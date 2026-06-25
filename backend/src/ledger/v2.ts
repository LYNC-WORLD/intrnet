import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";

export interface TokenClaims {
  sub?: string;
  actAs?: string[];
  readAs?: string[];
}

export interface LegacyCreatedEvent {
  contractId: string;
  templateId: string;
  payload: Record<string, unknown>;
}

export interface LegacyArchivedEvent {
  contractId: string;
  templateId: string;
}

export type ExerciseEvents = Array<{ created?: LegacyCreatedEvent }>;

export function decodeTokenClaims(token: string): TokenClaims {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded === "string") return {};
  return decoded as TokenClaims;
}

export function templateSuffix(templateId: string): string {
  const parts = templateId.split(":");
  if (parts.length >= 2) return `${parts[parts.length - 2]}:${parts[parts.length - 1]}`;
  return templateId;
}

export function matchesTemplate(templateId: string, expected: string): boolean {
  return templateSuffix(templateId) === expected || templateId.endsWith(`:${expected}`);
}

export function qualifyTemplateId(templateId: string, packageId: string): string {
  if (templateId.split(":").length >= 3) return templateId;
  return `${packageId}:${templateId}`;
}

export function resolvePartyHint(hint: string, knownParties: string[]): string {
  if (hint.includes("::")) return hint;
  const match = knownParties.find((p) => p === hint || p.startsWith(`${hint}::`));
  return match ?? hint;
}

export function wildcardEventFormat(parties: string[]) {
  const filtersByParty: Record<string, unknown> = {};
  for (const party of parties) {
    filtersByParty[party] = {
      cumulative: [{ identifierFilter: { WildcardFilter: { value: {} } } }],
    };
  }
  return { filtersByParty };
}

export function templateEventFormat(parties: string[], templateIds: string[], packageId: string) {
  const cumulative = templateIds.map((templateId) => ({
    identifierFilter: {
      TemplateFilter: {
        value: {
          templateId: qualifyTemplateId(templateId, packageId),
          includeCreatedEventBlob: false,
        },
      },
    },
  }));
  const filtersByParty: Record<string, unknown> = {};
  for (const party of parties) {
    filtersByParty[party] = { cumulative };
  }
  return { filtersByParty };
}

export function toLegacyEvents(events: Array<Record<string, unknown>>) {
  return events.map((event) => {
    const created = event.CreatedEvent as Record<string, unknown> | undefined;
    if (created) {
      return {
        created: {
          contractId: created.contractId as string,
          templateId: created.templateId as string,
          payload: (created.createArgument ?? {}) as Record<string, unknown>,
        },
      };
    }

    const archived = event.ArchivedEvent as Record<string, unknown> | undefined;
    if (archived) {
      return {
        archived: {
          contractId: archived.contractId as string,
          templateId: archived.templateId as string,
        },
      };
    }

    return event;
  });
}

export function extractPackageId(templateId: string): string | null {
  const parts = templateId.split(":");
  return parts.length >= 3 ? parts[0] : null;
}

export function newCommandId(): string {
  return randomUUID();
}

export function partyInList(parties: string[], partyId: string): boolean {
  return parties.some(
    (party) => party === partyId || party.startsWith(`${partyId}::`) || partyId.startsWith(`${party}::`),
  );
}

export function extractExerciseContractId(result: unknown): string | null {
  if (!result) return null;
  if (typeof result === "string") {
    const normalized = result.replace(/^#/, "");
    return normalized.includes(":") ? normalized.split(":")[0]! : normalized;
  }
  if (typeof result === "object") {
    const record = result as Record<string, unknown>;
    if (typeof record.contractId === "string") return record.contractId;
    if (typeof record.value === "string") return extractExerciseContractId(record.value);
  }
  return null;
}

export function findCreatedEvent(
  events: Array<{ created?: LegacyCreatedEvent }>,
  templateId: string,
): LegacyCreatedEvent | null {
  for (const event of events) {
    if (event.created && matchesTemplate(event.created.templateId, templateId)) {
      return event.created;
    }
  }
  return null;
}

export function findAllCreatedEvents(
  events: Array<{ created?: LegacyCreatedEvent }>,
  templateId: string,
): LegacyCreatedEvent[] {
  return events
    .filter((e) => e.created && matchesTemplate(e.created.templateId, templateId))
    .map((e) => e.created!);
}
