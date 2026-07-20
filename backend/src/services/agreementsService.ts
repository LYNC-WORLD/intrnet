import { prisma } from "../db";
import { operatorClient } from "../ledger/client";
import { getOperatorPartyId } from "../ledger/operatorParty";
import { T } from "../ledger/templateIds";
import {
  getAgreementById,
  getAgreementContractId,
  listAgreements as pqsListAgreements,
} from "../repositories/pqsLedgerReadRepository";
import { ServiceError } from "../utils/http";
import { auditLedgerCreate } from "./ledgerAudit";

export type AgreementPayload = {
  agreementId?: string;
  participants?: string[];
  settlementCurrency?: string;
  agreementDate?: string;
  operator?: string;
};

export async function syncUserAgreementContractId(
  agreementId: string,
  contractId: string,
): Promise<void> {
  await prisma.user.updateMany({
    where: { agreementId, status: "ACTIVE" },
    data: { agreementContractId: contractId },
  });
}

export async function createAgreement(input: {
  agreementId: string;
  settlementCurrency: string;
  agreementDate?: string;
}): Promise<ServiceError | { contractId: string; payload: Record<string, unknown> }> {
  const existing = await getAgreementById(input.agreementId);
  if (existing) {
    return { error: `Agreement '${input.agreementId}' already exists`, status: 409 as const };
  }

  const operator = await getOperatorPartyId();
  const client = await operatorClient();
  const created = await client.create({
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

  await auditLedgerCreate(T.NettingAgreement, created.contractId, created.payload, operator);
  return created;
}

export async function listAgreements() {
  return pqsListAgreements();
}

export async function getAgreementByIdSvc(agreementId: string) {
  const agreement = await getAgreementById(agreementId);
  if (!agreement) return { error: "Agreement not found", status: 404 as const };
  return { data: agreement };
}

export async function resolveAgreementContractId(
  agreementId: string,
): Promise<ServiceError | { data: string }> {
  const contractId = await getAgreementContractId(agreementId);
  if (!contractId) return { error: "Agreement not found", status: 404 as const };
  return { data: contractId };
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

  const client = await operatorClient();
  const agreement = await client.fetchById(input.agreementContractId);
  if (!agreement) return { error: "NettingAgreement not found on ledger", status: 404 as const };

  const payload = agreement.payload as AgreementPayload;
  if (payload.agreementId) {
    await syncUserAgreementContractId(payload.agreementId, agreement.contractId);
  }
  return {
    data: {
      agreementId: payload.agreementId ?? "",
      agreementContractId: agreement.contractId,
    },
  };
}
