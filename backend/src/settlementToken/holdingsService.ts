import { isAxiosError } from "axios";
import { LedgerClient, operatorClient, partyClient } from "../ledger/client";
import { getOperatorPartyId } from "../ledger/operatorParty";
import { grantOperatorReadAsParty } from "../ledger/ledgerBootstrap";
import {
  getSettlementCurrency,
  getTokenConfig,
  HOLDING_INTERFACE_ID,
  resolveInstrumentAdmin,
} from "../config/settlementToken";
import { parsePositiveAmount } from "../utils/amount";
import { parseDepositAttributionParty } from "./metadata";
import { parseInstrument, shouldEnforceInstrumentAdmin } from "./shared";

export interface TokenHolding {
  contractId: string;
  owner: string;
  amount: number;
  instrumentId: string;
  instrumentAdmin: string | null;
  createdEventBlob: string | null;
  attributedParty: string | null;
}

export interface SelectedHoldings {
  inputHoldingCids: string[];
  total: number;
  instrumentAdmin: string;
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

function isForbiddenLedgerError(err: unknown): boolean {
  return isAxiosError(err) && err.response?.status === 403;
}

async function listHoldingsWithClient(
  client: LedgerClient,
  resolvedOwner: string,
  opts: { includeLocked?: boolean; filterOwner?: string } = {},
): Promise<TokenHolding[]> {
  const { instrumentId } = getTokenConfig();
  const expectedAdmin = await resolveInstrumentAdmin();
  const enforceAdmin = shouldEnforceInstrumentAdmin();
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
    if (opts.filterOwner && owner !== opts.filterOwner) continue;

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

export async function listTokenHoldings(
  partyId?: string,
  opts: { includeLocked?: boolean; client?: LedgerClient; ledgerToken?: string } = {},
): Promise<TokenHolding[]> {
  const resolvedOwner = partyId ?? (await getOperatorPartyId());
  const client =
    opts.client ??
    (opts.ledgerToken
      ? partyClient(opts.ledgerToken, resolvedOwner)
      : await operatorClient());

  try {
    return await listHoldingsWithClient(client, resolvedOwner, {
      includeLocked: opts.includeLocked,
      filterOwner: partyId,
    });
  } catch (err) {
    if (!opts.client && !opts.ledgerToken && partyId && isForbiddenLedgerError(err)) {
      try {
        await grantOperatorReadAsParty(partyId);
        return await listHoldingsWithClient(await operatorClient(), resolvedOwner, {
          includeLocked: opts.includeLocked,
          filterOwner: partyId,
        });
      } catch (retryErr) {
        throw retryErr;
      }
    }
    throw err;
  }
}

export async function getTokenHoldingsTotal(
  partyId: string,
  opts: { client?: LedgerClient; ledgerToken?: string } = {},
): Promise<number> {
  const holdings = await listTokenHoldings(partyId, opts);
  return holdings.reduce((sum, holding) => sum + holding.amount, 0);
}

export async function getTokenHoldingsTotalsByParty(
  partyIds: string[],
): Promise<Map<string, number | null>> {
  const unique = [...new Set(partyIds.filter(Boolean))];
  const entries = await Promise.all(
    unique.map(async (partyId) => {
      try {
        return [partyId, await getTokenHoldingsTotal(partyId)] as const;
      } catch (err) {
        if (!isForbiddenLedgerError(err)) {
          console.warn(
            `Failed to fetch holdings total for ${partyId}:`,
            err instanceof Error ? err.message : err,
          );
        }
        return [partyId, null] as const;
      }
    }),
  );
  return new Map(entries);
}

function selectHoldingsGreedy(
  holdings: TokenHolding[],
  amount: number,
  preferredIds?: string[],
): SelectedHoldings | null {
  const preferred = preferredIds?.length ? new Set(preferredIds) : null;
  const sorted = [...holdings].sort((left, right) => {
    if (preferred) {
      const leftPref = preferred.has(left.contractId) ? 0 : 1;
      const rightPref = preferred.has(right.contractId) ? 0 : 1;
      if (leftPref !== rightPref) return leftPref - rightPref;
    }
    if (left.amount !== right.amount) return left.amount - right.amount;
    return left.contractId.localeCompare(right.contractId);
  });

  const byAdmin = new Map<string, TokenHolding[]>();
  for (const holding of sorted) {
    if (!holding.instrumentAdmin) continue;
    const list = byAdmin.get(holding.instrumentAdmin) ?? [];
    list.push(holding);
    byAdmin.set(holding.instrumentAdmin, list);
  }

  const configuredAdmin = process.env.SETTLEMENT_INSTRUMENT_ADMIN?.trim();
  const admins = [...byAdmin.keys()].sort((left, right) => {
    if (configuredAdmin) {
      if (left === configuredAdmin) return -1;
      if (right === configuredAdmin) return 1;
    }
    return 0;
  });

  for (const admin of admins) {
    const group = byAdmin.get(admin)!;
    const selected: string[] = [];
    let total = 0;
    for (const holding of group) {
      selected.push(holding.contractId);
      total += holding.amount;
      if (total >= amount) {
        return { inputHoldingCids: selected, total, instrumentAdmin: admin };
      }
    }
  }

  return null;
}

export async function selectHoldingsForAmount(
  ownerPartyId: string,
  amount: number,
  opts: { holdings?: TokenHolding[]; preferredHoldingIds?: string[] } = {},
): Promise<SelectedHoldings> {
  const currency = getSettlementCurrency();
  const allHoldings = opts.holdings ?? (await listTokenHoldings(ownerPartyId));
  const picked = selectHoldingsGreedy(allHoldings, amount, opts.preferredHoldingIds);
  if (picked) return picked;

  const available = allHoldings.reduce((sum, holding) => sum + holding.amount, 0);
  throw new Error(
    `Insufficient ${currency} holdings for ${ownerPartyId}: need ${amount}, available ${available}`,
  );
}
