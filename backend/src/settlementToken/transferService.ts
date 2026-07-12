import { operatorClient } from "../ledger/client";
import { getOperatorPartyId } from "../ledger/operatorParty";
import {
  getTokenConfig,
  TRANSFER_FACTORY_INTERFACE_ID,
} from "../config/settlementToken";
import { assertPositiveAmount, formatRegistryTokenAmount } from "../utils/amount";
import { getTransferFactory, DisclosedContract } from "./registryClient";
import { selectHoldingsForAmount } from "./holdingsService";

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

export async function executeTokenTransfer(params: {
  receiverPartyId: string;
  amount: number;
  meta?: Record<string, string>;
}): Promise<TransferResult> {
  assertPositiveAmount(params.amount, "Transfer amount");

  const receiver = params.receiverPartyId.trim();
  if (!PARTY_ID_PATTERN.test(receiver)) {
    throw new Error("receiverPartyId must be a valid Canton party id");
  }

  const config = getTokenConfig();
  const sender = await getOperatorPartyId();

  const { inputHoldingCids, instrumentAdmin: admin } = await selectHoldingsForAmount(
    sender,
    params.amount,
  );

  const now = new Date();
  const executeBefore = new Date(now.getTime() + config.transferDeadlineSeconds * 1000);

  const transfer = {
    sender,
    receiver,
    amount: formatRegistryTokenAmount(params.amount),
    instrumentId: { admin, id: config.instrumentId },
    lock: null,
    requestedAt: now.toISOString(),
    executeBefore: executeBefore.toISOString(),
    inputHoldingCids,
    meta: { values: params.meta ?? {} },
  };

  const factory = await getTransferFactory(
    {
      expectedAdmin: admin,
      transfer,
      extraArgs: {
        context: { values: {} },
        meta: { values: {} },
      },
    },
    admin,
  );

  const choiceArgument = {
    expectedAdmin: admin,
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
