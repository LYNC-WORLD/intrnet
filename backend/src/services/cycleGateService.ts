import { NetPosition, SettlementInstruction } from "@prisma/client";

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

export function computeCycleGateSummary(input: {
  status: string;
  settlementPhase: string;
  ackDeadline: Date | null;
  positionContractIds: unknown;
  positions: NetPosition[];
  instructions: Pick<SettlementInstruction, "status">[];
}) {
  const { status, settlementPhase, ackDeadline, positionContractIds, positions, instructions } = input;
  const pendingAckCount = positions.filter((position) => position.status !== "ACKNOWLEDGED").length;
  const instructionCounts = instructions.reduce(
    (acc, instruction) => {
      if (instruction.status === "PENDING") acc.PENDING += 1;
      if (instruction.status === "EXECUTED") acc.EXECUTED += 1;
      if (instruction.status === "CONFIRMED") acc.CONFIRMED += 1;
      return acc;
    },
    { PENDING: 0, EXECUTED: 0, CONFIRMED: 0 },
  );
  const hasComputedPositions = parseStringArray(positionContractIds).length > 0;
  const now = new Date();

  return {
    pendingAckCount,
    instructionCounts,
    canSettle:
      status === "OPEN" &&
      settlementPhase === "NOT_SETTLED" &&
      hasComputedPositions &&
      pendingAckCount === 0,
    canForceSettle:
      status === "OPEN" &&
      settlementPhase === "NOT_SETTLED" &&
      hasComputedPositions &&
      ackDeadline !== null &&
      now >= ackDeadline,
    canClose:
      status === "OPEN" &&
      settlementPhase === "SETTLED" &&
      instructions.every((instruction) => instruction.status === "CONFIRMED"),
  };
}
