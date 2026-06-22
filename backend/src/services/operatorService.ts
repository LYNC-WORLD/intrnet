import { prisma } from "../db";
import { operatorClient } from "../ledger/client";
import { T } from "../ledger/templateIds";

function nextCashAccountContractId(events: unknown[]) {
  const createdAccount = (events as Array<{ created?: { templateId?: string; contractId?: string } }>).find(
    (event) => event.created?.templateId?.includes("CashAccount"),
  );
  return createdAccount?.created?.contractId;
}

function toConflictError(err: unknown) {
  if (err instanceof Error) return { error: err.message, status: 409 as const };
  return { error: "Ledger operation failed", status: 409 as const };
}

export async function fundAccount(owner: string, currency: string, amount: number) {
  if (amount <= 0) return { error: "Amount must be positive", status: 400 as const };

  const account = await prisma.cashAccount.findFirst({
    where: { owner, currency },
  });
  if (!account) return { error: "Cash account not found", status: 404 as const };

  try {
    const client = await operatorClient();
    const result = await client.exercise({
      templateId: T.CashAccount,
      contractId: account.contractId,
      choice: "Credit",
      argument: { creditAmount: String(amount) },
    });
    return {
      data: {
        ...result,
        newContractId: nextCashAccountContractId(result.events),
      },
    };
  } catch (err) {
    return toConflictError(err);
  }
}
