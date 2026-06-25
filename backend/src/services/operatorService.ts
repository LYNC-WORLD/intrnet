import { operatorClient } from "../ledger/client";
import { T } from "../ledger/templateIds";
import { toConflictError } from "../utils/http";
import { getCashAccount } from "../repositories/pqsLedgerReadRepository";
import { auditLedgerExercise } from "./ledgerAudit";

export async function fundAccount(owner: string, currency: string, amount: number) {
  if (amount <= 0) return { error: "Amount must be positive", status: 400 as const };

  const account = await getCashAccount(owner, currency);
  if (!account) return { error: "Cash account not found", status: 404 as const };

  try {
    const client = await operatorClient();
    const result = await client.exercise({
      templateId: T.CashAccount,
      contractId: account.contractId,
      choice: "Credit",
      argument: { creditAmount: String(amount) },
    });

    await auditLedgerExercise(T.CashAccount, "Credit", account.contractId, result.events, {
      argument: { creditAmount: String(amount) },
    });

    return { data: result };
  } catch (err) {
    return toConflictError(err);
  }
}
