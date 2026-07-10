import { prisma } from "../db";
import { getOperatorPartyId } from "../ledger/operatorParty";
import { listTokenHoldings } from "./holdingsService";
import { acceptPendingIncomingTransfers } from "./transferInstructionService";
import { creditDeposit, sumRecordedDepositCredits } from "../services/balanceService";
import { getSettlementCurrency } from "../config/settlementToken";

export interface DepositReconcileResult {
  custodyParty: string;
  transfersAccepted: Array<{
    contractId: string;
    sender: string;
    amount: number;
    updateId: string | null;
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

export async function reconcileDeposits(createdBy?: string): Promise<DepositReconcileResult> {
  const custodyParty = await getOperatorPartyId();
  const { accepted: transfersAccepted, failed: transfersFailed } =
    await acceptPendingIncomingTransfers(custodyParty);

  const holdings = await listTokenHoldings(custodyParty);
  const currency = getSettlementCurrency();

  const credited: DepositReconcileResult["credited"] = [];
  const unattributed: DepositReconcileResult["unattributed"] = [];
  const skippedUnknownParty: DepositReconcileResult["skippedUnknownParty"] = [];
  let alreadyApplied = 0;
  let onChainCustodyTotal = 0;
  let unattributedOnChainTotal = 0;

  for (const holding of holdings) {
    onChainCustodyTotal += holding.amount;

    if (!holding.attributedParty) {
      unattributed.push({ amount: holding.amount, holdingContractId: holding.contractId });
      unattributedOnChainTotal += holding.amount;
      continue;
    }

    const knownParty = await prisma.user.findFirst({
      where: { partyId: holding.attributedParty, status: "ACTIVE" },
      select: { partyId: true },
    });
    if (!knownParty) {
      skippedUnknownParty.push({
        partyId: holding.attributedParty,
        amount: holding.amount,
        holdingContractId: holding.contractId,
      });
      continue;
    }

    const result = await creditDeposit({
      partyId: holding.attributedParty,
      amount: holding.amount,
      holdingContractId: holding.contractId,
      createdBy,
      note: `Auto-credited from inbound ${currency} custody deposit`,
    });

    if (result === null) {
      alreadyApplied += 1;
    } else {
      credited.push({
        partyId: holding.attributedParty,
        amount: holding.amount,
        holdingContractId: holding.contractId,
      });
    }
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
