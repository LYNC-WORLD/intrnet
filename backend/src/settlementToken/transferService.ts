import axios, { isAxiosError } from "axios";
import { operatorClient } from "../ledger/client";
import { getOperatorPartyId } from "../ledger/operatorParty";
import {
  getTokenConfig,
  TRANSFER_FACTORY_INTERFACE_ID,
} from "../config/settlementToken";
import { assertPositiveAmount, formatRegistryTokenAmount } from "../utils/amount";
import { getTransferFactory, DisclosedContract, TransferFactoryResult } from "./registryClient";
import {
  enumerateHoldingCandidates,
  listTokenHoldings,
  SelectedHoldings,
  selectHoldingsForAmount,
} from "./holdingsService";

export interface TransferResult {
  paymentReference: string;
  transferKind?: string;
}

const PARTY_ID_PATTERN = /^[^:]+::[0-9a-f]+$/i;
const REQUESTED_AT_SKEW_MS = 1000;
const LOG_PREFIX = "[SettlementTransfer]";
const MAX_FACTORY_ATTEMPTS_PER_CANDIDATE = 3;

function transferDebugEnabled(): boolean {
  const flag = process.env.SETTLEMENT_TRANSFER_DEBUG?.trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

function logTransferDebug(message: string, details?: Record<string, unknown>): void {
  const isFailure = /fail|archived|missing|invalid|inactive/i.test(message);
  if (!transferDebugEnabled() && !isFailure) return;
  if (details) {
    console.warn(`${LOG_PREFIX} ${message}`, details);
  } else {
    console.warn(`${LOG_PREFIX} ${message}`);
  }
}

function toLedgerDisclosed(disclosed: DisclosedContract[]) {
  return disclosed.map((d) => ({
    templateId: d.templateId,
    contractId: d.contractId,
    createdEventBlob: d.createdEventBlob,
    ...(d.synchronizerId ? { synchronizerId: d.synchronizerId } : {}),
  }));
}

function formatTransferError(err: unknown): Error {
  if (isAxiosError(err)) {
    const data = err.response?.data;
    const detail =
      typeof data === "object" && data !== null
        ? JSON.stringify(data)
        : typeof data === "string"
          ? data
          : err.message;
    return new Error(detail);
  }
  return err instanceof Error ? err : new Error(String(err));
}

function isRetryableTransferError(err: unknown): boolean {
  const message = formatTransferError(err).message;
  return (
    message.includes("Given holdings are invalid") ||
    message.includes("inactive contracts") ||
    message.includes("INACTIVE_CONTRACT") ||
    message.includes("not in the custody ACS") ||
    message.includes("were archived")
  );
}

interface HoldingValidation {
  ok: boolean;
  missingFromAcs: string[];
  archived: string[];
}

async function validateCandidateHoldings(
  sender: string,
  inputHoldingCids: string[],
): Promise<HoldingValidation> {
  const activeHoldings = await listTokenHoldings(sender);
  const activeIds = new Set(activeHoldings.map((holding) => holding.contractId));
  const missingFromAcs = inputHoldingCids.filter((contractId) => !activeIds.has(contractId));
  if (missingFromAcs.length === 0) {
    return { ok: true, missingFromAcs: [], archived: [] };
  }

  const client = await operatorClient();
  const archived: string[] = [];
  for (const contractId of missingFromAcs) {
    const lifecycle = await client.fetchContractLifecycle(contractId);
    if (lifecycle?.archived) archived.push(contractId);
  }

  return { ok: false, missingFromAcs, archived };
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

function summarizeFactory(factory: TransferFactoryResult) {
  return {
    factoryId: factory.factoryId,
    transferKind: factory.transferKind,
    disclosedContracts: factory.disclosedContracts.map((contract) => ({
      contractId: contract.contractId,
      templateId: contract.templateId,
      synchronizerId: contract.synchronizerId ?? null,
    })),
    choiceContextKeys: Object.keys(factory.choiceContextData ?? {}),
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
  attemptIndex: number;
  factoryAttemptIndex: number;
}): Promise<{ factory: TransferFactoryResult; updateId: string }> {
  const validation = await validateCandidateHoldings(params.sender, params.candidate.inputHoldingCids);
  if (!validation.ok) {
    const hint =
      validation.archived.length > 0
        ? "One or more deposit holding CIDs were archived (spent). Run deposit sync and ensure PartyBalance DEPOSIT referenceIds match active custody holdings."
        : "One or more holding CIDs are not in the custody ACS.";
    throw new Error(
      `${hint} missing=${validation.missingFromAcs.join(",")} archived=${validation.archived.join(",")}`,
    );
  }

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

  logTransferDebug("transfer-factory request", {
    attemptIndex: params.attemptIndex,
    factoryAttemptIndex: params.factoryAttemptIndex,
    sender: params.sender,
    receiver: params.receiver,
    amount: transfer.amount,
    inputHoldingCids: transfer.inputHoldingCids,
    requestedAt: transfer.requestedAt,
    executeBefore: transfer.executeBefore,
    instrumentAdmin: params.candidate.instrumentAdmin,
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

  logTransferDebug("transfer-factory response", {
    attemptIndex: params.attemptIndex,
    factoryAttemptIndex: params.factoryAttemptIndex,
    ...summarizeFactory(factory),
  });

  const choiceArgument = {
    expectedAdmin: params.candidate.instrumentAdmin,
    transfer,
    extraArgs: {
      context: factory.choiceContextData,
      meta: { values: {} },
    },
  };

  const disclosed = toLedgerDisclosed(factory.disclosedContracts);
  logTransferDebug("ledger submit", {
    attemptIndex: params.attemptIndex,
    factoryAttemptIndex: params.factoryAttemptIndex,
    exerciseContractId: factory.factoryId,
    templateId: TRANSFER_FACTORY_INTERFACE_ID,
    disclosedCount: disclosed.length,
    inputHoldingCids: transfer.inputHoldingCids,
  });

  const client = await operatorClient();
  try {
    const result = await client.exerciseWithDisclosed({
      templateId: TRANSFER_FACTORY_INTERFACE_ID,
      contractId: factory.factoryId,
      choice: "TransferFactory_Transfer",
      argument: choiceArgument,
      disclosedContracts: disclosed,
    });

    if (!result.updateId) {
      throw new Error("Token transfer completed but no updateId was returned by the ledger");
    }

    logTransferDebug("ledger submit succeeded", {
      attemptIndex: params.attemptIndex,
      factoryAttemptIndex: params.factoryAttemptIndex,
      updateId: result.updateId,
      transferKind: factory.transferKind,
    });

    return { factory, updateId: result.updateId };
  } catch (err) {
    const formatted = formatTransferError(err);
    logTransferDebug("ledger submit failed", {
      attemptIndex: params.attemptIndex,
      factoryAttemptIndex: params.factoryAttemptIndex,
      error: formatted.message,
      exerciseContractId: factory.factoryId,
      inputHoldingCids: transfer.inputHoldingCids,
      disclosedContractIds: factory.disclosedContracts.map((contract) => contract.contractId),
      transferKind: factory.transferKind,
    });
    throw formatted;
  }
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

  logTransferDebug("starting transfer", {
    sender,
    receiver,
    amount: params.amount,
    depositHoldingFilter: params.holdingContractIds ?? null,
    candidateCount: attemptCandidates.length,
    candidates: attemptCandidates.map((candidate) => ({
      inputHoldingCids: candidate.inputHoldingCids,
      total: candidate.total,
      instrumentAdmin: candidate.instrumentAdmin,
    })),
  });

  let lastRetryableError: unknown;

  for (let attemptIndex = 0; attemptIndex < attemptCandidates.length; attemptIndex++) {
    const candidate = attemptCandidates[attemptIndex]!;
    for (
      let factoryAttemptIndex = 0;
      factoryAttemptIndex < MAX_FACTORY_ATTEMPTS_PER_CANDIDATE;
      factoryAttemptIndex++
    ) {
      try {
        const { factory, updateId } = await submitTransferForCandidate({
          candidate,
          sender,
          receiver,
          amount: params.amount,
          instrumentId: config.instrumentId,
          transferDeadlineSeconds: config.transferDeadlineSeconds,
          meta: params.meta,
          attemptIndex,
          factoryAttemptIndex,
        });

        return {
          paymentReference: updateId,
          transferKind: factory.transferKind,
        };
      } catch (err) {
        const formatted = formatTransferError(err);
        if (!isRetryableTransferError(formatted)) throw formatted;
        lastRetryableError = formatted;
        const hasMoreFactoryAttempts =
          factoryAttemptIndex + 1 < MAX_FACTORY_ATTEMPTS_PER_CANDIDATE;
        if (hasMoreFactoryAttempts) {
          logTransferDebug("candidate attempt failed, refreshing factory context", {
            attemptIndex,
            factoryAttemptIndex,
            inputHoldingCids: candidate.inputHoldingCids,
            error: formatted.message,
          });
          continue;
        }
        logTransferDebug("candidate failed, trying next", {
          attemptIndex,
          factoryAttemptIndex,
          inputHoldingCids: candidate.inputHoldingCids,
          error: formatted.message,
        });
      }
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
