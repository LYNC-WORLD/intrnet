import { operatorClient, partyClient } from "../ledger/client";
import { T } from "../ledger/templateIds";
import { extractRecreatedContractId } from "../ledger/v2";
import { toConflictError } from "../utils/http";
import { currenciesMatchForSettlement, getSettlementCurrency } from "../config/settlementToken";
import {
  finalizeSettlementBalances,
  findUnsettledReserveCids,
  getOrCreatePartyBalance,
  getSettlementEntryFlags,
  hasLedgerEntry,
  listActiveDepositHoldingIdsForParty,
  listPartyBalances,
  getSettlementTransferReference,
  recordSettlementTransfer,
  releaseReservedBalance,
  reserveBalance,
  creditSettlementReceiver,
  resolveSettlementBookkeepingCid,
} from "./balanceService";
import { getTokenHoldingsTotal, listTokenHoldings } from "../settlementToken/holdingsService";
import { executeTokenTransfer } from "../settlementToken/transferService";
import { getOperatorPartyId } from "../ledger/operatorParty";
import {
  acceptIncomingTransfer,
  AcceptedIncomingTransfer,
  findPendingIncomingTransferByUpdateId,
  findSettlementPendingTransfer,
  listPendingIncomingTransfers,
  PendingIncomingTransfer,
} from "../settlementToken/transferInstructionService";
import { SETTLEMENT_INSTRUCTION_META_KEY } from "../settlementToken/metadata";
import {
  findConfirmedSettlementInstruction,
  findExecutedSettlementInstruction,
  getArchivedInstruction,
  getInstruction,
  listCycleIdsByAgreement,
  listSettlementInstructions as pqsListInstructions,
} from "../repositories/pqsLedgerReadRepository";
import type { PqsSettlementInstruction } from "../types/ledger";
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

async function loadSettlementInstructionForBookkeeping(
  bookkeepingCid: string,
  paymentReference?: string | null,
): Promise<PqsSettlementInstruction | null> {
  const paymentRef =
    paymentReference?.trim() ?? (await getSettlementTransferReference(bookkeepingCid));

  const [active, archived] = await Promise.all([
    getInstruction(bookkeepingCid),
    getArchivedInstruction(bookkeepingCid),
  ]);
  if (active && (active.status === "EXECUTED" || active.status === "CONFIRMED")) {
    return active;
  }

  const base = archived ?? active;
  if (!base) return null;

  const lookup = {
    cycleId: base.cycleId,
    payer: base.payer,
    receiver: base.receiver,
    paymentReference: base.paymentReference ?? paymentRef,
  };

  const [confirmed, executed] = await Promise.all([
    findConfirmedSettlementInstruction(lookup),
    findExecutedSettlementInstruction(lookup),
  ]);
  return confirmed ?? executed ?? active ?? archived;
}

export async function ensureSettlementFinalized(
  bookkeepingCid: string,
  paymentReference?: string | null,
  createdBy?: string,
): Promise<boolean> {
  const flags = await getSettlementEntryFlags(bookkeepingCid);
  if (flags.hasDebit) return true;
  if (!flags.hasTransfer) return false;

  const instruction = await loadSettlementInstructionForBookkeeping(
    bookkeepingCid,
    paymentReference,
  );
  if (!instruction) return false;
  if (instruction.status !== "EXECUTED" && instruction.status !== "CONFIRMED") {
    return false;
  }

  await finalizeSettlementBalances({
    payerPartyId: instruction.payer,
    receiverPartyId: instruction.receiver,
    amount: instruction.amount,
    instructionCid: bookkeepingCid,
    creditReceiver: false,
    createdBy,
  });
  return true;
}

export async function repairUnsettledSettlementReserves(params?: {
  partyId?: string;
  createdBy?: string;
}): Promise<string[]> {
  const unsettled = await findUnsettledReserveCids(params?.partyId);
  const repaired: string[] = [];

  for (const reserve of unsettled) {
    try {
      const finalized = await ensureSettlementFinalized(
        reserve.instructionCid,
        undefined,
        params?.createdBy,
      );
      if (finalized) repaired.push(reserve.instructionCid);
    } catch (err) {
      console.warn(
        `Failed to repair unsettled reserve for ${reserve.instructionCid}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return repaired;
}

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
  let instruction =
    (await getInstruction(contractId)) ?? (await getArchivedInstruction(contractId));
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

  const paymentReferenceFromInstruction =
    instruction.paymentReference ?? (await getSettlementTransferReference(contractId));

  const bookkeepingCid = await resolveSettlementBookkeepingCid(
    contractId,
    paymentReferenceFromInstruction,
    { payer: instruction.payer, amount: instruction.amount },
  );
  let paymentReference =
    paymentReferenceFromInstruction ?? (await getSettlementTransferReference(bookkeepingCid));

  const flags = await getSettlementEntryFlags(bookkeepingCid);
  const transferRecorded = flags.hasTransfer;
  const alreadyFinalized = flags.hasDebit;

  if (alreadyFinalized) {
    return { error: "Settlement balances already finalized for this instruction", status: 409 as const };
  }

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

  const pendingInstruction =
    (await getInstruction(bookkeepingCid)) ??
    (instruction.status === "PENDING" ? instruction : null);
  const attestContractId =
    pendingInstruction?.status === "PENDING" ? pendingInstruction.contractId : bookkeepingCid;

  let phase: ExecutePhase = transferRecorded ? "transferred" : "none";
  let attestResult: {
    exerciseResult: unknown;
    events: Array<Record<string, unknown>>;
  } | null = null;
  let activeContractId = executedInstruction?.contractId ?? attestContractId;

  try {
    if (!transferRecorded) {
      await reserveBalance({
        partyId: instruction.payer,
        amount: instruction.amount,
        instructionCid: bookkeepingCid,
      });
      phase = "reserved";

      if (!paymentReference) {
        const custodyHoldings = await listTokenHoldings(await getOperatorPartyId());
        const holdingContractIds = await listActiveDepositHoldingIdsForParty(
          instruction.payer,
          custodyHoldings,
        );
        const transfer = await executeTokenTransfer({
          receiverPartyId: instruction.receiver,
          amount: instruction.amount,
          holdingContractIds:
            holdingContractIds.length > 0 ? holdingContractIds : undefined,
          custodyHoldings,
          meta: {
            [SETTLEMENT_INSTRUCTION_META_KEY]: bookkeepingCid,
          },
        });
        paymentReference = transfer.paymentReference;
        await recordSettlementTransfer({
          payerPartyId: instruction.payer,
          instructionCid: bookkeepingCid,
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
        contractId: attestContractId,
        choice: "AttestPayment",
        argument: {
          paymentUpdateId: paymentReference,
        },
      });
      phase = "attested";
      attestResult = result;

      await auditLedgerExercise(
        T.SettlementInstruction,
        "AttestPayment",
        attestContractId,
        result.events,
      );

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
      instructionCid: bookkeepingCid,
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
        bookkeepingCid,
      },
    };
  } catch (err) {
    if (phase === "reserved") {
      try {
        await releaseReservedBalance({
          partyId: instruction.payer,
          amount: instruction.amount,
          instructionCid: bookkeepingCid,
          note: err instanceof Error ? err.message : "Execute failed",
        });
      } catch (releaseErr) {
        console.error(
          `Failed to release reserved balance for ${bookkeepingCid}:`,
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
  let instruction = await getInstruction(contractId);
  let activeContractId = contractId;

  if (!instruction) {
    const archived = await getArchivedInstruction(contractId);
    if (archived) {
      const executed = await findExecutedSettlementInstruction({
        cycleId: archived.cycleId,
        payer: archived.payer,
        receiver: archived.receiver,
        paymentReference: archived.paymentReference,
      });
      if (executed) {
        instruction = executed;
        activeContractId = executed.contractId;
      }
    }
  }

  if (!instruction) return { error: "Settlement instruction not found", status: 404 as const };
  if (instruction.receiver !== partyId) {
    return { error: "Only receiver can confirm this settlement", status: 403 as const };
  }

  if (instruction.status === "CONFIRMED") {
    const paymentReference =
      instruction.paymentReference ?? (await getSettlementTransferReference(contractId));
    const bookkeepingCid = await resolveSettlementBookkeepingCid(
      contractId,
      paymentReference,
      { payer: instruction.payer, amount: instruction.amount },
    );
    if (!(await hasLedgerEntry(bookkeepingCid, "CREDIT"))) {
      await ensureSettlementFinalized(bookkeepingCid, paymentReference, createdBy);
      await creditSettlementReceiver({
        receiverPartyId: partyId,
        amount: instruction.amount,
        instructionCid: bookkeepingCid,
        createdBy,
      });
    }
    return {
      data: {
        newContractId: activeContractId,
        transferAccepted: null,
        exerciseResult: null,
        events: [],
        alreadyConfirmed: true,
      },
    };
  }

  if (instruction.status !== "EXECUTED") {
    const executed = await findExecutedSettlementInstruction({
      cycleId: instruction.cycleId,
      payer: instruction.payer,
      receiver: instruction.receiver,
      paymentReference: instruction.paymentReference,
    });
    if (!executed) {
      return { error: "Only EXECUTED settlement instructions can be confirmed", status: 400 as const };
    }
    instruction = executed;
    activeContractId = executed.contractId;
  }

  const paymentReference =
    instruction.paymentReference ??
    (await getSettlementTransferReference(contractId)) ??
    (await getSettlementTransferReference(activeContractId));

  const [bookkeepingCid, custodyParty] = await Promise.all([
    resolveSettlementBookkeepingCid(contractId, paymentReference, {
      payer: instruction.payer,
      amount: instruction.amount,
    }),
    getOperatorPartyId(),
  ]);

  const client = partyClient(token, partyId);
  let transferAccepted: AcceptedIncomingTransfer | null = null;

  try {
    const flags = await getSettlementEntryFlags(bookkeepingCid);

    if (!flags.hasCredit) {
      const alternateInstructionCids = [contractId, activeContractId].filter(
        (cid) => cid !== bookkeepingCid,
      );

      const resolvePendingOffer = async (): Promise<PendingIncomingTransfer | null> => {
        if (paymentReference) {
          const fromUpdate = await findPendingIncomingTransferByUpdateId(
            paymentReference,
            partyId,
            client,
          );
          if (
            fromUpdate.pending &&
            fromUpdate.pending.sender === custodyParty &&
            Math.abs(fromUpdate.pending.amount - instruction.amount) < 0.00000001
          ) {
            return fromUpdate.pending;
          }
          if (fromUpdate.skipAcsFallback) {
            return null;
          }
        }

        const pending = await listPendingIncomingTransfers(partyId, client);
        return findSettlementPendingTransfer(pending, {
          instructionCid: bookkeepingCid,
          alternateInstructionCids,
          senderPartyId: custodyParty,
          amount: instruction.amount,
        });
      };

      const finalizePromise = flags.hasDebit
        ? Promise.resolve(true)
        : ensureSettlementFinalized(bookkeepingCid, paymentReference, createdBy);

      const [match, finalized] = await Promise.all([resolvePendingOffer(), finalizePromise]);

      if (match) {
        try {
          transferAccepted = await acceptIncomingTransfer(match, client, {
            skipAttribution: true,
          });
        } catch (acceptErr) {
          if (!flags.hasPayout && !flags.hasDebit && !flags.hasTransfer && !finalized) {
            throw acceptErr;
          }
        }
      } else if (!flags.hasPayout && !flags.hasDebit && !flags.hasTransfer) {
        return {
          error:
            `No pending ${getSettlementCurrency()} transfer found for this settlement. The transfer may have expired — ask the operator to re-execute.`,
          status: 409 as const,
        };
      } else if (!finalized && !flags.hasDebit) {
        return {
          error:
            "Settlement is EXECUTED on-chain but app balances were not finalized. Ask the operator to run sync or retry execute.",
          status: 409 as const,
        };
      }

      await creditSettlementReceiver({
        receiverPartyId: partyId,
        amount: instruction.amount,
        instructionCid: bookkeepingCid,
        createdBy,
      });
    }

    const result = await client.exercise({
      templateId: T.SettlementInstruction,
      contractId: activeContractId,
      choice: "ConfirmReceipt",
      argument: {},
    });

    await auditLedgerExercise(
      T.SettlementInstruction,
      "ConfirmReceipt",
      activeContractId,
      result.events,
      {
        actorPartyId: partyId,
      },
    );

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
