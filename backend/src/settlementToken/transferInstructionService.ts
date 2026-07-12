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
  parseDepositorPartyFromInstructionPayload,
  parseSettlementInstructionCidFromMeta,
} from "./metadata";
import {
  extractCreatedHoldingCids,
  extractReceiverHoldingCidsFromExerciseResult,
  resolveReceiverHoldingCidsFromUpdate,
  resolveTransferInstructionDepositor,
} from "./depositAttribution";
import { DisclosedContract, getTransferInstructionContext } from "./registryClient";

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

const PARTY_ID_PATTERN = /^[^:]+::[0-9a-f]+$/i;

async function resolveLedgerClient(client?: LedgerClient): Promise<LedgerClient> {
  return client ?? (await operatorClient());
}

function amountsMatch(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.00000001;
}

function toLedgerDisclosed(disclosed: DisclosedContract[]) {
  return disclosed.map((d) => ({
    templateId: d.templateId,
    contractId: d.contractId,
    createdEventBlob: d.createdEventBlob,
    ...(d.synchronizerId ? { synchronizerId: d.synchronizerId } : {}),
  }));
}

function parseInstrument(payload: Record<string, unknown>): { id: string; admin: string | null } | null {
  const instrument = payload.instrumentId ?? payload.instrument;
  if (!instrument || typeof instrument !== "object") return null;
  const record = instrument as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : null;
  if (!id) return null;
  const admin = typeof record.admin === "string" ? record.admin : null;
  return { id, admin };
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

function shouldEnforceInstrumentAdmin(): boolean {
  return Boolean(process.env.SETTLEMENT_INSTRUMENT_ADMIN?.trim());
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
  params: { instructionCid: string; senderPartyId: string; amount: number },
): PendingIncomingTransfer | null {
  const candidates = pending.filter(
    (transfer) =>
      transfer.sender === params.senderPartyId && amountsMatch(transfer.amount, params.amount),
  );

  const byInstruction = candidates.filter(
    (transfer) => transfer.settlementInstructionCid === params.instructionCid,
  );
  if (byInstruction.length === 1) return byInstruction[0];
  if (byInstruction.length > 1) return null;

  if (candidates.length === 1) return candidates[0];
  return null;
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
    const payload = contract.payload;
    if (!isPendingReceiverAcceptance(payload.status)) continue;

    const transfer = parseTransferRecord(payload);
    if (!transfer) continue;

    const transferReceiver =
      (typeof transfer.receiver === "string" && transfer.receiver) || null;
    if (!transferReceiver || transferReceiver !== receiver) continue;

    const instrument = parseInstrument(transfer);
    if (!instrument || instrument.id !== instrumentId) continue;
    if (enforceAdmin && instrument.admin && instrument.admin !== expectedAdmin) continue;

    const sender = typeof transfer.sender === "string" ? transfer.sender : null;
    if (!sender || !PARTY_ID_PATTERN.test(sender)) continue;

    const amount = parsePositiveAmount(transfer.amount);
    if (amount === null) continue;

    const settlementInstructionCid =
      parseSettlementInstructionCidFromMeta(transfer.meta) ??
      parseSettlementInstructionCidFromMeta(payload.meta);

    pending.push({
      contractId: contract.contractId,
      sender,
      receiver: transferReceiver,
      amount,
      instrumentId: instrument.id,
      depositorPartyId: parseDepositorPartyFromInstructionPayload(payload),
      settlementInstructionCid,
    });
  }

  return pending;
}

export async function acceptIncomingTransfer(
  instruction: PendingIncomingTransfer,
  client?: LedgerClient,
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

  let receiverHoldingCids = extractReceiverHoldingCids(
    result.exerciseResult,
    result.events,
    result.rawEvents,
  );
  if (receiverHoldingCids.length === 0 && result.updateId) {
    receiverHoldingCids = await resolveReceiverHoldingCidsFromUpdate(result.updateId);
  }

  let depositorPartyId = instruction.depositorPartyId;
  if (!depositorPartyId) {
    depositorPartyId = await resolveTransferInstructionDepositor(instruction.contractId);
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
