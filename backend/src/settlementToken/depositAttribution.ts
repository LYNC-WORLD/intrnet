import { prisma } from "../db";
import { operatorClient } from "../ledger/client";
import { extractExerciseContractId, matchesTemplate } from "../ledger/v2";
import {
  HOLDING_INTERFACE_ID,
  TRANSFER_INSTRUCTION_INTERFACE_ID,
} from "../config/settlementToken";
import { parsePositiveAmount } from "../utils/amount";
import {
  auditStep,
  createAttributionAudit,
  DepositAttributionAudit,
  depositSyncDebug,
} from "./depositSyncAudit";
import {
  collectPartyIdsDeep,
  isPartyId,
  parseDepositAttributionParty,
  parseDepositorPartyFromInstructionPayload,
  parseMetaValues,
  parseTransferRecord,
  summarizeInstructionPayload,
} from "./metadata";

export interface DepositorResolution {
  partyId: string | null;
  audit: DepositAttributionAudit;
}

function mergePayloads(payloads: Array<Record<string, unknown>>): Record<string, unknown> {
  return Object.assign({}, ...payloads);
}

function parseTransferAmount(payload: Record<string, unknown>): number | null {
  const transfer = parseTransferRecord(payload);
  if (!transfer) return null;
  return parsePositiveAmount(transfer.amount);
}

async function resolveDepositorFromPayload(
  payload: Record<string, unknown>,
): Promise<string | null> {
  const direct = parseDepositorPartyFromInstructionPayload(payload);
  if (direct) return direct;

  const transfer = parseTransferRecord(payload);
  const client = await operatorClient();
  const metas = [transfer?.meta, payload.meta];
  for (const meta of metas) {
    const values = parseMetaValues(meta);
    for (const candidate of Object.values(values)) {
      if (!candidate || isPartyId(candidate)) continue;
      const resolved = await client.findPartyByHint(candidate);
      if (resolved) return resolved;
    }
  }

  return null;
}

async function matchDepositorToActiveUser(
  partyIds: string[],
  audit?: DepositAttributionAudit,
): Promise<string | null> {
  if (partyIds.length === 0) return null;

  const exactUsers = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      role: "PARTICIPANT",
      partyId: { in: partyIds },
    },
    select: { partyId: true, email: true },
  });
  if (exactUsers.length === 1 && exactUsers[0].partyId) {
    auditStep(audit!, "db_match_exact", exactUsers[0].partyId, {
      email: exactUsers[0].email,
    });
    return exactUsers[0].partyId;
  }
  if (exactUsers.length > 1) {
    auditStep(audit!, "db_match_ambiguous", "Multiple ACTIVE participants match party ids in transfer", {
      matches: exactUsers.map((user) => user.partyId),
    });
    return null;
  }

  const activeUsers = await prisma.user.findMany({
    where: { status: "ACTIVE", role: "PARTICIPANT", partyId: { not: null } },
    select: { partyId: true, email: true },
  });
  const fingerprintMatches = activeUsers.filter((user) => {
    if (!user.partyId) return false;
    const fingerprint = user.partyId.split("::")[1];
    if (!fingerprint) return false;
    return partyIds.some((partyId) => partyId === user.partyId || partyId.endsWith(`::${fingerprint}`));
  });
  if (fingerprintMatches.length === 1 && fingerprintMatches[0].partyId) {
    auditStep(audit!, "db_match_fingerprint", fingerprintMatches[0].partyId, {
      email: fingerprintMatches[0].email,
    });
    return fingerprintMatches[0].partyId;
  }
  if (fingerprintMatches.length > 1) {
    auditStep(audit!, "db_match_ambiguous", "Multiple ACTIVE participants share fingerprint with transfer party ids", {
      matches: fingerprintMatches.map((user) => user.partyId),
    });
  }

  return null;
}

async function resolveDepositorFromPayloadWithDb(
  payload: Record<string, unknown>,
  audit?: DepositAttributionAudit,
): Promise<string | null> {
  const direct = await resolveDepositorFromPayload(payload);
  if (direct) {
    auditStep(audit!, "payload_parse", direct, summarizeInstructionPayload(payload));
    const user = await prisma.user.findFirst({
      where: { status: "ACTIVE", partyId: direct },
      select: { partyId: true },
    });
    if (user?.partyId) return user.partyId;
    auditStep(audit!, "payload_party_not_active_user", direct);
    return direct;
  }

  const transfer = parseTransferRecord(payload);
  const exclude = new Set(
    [transfer?.sender, transfer?.receiver].filter((value): value is string => typeof value === "string"),
  );
  const partyIds = collectPartyIdsDeep(payload, exclude);
  auditStep(audit!, "payload_party_ids", partyIds.length ? partyIds.join(", ") : "none", {
    summary: summarizeInstructionPayload(payload),
  });
  return matchDepositorToActiveUser(partyIds, audit);
}

function extractArchivedTransferInstructionCids(events: Array<Record<string, unknown>>): string[] {
  const cids: string[] = [];
  for (const event of events) {
    const archived = event.ArchivedEvent as Record<string, unknown> | undefined;
    if (!archived) continue;
    const templateId = archived.templateId;
    if (typeof templateId !== "string") continue;
    if (
      matchesTemplate(templateId, "TransferInstructionV1:TransferInstruction") ||
      templateId.includes("TransferInstruction")
    ) {
      const contractId = archived.contractId;
      if (typeof contractId === "string") cids.push(contractId);
    }
  }
  return cids;
}

function extractCreatedHoldingCids(events: Array<Record<string, unknown>>): string[] {
  const cids: string[] = [];
  for (const event of events) {
    const created = event.CreatedEvent as Record<string, unknown> | undefined;
    if (!created) continue;
    const templateId = created.templateId;
    if (typeof templateId !== "string" || !templateId.includes("Holding")) continue;
    const contractId = created.contractId;
    if (typeof contractId === "string") cids.push(contractId);
  }
  return cids;
}

function extractReceiverHoldingCidsFromExerciseResult(exerciseResult: unknown): string[] {
  const cids = new Set<string>();

  const addCid = (value: unknown) => {
    const cid = extractExerciseContractId(value);
    if (cid) cids.add(cid);
  };

  const scan = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const tag = record.tag;
    if (
      tag === "TransferInstructionResult_Completed" ||
      tag === "Completed" ||
      tag === "TransferInstructionResult_Output"
    ) {
      scan(record.value);
    }
    if (Array.isArray(record.receiverHoldingCids)) {
      for (const cid of record.receiverHoldingCids) addCid(cid);
    }
    if (record.output) scan(record.output);
    if (record.value) scan(record.value);
  };

  scan(exerciseResult);
  return [...cids];
}

function summarizeTransactionEvents(events: Array<Record<string, unknown>>): Record<string, unknown> {
  const created = events.filter((event) => event.CreatedEvent).length;
  const archived = events.filter((event) => event.ArchivedEvent).length;
  const exercised = events
    .map((event) => (event.ExercisedEvent as Record<string, unknown> | undefined)?.choice)
    .filter((choice): choice is string => typeof choice === "string");
  return {
    eventCount: events.length,
    created,
    archived,
    exercisedChoices: exercised,
    archivedTransferInstructions: extractArchivedTransferInstructionCids(events),
    createdHoldings: extractCreatedHoldingCids(events),
  };
}

async function fetchInstructionPayload(
  instructionContractId: string,
): Promise<Record<string, unknown> | null> {
  const client = await operatorClient();
  const interfaceContract = await client.fetchInterfaceById(
    instructionContractId,
    TRANSFER_INSTRUCTION_INTERFACE_ID,
  );
  const rawContract = await client.fetchById(instructionContractId);

  const payloads = [interfaceContract?.payload, rawContract?.payload].filter(
    (payload): payload is Record<string, unknown> => Boolean(payload),
  );
  if (payloads.length === 0) return null;

  for (const payload of payloads) {
    const depositor = await resolveDepositorFromPayload(payload);
    if (depositor) return payload;
  }

  return mergePayloads(payloads);
}

async function resolveDepositorFromInstructionContract(
  instructionContractId: string,
  audit: DepositAttributionAudit,
  expectedAmount?: number,
): Promise<string | null> {
  const payload = await fetchInstructionPayload(instructionContractId);
  if (!payload) {
    auditStep(audit, "instruction_fetch_failed", instructionContractId);
    return null;
  }

  const transferAmount = parseTransferAmount(payload);
  if (expectedAmount !== undefined && transferAmount !== null && transferAmount !== expectedAmount) {
    auditStep(audit, "instruction_amount_mismatch", `transfer=${transferAmount} holding=${expectedAmount}`, {
      instructionContractId,
    });
    return null;
  }

  auditStep(audit, "instruction_loaded", instructionContractId, summarizeInstructionPayload(payload));
  return resolveDepositorFromPayloadWithDb(payload, audit);
}

async function resolveDepositorFromAcceptTransaction(
  events: Array<Record<string, unknown>>,
  audit: DepositAttributionAudit,
  expectedAmount?: number,
): Promise<string | null> {
  auditStep(audit, "accept_tx_summary", undefined, summarizeTransactionEvents(events));

  for (const instructionCid of extractArchivedTransferInstructionCids(events)) {
    const depositor = await resolveDepositorFromInstructionContract(
      instructionCid,
      audit,
      expectedAmount,
    );
    if (depositor) return depositor;
  }

  for (const event of events) {
    const exercised = event.ExercisedEvent as Record<string, unknown> | undefined;
    if (!exercised || exercised.choice !== "TransferInstruction_Accept") continue;
    const contractId = exercised.contractId;
    if (typeof contractId !== "string") continue;
    const depositor = await resolveDepositorFromInstructionContract(contractId, audit, expectedAmount);
    if (depositor) return depositor;
  }

  return null;
}

export async function resolveReceiverHoldingCidsFromUpdate(
  updateId: string,
): Promise<string[]> {
  const client = await operatorClient();
  const events = await client.fetchTransactionEventsByUpdateId(updateId);
  const fromCreated = extractCreatedHoldingCids(events);
  if (fromCreated.length > 0) return fromCreated;

  for (const event of events) {
    const exercised = event.ExercisedEvent as Record<string, unknown> | undefined;
    if (!exercised || exercised.choice !== "TransferInstruction_Accept") continue;
    const fromResult = extractReceiverHoldingCidsFromExerciseResult(exercised.exerciseResult);
    if (fromResult.length > 0) return fromResult;
  }

  return [];
}

export async function resolveHoldingDepositorParty(
  holdingContractId: string,
  amount?: number,
): Promise<DepositorResolution> {
  const audit = createAttributionAudit(holdingContractId, amount);
  const client = await operatorClient();

  const holding =
    (await client.fetchInterfaceById(holdingContractId, HOLDING_INTERFACE_ID)) ??
    (await client.fetchById(holdingContractId));
  if (holding) {
    const fromHolding = parseDepositAttributionParty(holding.payload);
    auditStep(audit, "holding_payload", fromHolding ?? "no reference on holding", {
      summary: summarizeInstructionPayload(holding.payload),
    });
    if (fromHolding) {
      audit.resolvedPartyId = fromHolding;
      return { partyId: fromHolding, audit };
    }
  } else {
    auditStep(audit, "holding_fetch_failed", holdingContractId);
  }

  const lifecycle = await client.fetchContractLifecycle(holdingContractId);
  const createdOffset = lifecycle?.created?.offset;
  auditStep(audit, "holding_lifecycle", createdOffset === null || createdOffset === undefined ? "missing offset" : String(createdOffset), {
    hasCreated: Boolean(lifecycle?.created),
    hasArchived: Boolean(lifecycle?.archived),
  });

  if (createdOffset !== null && createdOffset !== undefined) {
    try {
      const tx = await client.fetchTransactionEventsAtOffsetWithFallback(createdOffset);
      auditStep(audit, "accept_tx_fetch", `shape=${tx.transactionShape} events=${tx.events.length}`, {
        errors: tx.errors,
        summary: summarizeTransactionEvents(tx.events),
      });
      const depositor = await resolveDepositorFromAcceptTransaction(tx.events, audit, amount);
      if (depositor) {
        audit.resolvedPartyId = depositor;
        return { partyId: depositor, audit };
      }
    } catch (err) {
      auditStep(audit, "accept_tx_fetch_error", err instanceof Error ? err.message : String(err));
    }
  }

  const fallback = await resolveSingleActiveParticipantFallback(audit);
  audit.resolvedPartyId = fallback;
  return { partyId: fallback, audit };
}

export async function resolveTransferInstructionDepositor(
  instructionContractId: string,
): Promise<string | null> {
  const audit = createAttributionAudit(instructionContractId);
  const depositor = await resolveDepositorFromInstructionContract(instructionContractId, audit);
  return depositor;
}

async function resolveSingleActiveParticipantFallback(
  audit: DepositAttributionAudit,
): Promise<string | null> {
  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      role: "PARTICIPANT",
      partyId: { not: null },
    },
    select: { partyId: true, email: true },
  });
  auditStep(audit, "active_participants", String(users.length), {
    participants: users.map((user) => ({ partyId: user.partyId, email: user.email })),
  });
  if (users.length !== 1 || !users[0].partyId) {
    auditStep(audit, "single_participant_fallback_skipped", "Need exactly one ACTIVE participant for fallback");
    return null;
  }
  auditStep(audit, "single_participant_fallback", users[0].partyId, { email: users[0].email });
  return users[0].partyId;
}

export async function listActiveParticipantPartyIds(): Promise<Array<{ partyId: string; email: string }>> {
  const users = await prisma.user.findMany({
    where: { status: "ACTIVE", role: "PARTICIPANT", partyId: { not: null } },
    select: { partyId: true, email: true },
    orderBy: { email: "asc" },
  });
  return users
    .filter((user): user is { partyId: string; email: string } => Boolean(user.partyId))
    .map((user) => ({ partyId: user.partyId, email: user.email }));
}

export {
  extractCreatedHoldingCids,
  extractReceiverHoldingCidsFromExerciseResult,
};
