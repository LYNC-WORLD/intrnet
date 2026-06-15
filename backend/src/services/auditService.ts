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
  if (templateId.includes("CashAccount")) return "Cash Account Updated";
  return "Contract Created";
}

export function inferActorPartyId(templateId: string, payload: Record<string, unknown>): string | null {
  if (templateId.includes("Obligation")) {
    if (payload.status === "ACCEPTED") return (payload.receiver as string) ?? null;
    return (payload.payer as string) ?? null;
  }
  if (templateId.includes("NetPosition")) return (payload.participant as string) ?? null;
  if (templateId.includes("SettlementInstruction")) {
    return (payload.payer as string) ?? null;
  }
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
}
