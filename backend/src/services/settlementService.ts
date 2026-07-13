import { operatorClient, partyClient } from "../ledger/client";
import { T } from "../ledger/templateIds";
import { extractRecreatedContractId } from "../ledger/v2";
import { toConflictError } from "../utils/http";
import { currenciesMatchForSettlement, getSettlementCurrency } from "../config/settlementToken";
import {
  finalizeSettlementBalances,
  getOrCreatePartyBalance,
  getPartyBalance,
  hasLedgerEntry,
  listActiveDepositHoldingIdsForParty,
  listPartyBalances,
  getSettlementTransferReference,
  recordSettlementTransfer,
  releaseReservedBalance,
  reserveBalance,
  creditSettlementReceiver,
} from "./balanceService";
import { getTokenHoldingsTotal } from "../settlementToken/holdingsService";
import { executeTokenTransfer } from "../settlementToken/transferService";
import { reconcileStaleDepositsForParty } from "../settlementToken/depositIndexer";
import { getOperatorPartyId } from "../ledger/operatorParty";
import {
  acceptIncomingTransfer,
  AcceptedIncomingTransfer,
  findSettlementPendingTransfer,
  listPendingIncomingTransfers,
} from "../settlementToken/transferInstructionService";
import { SETTLEMENT_INSTRUCTION_META_KEY } from "../settlementToken/metadata";
import {
  findExecutedSettlementInstruction,
  getArchivedInstruction,
  getInstruction,
  listCycleIdsByAgreement,
  listSettlementInstructions as pqsListInstructions,
} from "../repositories/pqsLedgerReadRepository";
import { auditLedgerExercise } from "./ledgerAudit";

export interface SettlementBalanceView {
  partyId: string;
  currency: string;
  available: number;
  reserved: number;
  total: number;
  holdingsTotal: number | null;
}

type ExecutePhase = "none" | "reserved" | "transferred" | "attested" | "finalized";

export async function listSettlementInstructions(
  role: string,
  partyId: string,
  userAgreementId?: string | null,
  agreementId?: string,
) {
  const cycleFilterAgreementId = role === "operator" ? agreementId : userAgreementId;
  const cycleIds = cycleFilterAgreementId
    ? await listCycleIdsByAgreement(cycleFilterAgreementId)
    : undefined;

  if (cycleFilterAgreementId && cycleIds && cycleIds.length === 0) {
    return [];
  }

  return pqsListInstructions({ role, partyId, cycleIds });
}

export async function getSettlementBalance(
  role: string,
  partyId: string,
): Promise<SettlementBalanceView> {
  const balance = await getOrCreatePartyBalance(partyId, 0);
  let holdingsTotal: number | null = null;

  const custodyParty = await getOperatorPartyId();
  if (partyId === custodyParty) {
    try {
      holdingsTotal = await getTokenHoldingsTotal(partyId);
    } catch (err) {
      console.warn(
        `Failed to fetch holdings total for ${partyId}:`,
        err instanceof Error ? err.message : err,
      );
      holdingsTotal = null;
    }
  }

  return {
    partyId: balance.partyId,
    currency: balance.currency,
    available: balance.available,
    reserved: balance.reserved,
    total: balance.total,
    holdingsTotal,
  };
}

export async function listSettlementBalances(role: string, partyId: string) {
  if (role === "operator") {
    return listPartyBalances();
  }
  const balance = await getSettlementBalance(role, partyId);
  return [balance];
}

export async function executeSettlement(contractId: string) {
  const transferRecorded = await hasLedgerEntry(contractId, "TRANSFER");
  const alreadyFinalized = await hasLedgerEntry(contractId, "DEBIT");

  if (alreadyFinalized) {
    return { error: "Settlement balances already finalized for this instruction", status: 409 as const };
  }

  let instruction =
    (await getInstruction(contractId)) ??
    (transferRecorded ? await getArchivedInstruction(contractId) : null);
  if (!instruction) {
    return { error: "Settlement instruction not found", status: 404 as const };
  }

  const settlementCurrency = getSettlementCurrency();
  if (!currenciesMatchForSettlement(instruction.currency, settlementCurrency)) {
    return {
      error: `Instruction currency ${instruction.currency} does not match settlement currency ${settlementCurrency}`,
      status: 400 as const,
    };
  }

  let paymentReference =
    (await getSettlementTransferReference(contractId)) ?? instruction.paymentReference;

  const executedInstruction =
  instruction.status === "EXECUTED"
    ? instruction
    : await findExecutedSettlementInstruction({
        cycleId: instruction.cycleId,
        payer: instruction.payer,
        receiver: instruction.receiver,
        paymentReference,
      });

  const resumeAfterTransfer = transferRecorded || executedInstruction !== null;
  const attestedOnLedger = executedInstruction !== null;

  if (!resumeAfterTransfer && instruction.status !== "PENDING") {
    return { error: "Only PENDING settlement instructions can be executed", status: 400 as const };
  }

  let phase: ExecutePhase = transferRecorded ? "transferred" : "none";
  let attestResult: {
    exerciseResult: unknown;
    events: Array<Record<string, unknown>>;
  } | null = null;
  let activeContractId = executedInstruction?.contractId ?? contractId;

  try {
    await reconcileStaleDepositsForParty(instruction.payer);

    if (!transferRecorded) {
      await reserveBalance({
        partyId: instruction.payer,
        amount: instruction.amount,
        instructionCid: contractId,
      });
      phase = "reserved";

      if (!paymentReference) {
        const holdingContractIds = await listActiveDepositHoldingIdsForParty(instruction.payer);
        const transfer = await executeTokenTransfer({
          receiverPartyId: instruction.receiver,
          amount: instruction.amount,
          holdingContractIds,
          meta: {
            [SETTLEMENT_INSTRUCTION_META_KEY]: contractId,
          },
        });
        paymentReference = transfer.paymentReference;
        await recordSettlementTransfer({
          payerPartyId: instruction.payer,
          instructionCid: contractId,
          paymentReference,
          amount: instruction.amount,
        });
      }
      phase = "transferred";
    }

    if (!attestedOnLedger) {
      if (!paymentReference) {
        throw new Error("Payment reference is required to attest settlement");
      }
      const client = await operatorClient();
      const result = await client.exercise({
        templateId: T.SettlementInstruction,
        contractId,
        choice: "AttestPayment",
        argument: {
          paymentUpdateId: paymentReference,
        },
      });
      phase = "attested";
      attestResult = result;

      await auditLedgerExercise(T.SettlementInstruction, "AttestPayment", contractId, result.events);

      const newContractId = extractRecreatedContractId(
        result.exerciseResult,
        result.events as Array<{ created?: { contractId: string; templateId: string } }>,
        T.SettlementInstruction,
      );
      if (newContractId) {
        activeContractId = newContractId;
      }
    } else {
      phase = "attested";
    }

    await finalizeSettlementBalances({
      payerPartyId: instruction.payer,
      receiverPartyId: instruction.receiver,
      amount: instruction.amount,
      instructionCid: contractId,
      creditReceiver: false,
    });
    phase = "finalized";

    return {
      data: {
        newContractId: activeContractId,
        paymentReference,
        exerciseResult: attestResult?.exerciseResult ?? null,
        events: attestResult?.events ?? [],
        resumed: resumeAfterTransfer,
      },
    };
  } catch (err) {
    if (phase === "reserved") {
      try {
        await releaseReservedBalance({
          partyId: instruction.payer,
          amount: instruction.amount,
          instructionCid: contractId,
          note: err instanceof Error ? err.message : "Execute failed",
        });
      } catch (releaseErr) {
        console.error(
          `Failed to release reserved balance for ${contractId}:`,
          releaseErr instanceof Error ? releaseErr.message : releaseErr,
        );
      }
      return toConflictError(err);
    }

    if (phase === "transferred" || phase === "attested") {
      const message =
        `Settlement partially completed (phase=${phase}, paymentReference=${paymentReference ?? "unknown"}). ` +
        "Funds were transferred on-chain; do not release reserved balance. Retry execute to complete attestation/finalization.";
      console.error(message, err);
      return { error: message, status: 409 as const };
    }

    return toConflictError(err);
  }
}

export async function failSettlement(contractId: string, reason?: string) {
  const instruction = await getInstruction(contractId);
  if (!instruction) return { error: "Settlement instruction not found", status: 404 as const };
  if (instruction.status !== "PENDING") {
    return { error: "Only PENDING settlement instructions can be failed", status: 400 as const };
  }

  if (await hasLedgerEntry(contractId, "TRANSFER")) {
    return {
      error: "Cannot fail settlement after on-chain transfer has been initiated",
      status: 409 as const,
    };
  }

  const failureReason = reason?.trim() || "Settlement failed by operator";

  try {
    const client = await operatorClient();
    const result = await client.exercise({
      templateId: T.SettlementInstruction,
      contractId,
      choice: "FailPayment",
      argument: { reason: failureReason },
    });

    await auditLedgerExercise(T.SettlementInstruction, "FailPayment", contractId, result.events);

    const released = await releaseReservedBalance({
      partyId: instruction.payer,
      amount: instruction.amount,
      instructionCid: contractId,
      note: failureReason,
    });
    if (released === null && (await hasLedgerEntry(contractId, "RESERVE"))) {
      console.warn(`Reserved balance was not released for failed settlement ${contractId}`);
    }

    const newContractId = extractRecreatedContractId(
      result.exerciseResult,
      result.events as Array<{ created?: { contractId: string; templateId: string } }>,
      T.SettlementInstruction,
    );

    return {
      data: {
        newContractId,
        failureReason,
        exerciseResult: result.exerciseResult,
        events: result.events,
      },
    };
  } catch (err) {
    return toConflictError(err);
  }
}

export async function confirmSettlement(
  contractId: string,
  token: string,
  partyId: string,
  createdBy?: string,
) {
  const instruction = await getInstruction(contractId);
  if (!instruction) return { error: "Settlement instruction not found", status: 404 as const };
  if (instruction.receiver !== partyId) {
    return { error: "Only receiver can confirm this settlement", status: 403 as const };
  }
  if (instruction.status !== "EXECUTED") {
    return { error: "Only EXECUTED settlement instructions can be confirmed", status: 400 as const };
  }

  const custodyParty = await getOperatorPartyId();
  const client = partyClient(token, partyId);
  let transferAccepted: AcceptedIncomingTransfer | null = null;

  try {
    if (!(await hasLedgerEntry(contractId, "CREDIT"))) {
      const pending = await listPendingIncomingTransfers(partyId, client);
      const match = findSettlementPendingTransfer(pending, {
        instructionCid: contractId,
        senderPartyId: custodyParty,
        amount: instruction.amount,
      });

      if (match) {
        try {
          transferAccepted = await acceptIncomingTransfer(match, client);
        } catch (acceptErr) {
          if (!(await hasLedgerEntry(contractId, "PAYOUT"))) {
            throw acceptErr;
          }
        }
      } else if (!(await hasLedgerEntry(contractId, "PAYOUT"))) {
        return {
          error:
            `No pending ${getSettlementCurrency()} transfer found for this settlement. The transfer may have expired — ask the operator to re-execute.`,
          status: 409 as const,
        };
      }

      await creditSettlementReceiver({
        receiverPartyId: partyId,
        amount: instruction.amount,
        instructionCid: contractId,
        createdBy,
      });
    }

    const result = await client.exercise({
      templateId: T.SettlementInstruction,
      contractId,
      choice: "ConfirmReceipt",
      argument: {},
    });

    await auditLedgerExercise(T.SettlementInstruction, "ConfirmReceipt", contractId, result.events, {
      actorPartyId: partyId,
    });

    const newContractId = extractRecreatedContractId(
      result.exerciseResult,
      result.events as Array<{ created?: { contractId: string; templateId: string } }>,
      T.SettlementInstruction,
    );

    return {
      data: {
        newContractId,
        transferAccepted,
        exerciseResult: result.exerciseResult,
        events: result.events,
      },
    };
  } catch (err) {
    return toConflictError(err);
  }
}
