import { operatorClient } from "../ledger/client";
import { getOperatorPartyId } from "../ledger/operatorParty";
import {
  getTokenConfig,
  TRANSFER_FACTORY_INTERFACE_ID,
} from "../config/settlementToken";
import { assertPositiveAmount, formatRegistryTokenAmount } from "../utils/amount";
import { getTransferFactory, DisclosedContract, TransferFactoryResult } from "./registryClient";
import { enumerateHoldingCandidates, SelectedHoldings, selectHoldingsForAmount } from "./holdingsService";

export interface TransferResult {
  paymentReference: string;
  transferKind?: string;
}

const PARTY_ID_PATTERN = /^[^:]+::[0-9a-f]+$/i;
const REQUESTED_AT_SKEW_MS = 1000;

function toLedgerDisclosed(disclosed: DisclosedContract[]) {
  return disclosed.map((d) => ({
    templateId: d.templateId,
    contractId: d.contractId,
    createdEventBlob: d.createdEventBlob,
    ...(d.synchronizerId ? { synchronizerId: d.synchronizerId } : {}),
  }));
}

function isRetryableTransferFactoryError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message;
  return (
    message.includes("Given holdings are invalid") ||
    message.includes("inactive contracts") ||
    message.includes("INACTIVE_CONTRACT")
  );
}

function buildTransferRecord(params: {
  sender: string;
  receiver: string;
  amount: number;
  instrumentId: string;
  instrumentAdmin: string;
  inputHoldingCids: string[];
  transferDeadlineSeconds: number;
  meta?: Record<string, string>;
}) {
  const now = Date.now();
  return {
    sender: params.sender,
    receiver: params.receiver,
    amount: formatRegistryTokenAmount(params.amount),
    instrumentId: { admin: params.instrumentAdmin, id: params.instrumentId },
    lock: null,
    requestedAt: new Date(now - REQUESTED_AT_SKEW_MS).toISOString(),
    executeBefore: new Date(now + params.transferDeadlineSeconds * 1000).toISOString(),
    inputHoldingCids: params.inputHoldingCids,
    meta: { values: params.meta ?? {} },
  };
}

async function submitTransferForCandidate(params: {
  candidate: SelectedHoldings;
  sender: string;
  receiver: string;
  amount: number;
  instrumentId: string;
  transferDeadlineSeconds: number;
  meta?: Record<string, string>;
}): Promise<{ factory: TransferFactoryResult; updateId: string }> {
  const transfer = buildTransferRecord({
    sender: params.sender,
    receiver: params.receiver,
    amount: params.amount,
    instrumentId: params.instrumentId,
    instrumentAdmin: params.candidate.instrumentAdmin,
    inputHoldingCids: params.candidate.inputHoldingCids,
    transferDeadlineSeconds: params.transferDeadlineSeconds,
    meta: params.meta,
  });

  const factory = await getTransferFactory(
    {
      expectedAdmin: params.candidate.instrumentAdmin,
      transfer,
      extraArgs: {
        context: { values: {} },
        meta: { values: {} },
      },
    },
    params.candidate.instrumentAdmin,
  );

  const choiceArgument = {
    expectedAdmin: params.candidate.instrumentAdmin,
    transfer,
    extraArgs: {
      context: factory.choiceContextData,
      meta: { values: {} },
    },
  };

  const client = await operatorClient();
  const result = await client.exerciseWithDisclosed({
    templateId: TRANSFER_FACTORY_INTERFACE_ID,
    contractId: factory.factoryId,
    choice: "TransferFactory_Transfer",
    argument: choiceArgument,
    disclosedContracts: toLedgerDisclosed(factory.disclosedContracts),
  });

  if (!result.updateId) {
    throw new Error("Token transfer completed but no updateId was returned by the ledger");
  }

  return { factory, updateId: result.updateId };
}

export async function executeTokenTransfer(params: {
  receiverPartyId: string;
  amount: number;
  holdingContractIds?: string[];
  meta?: Record<string, string>;
}): Promise<TransferResult> {
  assertPositiveAmount(params.amount, "Transfer amount");

  const receiver = params.receiverPartyId.trim();
  if (!PARTY_ID_PATTERN.test(receiver)) {
    throw new Error("receiverPartyId must be a valid Canton party id");
  }

  const config = getTokenConfig();
  const sender = await getOperatorPartyId();

  const candidates = await enumerateHoldingCandidates(sender, params.amount, {
    holdingContractIds: params.holdingContractIds,
  });
  let fallback: SelectedHoldings;
  if (candidates.length > 0) {
    fallback = candidates[0]!;
  } else {
    if (params.holdingContractIds) {
      throw new Error(
        `No active ${config.instrumentId} custody holdings found for settlement payer deposits`,
      );
    }
    fallback = await selectHoldingsForAmount(sender, params.amount);
  }

  const attemptCandidates = candidates.length > 0 ? candidates : [fallback];
  let lastRetryableError: unknown;

  for (const candidate of attemptCandidates) {
    try {
      const { factory, updateId } = await submitTransferForCandidate({
        candidate,
        sender,
        receiver,
        amount: params.amount,
        instrumentId: config.instrumentId,
        transferDeadlineSeconds: config.transferDeadlineSeconds,
        meta: params.meta,
      });

      return {
        paymentReference: updateId,
        transferKind: factory.transferKind,
      };
    } catch (err) {
      if (!isRetryableTransferFactoryError(err)) throw err;
      lastRetryableError = err;
    }
  }

  const attempted = attemptCandidates
    .map((candidate) => candidate.inputHoldingCids.join(","))
    .join("; ");
  const message =
    lastRetryableError instanceof Error
      ? lastRetryableError.message
      : "Transfer failed for all holding candidates";
  throw new Error(`${message}. Attempted holding candidates: ${attempted}`);
}
