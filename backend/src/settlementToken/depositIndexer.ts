import { prisma } from "../db";
import { getOperatorPartyId } from "../ledger/operatorParty";
import { listTokenHoldings } from "./holdingsService";
import { acceptPendingIncomingTransfers } from "./transferInstructionService";
import { resolveHoldingDepositorParty } from "./depositAttribution";
import { creditDeposit, sumRecordedDepositCredits } from "../services/balanceService";
import { getSettlementCurrency } from "../config/settlementToken";

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
  alreadyApplied: number;
  skippedUnknownParty: Array<{ partyId: string; amount: number; holdingContractId: string }>;
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

export async function reconcileDeposits(createdBy?: string): Promise<DepositReconcileResult> {
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
    if (!accepted.depositorPartyId || accepted.receiverHoldingCids.length === 0) continue;

    for (const holdingContractId of accepted.receiverHoldingCids) {
      const holding = holdingsById.get(holdingContractId);
      const amount = holding?.amount ?? accepted.amount;
      alreadyApplied += await creditDepositForParty({
        partyId: accepted.depositorPartyId,
        amount,
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

    let depositorPartyId = holding.attributedParty;
    if (!depositorPartyId) {
      depositorPartyId = await resolveHoldingDepositorParty(holding.contractId);
    }

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
    alreadyApplied,
    skippedUnknownParty,
  };
}
