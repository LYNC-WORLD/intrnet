import { prisma } from "../db";
import { operatorClient } from "../ledger/client";
import { extractExerciseContractId, matchesTemplate } from "../ledger/v2";
import {
  HOLDING_INTERFACE_ID,
  TRANSFER_INSTRUCTION_INTERFACE_ID,
} from "../config/settlementToken";
import {
  isPartyId,
  parseDepositAttributionParty,
  parseDepositorPartyFromInstructionPayload,
  parseMetaValues,
  parseTransferRecord,
} from "./metadata";

function mergePayloads(payloads: Array<Record<string, unknown>>): Record<string, unknown> {
  return Object.assign({}, ...payloads);
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
): Promise<string | null> {
  const payload = await fetchInstructionPayload(instructionContractId);
  if (!payload) return null;
  return resolveDepositorFromPayload(payload);
}

async function resolveDepositorFromAcceptTransaction(
  events: Array<Record<string, unknown>>,
): Promise<string | null> {
  for (const instructionCid of extractArchivedTransferInstructionCids(events)) {
    const depositor = await resolveDepositorFromInstructionContract(instructionCid);
    if (depositor) return depositor;
  }

  for (const event of events) {
    const exercised = event.ExercisedEvent as Record<string, unknown> | undefined;
    if (!exercised || exercised.choice !== "TransferInstruction_Accept") continue;
    const contractId = exercised.contractId;
    if (typeof contractId !== "string") continue;
    const depositor = await resolveDepositorFromInstructionContract(contractId);
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

export async function resolveHoldingDepositorParty(holdingContractId: string): Promise<string | null> {
  const client = await operatorClient();

  const holding =
    (await client.fetchInterfaceById(holdingContractId, HOLDING_INTERFACE_ID)) ??
    (await client.fetchById(holdingContractId));
  if (holding) {
    const fromHolding = parseDepositAttributionParty(holding.payload);
    if (fromHolding) return fromHolding;
  }

  const lifecycle = await client.fetchContractLifecycle(holdingContractId);
  const createdOffset = lifecycle?.created?.offset;
  if (createdOffset !== null && createdOffset !== undefined) {
    const events = await client.fetchTransactionEventsAtOffset(createdOffset);
    const depositor = await resolveDepositorFromAcceptTransaction(events);
    if (depositor) return depositor;
  }

  return resolveSingleActiveParticipantFallback();
}

export async function resolveTransferInstructionDepositor(
  instructionContractId: string,
): Promise<string | null> {
  return resolveDepositorFromInstructionContract(instructionContractId);
}

async function resolveSingleActiveParticipantFallback(): Promise<string | null> {
  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      role: "PARTICIPANT",
      partyId: { not: null },
    },
    select: { partyId: true },
  });
  if (users.length !== 1 || !users[0].partyId) return null;
  return users[0].partyId;
}

export {
  extractCreatedHoldingCids,
  extractReceiverHoldingCidsFromExerciseResult,
};
