export const FX_ORACLE_TARGET_CURRENCY = "USD";

export function getSettlementInstrumentId(): string {
  return (
    process.env.SETTLEMENT_INSTRUMENT_ID?.trim() ||
    process.env.SETTLEMENT_CURRENCY?.trim() ||
    "tUSD"
  );
}

export function getSettlementUsdEquivalentCurrencies(): Set<string> {
  const equivalents = new Set<string>([FX_ORACLE_TARGET_CURRENCY]);
  const instrument = getSettlementInstrumentId();
  if (instrument) equivalents.add(instrument);

  const configured = process.env.SETTLEMENT_USD_EQUIVALENTS?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const currency of configured ?? []) {
    equivalents.add(currency);
  }

  equivalents.add("tUSD");

  return equivalents;
}

export function currenciesAreSettlementEquivalent(left: string, right: string): boolean {
  if (left === right) return true;
  const family = getSettlementUsdEquivalentCurrencies();
  return family.has(left) && family.has(right);
}

export function normalizeFxToCurrencyForApi(toCurrency: string): string {
  if (
    toCurrency !== FX_ORACLE_TARGET_CURRENCY &&
    getSettlementUsdEquivalentCurrencies().has(toCurrency)
  ) {
    return FX_ORACLE_TARGET_CURRENCY;
  }
  return toCurrency;
}

export function normalizeFxToCurrencyForLedger(toCurrency: string): string {
  const trimmed = toCurrency.trim();
  if (
    trimmed === FX_ORACLE_TARGET_CURRENCY ||
    getSettlementUsdEquivalentCurrencies().has(trimmed)
  ) {
    return FX_ORACLE_TARGET_CURRENCY;
  }
  return trimmed;
}

export function oracleToCurrencyMatchesSettlement(
  oracleToCurrency: string,
  settlementCurrency: string,
): boolean {
  return currenciesAreSettlementEquivalent(oracleToCurrency, settlementCurrency);
}

export function isContractUpgradeError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /INTERPRETATION_UPGRADE_ERROR|UPGRADE_ERROR_VALIDATION_FAILED/i.test(message);
}

export interface FxRateLike {
  contractId: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  asOf: Date;
}

export function dedupeFxRatesByFromCurrency<T extends FxRateLike>(rates: T[]): T[] {
  const byFrom = new Map<string, T>();
  for (const rate of rates) {
    const existing = byFrom.get(rate.fromCurrency);
    if (!existing) {
      byFrom.set(rate.fromCurrency, rate);
      continue;
    }
    if (
      existing.toCurrency !== FX_ORACLE_TARGET_CURRENCY &&
      rate.toCurrency === FX_ORACLE_TARGET_CURRENCY
    ) {
      byFrom.set(rate.fromCurrency, rate);
    }
  }
  return [...byFrom.values()];
}

export function mapFxRatesForApi<T extends FxRateLike>(rates: T[]): T[] {
  return dedupeFxRatesByFromCurrency(rates).map((rate) => ({
    ...rate,
    toCurrency: normalizeFxToCurrencyForApi(rate.toCurrency),
  }));
}

export function listFxOracleToCurrencyQueryValues(toCurrency: string): string[] {
  const normalized = normalizeFxToCurrencyForLedger(toCurrency);
  if (normalized !== FX_ORACLE_TARGET_CURRENCY) {
    return [normalized];
  }
  return [...getSettlementUsdEquivalentCurrencies()];
}
