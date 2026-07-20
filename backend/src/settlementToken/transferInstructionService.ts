import { LedgerClient, operatorClient } from "../ledger/client";
import { getOperatorPartyId } from "../ledger/operatorParty";
import {
  getTokenConfig,
  resolveInstrumentAdmin,
  TRANSFER_INSTRUCTION_INTERFACE_ID,
} from "../config/settlementToken";
import { ExerciseEvents, extractExerciseContractId, matchesTemplate } from "../ledger/v2";
import { parsePositiveAmount } from "../utils/amount";
import {
  amountsMatch,
  PARTY_ID_PATTERN,
  parseInstrument,
  shouldEnforceInstrumentAdmin,
  toLedgerDisclosed,
} from "./shared";
import {
  parseDepositorPartyFromInstructionPayload,
  parseSettlementInstructionCidFromMeta,
} from "./metadata";
import {
  extractCreatedHoldingCids,
  extractReceiverHoldingCidsFromExerciseResult,
  resolveReceiverHoldingCidsFromUpdate,
  resolveTransferInstructionDepositor,
} from "./depositAttribution";
import { getTransferInstructionContext } from "./registryClient";

export interface PendingIncomingTransfer {
  contractId: string;
  sender: string;
  receiver: string;
  amount: number;
  instrumentId: string;
  depositorPartyId: string | null;
  settlementInstructionCid: string | null;
}

export interface AcceptedIncomingTransfer {
  contractId: string;
  sender: string;
  amount: number;
  updateId: string | null;
  depositorPartyId: string | null;
  receiverHoldingCids: string[];
}

export interface AcceptTransfersResult {
  accepted: AcceptedIncomingTransfer[];
  failed: Array<{ contractId: string; error: string }>;
}

async function resolveLedgerClient(client?: LedgerClient): Promise<LedgerClient> {
  return client ?? (await operatorClient());
}

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

function isPendingReceiverAcceptance(status: unknown): boolean {
  if (typeof status === "string") {
    return (
      status === "TransferPendingReceiverAcceptance" ||
      status === "Offered" ||
      status === "PendingReceiverAcceptance"
    );
  }
  if (status && typeof status === "object") {
    const record = status as Record<string, unknown>;
    const tag = record.tag ?? record.constructor;
    if (typeof tag === "string") {
      return (
        tag === "TransferPendingReceiverAcceptance" ||
        tag === "Offered" ||
        tag === "PendingReceiverAcceptance"
      );
    }
  }
  return false;
}

function extractReceiverHoldingCids(
  exerciseResult: unknown,
  events: ExerciseEvents,
  rawEvents: Array<Record<string, unknown>>,
): string[] {
  const fromResult = extractReceiverHoldingCidsFromExerciseResult(exerciseResult);
  if (fromResult.length > 0) return fromResult;

  const cids = new Set<string>();

  const addCid = (value: unknown) => {
    const cid = extractExerciseContractId(value);
    if (cid) cids.add(cid);
  };

  for (const cid of extractCreatedHoldingCids(rawEvents)) {
    cids.add(cid);
  }

  for (const event of events) {
    if (event.created && matchesTemplate(event.created.templateId, "HoldingV1:Holding")) {
      cids.add(event.created.contractId);
    }
    if (event.created?.templateId.includes("Holding")) {
      cids.add(event.created.contractId);
    }
  }

  if (cids.size > 0) return [...cids];

  for (const event of rawEvents) {
    const exercised = event.ExercisedEvent as Record<string, unknown> | undefined;
    if (!exercised || exercised.choice !== "TransferInstruction_Accept") continue;
    for (const cid of extractReceiverHoldingCidsFromExerciseResult(exercised.exerciseResult)) {
      addCid(cid);
    }
  }

  return [...cids];
}

export function findSettlementPendingTransfer(
  pending: PendingIncomingTransfer[],
  params: { instructionCid: string; senderPartyId: string; amount: number; alternateInstructionCids?: string[] },
): PendingIncomingTransfer | null {
  const instructionIds = new Set(
    [params.instructionCid, ...(params.alternateInstructionCids ?? [])].filter(Boolean),
  );

  const candidates = pending.filter(
    (transfer) =>
      transfer.sender === params.senderPartyId && amountsMatch(transfer.amount, params.amount),
  );

  const byInstruction = candidates.filter(
    (transfer) =>
      transfer.settlementInstructionCid !== null &&
      instructionIds.has(transfer.settlementInstructionCid),
  );
  if (byInstruction.length === 1) return byInstruction[0];
  if (byInstruction.length > 1) return null;

  if (candidates.length === 1) return candidates[0];
  return null;
}

function parsePendingIncomingTransfer(
  contractId: string,
  payload: Record<string, unknown>,
  receiver: string,
  instrumentId: string,
  expectedAdmin: string | null,
  enforceAdmin: boolean,
): PendingIncomingTransfer | null {
  if (!isPendingReceiverAcceptance(payload.status)) return null;

  const transfer = parseTransferRecord(payload);
  if (!transfer) return null;

  const transferReceiver =
    (typeof transfer.receiver === "string" && transfer.receiver) || null;
  if (!transferReceiver || transferReceiver !== receiver) return null;

  const instrument = parseInstrument(transfer);
  if (!instrument || instrument.id !== instrumentId) return null;
  if (enforceAdmin && instrument.admin && expectedAdmin && instrument.admin !== expectedAdmin) {
    return null;
  }

  const sender = typeof transfer.sender === "string" ? transfer.sender : null;
  if (!sender || !PARTY_ID_PATTERN.test(sender)) return null;

  const amount = parsePositiveAmount(transfer.amount);
  if (amount === null) return null;

  const settlementInstructionCid =
    parseSettlementInstructionCidFromMeta(transfer.meta) ??
    parseSettlementInstructionCidFromMeta(payload.meta);

  return {
    contractId,
    sender,
    receiver: transferReceiver,
    amount,
    instrumentId: instrument.id,
    depositorPartyId: parseDepositorPartyFromInstructionPayload(payload),
    settlementInstructionCid,
  };
}

//Resolve pending TransferInstruction from execute updateId 
export async function findPendingIncomingTransferByUpdateId(
  updateId: string,
  receiverPartyId: string,
  client?: LedgerClient,
): Promise<{ pending: PendingIncomingTransfer | null; skipAcsFallback: boolean }> {
  const updateRef = updateId.trim();
  if (!updateRef) return { pending: null, skipAcsFallback: false };

  const ledger = await resolveLedgerClient(client);
  const { instrumentId } = getTokenConfig();
  const expectedAdmin = await resolveInstrumentAdmin();
  const enforceAdmin = shouldEnforceInstrumentAdmin();

  let events: Array<Record<string, unknown>>;
  try {
    events = await ledger.fetchTransactionEventsByUpdateId(updateRef);
  } catch (err) {
    console.warn(
      `Failed to load transfer update ${updateRef} for pending offer lookup:`,
      err instanceof Error ? err.message : err,
    );
    return { pending: null, skipAcsFallback: false };
  }

  let sawInstruction = false;
  for (const event of events) {
    const created = event.CreatedEvent as Record<string, unknown> | undefined;
    if (!created) continue;
    const templateId = created.templateId;
    if (typeof templateId !== "string") continue;
    if (
      !matchesTemplate(templateId, "TransferInstructionV1:TransferInstruction") &&
      !templateId.includes("TransferInstruction")
    ) {
      continue;
    }
    const contractId = created.contractId;
    if (typeof contractId !== "string") continue;
    sawInstruction = true;

    const payload = (created.createArgument ?? created.payload ?? {}) as Record<string, unknown>;
    const pending = parsePendingIncomingTransfer(
      contractId,
      payload,
      receiverPartyId,
      instrumentId,
      expectedAdmin,
      enforceAdmin,
    );
    if (pending) return { pending, skipAcsFallback: true };
  }

  return { pending: null, skipAcsFallback: sawInstruction };
}

export async function listPendingIncomingTransfers(
  receiverPartyId?: string,
  client?: LedgerClient,
): Promise<PendingIncomingTransfer[]> {
  const receiver = receiverPartyId ?? (await getOperatorPartyId());
  const { instrumentId } = getTokenConfig();
  const expectedAdmin = await resolveInstrumentAdmin();
  const enforceAdmin = shouldEnforceInstrumentAdmin();
  const ledger = await resolveLedgerClient(client);
  const contracts = await ledger.listInterfaceContracts(
    TRANSFER_INSTRUCTION_INTERFACE_ID,
    receiver,
  );

  const pending: PendingIncomingTransfer[] = [];
  for (const contract of contracts) {
    const match = parsePendingIncomingTransfer(
      contract.contractId,
      contract.payload,
      receiver,
      instrumentId,
      expectedAdmin,
      enforceAdmin,
    );
    if (match) pending.push(match);
  }

  return pending;
}

export async function acceptIncomingTransfer(
  instruction: PendingIncomingTransfer,
  client?: LedgerClient,
  options?: { skipAttribution?: boolean },
): Promise<AcceptedIncomingTransfer> {
  const context = await getTransferInstructionContext(instruction.contractId, "accept");
  const ledger = await resolveLedgerClient(client);
  const result = await ledger.exerciseWithDisclosed({
    templateId: TRANSFER_INSTRUCTION_INTERFACE_ID,
    contractId: instruction.contractId,
    choice: "TransferInstruction_Accept",
    argument: {
      extraArgs: {
        context: context.choiceContextData,
        meta: { values: {} },
      },
    },
    disclosedContracts: toLedgerDisclosed(context.disclosedContracts),
  });

  let receiverHoldingCids: string[] = [];
  let depositorPartyId = instruction.depositorPartyId;
  if (!options?.skipAttribution) {
    receiverHoldingCids = extractReceiverHoldingCids(
      result.exerciseResult,
      result.events,
      result.rawEvents,
    );
    if (receiverHoldingCids.length === 0 && result.updateId) {
      receiverHoldingCids = await resolveReceiverHoldingCidsFromUpdate(result.updateId);
    }
    if (!depositorPartyId) {
      depositorPartyId = await resolveTransferInstructionDepositor(instruction.contractId);
    }
  }

  return {
    contractId: instruction.contractId,
    sender: instruction.sender,
    amount: instruction.amount,
    updateId: result.updateId,
    depositorPartyId,
    receiverHoldingCids,
  };
}

export async function acceptPendingIncomingTransfers(
  receiverPartyId?: string,
  client?: LedgerClient,
): Promise<AcceptTransfersResult> {
  const pending = await listPendingIncomingTransfers(receiverPartyId, client);
  const accepted: AcceptTransfersResult["accepted"] = [];
  const failed: AcceptTransfersResult["failed"] = [];

  for (const instruction of pending) {
    try {
      accepted.push(await acceptIncomingTransfer(instruction, client));
    } catch (err) {
      failed.push({
        contractId: instruction.contractId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { accepted, failed };
}
