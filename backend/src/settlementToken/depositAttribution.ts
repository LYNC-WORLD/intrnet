import { operatorClient } from "../ledger/client";
import { matchesTemplate } from "../ledger/v2";
import {
  HOLDING_INTERFACE_ID,
  TRANSFER_INSTRUCTION_INTERFACE_ID,
} from "../config/settlementToken";
import { parseDepositAttributionParty, parseTransferDepositorParty } from "./metadata";

function parseTransferRecord(payload: Record<string, unknown>): Record<string, unknown> | null {
  const transfer = payload.transfer;
  if (transfer && typeof transfer === "object") {
    return transfer as Record<string, unknown>;
  }
  if (typeof payload.receiver === "string" && typeof payload.sender === "string") {
    return payload;
  }
  return null;
}

function parseDepositorFromInstructionPayload(payload: Record<string, unknown>): string | null {
  const transfer = parseTransferRecord(payload);
  if (!transfer) return null;
  return parseTransferDepositorParty(transfer);
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
    const instruction =
      (await client.fetchInterfaceById(instructionCid, TRANSFER_INSTRUCTION_INTERFACE_ID)) ??
      (await client.fetchById(instructionCid));
    if (!instruction) continue;
    const depositor = parseDepositorFromInstructionPayload(instruction.payload);
    if (depositor) return depositor;
  }

  for (const event of events) {
    const exercised = event.ExercisedEvent as Record<string, unknown> | undefined;
    if (!exercised) continue;
    const choice = exercised.choice;
    if (choice !== "TransferInstruction_Accept") continue;
    const contractId = exercised.contractId;
    if (typeof contractId !== "string") continue;
    const instruction =
      (await client.fetchInterfaceById(contractId, TRANSFER_INSTRUCTION_INTERFACE_ID)) ??
      (await client.fetchById(contractId));
    if (!instruction) continue;
    const depositor = parseDepositorFromInstructionPayload(instruction.payload);
    if (depositor) return depositor;
  }

  return null;
}

export async function resolveTransferInstructionDepositor(
  instructionContractId: string,
): Promise<string | null> {
  const client = await operatorClient();
  const instruction =
    (await client.fetchInterfaceById(instructionContractId, TRANSFER_INSTRUCTION_INTERFACE_ID)) ??
    (await client.fetchById(instructionContractId));
  if (!instruction) return null;
  return parseDepositorFromInstructionPayload(instruction.payload);
}
