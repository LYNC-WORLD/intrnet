import { getOperatorPartyId } from "../ledger/operatorParty";
import { currenciesAreSettlementEquivalent } from "../utils/fxCurrency";

export interface TokenConfig {
  network: string;
  instrumentId: string;
  instrumentAdmin: string | null;
  utilityBackendUrl: string;
  registryBaseUrl: string;
  settlementCurrency: string;
  transferDeadlineSeconds: number;
}

export const HOLDING_INTERFACE_ID =
  "#splice-api-token-holding-v1:Splice.Api.Token.HoldingV1:Holding";
export const TRANSFER_FACTORY_INTERFACE_ID =
  "#splice-api-token-transfer-instruction-v1:Splice.Api.Token.TransferInstructionV1:TransferFactory";
export const TRANSFER_INSTRUCTION_INTERFACE_ID =
  "#splice-api-token-transfer-instruction-v1:Splice.Api.Token.TransferInstructionV1:TransferInstruction";

function backendUrl(): string {
  return (process.env.UTILITY_BACKEND_URL ?? "https://api.utilities.digitalasset-dev.com").replace(
    /\/+$/,
    "",
  );
}

function parseTransferDeadlineSeconds(): number {
  const raw = process.env.TOKEN_TRANSFER_DEADLINE_SECONDS ?? "300";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `TOKEN_TRANSFER_DEADLINE_SECONDS must be a positive number (got "${raw}")`,
    );
  }
  return parsed;
}

let cachedDiscoveredAdmin: string | null | undefined;

export function getSettlementCurrency(): string {
  return process.env.SETTLEMENT_CURRENCY ?? process.env.SETTLEMENT_INSTRUMENT_ID ?? "tUSD";
}

export function currenciesMatchForSettlement(left: string, right: string): boolean {
  return currenciesAreSettlementEquivalent(left, right);
}

export function getRegistryBaseUrl(): string {
  const explicit = process.env.UTILITY_REGISTRY_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  return `${backendUrl()}/api/utilities/v0/registry`;
}

export function getTokenStandardBaseUrl(admin: string): string {
  const prefix = (
    process.env.UTILITY_TOKEN_STANDARD_URL ?? `${backendUrl()}/api/token-standard/v0/registrars`
  ).replace(/\/+$/, "");
  return `${prefix}/${encodeURIComponent(admin)}/registry`;
}

export function getTokenConfig(): TokenConfig {
  const instrumentId = process.env.SETTLEMENT_INSTRUMENT_ID ?? "tUSD";
  const settlementCurrency = getSettlementCurrency();
  if (
    process.env.SETTLEMENT_CURRENCY &&
    process.env.SETTLEMENT_INSTRUMENT_ID &&
    settlementCurrency !== instrumentId
  ) {
    throw new Error(
      "SETTLEMENT_CURRENCY and SETTLEMENT_INSTRUMENT_ID must match when both are set",
    );
  }

  return {
    network: process.env.CANTON_NETWORK ?? "devnet",
    instrumentId,
    instrumentAdmin: process.env.SETTLEMENT_INSTRUMENT_ADMIN?.trim() || null,
    utilityBackendUrl: backendUrl(),
    registryBaseUrl: getRegistryBaseUrl(),
    settlementCurrency,
    transferDeadlineSeconds: parseTransferDeadlineSeconds(),
  };
}

export async function resolveInstrumentAdmin(): Promise<string> {
  const configured = process.env.SETTLEMENT_INSTRUMENT_ADMIN?.trim();
  if (configured) return configured;

  if (cachedDiscoveredAdmin) return cachedDiscoveredAdmin;

  const { discoverInstrumentAdmin } = await import("../settlementToken/registryClient");
  const discovered = await discoverInstrumentAdmin();
  if (discovered) {
    cachedDiscoveredAdmin = discovered;
    return discovered;
  }

  return getOperatorPartyId();
}

export function isHoldingContract(templateId: string): boolean {
  return templateId.includes("HoldingV1:Holding");
}

export function isTransferInstructionContract(templateId: string): boolean {
  return templateId.includes("TransferInstructionV1:TransferInstruction");
}
