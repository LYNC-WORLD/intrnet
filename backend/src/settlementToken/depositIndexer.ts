import { prisma } from "../db";
import { operatorClient } from "../ledger/client";
import { getOperatorPartyId } from "../ledger/operatorParty";
import { listTokenHoldings } from "./holdingsService";
import { acceptPendingIncomingTransfers } from "./transferInstructionService";
import {
  resolveHoldingDepositorParty,
  resolveReceiverHoldingCidsFromUpdate,
  resolveTransferInstructionDepositor,
} from "./depositAttribution";
import {
  creditDeposit,
  revokeStaleDepositCredit,
  sumRecordedDepositCredits,
} from "../services/balanceService";
import { getSettlementCurrency } from "../config/settlementToken";
import { toNumber } from "../utils/amount";

export interface DepositReconcileResult {
  custodyParty: string;
  transfersAccepted: Array<{
    contractId: string;
    sender: string;
    amount: number;
    updateId: string | null;
    depositorPartyId: string | null;
    receiverHoldingCids: string[];
  }>;
  transfersFailed: Array<{ contractId: string; error: string }>;
  onChainCustodyTotal: number;
  recordedDepositCreditsTotal: number;
  unattributedOnChainTotal: number;
  depositCreditDrift: number;
  credited: Array<{ partyId: string; amount: number; holdingContractId: string }>;
  unattributed: Array<{ amount: number; holdingContractId: string }>;
  staleRevoked: Array<{ partyId: string; amount: number; holdingContractId: string }>;
  alreadyApplied: number;
  skippedUnknownParty: Array<{ partyId: string; amount: number; holdingContractId: string }>;
  settlementsRepaired: string[];
}

async function creditDepositForParty(params: {
  partyId: string;
  amount: number;
  holdingContractId: string;
  createdBy?: string;
  note: string;
  credited: DepositReconcileResult["credited"];
  skippedUnknownParty: DepositReconcileResult["skippedUnknownParty"];
}): Promise<number> {
  const knownParty = await prisma.user.findFirst({
    where: { partyId: params.partyId, status: "ACTIVE" },
    select: { partyId: true },
  });
  if (!knownParty) {
    params.skippedUnknownParty.push({
      partyId: params.partyId,
      amount: params.amount,
      holdingContractId: params.holdingContractId,
    });
    return 0;
  }

  const result = await creditDeposit({
    partyId: params.partyId,
    amount: params.amount,
    holdingContractId: params.holdingContractId,
    createdBy: params.createdBy,
    note: params.note,
  });

  if (result === null) {
    return 1;
  }

  params.credited.push({
    partyId: params.partyId,
    amount: params.amount,
    holdingContractId: params.holdingContractId,
  });
  return 0;
}

function amountsMatch(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.00000001;
}

function selectDepositHoldingCids(params: {
  cids: string[];
  transferAmount: number;
  holdingsById: Map<string, { contractId: string; amount: number }>;
  creditedHoldingIds: Set<string>;
}): string[] {
  const matching = params.cids.filter((cid) => {
    if (params.creditedHoldingIds.has(cid)) return false;
    const holding = params.holdingsById.get(cid);
    return holding !== undefined && amountsMatch(holding.amount, params.transferAmount);
  });

  if (matching.length === 0) return [];

  // One inbound transfer creates one custody holding equal to the transfer amount.
  return [matching[0]];
}

async function resolveAcceptedHoldingCids(params: {
  accepted: {
    amount: number;
    updateId: string | null;
    receiverHoldingCids: string[];
    contractId: string;
  };
  holdingsById: Map<string, { contractId: string; amount: number }>;
  creditedHoldingIds: Set<string>;
}): Promise<string[]> {
  const candidateCids =
    params.accepted.receiverHoldingCids.length > 0
      ? params.accepted.receiverHoldingCids
      : params.accepted.updateId
        ? await resolveReceiverHoldingCidsFromUpdate(params.accepted.updateId)
        : [];

  const fromCandidates = selectDepositHoldingCids({
    cids: candidateCids,
    transferAmount: params.accepted.amount,
    holdingsById: params.holdingsById,
    creditedHoldingIds: params.creditedHoldingIds,
  });
  if (fromCandidates.length > 0) return fromCandidates;

  const fallback = [...params.holdingsById.values()]
    .filter(
      (holding) =>
        !params.creditedHoldingIds.has(holding.contractId) &&
        amountsMatch(holding.amount, params.accepted.amount),
    )
    .map((holding) => holding.contractId);

  return fallback.length > 0 ? [fallback[0]] : [];
}

async function reconcileArchivedDepositCredits(params: {
  createdBy?: string;
  partyId?: string;
}): Promise<DepositReconcileResult["staleRevoked"]> {
  const custodyParty = await getOperatorPartyId();
  const activeHoldings = await listTokenHoldings(custodyParty);
  const activeIds = new Set(activeHoldings.map((holding) => holding.contractId));

  const deposits = await prisma.balanceLedgerEntry.findMany({
    where: {
      referenceType: "DEPOSIT",
      entryType: "CREDIT",
      referenceId: { not: null },
      ...(params.partyId ? { partyId: params.partyId } : {}),
    },
    orderBy: { createdAt: "asc" },
  });

  const client = await operatorClient();
  const staleRevoked: DepositReconcileResult["staleRevoked"] = [];

  for (const deposit of deposits) {
    const holdingContractId = deposit.referenceId;
    if (!holdingContractId || activeIds.has(holdingContractId)) continue;

    const lifecycle = await client.fetchContractLifecycle(holdingContractId);
    if (!lifecycle?.archived) continue;

    const result = await revokeStaleDepositCredit({
      holdingContractId,
      createdBy: params.createdBy,
    }).catch((err) => {
      console.warn(
        `Skipped stale deposit revoke for ${holdingContractId}:`,
        err instanceof Error ? err.message : err,
      );
      return { revoked: false as const };
    });
    if (!result.revoked) continue;

    staleRevoked.push({
      partyId: deposit.partyId,
      amount: result.amount ?? toNumber(deposit.amount),
      holdingContractId,
    });
  }

  return staleRevoked;
}

export async function reconcileStaleDepositsForParty(
  partyId: string,
  createdBy?: string,
): Promise<DepositReconcileResult["staleRevoked"]> {
  return reconcileArchivedDepositCredits({ partyId, createdBy });
}

export async function reconcileDeposits(createdBy?: string): Promise<DepositReconcileResult> {
  const staleRevoked = await reconcileArchivedDepositCredits({ createdBy });
  const custodyParty = await getOperatorPartyId();
  const currency = getSettlementCurrency();
  const creditNote = `Auto-credited from inbound ${currency} custody deposit`;

  const { accepted: transfersAccepted, failed: transfersFailed } =
    await acceptPendingIncomingTransfers(custodyParty);

  const holdings = await listTokenHoldings(custodyParty);
  const holdingsById = new Map(holdings.map((holding) => [holding.contractId, holding]));

  const credited: DepositReconcileResult["credited"] = [];
  const unattributed: DepositReconcileResult["unattributed"] = [];
  const skippedUnknownParty: DepositReconcileResult["skippedUnknownParty"] = [];
  const creditedHoldingIds = new Set<string>();
  let alreadyApplied = 0;

  for (const accepted of transfersAccepted) {
    let depositorPartyId = accepted.depositorPartyId;
    if (!depositorPartyId) {
      depositorPartyId = await resolveTransferInstructionDepositor(accepted.contractId);
    }
    if (!depositorPartyId) continue;

    const holdingCids = await resolveAcceptedHoldingCids({
      accepted,
      holdingsById,
      creditedHoldingIds,
    });
    if (holdingCids.length === 0) continue;

    for (const holdingContractId of holdingCids) {
      const holding = holdingsById.get(holdingContractId);
      if (!holding) continue;

      alreadyApplied += await creditDepositForParty({
        partyId: depositorPartyId,
        amount: holding.amount,
        holdingContractId,
        createdBy,
        note: creditNote,
        credited,
        skippedUnknownParty,
      });
      creditedHoldingIds.add(holdingContractId);
    }
  }

  let onChainCustodyTotal = 0;
  let unattributedOnChainTotal = 0;

  for (const holding of holdings) {
    onChainCustodyTotal += holding.amount;
    if (creditedHoldingIds.has(holding.contractId)) continue;

    const depositorPartyId = await resolveHoldingDepositorParty(holding.contractId, holding.amount);
    if (!depositorPartyId) {
      unattributed.push({ amount: holding.amount, holdingContractId: holding.contractId });
      unattributedOnChainTotal += holding.amount;
      continue;
    }

    alreadyApplied += await creditDepositForParty({
      partyId: depositorPartyId,
      amount: holding.amount,
      holdingContractId: holding.contractId,
      createdBy,
      note: creditNote,
      credited,
      skippedUnknownParty,
    });
  }

  const recordedDepositCreditsTotal = await sumRecordedDepositCredits();
  const attributedOnChainTotal = onChainCustodyTotal - unattributedOnChainTotal;

  let settlementsRepaired: string[] = [];
  try {
    const { repairUnsettledSettlementReserves } = await import("../services/settlementService");
    settlementsRepaired = await repairUnsettledSettlementReserves({ createdBy });
  } catch (err) {
    console.warn(
      "Settlement balance repair during deposit sync failed:",
      err instanceof Error ? err.message : err,
    );
  }

  return {
    custodyParty,
    transfersAccepted,
    transfersFailed,
    onChainCustodyTotal,
    recordedDepositCreditsTotal,
    unattributedOnChainTotal,
    depositCreditDrift: Number((attributedOnChainTotal - recordedDepositCreditsTotal).toFixed(8)),
    credited,
    unattributed,
    staleRevoked,
    alreadyApplied,
    skippedUnknownParty,
    settlementsRepaired,
  };
}
