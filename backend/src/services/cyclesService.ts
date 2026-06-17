import { prisma } from "../db";
import { operatorClient } from "../ledger/client";
import { T } from "../ledger/templateIds";
import { isServiceError } from "../utils/http";
import { resolveAgreementFromInput } from "./agreementsService";
import {
  bulkAddObligations,
  computeNetPositions,
} from "./nettingOrchestrator";

export async function listCycles(role: string, userAgreementId?: string | null, agreementId?: string) {
  const where: Record<string, unknown> = {};
  if (role !== "operator") {
    if (userAgreementId) where.agreementId = userAgreementId;
  } else if (agreementId) {
    where.agreementId = agreementId;
  }
  return prisma.nettingCycle.findMany({ where, orderBy: { createdAt: "desc" } });
}

export async function getCycle(contractId: string) {
  const cycle = await prisma.nettingCycle.findFirst({ where: { contractId } });
  if (!cycle) return { error: "Cycle not found", status: 404 as const };
  return { data: cycle };
}

export async function startCycle(
  cycleId: string,
  cutoffTime: string,
  agreementId?: string,
  agreementContractId?: string,
) {
  const resolution = await resolveAgreementFromInput({ agreementId, agreementContractId });
  if (isServiceError(resolution)) return resolution;

  return operatorClient().exercise({
    templateId: T.NettingAgreement,
    contractId: resolution.data.agreementContractId,
    choice: "StartNettingCycle",
    argument: { cycleId, cutoffTime },
  });
}

export async function addObligationsToCycle(contractId: string) {
  const cycle = await prisma.nettingCycle.findFirst({ where: { contractId } });
  if (!cycle) return { error: "Cycle not found", status: 404 as const };
  const newContractId = await bulkAddObligations(contractId, cycle.cycleId, cycle.agreementId);
  return { data: { newContractId } };
}

export async function computeCyclePositions(contractId: string) {
  return computeNetPositions(contractId);
}
