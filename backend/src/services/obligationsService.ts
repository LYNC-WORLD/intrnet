import { prisma } from "../db";
import { partyClient } from "../ledger/client";
import { getOperatorPartyId } from "../ledger/operatorParty";
import { T } from "../ledger/templateIds";

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
  const { partyId, userRole, userAgreementId, agreementId, status, role, currency, page, limit } = params;
  const where: any = {};
  if (userRole !== "operator") {
    where.OR = [{ payer: partyId }, { receiver: partyId }];
    if (userAgreementId) where.agreementId = userAgreementId;
  } else if (agreementId) {
    where.agreementId = agreementId;
  }
  if (status) where.status = status;
  if (currency) where.currency = currency;
  if (role === "payer") where.payer = partyId;
  if (role === "receiver") where.receiver = partyId;

  const [total, obligations] = await prisma.$transaction([
    prisma.obligation.count({ where }),
    prisma.obligation.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { obligations, total, page };
}

export async function getObligation(contractId: string, partyId: string, role: string) {
  const obligation = await prisma.obligation.findUnique({ where: { contractId } });
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

  const agreement = await prisma.nettingAgreement.findUnique({ where: { agreementId } });
  if (!agreement) {
    throw new Error("Agreement not found");
  }
  const participants = Array.isArray(agreement.participants) ? (agreement.participants as string[]) : [];
  if (!participants.includes(partyId)) {
    throw new Error("Payer is not a participant in the selected agreement");
  }
  if (!participants.includes(receiver)) {
    throw new Error("Receiver is not a participant in the same agreement");
  }

  const operatorPartyId = await getOperatorPartyId();
  return partyClient(token).create({
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
}

export async function acceptObligation(contractId: string, token: string, partyId: string) {
  const obligation = await prisma.obligation.findUnique({ where: { contractId } });
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
  return { data };
}

export async function rejectObligation(
  contractId: string,
  token: string,
  partyId: string,
  reason: string,
) {
  const obligation = await prisma.obligation.findUnique({ where: { contractId } });
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
  return { data };
}
