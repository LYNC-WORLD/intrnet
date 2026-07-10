import { prisma } from "../db";

export const PARTICIPANT_ROLE = "participant";

export async function listActiveParticipantUsers(): Promise<
  Array<{ partyId: string; email: string }>
> {
  const users = await prisma.user.findMany({
    where: { status: "ACTIVE", role: PARTICIPANT_ROLE, partyId: { not: null } },
    select: { partyId: true, email: true },
    orderBy: { email: "asc" },
  });
  return users
    .filter((user): user is { partyId: string; email: string } => Boolean(user.partyId))
    .map((user) => ({ partyId: user.partyId, email: user.email }));
}
