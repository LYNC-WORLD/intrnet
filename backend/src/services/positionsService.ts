import { prisma } from "../db";

export async function listPositions(partyId: string, role: string, cycleId?: string) {
  const where: any = {};
  if (role !== "operator") where.participant = partyId;
  if (cycleId) where.cycleId = cycleId;
  return prisma.netPosition.findMany({ where });
}
