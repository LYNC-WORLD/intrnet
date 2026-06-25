import { ExerciseEvents } from "../ledger/v2";
import {
  inferActorPartyId,
  inferCycleId,
  mapCreatedEventType,
  mapExerciseEventType,
  recordAuditEvent,
} from "./auditService";

export async function auditLedgerCreate(
  templateId: string,
  contractId: string,
  payload: Record<string, unknown>,
  actorPartyId?: string | null,
) {
  await recordAuditEvent({
    eventType: mapCreatedEventType(templateId, payload),
    actorPartyId: actorPartyId ?? inferActorPartyId(templateId, payload),
    contractId,
    templateId,
    payload,
    cycleId: inferCycleId(templateId, payload),
  });
}

export async function auditLedgerExercise(
  templateId: string,
  choice: string,
  contractId: string,
  events: ExerciseEvents,
  context?: {
    actorPartyId?: string | null;
    beforePayload?: Record<string, unknown>;
    argument?: Record<string, unknown>;
  },
) {
  const created = events.filter((event) => event.created);
  if (created.length > 0) {
    for (const event of created) {
      if (!event.created) continue;
      await auditLedgerCreate(
        event.created.templateId,
        event.created.contractId,
        event.created.payload,
        context?.actorPartyId,
      );
    }
    return;
  }

  await recordAuditEvent({
    eventType: mapExerciseEventType(templateId, choice),
    actorPartyId: context?.actorPartyId ?? inferActorPartyId(templateId, context?.beforePayload ?? {}),
    contractId,
    templateId,
    payload: {
      ...(context?.beforePayload ?? {}),
      ...(context?.argument ?? {}),
    },
    cycleId: inferCycleId(templateId, context?.beforePayload ?? {}),
  });
}
