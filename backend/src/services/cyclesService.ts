import { operatorClient } from "../ledger/client";
import { T } from "../ledger/templateIds";
import { isServiceError, toConflictError } from "../utils/http";
import { resolveAgreementFromInput } from "./agreementsService";
import { computeCycleGateSummary } from "./cycleGateService";
import { auditLedgerExercise } from "./ledgerAudit";
import { bulkAddObligations, computeNetPositions } from "./nettingOrchestrator";
import {
  getCycleByContractId,
  getCycleByCycleId,
  getActivePositionsForCycle,
  getActiveInstructionsForCycle,
  listCycles as pqsListCycles,
} from "../repositories/pqsLedgerReadRepository";

async function loadSettlementPositionCids(contractId: string) {
  const cycle = await getCycleByContractId(contractId);
  if (!cycle) return { error: "Cycle not found", status: 404 as const };

  const positions = await getActivePositionsForCycle(cycle.cycleId, "ACKNOWLEDGED");
  return { data: positions.map((p) => p.contractId) };
}

async function loadSettlementInstructionCids(contractId: string) {
  const cycle = await getCycleByContractId(contractId);
  if (!cycle) return { error: "Cycle not found", status: 404 as const };
  const instructions = await getActiveInstructionsForCycle(cycle.cycleId);
  return { data: instructions.map((i) => i.contractId) };
}

export async function listCycles(
  role: string,
  userAgreementId?: string | null,
  agreementId?: string,
) {
  return pqsListCycles({ role, userAgreementId, agreementId });
}

export async function getCycle(contractId: string) {
  const cycle = await getCycleByContractId(contractId);
  if (!cycle) return { error: "Cycle not found", status: 404 as const };

  const positions = await getActivePositionsForCycle(cycle.cycleId);
  const instructions = await getActiveInstructionsForCycle(cycle.cycleId);

  const gateSummary = computeCycleGateSummary({
    status: cycle.status,
    settlementPhase: cycle.settlementPhase,
    ackDeadline: cycle.ackDeadline,
    positionContractIds: cycle.positionCids,
    positions,
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
  const result = await client.exercise({
    templateId: T.NettingAgreement,
    contractId: resolution.data.agreementContractId,
    choice: "StartNettingCycle",
    argument: { cycleId, cutoffTime },
  });

  await auditLedgerExercise(
    T.NettingAgreement,
    "StartNettingCycle",
    resolution.data.agreementContractId,
    result.events,
    { argument: { cycleId, cutoffTime } },
  );

  return result;
}

export async function addObligationsToCycle(contractId: string) {
  const cycle = await getCycleByContractId(contractId);
  if (!cycle) return { error: "Cycle not found", status: 404 as const };
  const newContractId = await bulkAddObligations(contractId, cycle.cycleId, cycle.agreementId);
  return { data: { newContractId } };
}

export async function computeCyclePositions(contractId: string, ackDeadline?: string) {
  const cycle = await getCycleByContractId(contractId);
  if (!cycle) return { error: "Cycle not found", status: 404 as const };

  const resolvedAckDeadline = ackDeadline ?? cycle.cutoffTime.toISOString();
  try {
    const result = await computeNetPositions(contractId, resolvedAckDeadline);
    return { data: result };
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

    await auditLedgerExercise(T.NettingCycle, "SettleCycle", contractId, result.events, {
      argument: { positionCids: positionResult.data },
    });

    return { data: result };
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

    await auditLedgerExercise(T.NettingCycle, "ForceSettleCycle", contractId, result.events, {
      argument: { positionCids: positionResult.data },
    });

    return { data: result };
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

    await auditLedgerExercise(T.NettingCycle, "CloseCycle", contractId, result.events, {
      argument: { settlementInstructionCids: instructionResult.data },
    });

    return { data: result };
  } catch (err) {
    return toConflictError(err);
  }
}
