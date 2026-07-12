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
    if (!instrument.admin) continue;
    if (enforceAdmin && instrument.admin !== expectedAdmin) continue;

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
      instrumentAdmin: instrument.admin,
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

export interface SelectedHoldings {
  inputHoldingCids: string[];
  total: number;
  instrumentAdmin: string;
}

function groupHoldingsByAdmin(holdings: TokenHolding[]): Map<string, TokenHolding[]> {
  const groups = new Map<string, TokenHolding[]>();
  for (const holding of holdings) {
    if (!holding.instrumentAdmin) continue;
    const list = groups.get(holding.instrumentAdmin) ?? [];
    list.push(holding);
    groups.set(holding.instrumentAdmin, list);
  }
  return groups;
}

function pickHoldingsForAmount(
  holdings: TokenHolding[],
  amount: number,
): { cids: string[]; total: number } | null {
  const singles = holdings
    .filter((holding) => holding.amount >= amount)
    .sort((a, b) => b.amount - a.amount);
  if (singles.length > 0) {
    return { cids: [singles[0].contractId], total: singles[0].amount };
  }

  const sorted = [...holdings].sort((a, b) => b.amount - a.amount);
  const selected: string[] = [];
  let total = 0;
  for (const holding of sorted) {
    if (total >= amount) break;
    selected.push(holding.contractId);
    total += holding.amount;
  }
  if (total < amount) return null;
  return { cids: selected, total };
}

function orderAdminGroups(
  groups: Map<string, TokenHolding[]>,
  configuredAdmin?: string,
): string[] {
  const orderedAdmins = [...groups.keys()].sort((left, right) => {
    const totalLeft = groups.get(left)!.reduce((sum, holding) => sum + holding.amount, 0);
    const totalRight = groups.get(right)!.reduce((sum, holding) => sum + holding.amount, 0);
    return totalRight - totalLeft;
  });

  if (configuredAdmin) {
    orderedAdmins.sort((left, right) => {
      if (left === configuredAdmin) return -1;
      if (right === configuredAdmin) return 1;
      return 0;
    });
  }

  return orderedAdmins;
}

function candidateKey(selection: SelectedHoldings): string {
  return `${selection.instrumentAdmin}:${selection.inputHoldingCids.join(",")}`;
}

export async function enumerateHoldingCandidates(
  ownerPartyId: string,
  amount: number,
  opts: { holdingContractIds?: string[] } = {},
): Promise<SelectedHoldings[]> {
  const allHoldings = await listTokenHoldings(ownerPartyId);
  const allowedHoldingIds = opts.holdingContractIds
    ? new Set(opts.holdingContractIds)
    : null;
  const eligibleHoldings = allowedHoldingIds
    ? allHoldings.filter((holding) => allowedHoldingIds.has(holding.contractId))
    : allHoldings;
  const configuredAdmin = process.env.SETTLEMENT_INSTRUMENT_ADMIN?.trim();
  const groups = groupHoldingsByAdmin(eligibleHoldings);
  const candidates: SelectedHoldings[] = [];
  const seen = new Set<string>();

  for (const admin of orderAdminGroups(groups, configuredAdmin)) {
    const group = groups.get(admin)!;
    const singles = group
      .filter((holding) => holding.amount >= amount)
      .sort((a, b) => b.amount - a.amount);

    for (const holding of singles) {
      const selection = {
        inputHoldingCids: [holding.contractId],
        total: holding.amount,
        instrumentAdmin: admin,
      };
      const key = candidateKey(selection);
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push(selection);
      }
    }

    const picked = pickHoldingsForAmount(group, amount);
    if (picked) {
      const selection = {
        inputHoldingCids: picked.cids,
        total: picked.total,
        instrumentAdmin: admin,
      };
      const key = candidateKey(selection);
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push(selection);
      }
    }
  }

  return candidates;
}

export async function selectHoldingsForAmount(
  ownerPartyId: string,
  amount: number,
): Promise<SelectedHoldings> {
  const currency = getSettlementCurrency();
  const allHoldings = await listTokenHoldings(ownerPartyId);
  const configuredAdmin = process.env.SETTLEMENT_INSTRUMENT_ADMIN?.trim();
  const groups = groupHoldingsByAdmin(allHoldings);

  for (const admin of orderAdminGroups(groups, configuredAdmin)) {
    const picked = pickHoldingsForAmount(groups.get(admin)!, amount);
    if (picked) {
      return {
        inputHoldingCids: picked.cids,
        total: picked.total,
        instrumentAdmin: admin,
      };
    }
  }

  const available = allHoldings.reduce((sum, holding) => sum + holding.amount, 0);
  throw new Error(
    `Insufficient ${currency} holdings for ${ownerPartyId}: need ${amount}, available ${available}`,
  );
}
