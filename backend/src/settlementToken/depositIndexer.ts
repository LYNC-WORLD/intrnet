import { prisma } from "../db";
import { getOperatorPartyId } from "../ledger/operatorParty";
import { listTokenHoldings } from "./holdingsService";
import { acceptPendingIncomingTransfers } from "./transferInstructionService";
import {
  listActiveParticipantPartyIds,
  resolveHoldingDepositorParty,
  resolveReceiverHoldingCidsFromUpdate,
  resolveTransferInstructionDepositor,
} from "./depositAttribution";
import { creditDeposit, sumRecordedDepositCredits } from "../services/balanceService";
import { getSettlementCurrency } from "../config/settlementToken";
import {
  auditStep,
  createAttributionAudit,
  DepositAttributionAudit,
  depositSyncDebug,
} from "./depositSyncAudit";

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
  unattributed: Array<{ amount: number; holdingContractId: string; reason?: string }>;
  alreadyApplied: number;
  skippedUnknownParty: Array<{ partyId: string; amount: number; holdingContractId: string }>;
  attributionAudit: DepositAttributionAudit[];
  activeParticipants: Array<{ partyId: string; email: string }>;
}

async function creditDepositForParty(params: {
  partyId: string;
  amount: number;
  holdingContractId: string;
  createdBy?: string;
  note: string;
  credited: DepositReconcileResult["credited"];
  skippedUnknownParty: DepositReconcileResult["skippedUnknownParty"];
  audit: DepositAttributionAudit;
}): Promise<number> {
  const knownParty = await prisma.user.findFirst({
    where: { partyId: params.partyId, status: "ACTIVE" },
    select: { partyId: true, email: true },
  });
  if (!knownParty) {
    auditStep(params.audit, "credit_skipped_unknown_party", params.partyId, {
      holdingContractId: params.holdingContractId,
      amount: params.amount,
    });
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
    auditStep(params.audit, "credit_already_applied", params.holdingContractId, {
      partyId: params.partyId,
      amount: params.amount,
    });
    return 1;
  }

  auditStep(params.audit, "credit_applied", params.partyId, {
    holdingContractId: params.holdingContractId,
    amount: params.amount,
    email: knownParty.email,
  });
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
  if (params.accepted.receiverHoldingCids.length > 0) {
    return params.accepted.receiverHoldingCids;
  }

  if (params.accepted.updateId) {
    const fromUpdate = await resolveReceiverHoldingCidsFromUpdate(params.accepted.updateId);
    if (fromUpdate.length > 0) return fromUpdate;
  }

  return [...params.holdingsById.values()]
    .filter(
      (holding) =>
        !params.creditedHoldingIds.has(holding.contractId) &&
        amountsMatch(holding.amount, params.accepted.amount),
    )
    .map((holding) => holding.contractId);
}

export async function reconcileDeposits(createdBy?: string): Promise<DepositReconcileResult> {
  const custodyParty = await getOperatorPartyId();
  const currency = getSettlementCurrency();
  const creditNote = `Auto-credited from inbound ${currency} custody deposit`;
  const attributionAudit: DepositAttributionAudit[] = [];
  const activeParticipants = await listActiveParticipantPartyIds();

  depositSyncDebug("reconcile_start", {
    custodyParty,
    activeParticipants,
  });

  const { accepted: transfersAccepted, failed: transfersFailed } =
    await acceptPendingIncomingTransfers(custodyParty);

  const holdings = await listTokenHoldings(custodyParty);
  const holdingsById = new Map(holdings.map((holding) => [holding.contractId, holding]));

  depositSyncDebug("holdings_scan", {
    custodyHoldings: holdings.map((holding) => ({
      contractId: holding.contractId,
      amount: holding.amount,
      attributedParty: holding.attributedParty,
    })),
    pendingTransfers: transfersAccepted.length,
  });

  const credited: DepositReconcileResult["credited"] = [];
  const unattributed: DepositReconcileResult["unattributed"] = [];
  const skippedUnknownParty: DepositReconcileResult["skippedUnknownParty"] = [];
  const creditedHoldingIds = new Set<string>();
  let alreadyApplied = 0;

  for (const accepted of transfersAccepted) {
    const audit = createAttributionAudit(accepted.contractId, accepted.amount);
    attributionAudit.push(audit);
    auditStep(audit, "accept_transfer", accepted.contractId, {
      sender: accepted.sender,
      amount: accepted.amount,
      depositorPartyId: accepted.depositorPartyId,
      receiverHoldingCids: accepted.receiverHoldingCids,
      updateId: accepted.updateId,
    });

    let depositorPartyId = accepted.depositorPartyId;
    if (!depositorPartyId) {
      depositorPartyId = await resolveTransferInstructionDepositor(accepted.contractId);
      auditStep(audit, "accept_transfer_depositor_lookup", depositorPartyId ?? "not found");
    }
    if (!depositorPartyId) continue;

    const holdingCids = await resolveAcceptedHoldingCids({
      accepted,
      holdingsById,
      creditedHoldingIds,
    });
    auditStep(audit, "accept_transfer_holding_cids", holdingCids.join(", ") || "none");
    if (holdingCids.length === 0) continue;

    for (const holdingContractId of holdingCids) {
      const holding = holdingsById.get(holdingContractId);
      const amount = holding?.amount ?? accepted.amount;
      alreadyApplied += await creditDepositForParty({
        partyId: depositorPartyId,
        amount,
        holdingContractId,
        createdBy,
        note: creditNote,
        credited,
        skippedUnknownParty,
        audit,
      });
      creditedHoldingIds.add(holdingContractId);
    }
  }

  let onChainCustodyTotal = 0;
  let unattributedOnChainTotal = 0;

  for (const holding of holdings) {
    onChainCustodyTotal += holding.amount;
    if (creditedHoldingIds.has(holding.contractId)) continue;

    const resolution = await resolveHoldingDepositorParty(holding.contractId, holding.amount);
    attributionAudit.push(resolution.audit);

    if (!resolution.partyId) {
      const reason =
        resolution.audit.steps[resolution.audit.steps.length - 1]?.detail ??
        "Could not resolve depositor party from holding or accept transaction";
      unattributed.push({
        amount: holding.amount,
        holdingContractId: holding.contractId,
        reason,
      });
      unattributedOnChainTotal += holding.amount;
      continue;
    }

    alreadyApplied += await creditDepositForParty({
      partyId: resolution.partyId,
      amount: holding.amount,
      holdingContractId: holding.contractId,
      createdBy,
      note: creditNote,
      credited,
      skippedUnknownParty,
      audit: resolution.audit,
    });
  }

  const recordedDepositCreditsTotal = await sumRecordedDepositCredits();
  const attributedOnChainTotal = onChainCustodyTotal - unattributedOnChainTotal;

  const result = {
    custodyParty,
    transfersAccepted,
    transfersFailed,
    onChainCustodyTotal,
    recordedDepositCreditsTotal,
    unattributedOnChainTotal,
    depositCreditDrift: Number((attributedOnChainTotal - recordedDepositCreditsTotal).toFixed(8)),
    credited,
    unattributed,
    alreadyApplied,
    skippedUnknownParty,
    attributionAudit,
    activeParticipants,
  };

  depositSyncDebug("reconcile_complete", {
    credited: result.credited,
    unattributed: result.unattributed,
    skippedUnknownParty: result.skippedUnknownParty,
  });

  return result;
}
