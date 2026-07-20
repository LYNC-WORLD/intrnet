import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { getSettlementCurrency } from "../config/settlementToken";
import { getOperatorPartyId } from "../ledger/operatorParty";
import { getTokenHoldingsTotal } from "../settlementToken/holdingsService";
import { ensureTusdTransferPreapproval } from "../settlementToken/transferPreapprovalService";
import { assertPositiveAmount, decimalAmount } from "../utils/amount";
import { extractErrorMessage } from "../utils/http";
import { getOrCreatePartyBalance, type PartyBalanceView } from "./balanceService";

export function getFaucetAmount(): number {
  const raw = process.env.FAUCET_AMOUNT?.trim() || "1000";
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`FAUCET_AMOUNT must be a positive number (got "${raw}")`);
  }
  return amount;
}

function utcDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date = new Date()): Date {
  return new Date(`${utcDayKey(date)}T00:00:00.000Z`);
}

function faucetReferenceId(partyId: string, day = utcDayKey()): string {
  return `faucet:${partyId}:${day}`;
}

export async function canClaimFaucet(partyId: string | null | undefined): Promise<boolean> {
  const id = partyId?.trim();
  if (!id) return false;

  const claimedToday = await prisma.balanceLedgerEntry.findFirst({
    where: {
      partyId: id,
      referenceType: "FAUCET",
      createdAt: { gte: startOfUtcDay() },
    },
    select: { id: true },
  });
  return claimedToday === null;
}

function toBalanceView(balance: {
  partyId: string;
  available: Prisma.Decimal;
  reserved: Prisma.Decimal;
  currency: string;
}): PartyBalanceView {
  const available = Number(balance.available.toString());
  const reserved = Number(balance.reserved.toString());
  return {
    partyId: balance.partyId,
    available,
    reserved,
    total: available + reserved,
    currency: balance.currency,
  };
}

async function assertCustodyCanCover(amount: number): Promise<void> {
  const currency = getSettlementCurrency();
  const custodyParty = await getOperatorPartyId();

  let holdingsTotal: number;
  try {
    holdingsTotal = await getTokenHoldingsTotal(custodyParty);
  } catch (err) {
    console.warn(
      "Faucet: could not verify custody holdings; proceeding without on-chain reserve check:",
      err instanceof Error ? err.message : err,
    );
    return;
  }

  const booked = await prisma.partyBalance.aggregate({
    _sum: { available: true, reserved: true },
  });
  const availableSum = booked._sum.available ? Number(booked._sum.available.toString()) : 0;
  const reservedSum = booked._sum.reserved ? Number(booked._sum.reserved.toString()) : 0;
  const bookedClaims = availableSum + reservedSum;

  if (bookedClaims + amount > holdingsTotal + 1e-8) {
    throw new Error(
      `Faucet pool exhausted: custody holds ${holdingsTotal} ${currency} on-chain but ` +
        `${bookedClaims} is already booked in-app (need ${amount} more)`,
    );
  }
}

async function creditFaucetBalance(params: {
  partyId: string;
  amount: number;
  referenceId: string;
  createdBy?: string;
  note: string;
}): Promise<{ balance: PartyBalanceView; alreadyApplied: boolean }> {
  const currency = getSettlementCurrency();

  try {
    const balance = await prisma.$transaction(async (tx) => {
      const updated = await tx.partyBalance.upsert({
        where: { partyId: params.partyId },
        update: { available: { increment: decimalAmount(params.amount) } },
        create: {
          partyId: params.partyId,
          available: decimalAmount(params.amount),
          reserved: decimalAmount(0),
          currency,
        },
      });

      await tx.balanceLedgerEntry.create({
        data: {
          partyId: params.partyId,
          entryType: "CREDIT",
          amount: decimalAmount(params.amount),
          currency,
          referenceType: "FAUCET",
          referenceId: params.referenceId,
          createdBy: params.createdBy,
          note: params.note,
        },
      });

      return updated;
    });

    return { balance: toBalanceView(balance), alreadyApplied: false };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const balance = await getOrCreatePartyBalance(params.partyId, 0);
      return { balance, alreadyApplied: true };
    }
    throw err;
  }
}

export async function claimFaucet(params: {
  partyId: string;
  ledgerToken: string;
  createdBy?: string;
}) {
  const partyId = params.partyId?.trim();
  if (!partyId) {
    return { error: "User has no provisioned party id", status: 403 as const };
  }
  if (!params.ledgerToken?.trim()) {
    return { error: "Missing user token for transfer preapproval", status: 401 as const };
  }

  if (!(await canClaimFaucet(partyId))) {
    return {
      error: "Faucet already claimed today (UTC); try again tomorrow",
      status: 429 as const,
    };
  }

  let preapproval: { contractId: string; created: boolean };
  try {
    preapproval = await ensureTusdTransferPreapproval({
      partyId,
      ledgerToken: params.ledgerToken,
    });
  } catch (err) {
    return {
      error: `Transfer preapproval failed: ${extractErrorMessage(err)}`,
      status: 502 as const,
    };
  }

  const amount = getFaucetAmount();
  assertPositiveAmount(amount, "Faucet amount");

  try {
    await assertCustodyCanCover(amount);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Faucet pool check failed",
      status: 409 as const,
    };
  }

  const currency = getSettlementCurrency();
  const referenceId = faucetReferenceId(partyId);
  const { balance, alreadyApplied } = await creditFaucetBalance({
    partyId,
    amount,
    referenceId,
    createdBy: params.createdBy,
    note: `Faucet credit of ${amount} ${currency}`,
  });

  if (alreadyApplied) {
    return {
      error: "Faucet already claimed today (UTC); try again tomorrow",
      status: 429 as const,
    };
  }

  return {
    data: {
      amount,
      currency,
      alreadyApplied,
      balance,
      referenceId,
      canClaimFaucet: false,
      transferPreapproved: true,
      transferPreapprovalContractId: preapproval.contractId,
      transferPreapprovalCreated: preapproval.created,
    },
  };
}
