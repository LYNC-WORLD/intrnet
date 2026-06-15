import { prisma } from "../db";
import { operatorClient } from "../ledger/client";
import { T } from "../ledger/templateIds";
import {
  bulkAddObligations,
  computeNetPositions,
} from "./nettingOrchestrator";

export async function listCycles() {
  return prisma.nettingCycle.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getCycle(contractId: string) {
  const cycle = await prisma.nettingCycle.findFirst({ where: { contractId } });
  if (!cycle) return { error: "Cycle not found", status: 404 as const };
  return { data: cycle };
}

export async function startCycle(cycleId: string, cutoffTime: string, agreementContractId: string) {
  return operatorClient().exercise({
    templateId: T.NettingAgreement,
    contractId: agreementContractId,
    choice: "StartNettingCycle",
    argument: { cycleId, cutoffTime },
  });
}

export async function addObligationsToCycle(contractId: string) {
  const cycle = await prisma.nettingCycle.findFirst({ where: { contractId } });
  if (!cycle) return { error: "Cycle not found", status: 404 as const };
  const newContractId = await bulkAddObligations(contractId, cycle.cycleId);
  return { data: { newContractId } };
}

export async function computeCyclePositions(contractId: string) {
  return computeNetPositions(contractId);
}
