import { prisma } from "../db";
import { operatorClient } from "../ledger/client";
import { T } from "../ledger/templateIds";
import { resolveAgreementContractId } from "./agreementsService";

export async function listParticipants(agreementId: string) {
  const agreement = await prisma.nettingAgreement.findUnique({
    where: { agreementId },
    select: { participants: true },
  });
  const participants = Array.isArray(agreement?.participants) ? (agreement?.participants as string[]) : [];

  return prisma.user.findMany({
    where: {
      role: "participant",
      agreementId,
      ...(participants.length ? { partyId: { in: participants } } : {}),
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
  const resolution = await resolveAgreementContractId(agreementId);
  if ("error" in resolution) return resolution;

  const client = await operatorClient();
  const agreement = await client.fetchById(resolution.data);
  if (!agreement) return { error: "Agreement not found", status: 404 as const };

  return {
    data: {
      contractId: agreement.contractId,
      ...agreement.payload,
    },
  };
}
