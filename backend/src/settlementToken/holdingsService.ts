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

export interface HoldingSelection {
  inputHoldingCids: string[];
  total: number;
}

function depositOrderIndex(holdingContractIds?: string[]): Map<string, number> | undefined {
  if (!holdingContractIds?.length) return undefined;
  return new Map(holdingContractIds.map((contractId, index) => [contractId, index]));
}

function sortHoldingsSmallestFirst(
  holdings: TokenHolding[],
  depositOrder?: Map<string, number>,
): TokenHolding[] {
  return [...holdings].sort((left, right) => {
    if (left.amount !== right.amount) return left.amount - right.amount;
    if (depositOrder) {
      const leftIndex = depositOrder.get(left.contractId) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = depositOrder.get(right.contractId) ?? Number.MAX_SAFE_INTEGER;
      if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    }
    return left.contractId.localeCompare(right.contractId);
  });
}

export function pickSmallestFirstMultiHoldings(
  holdings: TokenHolding[],
  amount: number,
  depositOrder?: Map<string, number>,
): HoldingSelection | null {
  const sorted = sortHoldingsSmallestFirst(holdings, depositOrder);
  const selected: string[] = [];
  let total = 0;
  for (const holding of sorted) {
    selected.push(holding.contractId);
    total += holding.amount;
    if (total >= amount) break;
  }
  if (total < amount) return null;
  return { inputHoldingCids: selected, total };
}

export function pickSmallestSingleHolding(
  holdings: TokenHolding[],
  amount: number,
  depositOrder?: Map<string, number>,
): HoldingSelection | null {
  const covering = sortHoldingsSmallestFirst(holdings, depositOrder).filter(
    (holding) => holding.amount >= amount,
  );
  if (covering.length === 0) return null;
  const best = covering[0]!;
  return { inputHoldingCids: [best.contractId], total: best.amount };
}

export function pickHoldingsForAmount(
  holdings: TokenHolding[],
  amount: number,
  depositOrder?: Map<string, number>,
): HoldingSelection | null {
  const sorted = sortHoldingsSmallestFirst(holdings, depositOrder);
  const exact = sorted.find((holding) => holding.amount === amount);
  if (exact) {
    return { inputHoldingCids: [exact.contractId], total: exact.amount };
  }

  const multi = pickSmallestFirstMultiHoldings(holdings, amount, depositOrder);
  if (multi && multi.inputHoldingCids.length > 1) return multi;

  const single = pickSmallestSingleHolding(holdings, amount, depositOrder);
  if (single) return single;

  return multi;
}

export function enumerateHoldingSelections(
  holdings: TokenHolding[],
  amount: number,
  depositOrder?: Map<string, number>,
): HoldingSelection[] {
  const sorted = sortHoldingsSmallestFirst(holdings, depositOrder);
  const selections: HoldingSelection[] = [];
  const seen = new Set<string>();

  const add = (selection: HoldingSelection | null) => {
    if (!selection) return;
    const key = selection.inputHoldingCids.join(",");
    if (seen.has(key)) return;
    seen.add(key);
    selections.push(selection);
  };

  const exact = sorted.find((holding) => holding.amount === amount);
  if (exact) {
    add({ inputHoldingCids: [exact.contractId], total: exact.amount });
  }

  add(pickSmallestFirstMultiHoldings(holdings, amount, depositOrder));

  for (const holding of sorted.filter((entry) => entry.amount >= amount)) {
    add({ inputHoldingCids: [holding.contractId], total: holding.amount });
  }

  return selections;
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
  const depositOrder = depositOrderIndex(opts.holdingContractIds);
  const configuredAdmin = process.env.SETTLEMENT_INSTRUMENT_ADMIN?.trim();
  const groups = groupHoldingsByAdmin(eligibleHoldings);
  const candidates: SelectedHoldings[] = [];
  const seen = new Set<string>();

  for (const admin of orderAdminGroups(groups, configuredAdmin)) {
    const group = groups.get(admin)!;
    for (const picked of enumerateHoldingSelections(group, amount, depositOrder)) {
      const selection = {
        inputHoldingCids: picked.inputHoldingCids,
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
        inputHoldingCids: picked.inputHoldingCids,
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
