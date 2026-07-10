import { operatorClient } from "../ledger/client";
import { extractExerciseContractId, matchesTemplate } from "../ledger/v2";
import {
  HOLDING_INTERFACE_ID,
  TRANSFER_INSTRUCTION_INTERFACE_ID,
} from "../config/settlementToken";
import {
  parseDepositAttributionParty,
  parseDepositorPartyFromInstructionPayload,
} from "./metadata";

function parseDepositorFromInstructionPayload(payload: Record<string, unknown>): string | null {
  return parseDepositorPartyFromInstructionPayload(payload);
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
  const instruction =
    (await client.fetchInterfaceById(instructionContractId, TRANSFER_INSTRUCTION_INTERFACE_ID)) ??
    (await client.fetchById(instructionContractId));
  return instruction?.payload ?? null;
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
  if (createdOffset === null || createdOffset === undefined) return null;

  const events = await client.fetchTransactionEventsAtOffset(createdOffset);
  for (const instructionCid of extractArchivedTransferInstructionCids(events)) {
    const payload = await fetchInstructionPayload(instructionCid);
    if (!payload) continue;
    const depositor = parseDepositorFromInstructionPayload(payload);
    if (depositor) return depositor;
  }

  for (const event of events) {
    const exercised = event.ExercisedEvent as Record<string, unknown> | undefined;
    if (!exercised) continue;
    const choice = exercised.choice;
    if (choice !== "TransferInstruction_Accept") continue;
    const contractId = exercised.contractId;
    if (typeof contractId !== "string") continue;
    const payload = await fetchInstructionPayload(contractId);
    if (!payload) continue;
    const depositor = parseDepositorFromInstructionPayload(payload);
    if (depositor) return depositor;
  }

  return null;
}

export async function resolveTransferInstructionDepositor(
  instructionContractId: string,
): Promise<string | null> {
  const payload = await fetchInstructionPayload(instructionContractId);
  if (!payload) return null;
  return parseDepositorFromInstructionPayload(payload);
}

export {
  extractCreatedHoldingCids,
  extractReceiverHoldingCidsFromExerciseResult,
};
