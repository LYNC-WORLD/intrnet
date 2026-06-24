import { prisma } from "../db";
import { operatorClient, partyClient } from "../ledger/client";
import { T } from "../ledger/templateIds";

function toConflictError(err: unknown) {
  if (err instanceof Error) return { error: err.message, status: 409 as const };
  return { error: "Ledger operation failed", status: 409 as const };
}

function nextInstructionContractId(events: unknown[]) {
  const createdInstruction = (
    events as Array<{ created?: { templateId?: string; contractId?: string } }>
  ).find((event) => event.created?.templateId?.includes("SettlementInstruction"));
  return createdInstruction?.created?.contractId;
}

export async function listSettlementInstructions(
  role: string,
  partyId: string,
  userAgreementId?: string | null,
  agreementId?: string,
) {
  const cycleFilterAgreementId = role === "operator" ? agreementId : userAgreementId;
  const cycleIds = cycleFilterAgreementId
    ? (
        await prisma.nettingCycle.findMany({
          where: { agreementId: cycleFilterAgreementId },
          select: { cycleId: true },
        })
      ).map((cycle) => cycle.cycleId)
    : undefined;

  const where: Record<string, unknown> = {};
  if (cycleIds) where.cycleId = { in: cycleIds };
  if (role !== "operator") where.OR = [{ payer: partyId }, { receiver: partyId }];

  return prisma.settlementInstruction.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
}

export async function listCashAccounts(role: string, partyId: string) {
  if (role === "operator") {
    return prisma.cashAccount.findMany({ orderBy: { owner: "asc" } });
  }
  return prisma.cashAccount.findMany({
    where: { owner: partyId },
    orderBy: { currency: "asc" },
  });
}

export async function executeSettlement(contractId: string) {
  const instruction = await prisma.settlementInstruction.findUnique({ where: { contractId } });
  if (!instruction) return { error: "Settlement instruction not found", status: 404 as const };
  if (instruction.status !== "PENDING") {
    return { error: "Only PENDING settlement instructions can be executed", status: 400 as const };
  }

  const payerAccount = await prisma.cashAccount.findFirst({
    where: { owner: instruction.payer, currency: instruction.currency },
  });
  if (!payerAccount) return { error: "Payer cash account not found", status: 404 as const };
  const receiverAccount = await prisma.cashAccount.findFirst({
    where: { owner: instruction.receiver, currency: instruction.currency },
  });
  if (!receiverAccount) return { error: "Receiver cash account not found", status: 404 as const };

  if (Number(payerAccount.balance) < Number(instruction.amount)) {
    return { error: "Insufficient payer balance", status: 400 as const };
  }

  try {
    const client = await operatorClient();
    const result = await client.exercise({
      templateId: T.SettlementInstruction,
      contractId,
      choice: "ExecuteSettlement",
      argument: {
        payerAcctCid: payerAccount.contractId,
        receiverAcctCid: receiverAccount.contractId,
      },
    });

    return {
      data: {
        ...result,
        newContractId: nextInstructionContractId(result.events),
      },
    };
  } catch (err) {
    return toConflictError(err);
  }
}

export async function confirmSettlement(contractId: string, token: string, partyId: string) {
  const instruction = await prisma.settlementInstruction.findUnique({ where: { contractId } });
  if (!instruction) return { error: "Settlement instruction not found", status: 404 as const };
  if (instruction.receiver !== partyId) {
    return { error: "Only receiver can confirm this settlement", status: 403 as const };
  }
  if (instruction.status !== "EXECUTED") {
    return { error: "Only EXECUTED settlement instructions can be confirmed", status: 400 as const };
  }

  try {
    const result = await partyClient(token).exercise({
      templateId: T.SettlementInstruction,
      contractId,
      choice: "ConfirmReceipt",
      argument: {},
    });
    return {
      data: {
        ...result,
        newContractId: nextInstructionContractId(result.events),
      },
    };
  } catch (err) {
    return toConflictError(err);
  }
}
