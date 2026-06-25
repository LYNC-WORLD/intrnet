import { prisma } from "../db";
import { operatorClient } from "../ledger/client";
import { getOperatorPartyId } from "../ledger/operatorParty";
import { T } from "../ledger/templateIds";
import { listFxRates as pqsListFxRates } from "../repositories/pqsLedgerReadRepository";
import { auditLedgerCreate, auditLedgerExercise } from "./ledgerAudit";
import { refreshFxRates } from "./fxOracle";

export async function listFxRates(fromCurrency?: string, toCurrency?: string) {
  return pqsListFxRates(fromCurrency, toCurrency);
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
  const created = await client.create({
    templateId: T.FxRateOracle,
    payload: {
      operator: operatorPartyId,
      fromCurrency,
      toCurrency,
      rate: String(rate),
      asOf: asOf ?? new Date().toISOString(),
    },
  });

  await auditLedgerCreate(T.FxRateOracle, created.contractId, created.payload, operatorPartyId);

  await prisma.fxRateHistory.create({
    data: {
      contractId: created.contractId,
      fromCurrency,
      toCurrency,
      rate: String(rate),
      asOf: new Date(asOf ?? new Date().toISOString()),
    },
  }).catch(console.error);

  return created;
}

export async function updateFxRate(contractId: string, rate: number | string, asOf?: string) {
  const client = await operatorClient();
  const result = await client.exercise({
    templateId: T.FxRateOracle,
    contractId,
    choice: "UpdateRate",
    argument: {
      newRate: String(rate),
      newAsOf: asOf ?? new Date().toISOString(),
    },
  });

  const newEvent = (result.events as Array<{ created?: { contractId: string; payload: Record<string, unknown> } }>)
    .find((e) => e.created?.payload)?.created;
  if (newEvent) {
    await auditLedgerExercise(T.FxRateOracle, "UpdateRate", contractId, result.events);
    const p = newEvent.payload;
    await prisma.fxRateHistory.create({
      data: {
        contractId: newEvent.contractId,
        fromCurrency: p.fromCurrency as string,
        toCurrency: p.toCurrency as string,
        rate: String(rate),
        asOf: new Date((p.asOf as string) ?? asOf ?? new Date().toISOString()),
      },
    }).catch(console.error);
  }

  return result;
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
