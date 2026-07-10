import { operatorClient, partyClient } from "../ledger/client";
import { T } from "../ledger/templateIds";
import { extractRecreatedContractId } from "../ledger/v2";
import { toConflictError } from "../utils/http";
import { getSettlementCurrency } from "../config/settlementToken";
import {
  finalizeSettlementBalances,
  getOrCreatePartyBalance,
  getPartyBalance,
  hasLedgerEntry,
  listPartyBalances,
  getSettlementTransferReference,
  recordSettlementTransfer,
  releaseReservedBalance,
  reserveBalance,
} from "./balanceService";
import { getTokenHoldingsTotal } from "../settlementToken/holdingsService";
import { executeTokenTransfer } from "../settlementToken/transferService";
import { getOperatorPartyId } from "../ledger/operatorParty";
import {
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

  // Custodial tUSD: Holdings sit on the operator custody party. The operator M2M user
  // only has CanReadAs for operator parties, so querying a participant ACS returns 403.
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
  const instruction = await getInstruction(contractId);
  if (!instruction) return { error: "Settlement instruction not found", status: 404 as const };
  if (instruction.status !== "PENDING") {
    return { error: "Only PENDING settlement instructions can be executed", status: 400 as const };
  }

  const settlementCurrency = getSettlementCurrency();
  if (instruction.currency !== settlementCurrency) {
    return {
      error: `Instruction currency ${instruction.currency} does not match settlement currency ${settlementCurrency}`,
      status: 400 as const,
    };
  }

  if (await hasLedgerEntry(contractId, "DEBIT")) {
    return { error: "Settlement balances already finalized for this instruction", status: 409 as const };
  }

  let phase: ExecutePhase = "none";
  let paymentReference: string | null = null;

  try {
    await reserveBalance({
      partyId: instruction.payer,
      amount: instruction.amount,
      instructionCid: contractId,
    });
    phase = "reserved";

    paymentReference =
      (await getSettlementTransferReference(contractId)) ??
      instruction.paymentReference;

    if (!paymentReference) {
      const transfer = await executeTokenTransfer({
        receiverPartyId: instruction.receiver,
        amount: instruction.amount,
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

    await auditLedgerExercise(T.SettlementInstruction, "AttestPayment", contractId, result.events);

    await finalizeSettlementBalances({
      payerPartyId: instruction.payer,
      receiverPartyId: instruction.receiver,
      amount: instruction.amount,
      instructionCid: contractId,
      creditReceiver: false,
    });
    phase = "finalized";

    const newContractId = extractRecreatedContractId(
      result.exerciseResult,
      result.events as Array<{ created?: { contractId: string; templateId: string } }>,
      T.SettlementInstruction,
    );

    return {
      data: {
        newContractId,
        paymentReference,
        exerciseResult: result.exerciseResult,
        events: result.events,
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

export async function confirmSettlement(contractId: string, token: string, partyId: string) {
  const instruction = await getInstruction(contractId);
  if (!instruction) return { error: "Settlement instruction not found", status: 404 as const };
  if (instruction.receiver !== partyId) {
    return { error: "Only receiver can confirm this settlement", status: 403 as const };
  }
  if (instruction.status !== "EXECUTED") {
    return { error: "Only EXECUTED settlement instructions can be confirmed", status: 400 as const };
  }

  try {
    const result = await partyClient(token, partyId).exercise({
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
        exerciseResult: result.exerciseResult,
        events: result.events,
      },
    };
  } catch (err) {
    return toConflictError(err);
  }
}
