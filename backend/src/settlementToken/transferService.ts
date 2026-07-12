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

function toLedgerDisclosed(disclosed: DisclosedContract[]) {
  return disclosed.map((d) => ({
    templateId: d.templateId,
    contractId: d.contractId,
    createdEventBlob: d.createdEventBlob,
    ...(d.synchronizerId ? { synchronizerId: d.synchronizerId } : {}),
  }));
}

function isInvalidHoldingsError(err: unknown): boolean {
  return err instanceof Error && err.message.includes("Given holdings are invalid");
}

async function getFactoryForHoldingCandidate(params: {
  admin: string;
  transfer: Record<string, unknown>;
}) {
  return getTransferFactory(
    {
      expectedAdmin: params.admin,
      transfer: params.transfer,
      extraArgs: {
        context: { values: {} },
        meta: { values: {} },
      },
    },
    params.admin,
  );
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
  let selected: SelectedHoldings;
  if (candidates.length > 0) {
    selected = candidates[0]!;
  } else {
    if (params.holdingContractIds) {
      throw new Error(
        `No active ${config.instrumentId} custody holdings found for settlement payer deposits`,
      );
    }
    selected = await selectHoldingsForAmount(sender, params.amount);
  }

  const now = new Date();
  const executeBefore = new Date(now.getTime() + config.transferDeadlineSeconds * 1000);

  const transferBase = {
    sender,
    receiver,
    amount: formatRegistryTokenAmount(params.amount),
    lock: null,
    requestedAt: now.toISOString(),
    executeBefore: executeBefore.toISOString(),
    meta: { values: params.meta ?? {} },
  };

  let transfer = {
    ...transferBase,
    instrumentId: { admin: selected.instrumentAdmin, id: config.instrumentId },
    inputHoldingCids: selected.inputHoldingCids,
  };
  let factory: TransferFactoryResult | null = null;
  let lastInvalidHoldingsError: unknown;

  for (const candidate of candidates.length > 0 ? candidates : [selected]) {
    transfer = {
      ...transferBase,
      instrumentId: { admin: candidate.instrumentAdmin, id: config.instrumentId },
      inputHoldingCids: candidate.inputHoldingCids,
    };

    try {
      factory = await getFactoryForHoldingCandidate({
        admin: candidate.instrumentAdmin,
        transfer,
      });
      selected = candidate;
      break;
    } catch (err) {
      if (!isInvalidHoldingsError(err)) throw err;
      lastInvalidHoldingsError = err;
    }
  }

  if (!factory) {
    const attempted = (candidates.length > 0 ? candidates : [selected])
      .map((candidate) => candidate.inputHoldingCids.join(","))
      .join("; ");
    const message =
      lastInvalidHoldingsError instanceof Error
        ? lastInvalidHoldingsError.message
        : "Given holdings are invalid";
    throw new Error(`${message}. Attempted holding candidates: ${attempted}`);
  }

  const choiceArgument = {
    expectedAdmin: selected.instrumentAdmin,
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

  return {
    paymentReference: result.updateId,
    transferKind: factory.transferKind,
  };
}
