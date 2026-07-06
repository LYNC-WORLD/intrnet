import { operatorClient, partyClient } from "../ledger/client";
import { T } from "../ledger/templateIds";
import { toConflictError } from "../utils/http";
import {
  getCashAccount,
  getInstruction,
  listCashAccounts as pqsListCashAccounts,
  listCycleIdsByAgreement,
  listSettlementInstructions as pqsListInstructions,
} from "../repositories/pqsLedgerReadRepository";
import { auditLedgerExercise } from "./ledgerAudit";

export async function listSettlementInstructions(
  role: string,
  partyId: string,
  userAgreementId?: string | null,
  agreementId?: string,
) {
  const cycleFilterAgreementId = role === "operator" ? agreementId : userAgreementId;
  const cycleIds = cycleFilterAgreementId
    ? await listCycleIdsByAgreement(cycleFilterAgreementId)
    : undefined;

  return pqsListInstructions({ role, partyId, cycleIds });
}

export async function listCashAccounts(role: string, partyId: string) {
  if (role === "operator") {
    return pqsListCashAccounts();
  }
  return pqsListCashAccounts(partyId);
}

export async function executeSettlement(contractId: string) {
  const instruction = await getInstruction(contractId);
  if (!instruction) return { error: "Settlement instruction not found", status: 404 as const };
  if (instruction.status !== "PENDING") {
    return { error: "Only PENDING settlement instructions can be executed", status: 400 as const };
  }

  const payerAccount = await getCashAccount(instruction.payer, instruction.currency);
  if (!payerAccount) return { error: "Payer cash account not found", status: 404 as const };
  const receiverAccount = await getCashAccount(instruction.receiver, instruction.currency);
  if (!receiverAccount) return { error: "Receiver cash account not found", status: 404 as const };

  if (payerAccount.balance < instruction.amount) {
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

    await auditLedgerExercise(T.SettlementInstruction, "ExecuteSettlement", contractId, result.events);

    return { data: result };
  } catch (err) {
    return toConflictError(err);
  }
}

export async function confirmSettlement(contractId: string, token: string, partyId: string) {
  const instruction = await getInstruction(contractId);
  if (!instruction) return { error: "Settlement instruction not found", status: 404 as const };
  if (instruction.receiver !== partyId) {
    return { error: "Only receiver can confirm this settlement", status: 403 as const };
  }
  if (instruction.status !== "EXECUTED") {
    return { error: "Only EXECUTED settlement instructions can be confirmed", status: 400 as const };
  }

  try {
    const result = await partyClient(token, partyId).exercise({
      templateId: T.SettlementInstruction,
      contractId,
      choice: "ConfirmReceipt",
      argument: {},
    });

    await auditLedgerExercise(T.SettlementInstruction, "ConfirmReceipt", contractId, result.events, {
      actorPartyId: partyId,
    });

    return { data: result };
  } catch (err) {
    return toConflictError(err);
  }
}
