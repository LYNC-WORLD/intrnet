import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { getSettlementCurrency } from "../config/settlementToken";
import { getOperatorPartyId } from "../ledger/operatorParty";
import { listTokenHoldings } from "../settlementToken/holdingsService";
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

export async function findUnsettledReserveCids(
  partyId?: string,
): Promise<Array<{ instructionCid: string; partyId: string; amount: number }>> {
  const reserves = await prisma.balanceLedgerEntry.findMany({
    where: {
      entryType: "RESERVE",
      instructionCid: { not: null },
      ...(partyId ? { partyId } : {}),
    },
    select: { instructionCid: true, partyId: true, amount: true },
  });

  const unsettled: Array<{ instructionCid: string; partyId: string; amount: number }> = [];
  for (const reserve of reserves) {
    if (!reserve.instructionCid) continue;
    if (await hasLedgerEntry(reserve.instructionCid, "DEBIT")) continue;
    unsettled.push({
      instructionCid: reserve.instructionCid,
      partyId: reserve.partyId,
      amount: toNumber(reserve.amount),
    });
  }
  return unsettled;
}

export async function resolveSettlementBookkeepingCid(
  contractId: string,
  paymentReference?: string | null,
  hint?: { payer: string; amount: number },
): Promise<string> {
  if (
    (await hasLedgerEntry(contractId, "TRANSFER")) ||
    (await hasLedgerEntry(contractId, "RESERVE")) ||
    (await hasLedgerEntry(contractId, "DEBIT"))
  ) {
    return contractId;
  }

  const paymentRef =
    paymentReference?.trim() ||
    (await getSettlementTransferReference(contractId)) ||
    null;
  if (paymentRef) {
    const transferEntry = await prisma.balanceLedgerEntry.findFirst({
      where: { entryType: "TRANSFER", referenceId: paymentRef },
      select: { instructionCid: true },
    });
    if (transferEntry?.instructionCid) return transferEntry.instructionCid;
  }

  const linkedEntry = await prisma.balanceLedgerEntry.findFirst({
    where: {
      instructionCid: contractId,
      entryType: { in: ["RESERVE", "TRANSFER", "DEBIT", "PAYOUT", "CREDIT"] },
    },
    select: { instructionCid: true },
  });
  if (linkedEntry?.instructionCid) return linkedEntry.instructionCid;

  if (hint) {
    const unsettled = await findUnsettledReserveCids(hint.payer);
    const matches = unsettled.filter((entry) => entry.amount === hint.amount);
    if (matches.length === 1) return matches[0].instructionCid;
    if (matches.length > 1 && paymentRef) {
      for (const match of matches) {
        const ref = await getSettlementTransferReference(match.instructionCid);
        if (ref === paymentRef) return match.instructionCid;
      }
    }
  }

  return contractId;
}

function depositReversalReferenceId(holdingContractId: string): string {
  return `revoked:${holdingContractId}`;
}

async function listReversedDepositHoldingIds(holdingContractIds: string[]): Promise<Set<string>> {
  if (holdingContractIds.length === 0) return new Set();

  const reversals = await prisma.balanceLedgerEntry.findMany({
    where: {
      referenceType: "DEPOSIT_REVERSAL",
      referenceId: { in: holdingContractIds.map(depositReversalReferenceId) },
    },
    select: { referenceId: true },
  });

  return new Set(
    reversals
      .map((entry) => entry.referenceId?.replace(/^revoked:/, ""))
      .filter((referenceId): referenceId is string => Boolean(referenceId)),
  );
}

export async function listDepositHoldingIdsForParty(partyId: string): Promise<string[]> {
  const entries = await prisma.balanceLedgerEntry.findMany({
    where: {
      partyId,
      referenceType: "DEPOSIT",
      entryType: "CREDIT",
      referenceId: { not: null },
    },
    orderBy: { createdAt: "asc" },
  });

  const holdingIds = entries
    .map((entry) => entry.referenceId)
    .filter((referenceId): referenceId is string => Boolean(referenceId));
  const reversed = await listReversedDepositHoldingIds(holdingIds);
  return holdingIds.filter((holdingId) => !reversed.has(holdingId));
}

export async function listActiveDepositHoldingIdsForParty(partyId: string): Promise<string[]> {
  const custodyPartyId = await getOperatorPartyId();
  const recordedHoldingIds = await listDepositHoldingIdsForParty(partyId);
  const activeHoldings = await listTokenHoldings(custodyPartyId);
  const activeById = new Map(activeHoldings.map((holding) => [holding.contractId, holding]));

  const activeRecorded = recordedHoldingIds.filter((holdingId) => activeById.has(holdingId));
  const seen = new Set(activeRecorded);

  for (const holding of activeHoldings) {
    if (seen.has(holding.contractId)) continue;
    if (holding.attributedParty === partyId) {
      activeRecorded.push(holding.contractId);
      seen.add(holding.contractId);
    }
  }

  return activeRecorded;
}

export async function hasUnsettledReserve(partyId: string): Promise<boolean> {
  const reserves = await prisma.balanceLedgerEntry.findMany({
    where: { partyId, entryType: "RESERVE", instructionCid: { not: null } },
    select: { instructionCid: true },
  });

  for (const reserve of reserves) {
    if (!reserve.instructionCid) continue;
    const debited = await prisma.balanceLedgerEntry.findUnique({
      where: {
        instructionCid_entryType: { instructionCid: reserve.instructionCid, entryType: "DEBIT" },
      },
    });
    if (!debited) return true;
  }
  return false;
}

export async function revokeStaleDepositCredit(params: {
  holdingContractId: string;
  createdBy?: string;
  note?: string;
}): Promise<{ revoked: boolean; partyId?: string; amount?: number }> {
  const holdingContractId = params.holdingContractId.trim();
  if (!holdingContractId) return { revoked: false };

  const deposit = await prisma.balanceLedgerEntry.findUnique({
    where: {
      referenceType_referenceId: {
        referenceType: "DEPOSIT",
        referenceId: holdingContractId,
      },
    },
  });
  if (!deposit || deposit.entryType !== "CREDIT" || !deposit.referenceId) {
    return { revoked: false };
  }

  const reversalReferenceId = depositReversalReferenceId(holdingContractId);
  const existingReversal = await prisma.balanceLedgerEntry.findUnique({
    where: {
      referenceType_referenceId: {
        referenceType: "DEPOSIT_REVERSAL",
        referenceId: reversalReferenceId,
      },
    },
  });
  if (existingReversal) {
    return { revoked: false, partyId: deposit.partyId, amount: toNumber(deposit.amount) };
  }

  const currency = getSettlementCurrency();
  const amount = toNumber(deposit.amount);
  const note =
    params.note ??
    `Reversed stale deposit credit for archived custody holding ${holdingContractId}`;

  if (amount > 0 && (await hasUnsettledReserve(deposit.partyId))) {
    const balance = await prisma.partyBalance.findUnique({ where: { partyId: deposit.partyId } });
    const available = balance ? toNumber(balance.available) : 0;
    if (available < amount) {
      return { revoked: false, partyId: deposit.partyId, amount };
    }
  }

  await prisma.$transaction(async (tx) => {
    const balance = await tx.partyBalance.findUnique({ where: { partyId: deposit.partyId } });
    if (!balance) {
      throw new Error(`Cannot revoke stale deposit ${holdingContractId}: party balance not found`);
    }

    const available = toNumber(balance.available);
    const reserved = toNumber(balance.reserved);
    const total = available + reserved;
    const fromAvailable = Math.min(available, amount);
    const fromReserved = Math.min(reserved, amount - fromAvailable);

    if (fromAvailable + fromReserved < amount) {
      await tx.balanceLedgerEntry.create({
        data: {
          partyId: deposit.partyId,
          entryType: "DEBIT",
          amount: deposit.amount,
          currency,
          referenceType: "DEPOSIT_REVERSAL",
          referenceId: reversalReferenceId,
          createdBy: params.createdBy,
          note: `${note} (balance already adjusted)`,
        },
      });
      return;
    }

    if (fromAvailable > 0 || fromReserved > 0) {
      await tx.partyBalance.update({
        where: { partyId: deposit.partyId },
        data: {
          ...(fromAvailable > 0 ? { available: { decrement: decimalAmount(fromAvailable) } } : {}),
          ...(fromReserved > 0 ? { reserved: { decrement: decimalAmount(fromReserved) } } : {}),
        },
      });
    }

    await tx.balanceLedgerEntry.create({
      data: {
        partyId: deposit.partyId,
        entryType: "DEBIT",
        amount: deposit.amount,
        currency,
        referenceType: "DEPOSIT_REVERSAL",
        referenceId: reversalReferenceId,
        createdBy: params.createdBy,
        note,
      },
    });
  });

  return { revoked: true, partyId: deposit.partyId, amount };
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
      const existing = await tx.balanceLedgerEntry.findUnique({
        where: {
          referenceType_referenceId: {
            referenceType: "DEPOSIT",
            referenceId: params.holdingContractId,
          },
        },
      });
      if (existing) {
        const balance = await tx.partyBalance.findUnique({ where: { partyId: params.partyId } });
        return balance ? toBalanceView(balance) : null;
      }

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
      const balance = await prisma.partyBalance.findUnique({ where: { partyId: params.partyId } });
      return balance ? toBalanceView(balance) : null;
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
        referenceType: "SETTLEMENT_RESERVE",
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
    const existingPayout = creditReceiver
      ? null
      : await tx.balanceLedgerEntry.findUnique({
          where: { instructionCid_entryType: { instructionCid: params.instructionCid, entryType: "PAYOUT" } },
        });
    if (existingDebit && (!creditReceiver ? existingPayout : true)) {
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

    let updatedPayer = payerBalance;
    if (!existingDebit) {
      const payerReserved = toNumber(payerBalance.reserved);
      if (payerReserved < params.amount) {
        throw new Error("Insufficient reserved balance for payer");
      }

      updatedPayer = await tx.partyBalance.update({
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
          referenceType: "SETTLEMENT_DEBIT",
          referenceId: params.instructionCid,
          instructionCid: params.instructionCid,
          createdBy: params.createdBy,
        },
      });
    }

    let receiverView: PartyBalanceView | null = null;
    if (creditReceiver) {
      const existingCredit = await tx.balanceLedgerEntry.findUnique({
        where: { instructionCid_entryType: { instructionCid: params.instructionCid, entryType: "CREDIT" } },
      });
      if (!existingCredit) {
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
        const receiverBalance = await tx.partyBalance.findUnique({
          where: { partyId: params.receiverPartyId },
        });
        receiverView = receiverBalance ? toBalanceView(receiverBalance) : null;
      }
    } else if (!existingPayout) {
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
          note: `Real ${currency} transferred from custody to receiver wallet`,
        },
      });
    }

    return {
      payer: toBalanceView(updatedPayer),
      receiver: receiverView,
    };
  });
}

export async function creditSettlementReceiver(params: {
  receiverPartyId: string;
  amount: number;
  instructionCid: string;
  createdBy?: string;
}): Promise<PartyBalanceView | null> {
  assertPositiveAmount(params.amount, "Settlement amount");

  const currency = getSettlementCurrency();

  try {
    return await prisma.$transaction(async (tx) => {
      const existingCredit = await tx.balanceLedgerEntry.findUnique({
        where: {
          instructionCid_entryType: { instructionCid: params.instructionCid, entryType: "CREDIT" },
        },
      });
      if (existingCredit) {
        const balance = await tx.partyBalance.findUnique({ where: { partyId: params.receiverPartyId } });
        return balance ? toBalanceView(balance) : null;
      }

      const debit = await tx.balanceLedgerEntry.findUnique({
        where: {
          instructionCid_entryType: { instructionCid: params.instructionCid, entryType: "DEBIT" },
        },
      });
      if (!debit) {
        throw new Error("Settlement must be executed before receiver can confirm");
      }

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
          note: `Receiver accepted on-chain ${currency} and confirmed settlement`,
        },
      });

      return toBalanceView(updatedReceiver);
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const balance = await prisma.partyBalance.findUnique({ where: { partyId: params.receiverPartyId } });
      return balance ? toBalanceView(balance) : null;
    }
    throw err;
  }
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
