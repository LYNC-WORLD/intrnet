import { operatorClient } from "../ledger/client";
import { T } from "../ledger/templateIds";
import { extractRecreatedContractId, type ExerciseEvents } from "../ledger/v2";
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
  getObligationsByContractIds,
  listCycles as pqsListCycles,
} from "../repositories/pqsLedgerReadRepository";

function exerciseResultPayload(
  newContractId: string,
  result: { exerciseResult: unknown; events: unknown },
) {
  return {
    newContractId,
    exerciseResult: result.exerciseResult,
    events: result.events,
  };
}

async function resolveCycle(contractIdOrCycleId: string) {
  const byContractId = await getCycleByContractId(contractIdOrCycleId);
  if (byContractId) return byContractId;
  return getCycleByCycleId(contractIdOrCycleId);
}

async function loadSettlementPositionCids(contractIdOrCycleId: string) {
  const cycle = await resolveCycle(contractIdOrCycleId);
  if (!cycle) return { error: "Cycle not found", status: 404 as const };

  const positions = await getActivePositionsForCycle(cycle.cycleId, "ACKNOWLEDGED");
  return { data: positions.map((p) => p.contractId), cycle };
}

async function loadForceSettlementPositionCids(contractIdOrCycleId: string) {
  const cycle = await resolveCycle(contractIdOrCycleId);
  if (!cycle) return { error: "Cycle not found", status: 404 as const };

  const positions = await getActivePositionsForCycle(cycle.cycleId);
  return { data: positions.map((p) => p.contractId), cycle };
}

async function loadSettlementInstructionCids(contractIdOrCycleId: string) {
  const cycle = await resolveCycle(contractIdOrCycleId);
  if (!cycle) return { error: "Cycle not found", status: 404 as const };
  const instructions = await getActiveInstructionsForCycle(cycle.cycleId);
  return { data: instructions.map((i) => i.contractId), cycle };
}

export async function listCycles(params: {
  role: string;
  userAgreementId?: string | null;
  agreementId?: string;
  page: number;
  limit: number;
}) {
  return pqsListCycles(params);
}

export async function getCycle(contractIdOrCycleId: string) {
  const cycle = await resolveCycle(contractIdOrCycleId);
  if (!cycle) return { error: "Cycle not found", status: 404 as const };

  const [positions, instructions] = await Promise.all([
    getActivePositionsForCycle(cycle.cycleId),
    getActiveInstructionsForCycle(cycle.cycleId),
  ]);

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

export async function listCycleObligations(
  contractIdOrCycleId: string,
  partyId: string,
  role: string,
) {
  const cycle = await resolveCycle(contractIdOrCycleId);
  if (!cycle) return { error: "Cycle not found", status: 404 as const };

  const obligations = await getObligationsByContractIds(cycle.obligationCids);
  const visible =
    role === "operator"
      ? obligations
      : obligations.filter((o) => o.payer === partyId || o.receiver === partyId);

  return { data: { obligations: visible, total: visible.length } };
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

  const newContractId = extractRecreatedContractId(
    result.exerciseResult,
    result.events as ExerciseEvents,
    T.NettingCycle,
  );
  if (!newContractId) {
    throw new Error("StartNettingCycle did not return a NettingCycle contract id");
  }

  return {
    data: {
      newContractId,
      cycleContractId: newContractId,
      exerciseResult: result.exerciseResult,
      events: result.events,
    },
  };
}

export async function addObligationsToCycle(contractIdOrCycleId: string) {
  const cycle = await resolveCycle(contractIdOrCycleId);
  if (!cycle) return { error: "Cycle not found", status: 404 as const };
  const newContractId = await bulkAddObligations(cycle.contractId, cycle.cycleId, cycle.agreementId);
  return { data: { newContractId } };
}

export async function computeCyclePositions(contractIdOrCycleId: string, ackDeadline?: string) {
  try {
    const cycle = await resolveCycle(contractIdOrCycleId);
    if (!cycle) return { error: "Cycle not found", status: 404 as const };

    const resolvedAckDeadline =
      ackDeadline ??
      (Number.isNaN(cycle.cutoffTime.getTime())
        ? null
        : cycle.cutoffTime.toISOString());
    if (!resolvedAckDeadline) {
      return { error: "Invalid cycle cutoffTime; pass ackDeadline in the request body", status: 400 as const };
    }

    const result = await computeNetPositions(cycle.contractId, resolvedAckDeadline);
    return { data: { newContractId: result.newContractId } };
  } catch (err) {
    return toConflictError(err);
  }
}

export async function settleCycle(contractIdOrCycleId: string) {
  const positionResult = await loadSettlementPositionCids(contractIdOrCycleId);
  if (isServiceError(positionResult)) return positionResult;

  try {
    const client = await operatorClient();
    const result = await client.exercise({
      templateId: T.NettingCycle,
      contractId: positionResult.cycle.contractId,
      choice: "SettleCycle",
      argument: { positionCids: positionResult.data },
    });

    await auditLedgerExercise(
      T.NettingCycle,
      "SettleCycle",
      positionResult.cycle.contractId,
      result.events,
      { argument: { positionCids: positionResult.data } },
    );

    const newContractId = extractRecreatedContractId(
      result.exerciseResult,
      result.events as ExerciseEvents,
      T.NettingCycle,
    );
    if (!newContractId) {
      throw new Error("SettleCycle did not return an updated NettingCycle contract id");
    }

    return { data: exerciseResultPayload(newContractId, result) };
  } catch (err) {
    return toConflictError(err);
  }
}

export async function forceSettleCycle(contractIdOrCycleId: string) {
  const positionResult = await loadForceSettlementPositionCids(contractIdOrCycleId);
  if (isServiceError(positionResult)) return positionResult;

  try {
    const client = await operatorClient();
    const result = await client.exercise({
      templateId: T.NettingCycle,
      contractId: positionResult.cycle.contractId,
      choice: "ForceSettleCycle",
      argument: { positionCids: positionResult.data },
    });

    await auditLedgerExercise(
      T.NettingCycle,
      "ForceSettleCycle",
      positionResult.cycle.contractId,
      result.events,
      { argument: { positionCids: positionResult.data } },
    );

    const newContractId = extractRecreatedContractId(
      result.exerciseResult,
      result.events as ExerciseEvents,
      T.NettingCycle,
    );
    if (!newContractId) {
      throw new Error("ForceSettleCycle did not return an updated NettingCycle contract id");
    }

    return { data: exerciseResultPayload(newContractId, result) };
  } catch (err) {
    return toConflictError(err);
  }
}

export async function closeCycle(contractIdOrCycleId: string) {
  const instructionResult = await loadSettlementInstructionCids(contractIdOrCycleId);
  if (isServiceError(instructionResult)) return instructionResult;

  try {
    const client = await operatorClient();
    const result = await client.exercise({
      templateId: T.NettingCycle,
      contractId: instructionResult.cycle.contractId,
      choice: "CloseCycle",
      argument: { settlementInstructionCids: instructionResult.data },
    });

    await auditLedgerExercise(
      T.NettingCycle,
      "CloseCycle",
      instructionResult.cycle.contractId,
      result.events,
      { argument: { settlementInstructionCids: instructionResult.data } },
    );

    const newContractId = extractRecreatedContractId(
      result.exerciseResult,
      result.events as ExerciseEvents,
      T.NettingCycle,
    );
    if (!newContractId) {
      throw new Error("CloseCycle did not return an updated NettingCycle contract id");
    }

    return { data: exerciseResultPayload(newContractId, result) };
  } catch (err) {
    return toConflictError(err);
  }
}
