import { partyClient } from "../ledger/client";
import { getOperatorPartyId } from "../ledger/operatorParty";
import { T } from "../ledger/templateIds";
import {
  getAgreementById,
  getObligation,
  listObligations as pqsListObligations,
} from "../repositories/pqsLedgerReadRepository";
import { auditLedgerCreate, auditLedgerExercise } from "./ledgerAudit";

export async function listObligations(params: {
  partyId: string;
  userRole: string;
  userAgreementId?: string | null;
  agreementId?: string;
  status?: string;
  role?: string;
  currency?: string;
  page: number;
  limit: number;
}) {
  return pqsListObligations(params);
}

export async function getObligationSvc(contractId: string, partyId: string, role: string) {
  const obligation = await getObligation(contractId);
  if (!obligation) return { error: "Obligation not found", status: 404 as const };
  if (role !== "operator" && obligation.payer !== partyId && obligation.receiver !== partyId) {
    return { error: "Not authorized for this obligation", status: 403 as const };
  }
  return { data: obligation };
}

export async function createObligation(params: {
  token: string;
  partyId: string;
  userRole: string;
  userAgreementId?: string | null;
  receiver: string;
  amount: number;
  currency: string;
  description: string;
  invoiceRef: string;
  agreementId?: string;
}) {
  const {
    token,
    partyId,
    userRole,
    userAgreementId,
    receiver,
    amount,
    currency,
    description,
    invoiceRef,
    agreementId: inputAgreementId,
  } = params;
  const agreementId = userRole === "operator" ? inputAgreementId : userAgreementId;
  if (!agreementId) {
    throw new Error("agreementId is required");
  }

  const agreement = await getAgreementById(agreementId);
  if (!agreement) {
    throw new Error("Agreement not found");
  }
  const participants = agreement.participants;
  if (!participants.includes(partyId)) {
    throw new Error("Payer is not a participant in the selected agreement");
  }
  if (!participants.includes(receiver)) {
    throw new Error("Receiver is not a participant in the same agreement");
  }

  const operatorPartyId = await getOperatorPartyId();
  const created = await partyClient(token).create({
    templateId: T.Obligation,
    payload: {
      payer: partyId,
      receiver,
      amount: String(amount),
      currency,
      description,
      invoiceRef,
      agreementId,
      operator: operatorPartyId,
      status: "PENDING",
      createdAt: new Date().toISOString(),
    },
  });

  await auditLedgerCreate(T.Obligation, created.contractId, created.payload, partyId);
  return created;
}

export async function acceptObligation(contractId: string, token: string, partyId: string) {
  const obligation = await getObligation(contractId);
  if (!obligation) return { error: "Obligation not found", status: 404 as const };
  if (obligation.receiver !== partyId) {
    return { error: "Only receiver can accept this obligation", status: 403 as const };
  }
  const data = await partyClient(token).exercise({
    templateId: T.Obligation,
    contractId,
    choice: "AcceptObligation",
    argument: {},
  });

  await auditLedgerExercise(T.Obligation, "AcceptObligation", contractId, data.events, {
    actorPartyId: partyId,
    beforePayload: obligation as unknown as Record<string, unknown>,
  });

  return { data };
}

export async function rejectObligation(
  contractId: string,
  token: string,
  partyId: string,
  reason: string,
) {
  const obligation = await getObligation(contractId);
  if (!obligation) return { error: "Obligation not found", status: 404 as const };
  if (obligation.receiver !== partyId) {
    return { error: "Only receiver can reject this obligation", status: 403 as const };
  }
  const data = await partyClient(token).exercise({
    templateId: T.Obligation,
    contractId,
    choice: "RejectObligation",
    argument: { reason },
  });

  await auditLedgerExercise(T.Obligation, "RejectObligation", contractId, data.events, {
    actorPartyId: partyId,
    beforePayload: obligation as unknown as Record<string, unknown>,
    argument: { reason },
  });

  return { data };
}
