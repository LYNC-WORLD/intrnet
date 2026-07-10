import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { getSettlementCurrency } from "../config/settlementToken";
import { assertPositiveAmount, decimalAmount, toNumber } from "../utils/amount";

export interface PartyBalanceView {
  partyId: string;
  available: number;
  reserved: number;
  total: number;
  currency: string;
}

export async function getOrCreatePartyBalance(
  partyId: string,
  initialAvailable = 0,
): Promise<PartyBalanceView> {
  const currency = getSettlementCurrency();
  const balance = await prisma.partyBalance.upsert({
    where: { partyId },
    update: {},
    create: {
      partyId,
      available: decimalAmount(initialAvailable),
      reserved: decimalAmount(0),
      currency,
    },
  });
  return toBalanceView(balance);
}

export async function getPartyBalance(partyId: string): Promise<PartyBalanceView | null> {
  const balance = await prisma.partyBalance.findUnique({ where: { partyId } });
  return balance ? toBalanceView(balance) : null;
}

export async function listPartyBalances(partyId?: string): Promise<PartyBalanceView[]> {
  const balances = await prisma.partyBalance.findMany({
    where: partyId ? { partyId } : undefined,
    orderBy: { partyId: "asc" },
  });
  return balances.map(toBalanceView);
}

export async function hasLedgerEntry(
  instructionCid: string,
  entryType: string,
): Promise<boolean> {
  const entry = await prisma.balanceLedgerEntry.findUnique({
    where: { instructionCid_entryType: { instructionCid, entryType } },
  });
  return entry !== null;
}

export async function getSettlementTransferReference(instructionCid: string): Promise<string | null> {
  const entry = await prisma.balanceLedgerEntry.findUnique({
    where: { instructionCid_entryType: { instructionCid, entryType: "TRANSFER" } },
  });
  return entry?.referenceId ?? null;
}

export async function recordSettlementTransfer(params: {
  payerPartyId: string;
  instructionCid: string;
  paymentReference: string;
  amount: number;
  createdBy?: string;
}): Promise<string> {
  const existing = await getSettlementTransferReference(params.instructionCid);
  if (existing) return existing;

  const currency = getSettlementCurrency();
  try {
    await prisma.balanceLedgerEntry.create({
      data: {
        partyId: params.payerPartyId,
        entryType: "TRANSFER",
        amount: decimalAmount(params.amount),
        currency,
        referenceType: "SETTLEMENT_TRANSFER",
        referenceId: params.paymentReference,
        instructionCid: params.instructionCid,
        createdBy: params.createdBy,
        note: `On-chain transfer updateId: ${params.paymentReference}`,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const stored = await getSettlementTransferReference(params.instructionCid);
      if (stored) return stored;
    }
    throw err;
  }
  return params.paymentReference;
}

export async function creditDeposit(params: {
  partyId: string;
  amount: number;
  holdingContractId: string;
  createdBy?: string;
  note?: string;
}): Promise<PartyBalanceView | null> {
  assertPositiveAmount(params.amount, "Deposit amount");

  const currency = getSettlementCurrency();

  try {
    return await prisma.$transaction(async (tx) => {
      const balance = await tx.partyBalance.upsert({
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
          referenceType: "DEPOSIT",
          referenceId: params.holdingContractId,
          createdBy: params.createdBy,
          note: params.note,
        },
      });

      return toBalanceView(balance);
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return null;
    }
    throw err;
  }
}

export async function creditManualBalance(params: {
  partyId: string;
  amount: number;
  referenceId: string;
  createdBy?: string;
  note?: string;
}): Promise<{ balance: PartyBalanceView; alreadyApplied: boolean }> {
  assertPositiveAmount(params.amount, "Credit amount");

  const currency = getSettlementCurrency();
  const referenceId = params.referenceId.trim();
  if (!referenceId) {
    throw new Error("referenceId is required for manual balance credits");
  }

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
          referenceType: "MANUAL_CREDIT",
          referenceId,
          createdBy: params.createdBy,
          note: params.note ?? "Operator manual balance credit",
        },
      });

      return toBalanceView(updated);
    });

    return { balance, alreadyApplied: false };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const balance = await getOrCreatePartyBalance(params.partyId, 0);
      return { balance, alreadyApplied: true };
    }
    throw err;
  }
}

export async function reserveBalance(params: {
  partyId: string;
  amount: number;
  instructionCid: string;
  createdBy?: string;
}): Promise<PartyBalanceView> {
  assertPositiveAmount(params.amount, "Reserve amount");

  const currency = getSettlementCurrency();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.balanceLedgerEntry.findUnique({
      where: { instructionCid_entryType: { instructionCid: params.instructionCid, entryType: "RESERVE" } },
    });
    if (existing) {
      const balance = await tx.partyBalance.findUnique({ where: { partyId: params.partyId } });
      if (!balance) throw new Error("Party balance not found");
      return toBalanceView(balance);
    }

    const updated = await tx.partyBalance.updateMany({
      where: {
        partyId: params.partyId,
        available: { gte: decimalAmount(params.amount) },
      },
      data: {
        available: { decrement: decimalAmount(params.amount) },
        reserved: { increment: decimalAmount(params.amount) },
      },
    });
    if (updated.count === 0) {
      throw new Error("Insufficient available balance");
    }

    const balance = await tx.partyBalance.findUnique({ where: { partyId: params.partyId } });
    if (!balance) throw new Error("Party balance not found");

    await tx.balanceLedgerEntry.create({
      data: {
        partyId: params.partyId,
        entryType: "RESERVE",
        amount: decimalAmount(params.amount),
        currency,
        referenceType: "SETTLEMENT_EXECUTE",
        referenceId: params.instructionCid,
        instructionCid: params.instructionCid,
        createdBy: params.createdBy,
      },
    });

    return toBalanceView(balance);
  });
}

export async function finalizeSettlementBalances(params: {
  payerPartyId: string;
  receiverPartyId: string;
  amount: number;
  instructionCid: string;
  createdBy?: string;
  creditReceiver?: boolean;
}): Promise<{ payer: PartyBalanceView; receiver: PartyBalanceView | null }> {
  assertPositiveAmount(params.amount, "Settlement amount");

  const creditReceiver = params.creditReceiver ?? true;
  const currency = getSettlementCurrency();

  return prisma.$transaction(async (tx) => {
    const existingDebit = await tx.balanceLedgerEntry.findUnique({
      where: { instructionCid_entryType: { instructionCid: params.instructionCid, entryType: "DEBIT" } },
    });
    if (existingDebit) {
      const payerBalance = await tx.partyBalance.findUnique({ where: { partyId: params.payerPartyId } });
      if (!payerBalance) throw new Error("Payer balance not found");
      let receiverView: PartyBalanceView | null = null;
      if (creditReceiver) {
        const receiverBalance = await tx.partyBalance.findUnique({
          where: { partyId: params.receiverPartyId },
        });
        receiverView = receiverBalance ? toBalanceView(receiverBalance) : null;
      }
      return { payer: toBalanceView(payerBalance), receiver: receiverView };
    }

    const payerBalance = await tx.partyBalance.findUnique({ where: { partyId: params.payerPartyId } });
    if (!payerBalance) {
      throw new Error("Payer balance not found");
    }

    const payerReserved = toNumber(payerBalance.reserved);
    if (payerReserved < params.amount) {
      throw new Error("Insufficient reserved balance for payer");
    }

    const updatedPayer = await tx.partyBalance.update({
      where: { partyId: params.payerPartyId },
      data: {
        reserved: { decrement: decimalAmount(params.amount) },
      },
    });

    await tx.balanceLedgerEntry.create({
      data: {
        partyId: params.payerPartyId,
        entryType: "DEBIT",
        amount: decimalAmount(params.amount),
        currency,
        referenceType: "SETTLEMENT_EXECUTE",
        referenceId: params.instructionCid,
        instructionCid: params.instructionCid,
        createdBy: params.createdBy,
      },
    });

    let receiverView: PartyBalanceView | null = null;
    if (creditReceiver) {
      const updatedReceiver = await tx.partyBalance.upsert({
        where: { partyId: params.receiverPartyId },
        update: { available: { increment: decimalAmount(params.amount) } },
        create: {
          partyId: params.receiverPartyId,
          available: decimalAmount(params.amount),
          reserved: decimalAmount(0),
          currency,
        },
      });

      await tx.balanceLedgerEntry.create({
        data: {
          partyId: params.receiverPartyId,
          entryType: "CREDIT",
          amount: decimalAmount(params.amount),
          currency,
          referenceType: "SETTLEMENT_RECEIVE",
          referenceId: params.instructionCid,
          instructionCid: params.instructionCid,
          createdBy: params.createdBy,
        },
      });

      receiverView = toBalanceView(updatedReceiver);
    } else {
      await tx.balanceLedgerEntry.create({
        data: {
          partyId: params.receiverPartyId,
          entryType: "PAYOUT",
          amount: decimalAmount(params.amount),
          currency,
          referenceType: "SETTLEMENT_PAYOUT",
          referenceId: params.instructionCid,
          instructionCid: params.instructionCid,
          createdBy: params.createdBy,
          note: "Real tUSD transferred from custody to receiver wallet",
        },
      });
    }

    return {
      payer: toBalanceView(updatedPayer),
      receiver: receiverView,
    };
  });
}

export async function releaseReservedBalance(params: {
  partyId: string;
  amount: number;
  instructionCid: string;
  createdBy?: string;
  note?: string;
}): Promise<PartyBalanceView | null> {
  assertPositiveAmount(params.amount, "Release amount");

  const currency = getSettlementCurrency();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.balanceLedgerEntry.findUnique({
      where: { instructionCid_entryType: { instructionCid: params.instructionCid, entryType: "RELEASE" } },
    });
    if (existing) {
      const balance = await tx.partyBalance.findUnique({ where: { partyId: params.partyId } });
      return balance ? toBalanceView(balance) : null;
    }

    const reserveEntry = await tx.balanceLedgerEntry.findUnique({
      where: { instructionCid_entryType: { instructionCid: params.instructionCid, entryType: "RESERVE" } },
    });
    if (!reserveEntry) {
      return null;
    }

    const balance = await tx.partyBalance.findUnique({ where: { partyId: params.partyId } });
    if (!balance) {
      throw new Error("Party balance not found");
    }

    const reserved = toNumber(balance.reserved);
    if (reserved < params.amount) {
      throw new Error("Insufficient reserved balance to release");
    }

    const updated = await tx.partyBalance.update({
      where: { partyId: params.partyId },
      data: {
        reserved: { decrement: decimalAmount(params.amount) },
        available: { increment: decimalAmount(params.amount) },
      },
    });

    await tx.balanceLedgerEntry.create({
      data: {
        partyId: params.partyId,
        entryType: "RELEASE",
        amount: decimalAmount(params.amount),
        currency,
        referenceType: "SETTLEMENT_FAIL",
        referenceId: params.instructionCid,
        instructionCid: params.instructionCid,
        createdBy: params.createdBy,
        note: params.note,
      },
    });

    return toBalanceView(updated);
  });
}

export async function sumRecordedDepositCredits(): Promise<number> {
  const entries = await prisma.balanceLedgerEntry.findMany({
    where: { referenceType: "DEPOSIT", entryType: "CREDIT" },
    select: { amount: true },
  });
  return entries.reduce((sum, entry) => sum + toNumber(entry.amount), 0);
}

function toBalanceView(balance: {
  partyId: string;
  available: Prisma.Decimal;
  reserved: Prisma.Decimal;
  currency: string;
}): PartyBalanceView {
  const available = toNumber(balance.available);
  const reserved = toNumber(balance.reserved);
  return {
    partyId: balance.partyId,
    available,
    reserved,
    total: available + reserved,
    currency: balance.currency,
  };
}
