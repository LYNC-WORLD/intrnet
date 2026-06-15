import { prisma } from "../db";
import { operatorClient } from "../ledger/client";
import { T } from "../ledger/templateIds";

export async function listParticipants() {
  const agreements = await operatorClient().query(T.NettingAgreement);
  const agreement = agreements[0];
  const partyFilter = agreement?.payload?.participants as string[] | undefined;

  return prisma.user.findMany({
    where: {
      role: "participant",
      ...(partyFilter ? { partyId: { in: partyFilter } } : {}),
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

export async function getAgreement() {
  const agreements = await operatorClient().query(T.NettingAgreement);
  const agreement = agreements[0];
  if (!agreement) return { error: "Agreement not found", status: 404 as const };

  return {
    data: {
      contractId: agreement.contractId,
      ...agreement.payload,
    },
  };
}
