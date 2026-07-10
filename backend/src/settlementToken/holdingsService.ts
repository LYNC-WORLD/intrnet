import { operatorClient } from "../ledger/client";
import { getOperatorPartyId } from "../ledger/operatorParty";
import {
  getSettlementCurrency,
  getTokenConfig,
  HOLDING_INTERFACE_ID,
  resolveInstrumentAdmin,
} from "../config/settlementToken";
import { parsePositiveAmount } from "../utils/amount";
import { parseDepositAttributionParty } from "./metadata";

export interface TokenHolding {
  contractId: string;
  owner: string;
  amount: number;
  instrumentId: string;
  instrumentAdmin: string | null;
  createdEventBlob: string | null;
  attributedParty: string | null;
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

function parseHoldingAmount(payload: Record<string, unknown>): number | null {
  const amount = payload.amount ?? payload.quantity;
  return parsePositiveAmount(amount);
}

function isLockedHolding(payload: Record<string, unknown>): boolean {
  const lock = payload.lock;
  if (!lock) return false;
  if (typeof lock === "object") {
    const record = lock as Record<string, unknown>;
    if (record.tag === "None") return false;
    if (record.tag === "Some") return true;
    return Object.keys(record).length > 0;
  }
  return true;
}

function shouldEnforceInstrumentAdmin(): boolean {
  return Boolean(process.env.SETTLEMENT_INSTRUMENT_ADMIN?.trim());
}

export async function listTokenHoldings(
  partyId?: string,
  opts: { includeLocked?: boolean } = {},
): Promise<TokenHolding[]> {
  const { instrumentId } = getTokenConfig();
  const expectedAdmin = await resolveInstrumentAdmin();
  const enforceAdmin = shouldEnforceInstrumentAdmin();
  const client = await operatorClient();
  const resolvedOwner = partyId ?? (await getOperatorPartyId());
  const contracts = await client.listInterfaceContracts(HOLDING_INTERFACE_ID, resolvedOwner);

  const holdings: TokenHolding[] = [];
  for (const contract of contracts) {
    const payload = contract.payload;
    const instrument = parseInstrument(payload);
    if (!instrument || instrument.id !== instrumentId) continue;
    if (enforceAdmin && instrument.admin && instrument.admin !== expectedAdmin) continue;

    const owner =
      (typeof payload.owner === "string" && payload.owner) ||
      (typeof payload.holder === "string" && payload.holder) ||
      resolvedOwner;
    if (partyId && owner !== partyId) continue;

    if (!opts.includeLocked && isLockedHolding(payload)) continue;

    const amount = parseHoldingAmount(payload);
    if (amount === null) continue;

    holdings.push({
      contractId: contract.contractId,
      owner,
      amount,
      instrumentId: instrument.id,
      instrumentAdmin: instrument.admin ?? expectedAdmin,
      createdEventBlob: contract.createdEventBlob,
      attributedParty: parseDepositAttributionParty(payload),
    });
  }

  return holdings;
}

export async function getTokenHoldingsTotal(partyId: string): Promise<number> {
  const holdings = await listTokenHoldings(partyId);
  return holdings.reduce((sum, holding) => sum + holding.amount, 0);
}

export async function selectHoldingsForAmount(
  ownerPartyId: string,
  amount: number,
): Promise<{ inputHoldingCids: string[]; total: number }> {
  const currency = getSettlementCurrency();
  const holdings = (await listTokenHoldings(ownerPartyId)).sort((a, b) => b.amount - a.amount);
  const selected: string[] = [];
  let total = 0;
  for (const holding of holdings) {
    if (total >= amount) break;
    selected.push(holding.contractId);
    total += holding.amount;
  }
  if (total < amount) {
    throw new Error(
      `Insufficient ${currency} holdings for ${ownerPartyId}: need ${amount}, available ${total}`,
    );
  }
  return { inputHoldingCids: selected, total };
}
