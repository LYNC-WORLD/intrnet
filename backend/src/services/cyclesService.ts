import { prisma } from "../db";
import { operatorClient } from "../ledger/client";
import { T } from "../ledger/templateIds";
import { isServiceError } from "../utils/http";
import { resolveAgreementFromInput } from "./agreementsService";
import { computeCycleGateSummary } from "./cycleGateService";
import {
  bulkAddObligations,
  computeNetPositions,
} from "./nettingOrchestrator";

function toConflictError(err: unknown) {
  if (err instanceof Error) return { error: err.message, status: 409 as const };
  return { error: "Ledger operation failed", status: 409 as const };
}

function nextCycleContractId(events: unknown[]) {
  const createdCycle = (events as Array<{ created?: { templateId?: string; contractId?: string } }>).find(
    (event) => event.created?.templateId?.includes("NettingCycle"),
  );
  return createdCycle?.created?.contractId;
}

async function loadSettlementPositionCids(contractId: string) {
  const cycle = await prisma.nettingCycle.findFirst({ where: { contractId } });
  if (!cycle) return { error: "Cycle not found", status: 404 as const };

  const positions = await prisma.netPosition.findMany({
    where: {
      cycleId: cycle.cycleId,
      status: { not: "ARCHIVED" },
    },
    orderBy: { updatedAt: "desc" },
  });

  const latestByParticipant = new Map<string, string>();
  for (const position of positions) {
    if (!latestByParticipant.has(position.participant)) {
      latestByParticipant.set(position.participant, position.contractId);
    }
  }
  return { data: Array.from(latestByParticipant.values()) };
}

async function loadSettlementInstructionCids(contractId: string) {
  const cycle = await prisma.nettingCycle.findFirst({ where: { contractId } });
  if (!cycle) return { error: "Cycle not found", status: 404 as const };
  const instructions = await prisma.settlementInstruction.findMany({
    where: {
      cycleId: cycle.cycleId,
      status: { not: "ARCHIVED" },
    },
    select: { contractId: true },
    orderBy: { updatedAt: "desc" },
  });
  return { data: instructions.map((instruction) => instruction.contractId) };
}

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
  const cycle = await prisma.nettingCycle.findFirst({
    where: { contractId },
    include: { positions: true },
  });
  if (!cycle) return { error: "Cycle not found", status: 404 as const };

  const instructions = await prisma.settlementInstruction.findMany({
    where: { cycleId: cycle.cycleId },
    select: { status: true },
  });
  const gateSummary = computeCycleGateSummary({
    status: cycle.status,
    settlementPhase: cycle.settlementPhase,
    ackDeadline: cycle.ackDeadline,
    positionContractIds: cycle.positionContractIds,
    positions: cycle.positions,
    instructions,
  });

  return {
    data: {
      ...cycle,
      ...gateSummary,
    },
  };
}

export async function startCycle(
  cycleId: string,
  cutoffTime: string,
  agreementId?: string,
  agreementContractId?: string,
) {
  const resolution = await resolveAgreementFromInput({ agreementId, agreementContractId });
  if (isServiceError(resolution)) return resolution;

  const client = await operatorClient();
  return client.exercise({
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

export async function computeCyclePositions(contractId: string, ackDeadline?: string) {
  const cycle = await prisma.nettingCycle.findFirst({ where: { contractId } });
  if (!cycle) return { error: "Cycle not found", status: 404 as const };

  const resolvedAckDeadline = ackDeadline ?? cycle.cutoffTime.toISOString();
  try {
    const result = await computeNetPositions(contractId, resolvedAckDeadline);
    return {
      data: {
        ...result,
        newContractId: nextCycleContractId(result.events),
      },
    };
  } catch (err) {
    return toConflictError(err);
  }
}

export async function settleCycle(contractId: string) {
  const positionResult = await loadSettlementPositionCids(contractId);
  if (isServiceError(positionResult)) return positionResult;

  try {
    const client = await operatorClient();
    const result = await client.exercise({
      templateId: T.NettingCycle,
      contractId,
      choice: "SettleCycle",
      argument: { positionCids: positionResult.data },
    });
    return {
      data: {
        ...result,
        newContractId: nextCycleContractId(result.events),
      },
    };
  } catch (err) {
    return toConflictError(err);
  }
}

export async function forceSettleCycle(contractId: string) {
  const positionResult = await loadSettlementPositionCids(contractId);
  if (isServiceError(positionResult)) return positionResult;

  try {
    const client = await operatorClient();
    const result = await client.exercise({
      templateId: T.NettingCycle,
      contractId,
      choice: "ForceSettleCycle",
      argument: { positionCids: positionResult.data },
    });
    return {
      data: {
        ...result,
        newContractId: nextCycleContractId(result.events),
      },
    };
  } catch (err) {
    return toConflictError(err);
  }
}

export async function closeCycle(contractId: string) {
  const instructionResult = await loadSettlementInstructionCids(contractId);
  if (isServiceError(instructionResult)) return instructionResult;

  try {
    const client = await operatorClient();
    const result = await client.exercise({
      templateId: T.NettingCycle,
      contractId,
      choice: "CloseCycle",
      argument: { settlementInstructionCids: instructionResult.data },
    });
    return {
      data: {
        ...result,
        newContractId: nextCycleContractId(result.events),
      },
    };
  } catch (err) {
    return toConflictError(err);
  }
}
