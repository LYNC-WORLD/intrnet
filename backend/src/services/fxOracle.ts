import axios from "axios";
import cron, { ScheduledTask } from "node-cron";
import { operatorClient } from "../ledger/client";
import { getOperatorPartyId } from "../ledger/operatorParty";
import { T } from "../ledger/templateIds";
import { auditLedgerCreate, auditLedgerExercise } from "./ledgerAudit";

const CURRENCIES = (process.env.SUPPORTED_CURRENCIES ?? "EUR,GBP,JPY,CHF,AUD")
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean);

const BASE = process.env.SETTLEMENT_CURRENCY ?? "USD";

type FxApiResponse = {
  result?: string;
  base_code?: string;
  conversion_rates?: Record<string, number>;
  rates?: Record<string, number>;
  time_last_update_utc?: string;
};

function buildFxApiUrl() {
  const configuredUrl = process.env.FX_API_URL?.trim();
  const apiKey = process.env.FX_API_KEY?.trim();
  if (configuredUrl && configuredUrl.includes("{API_KEY}") && apiKey) {
    return configuredUrl.replace("{API_KEY}", apiKey).replace("{BASE}", BASE);
  }
  if (configuredUrl && !configuredUrl.includes("openexchangerates.org")) {
    return configuredUrl;
  }
  if (apiKey) {
    return `https://v6.exchangerate-api.com/v6/${apiKey}/latest/${BASE}`;
  }
  return configuredUrl!;
}

function extractRates(data: FxApiResponse) {
  return data.conversion_rates ?? data.rates ?? {};
}

let scheduledTask: ScheduledTask | null = null;

export function rescheduleFxOracle(schedule: string) {
  if (scheduledTask) scheduledTask.stop();
  scheduledTask = cron.schedule(schedule, refreshFxRates);
  console.log(`[FxOracle] scheduler started (${schedule})`);
}

export function startFxOracleScheduler() {
  const schedule = process.env.FX_CRON_SCHEDULE ?? "0 */4 * * *";
  rescheduleFxOracle(schedule);
}

export async function refreshFxRates() {
  console.log("[FxOracle] fetching latest rates...");
  try {
    const url = buildFxApiUrl();
    const isOpenExchangeRates = url.includes("openexchangerates.org");
    const { data } = await axios.get<FxApiResponse>(url, {
      ...(isOpenExchangeRates
        ? { params: { app_id: process.env.FX_API_KEY, base: BASE } }
        : {}),
    });

    if (data.result && data.result !== "success") {
      throw new Error(`FX API returned result=${data.result}`);
    }

    const rates = extractRates(data);
    const client = await operatorClient();
    const operatorPartyId = await getOperatorPartyId();
    const now = data.time_last_update_utc
      ? new Date(data.time_last_update_utc).toISOString()
      : new Date().toISOString();
    const existing = await client.query(T.FxRateOracle);

    for (const currency of CURRENCIES) {
      const rate = rates[currency];
      if (!rate) {
        console.warn(`[FxOracle] no rate for ${currency}`);
        continue;
      }

      const invRate = 1 / rate;
      const existingContract = existing.find(
        (c) => c.payload.fromCurrency === currency && c.payload.toCurrency === BASE,
      );

      if (existingContract) {
        const result = await client.exercise({
          templateId: T.FxRateOracle,
          contractId: existingContract.contractId,
          choice: "UpdateRate",
          argument: { newRate: String(invRate.toFixed(8)), newAsOf: now },
        });
        await auditLedgerExercise(
          T.FxRateOracle,
          "UpdateRate",
          existingContract.contractId,
          result.events,
        );
      } else {
        const created = await client.create({
          templateId: T.FxRateOracle,
          payload: {
            operator: operatorPartyId,
            fromCurrency: currency,
            toCurrency: BASE,
            rate: String(invRate.toFixed(8)),
            asOf: now,
          },
        });
        await auditLedgerCreate(T.FxRateOracle, created.contractId, created.payload, operatorPartyId);
      }
      console.log(`[FxOracle] updated ${currency}/${BASE} = ${invRate.toFixed(8)}`);
    }
  } catch (err) {
    console.error("[FxOracle] failed to update rates:", err);
  }
}
