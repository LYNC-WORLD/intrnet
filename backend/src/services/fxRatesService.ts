import { prisma } from "../db";
import { operatorClient } from "../ledger/client";
import { getOperatorPartyId } from "../ledger/operatorParty";
import { T } from "../ledger/templateIds";
import { refreshFxRates } from "./fxOracle";

export async function listFxRates(fromCurrency?: string, toCurrency?: string) {
  const where: any = {};
  if (fromCurrency) where.fromCurrency = fromCurrency;
  if (toCurrency) where.toCurrency = toCurrency;
  return prisma.fxRate.findMany({
    where,
    orderBy: [{ fromCurrency: "asc" }, { toCurrency: "asc" }],
  });
}

export async function createFxRate(params: {
  fromCurrency: string;
  toCurrency: string;
  rate: number | string;
  asOf?: string;
}) {
  const { fromCurrency, toCurrency, rate, asOf } = params;
  const operatorPartyId = await getOperatorPartyId();
  const client = await operatorClient();
  return client.create({
    templateId: T.FxRateOracle,
    payload: {
      operator: operatorPartyId,
      fromCurrency,
      toCurrency,
      rate: String(rate),
      asOf: asOf ?? new Date().toISOString(),
    },
  });
}

export async function updateFxRate(contractId: string, rate: number | string, asOf?: string) {
  const client = await operatorClient();
  return client.exercise({
    templateId: T.FxRateOracle,
    contractId,
    choice: "UpdateRate",
    argument: {
      newRate: String(rate),
      newAsOf: asOf ?? new Date().toISOString(),
    },
  });
}

export async function refreshRates() {
  await refreshFxRates();
}

export async function getFxRateHistory(
  fromCurrency?: string,
  toCurrency?: string,
  days = 30,
) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const where: Record<string, unknown> = { asOf: { gte: since } };
  if (fromCurrency) where.fromCurrency = fromCurrency;
  if (toCurrency) where.toCurrency = toCurrency;

  return prisma.fxRateHistory.findMany({
    where,
    orderBy: { asOf: "desc" },
  });
}
