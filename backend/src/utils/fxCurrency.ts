export const FX_ORACLE_TARGET_CURRENCY = "USD";

export function normalizeFxToCurrencyForApi(toCurrency: string): string {
  if (toCurrency === "tUSD") return FX_ORACLE_TARGET_CURRENCY;
  return toCurrency;
}

export function normalizeFxToCurrencyForLedger(toCurrency: string): string {
  const trimmed = toCurrency.trim();
  if (trimmed === "tUSD" || trimmed === "USD") return FX_ORACLE_TARGET_CURRENCY;
  return trimmed;
}

export function oracleToCurrencyMatchesSettlement(
  oracleToCurrency: string,
  settlementCurrency: string,
): boolean {
  if (oracleToCurrency === settlementCurrency) return true;
  if (settlementCurrency === "tUSD" && oracleToCurrency === FX_ORACLE_TARGET_CURRENCY) return true;
  if (settlementCurrency === FX_ORACLE_TARGET_CURRENCY && oracleToCurrency === "tUSD") return true;
  return false;
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
    if (existing.toCurrency === "tUSD" && rate.toCurrency === FX_ORACLE_TARGET_CURRENCY) {
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
