import { Prisma } from "@prisma/client";
import { prisma } from "../db";

export function mapCreatedEventType(templateId: string, payload: Record<string, unknown>): string {
  if (templateId.includes("Obligation")) {
    if (payload.status === "ACCEPTED") return "Obligation Accepted";
    if (payload.status === "NETTED") return "Obligation Netted";
    return "Obligation Created";
  }
  if (templateId.includes("NettingCycle")) {
    return payload.status === "CLOSED" ? "Cycle Closed" : "Cycle Opened";
  }
  if (templateId.includes("NetPosition")) return "Net Positions Computed";
  if (templateId.includes("SettlementInstruction")) {
    if (payload.status === "EXECUTED") return "Settlement Executed";
    if (payload.status === "CONFIRMED") return "Settlement Confirmed";
    return "Settlement Instruction Created";
  }
  if (templateId.includes("FxRateOracle")) return "FX Rate Updated";
  if (templateId.includes("NettingAgreement")) return "Agreement Updated";
  return "Contract Created";
}

export function mapExerciseEventType(templateId: string, choice: string): string {
  if (templateId.includes("Obligation") && choice === "RejectObligation") return "Obligation Rejected";
  if (templateId.includes("NetPosition") && choice === "AcknowledgePosition") return "Position Acknowledged";
  if (templateId.includes("SettlementInstruction") && choice === "ConfirmReceipt") {
    return "Settlement Confirmed";
  }
  if (templateId.includes("SettlementInstruction") && choice === "AttestPayment") {
    return "Settlement Executed";
  }
  if (templateId.includes("NettingCycle")) {
    if (choice === "SettleCycle") return "Cycle Settled";
    if (choice === "ForceSettleCycle") return "Cycle Force Settled";
    if (choice === "CloseCycle") return "Cycle Closed";
    if (choice === "ComputeNetPositions") return "Net Positions Computed";
    if (choice === "AddObligation") return "Obligation Added To Cycle";
  }
  if (templateId.includes("SettlementInstruction") && choice === "FailPayment") return "Settlement Failed";
  if (templateId.includes("NettingAgreement") && choice === "AddParticipant") return "Participant Added";
  if (templateId.includes("NettingAgreement") && choice === "StartNettingCycle") return "Cycle Opened";
  if (templateId.includes("FxRateOracle") && choice === "UpdateRate") return "FX Rate Updated";
  return `${choice} Exercised`;
}

export function inferActorPartyId(templateId: string, payload: Record<string, unknown>): string | null {
  if (templateId.includes("Obligation")) {
    if (payload.status === "ACCEPTED") return (payload.receiver as string) ?? null;
    return (payload.payer as string) ?? null;
  }
  if (templateId.includes("NetPosition")) return (payload.participant as string) ?? null;
  if (templateId.includes("SettlementInstruction")) return (payload.payer as string) ?? null;
  return (payload.operator as string) ?? (payload.owner as string) ?? null;
}

export function inferCycleId(templateId: string, payload: Record<string, unknown>): string | null {
  if (templateId.includes("NettingCycle")) return (payload.cycleId as string) ?? null;
  if (templateId.includes("NetPosition")) return (payload.cycleId as string) ?? null;
  if (templateId.includes("SettlementInstruction")) return (payload.cycleId as string) ?? null;
  return null;
}

export async function recordAuditEvent(params: {
  eventType: string;
  actorPartyId?: string | null;
  contractId?: string | null;
  templateId?: string | null;
  payload: Record<string, unknown>;
  cycleId?: string | null;
  timestamp?: Date;
}) {
  try {
    await prisma.auditEvent.create({
      data: {
        eventType: params.eventType,
        actorPartyId: params.actorPartyId ?? null,
        contractId: params.contractId ?? null,
        templateId: params.templateId ?? null,
        payload: params.payload as Prisma.InputJsonValue,
        cycleId: params.cycleId ?? null,
        timestamp: params.timestamp,
      },
    });
  } catch (err) {
    console.error("[audit] Failed to record event:", err);
  }
}
