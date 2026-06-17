import { prisma } from "../db";
import { operatorClient } from "../ledger/client";
import { getOperatorPartyId } from "../ledger/operatorParty";
import { T } from "../ledger/templateIds";
import { ServiceError } from "../utils/http";

type AgreementPayload = {
  agreementId?: string;
  participants?: string[];
  settlementCurrency?: string;
  agreementDate?: string;
  operator?: string;
};

function toAgreementRecord(contractId: string, payload: AgreementPayload) {
  if (!payload.agreementId) throw new Error("NettingAgreement payload is missing agreementId");
  return {
    agreementId: payload.agreementId,
    contractId,
    operator: payload.operator ?? "",
    settlementCurrency: payload.settlementCurrency ?? "USD",
    participants: payload.participants ?? [],
    agreementDate: new Date(payload.agreementDate ?? new Date().toISOString().slice(0, 10)),
  };
}

export async function createAgreement(input: {
  agreementId: string;
  settlementCurrency: string;
  agreementDate?: string;
}) {
  const operator = await getOperatorPartyId();
  return operatorClient().create({
    templateId: T.NettingAgreement,
    payload: {
      operator,
      participants: [],
      settlementCurrency: input.settlementCurrency,
      fxOracleParty: operator,
      agreementDate: input.agreementDate ?? new Date().toISOString().slice(0, 10),
      agreementId: input.agreementId,
    },
  });
}

export async function listAgreements() {
  return prisma.nettingAgreement.findMany({ orderBy: { agreementId: "asc" } });
}

export async function getAgreementById(agreementId: string) {
  const agreement = await prisma.nettingAgreement.findUnique({ where: { agreementId } });
  if (!agreement) return { error: "Agreement not found", status: 404 as const };
  return { data: agreement };
}

export async function resolveAgreementContractId(
  agreementId: string,
): Promise<ServiceError | { data: string }> {
  const agreement = await prisma.nettingAgreement.findUnique({ where: { agreementId } });
  if (!agreement) return { error: "Agreement not found", status: 404 as const };
  return { data: agreement.contractId };
}

export async function upsertAgreementFromLedger(contractId: string, payload: AgreementPayload) {
  const data = toAgreementRecord(contractId, payload);
  return prisma.nettingAgreement.upsert({
    where: { agreementId: data.agreementId },
    create: data,
    update: data,
  });
}

export async function resolveAgreementFromInput(input: {
  agreementId?: string;
  agreementContractId?: string;
}): Promise<ServiceError | { data: { agreementId: string; agreementContractId: string } }> {
  if (input.agreementId) {
    const result = await resolveAgreementContractId(input.agreementId);
    if ("error" in result) return result;
    return { data: { agreementId: input.agreementId, agreementContractId: result.data } };
  }

  if (!input.agreementContractId) {
    return { error: "agreementId or agreementContractId is required", status: 400 as const };
  }

  const agreement = await operatorClient().fetchById(input.agreementContractId);
  if (!agreement) return { error: "NettingAgreement not found on ledger", status: 404 as const };

  const payload = agreement.payload as AgreementPayload;
  await upsertAgreementFromLedger(agreement.contractId, payload);
  return {
    data: {
      agreementId: payload.agreementId ?? "",
      agreementContractId: agreement.contractId,
    },
  };
}
