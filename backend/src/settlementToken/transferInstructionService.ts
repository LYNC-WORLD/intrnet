import { operatorClient } from "../ledger/client";
import { getOperatorPartyId } from "../ledger/operatorParty";
import {
  getTokenConfig,
  resolveInstrumentAdmin,
  TRANSFER_INSTRUCTION_INTERFACE_ID,
} from "../config/settlementToken";
import { parsePositiveAmount } from "../utils/amount";
import { DisclosedContract, getTransferInstructionContext } from "./registryClient";

export interface PendingIncomingTransfer {
  contractId: string;
  sender: string;
  receiver: string;
  amount: number;
  instrumentId: string;
}

export interface AcceptTransfersResult {
  accepted: Array<{
    contractId: string;
    sender: string;
    amount: number;
    updateId: string | null;
  }>;
  failed: Array<{ contractId: string; error: string }>;
}

const PARTY_ID_PATTERN = /^[^:]+::[0-9a-f]+$/i;

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

export async function listPendingIncomingTransfers(
  receiverPartyId?: string,
): Promise<PendingIncomingTransfer[]> {
  const receiver = receiverPartyId ?? (await getOperatorPartyId());
  const { instrumentId } = getTokenConfig();
  const expectedAdmin = await resolveInstrumentAdmin();
  const enforceAdmin = shouldEnforceInstrumentAdmin();
  const client = await operatorClient();
  const contracts = await client.listInterfaceContracts(
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

    pending.push({
      contractId: contract.contractId,
      sender,
      receiver: transferReceiver,
      amount,
      instrumentId: instrument.id,
    });
  }

  return pending;
}

export async function acceptIncomingTransfer(contractId: string): Promise<string | null> {
  const context = await getTransferInstructionContext(contractId, "accept");
  const client = await operatorClient();
  const result = await client.exerciseWithDisclosed({
    templateId: TRANSFER_INSTRUCTION_INTERFACE_ID,
    contractId,
    choice: "TransferInstruction_Accept",
    argument: {
      extraArgs: {
        context: context.choiceContextData,
        meta: { values: {} },
      },
    },
    disclosedContracts: toLedgerDisclosed(context.disclosedContracts),
  });
  return result.updateId;
}

export async function acceptPendingIncomingTransfers(
  receiverPartyId?: string,
): Promise<AcceptTransfersResult> {
  const pending = await listPendingIncomingTransfers(receiverPartyId);
  const accepted: AcceptTransfersResult["accepted"] = [];
  const failed: AcceptTransfersResult["failed"] = [];

  for (const instruction of pending) {
    try {
      const updateId = await acceptIncomingTransfer(instruction.contractId);
      accepted.push({
        contractId: instruction.contractId,
        sender: instruction.sender,
        amount: instruction.amount,
        updateId,
      });
    } catch (err) {
      failed.push({
        contractId: instruction.contractId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { accepted, failed };
}
