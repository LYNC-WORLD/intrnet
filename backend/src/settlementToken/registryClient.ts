import axios, { isAxiosError } from "axios";
import {
  getTokenConfig,
  getTokenStandardBaseUrl,
  resolveInstrumentAdmin,
} from "../config/settlementToken";
export interface DisclosedContract {
  templateId: string;
  contractId: string;
  createdEventBlob: string;
  synchronizerId?: string;
}

export interface ChoiceContext {
  choiceContextData: Record<string, unknown>;
  disclosedContracts: DisclosedContract[];
}

export interface FactoryChoiceContext extends ChoiceContext {
  factoryId: string;
}

export interface TransferFactoryResult extends FactoryChoiceContext {
  transferKind?: string;
}

export interface RegistryInstrument {
  id: string;
  admin: string;
  name?: string;
  symbol?: string;
  decimals?: number;
}

const registryHttp = (() => {
  const timeout = Number(process.env.LEDGER_HTTP_TIMEOUT_MS ?? 120000);
  return { timeout: Number.isFinite(timeout) ? timeout : 120000 };
})();

function http(baseURL: string) {
  return axios.create({
    baseURL,
    timeout: registryHttp.timeout,
    headers: { "Content-Type": "application/json" },
  });
}

function wrapRegistryError(err: unknown, operation: string, baseURL?: string): Error {
  if (isAxiosError(err)) {
    const status = err.response?.status;
    const detail =
      typeof err.response?.data === "object" && err.response?.data !== null
        ? JSON.stringify(err.response.data)
        : err.message;
    const target = baseURL ? ` at ${baseURL}` : "";
    return new Error(`Registry ${operation} failed${target}${status ? ` (${status})` : ""}: ${detail}`);
  }
  return err instanceof Error ? err : new Error(`Registry ${operation} failed: ${String(err)}`);
}

function normalizeDisclosed(raw: unknown): DisclosedContract[] {
  if (!Array.isArray(raw)) return [];
  const disclosed: DisclosedContract[] = [];
  for (const item of raw as Array<Record<string, unknown>>) {
    const templateId = item.templateId;
    const contractId = item.contractId;
    const createdEventBlob = item.createdEventBlob;
    if (
      typeof templateId !== "string" ||
      typeof contractId !== "string" ||
      typeof createdEventBlob !== "string"
    ) {
      throw new Error("Registry disclosed contract missing templateId, contractId, or createdEventBlob");
    }
    disclosed.push({
      templateId,
      contractId,
      createdEventBlob,
      synchronizerId: typeof item.synchronizerId === "string" ? item.synchronizerId : undefined,
    });
  }
  return disclosed;
}

export async function getTransferFactory(
  choiceArguments: Record<string, unknown>,
): Promise<TransferFactoryResult> {
  const admin = await resolveInstrumentAdmin();
  const client = http(getTokenStandardBaseUrl(admin));
  try {
    const res = await client.post("/transfer-instruction/v1/transfer-factory", {
      choiceArguments,
      excludeDebugFields: true,
    });
    const data = res.data as {
      factoryId?: string;
      transferKind?: string;
      choiceContext?: ChoiceContext;
    };
    if (!data?.factoryId || !data.choiceContext) {
      throw new Error("Registry transfer-factory response missing factoryId/choiceContext");
    }
    return {
      factoryId: data.factoryId,
      transferKind: data.transferKind,
      choiceContextData: data.choiceContext.choiceContextData,
      disclosedContracts: normalizeDisclosed(data.choiceContext.disclosedContracts),
    };
  } catch (err) {
    throw wrapRegistryError(err, "transfer-factory", getTokenStandardBaseUrl(admin));
  }
}

export async function getTransferInstructionContext(
  transferInstructionId: string,
  action: "accept" | "reject" | "withdraw",
): Promise<ChoiceContext> {
  const admin = await resolveInstrumentAdmin();
  const baseURL = getTokenStandardBaseUrl(admin);
  const client = http(baseURL);
  try {
    const res = await client.post(
      `/transfer-instruction/v1/${encodeURIComponent(transferInstructionId)}/choice-contexts/${action}`,
      { meta: {}, excludeDebugFields: true },
    );
    const data = res.data as { choiceContext?: ChoiceContext } & ChoiceContext;
    const ctx = data.choiceContext ?? data;
    return {
      choiceContextData: ctx.choiceContextData ?? {},
      disclosedContracts: normalizeDisclosed(ctx.disclosedContracts),
    };
  } catch (err) {
    throw wrapRegistryError(err, `transfer-instruction-${action}`, baseURL);
  }
}

export async function listRegistryInstruments(): Promise<RegistryInstrument[]> {
  const admin = await resolveInstrumentAdmin();
  const client = http(getTokenStandardBaseUrl(admin));
  try {
    const res = await client.get("/metadata/v1/instruments");
    const body = res.data as { instruments?: unknown } | unknown[];
    const raw = Array.isArray(body) ? body : ((body as { instruments?: unknown[] }).instruments ?? []);
    const instruments: RegistryInstrument[] = [];
    for (const entry of raw as Array<Record<string, unknown>>) {
      const instrumentId = (entry.instrumentId ?? entry.id ?? entry) as Record<string, unknown> | string;
      if (typeof instrumentId === "string" && instrumentId) {
        instruments.push({ id: instrumentId, admin });
        continue;
      }
      if (typeof instrumentId === "object" && instrumentId) {
        const id = instrumentId.id as string;
        const entryAdmin = (instrumentId.admin as string) ?? admin;
        if (id) {
          instruments.push({
            id,
            admin: entryAdmin,
            name: entry.name as string | undefined,
            symbol: entry.symbol as string | undefined,
            decimals: entry.decimals as number | undefined,
          });
        }
      }
    }
    return instruments;
  } catch (err) {
    throw wrapRegistryError(err, "list-instruments", getTokenStandardBaseUrl(admin));
  }
}

export async function discoverInstrumentAdmin(): Promise<string | null> {
  const { instrumentId } = getTokenConfig();
  try {
    const instruments = await listRegistryInstruments();
    const match = instruments.find((i) => i.id === instrumentId);
    return match?.admin ?? null;
  } catch (err) {
    console.warn(
      "Failed to discover instrument admin from registry:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
