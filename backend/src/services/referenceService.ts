import { prisma } from "../db";
import { operatorClient } from "../ledger/client";
import {
  getAgreementParticipants,
  getAgreementContractId,
} from "../repositories/pqsLedgerReadRepository";

export async function listParticipants(agreementId: string) {
  const participants = await getAgreementParticipants(agreementId);

  return prisma.user.findMany({
    where: {
      role: "participant",
      agreementId,
      ...(participants.length > 0 ? { partyId: { in: participants } } : {}),
    },
    orderBy: { companyName: "asc" },
    select: {
      partyId: true,
      companyName: true,
      email: true,
      status: true,
    },
  });
}

export async function getAgreement(agreementId: string) {
  const contractId = await getAgreementContractId(agreementId);
  if (!contractId) return { error: "Agreement not found", status: 404 as const };

  const client = await operatorClient();
  const agreement = await client.fetchById(contractId);
  if (!agreement) return { error: "Agreement not found", status: 404 as const };

  return {
    data: {
      contractId: agreement.contractId,
      ...agreement.payload,
    },
  };
}
