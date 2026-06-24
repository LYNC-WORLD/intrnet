import { prisma } from "../db";
import { partyClient } from "../ledger/client";
import { T } from "../ledger/templateIds";

export async function listPositions(
  partyId: string,
  role: string,
  cycleId?: string,
  userAgreementId?: string | null,
  agreementId?: string,
) {
  const where: any = {};
  if (role !== "operator") where.participant = partyId;
  if (cycleId) where.cycleId = cycleId;

  if (role !== "operator" && userAgreementId) {
    where.cycle = { agreementId: userAgreementId };
  } else if (role === "operator" && agreementId) {
    where.cycle = { agreementId };
  }

  return prisma.netPosition.findMany({ where });
}

export async function acknowledgePosition(contractId: string, token: string, partyId: string) {
  const position = await prisma.netPosition.findUnique({ where: { contractId } });
  if (!position) return { error: "Net position not found", status: 404 as const };
  if (position.participant !== partyId) {
    return { error: "Not authorized for this net position", status: 403 as const };
  }
  if (position.status !== "PENDING") {
    return { error: "Only PENDING positions can be acknowledged", status: 400 as const };
  }

  const data = await partyClient(token).exercise({
    templateId: T.NetPosition,
    contractId,
    choice: "AcknowledgePosition",
    argument: {},
  });
  return { data };
}
