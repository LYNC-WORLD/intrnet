const PARTY_ID_PATTERN = /^[^:]+::[0-9a-f]+$/i;

export const SETTLEMENT_INSTRUCTION_META_KEY = "intrnet.netclear/settlementInstructionCid";

const REFERENCE_META_KEYS = [
  "reference",
  "depositor",
  "depositorPartyId",
  "partyId",
  "party_id",
  "recipient",
  "utility.digitalasset.com/reference",
  "utility.digitalasset.com/depositor",
  "splice.lfdecentralizedtrust.org/reference",
  "splice.lfdecentralizedtrust.org/reason",
];

export function isPartyId(value: string): boolean {
  return PARTY_ID_PATTERN.test(value.trim());
}

function unwrapMetaValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.value === "string") return record.value;
  if (record.tag === "Some" && typeof record.value === "string") return record.value;
  return null;
}

export function parseMetaValues(meta: unknown): Record<string, string> {
  if (!meta || typeof meta !== "object") return {};
  const record = meta as Record<string, unknown>;
  const raw = record.values;
  if (!raw) return {};

  if (typeof raw === "object" && !Array.isArray(raw)) {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const unwrapped = unwrapMetaValue(value);
      if (unwrapped !== null) out[key] = unwrapped;
    }
    return out;
  }

  if (Array.isArray(raw)) {
    const out: Record<string, string> = {};
    for (const entry of raw) {
      if (Array.isArray(entry) && entry.length >= 2) {
        const key = entry[0];
        const value = unwrapMetaValue(entry[1]);
        if (typeof key === "string" && value !== null) out[key] = value;
      } else if (entry && typeof entry === "object") {
        const pair = entry as Record<string, unknown>;
        const key = pair.key ?? pair._1 ?? pair.fst;
        const value = unwrapMetaValue(pair.value ?? pair._2 ?? pair.snd);
        if (typeof key === "string" && value !== null) out[key] = value;
      }
    }
    return out;
  }

  return {};
}

function partyIdFromOptionalText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return isPartyId(trimmed) ? trimmed : null;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.tag === "Some" && typeof record.value === "string") {
      const trimmed = record.value.trim();
      return isPartyId(trimmed) ? trimmed : null;
    }
  }
  return null;
}

export function parseSettlementInstructionCidFromMeta(meta: unknown): string | null {
  const values = parseMetaValues(meta);
  const candidate = values[SETTLEMENT_INSTRUCTION_META_KEY];
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim();
  }
  return null;
}

export function parseReferenceFromMeta(meta: unknown): string | null {
  const values = parseMetaValues(meta);
  for (const key of REFERENCE_META_KEYS) {
    const candidate = values[key];
    if (typeof candidate === "string" && isPartyId(candidate)) {
      return candidate.trim();
    }
  }

  for (const [key, candidate] of Object.entries(values)) {
    if (
      !/reference|depositor|party|recipient|reason/i.test(key) &&
      !key.endsWith("/reference") &&
      !key.endsWith("/reason")
    ) {
      continue;
    }
    if (typeof candidate === "string" && isPartyId(candidate)) {
      return candidate.trim();
    }
  }

  for (const candidate of Object.values(values)) {
    if (typeof candidate === "string" && isPartyId(candidate)) {
      return candidate.trim();
    }
  }

  return null;
}

function findPartyIdDeep(
  value: unknown,
  exclude: Set<string>,
  depth = 0,
): string | null {
  if (depth > 12 || value === null || value === undefined) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (isPartyId(trimmed) && !exclude.has(trimmed)) return trimmed;
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findPartyIdDeep(item, exclude, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const [key, child] of Object.entries(record)) {
      if (key === "sender" || key === "receiver" || key === "admin") continue;
      const found = findPartyIdDeep(child, exclude, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

export function parseTransferRecord(payload: Record<string, unknown>): Record<string, unknown> | null {
  const transfer = payload.transfer;
  if (transfer && typeof transfer === "object") {
    return transfer as Record<string, unknown>;
  }
  if (typeof payload.receiver === "string" && typeof payload.sender === "string") {
    return payload;
  }
  return null;
}

export function parseDepositAttributionParty(payload: Record<string, unknown>): string | null {
  const topLevel = partyIdFromOptionalText(payload.reference);
  if (topLevel) return topLevel;

  const fromMeta = parseReferenceFromMeta(payload.meta);
  if (fromMeta) return fromMeta;

  const lock = payload.lock;
  if (lock && typeof lock === "object") {
    const record = lock as Record<string, unknown>;
    const locked =
      record.tag === "Some" && record.value && typeof record.value === "object"
        ? (record.value as Record<string, unknown>)
        : record;
    const context = locked.context;
    const fromContext = partyIdFromOptionalText(context);
    if (fromContext) return fromContext;
  }

  return null;
}

export function parseTransferDepositorParty(transfer: Record<string, unknown>): string | null {
  const fromMeta = parseReferenceFromMeta(transfer.meta);
  if (fromMeta) return fromMeta;

  const topLevel = partyIdFromOptionalText(transfer.reference);
  if (topLevel) return topLevel;

  return null;
}

export function parseDepositorPartyFromInstructionPayload(
  payload: Record<string, unknown>,
): string | null {
  const transfer = parseTransferRecord(payload);
  const exclude = new Set(
    [transfer?.sender, transfer?.receiver].filter((value): value is string => typeof value === "string"),
  );

  if (transfer) {
    const fromTransfer = parseTransferDepositorParty(transfer);
    if (fromTransfer) return fromTransfer;
  }

  const fromInstructionMeta = parseReferenceFromMeta(payload.meta);
  if (fromInstructionMeta) return fromInstructionMeta;

  return findPartyIdDeep(payload, exclude);
}

export function collectPartyIdsDeep(
  value: unknown,
  exclude: Set<string> = new Set(),
  depth = 0,
  found: Set<string> = new Set(),
): string[] {
  if (depth > 16 || value === null || value === undefined) return [...found];

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (isPartyId(trimmed) && !exclude.has(trimmed)) found.add(trimmed);
    return [...found];
  }

  if (Array.isArray(value)) {
    for (const item of value) collectPartyIdsDeep(item, exclude, depth + 1, found);
    return [...found];
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const [key, child] of Object.entries(record)) {
      if (key === "sender" || key === "receiver" || key === "admin") continue;
      collectPartyIdsDeep(child, exclude, depth + 1, found);
    }
  }

  return [...found];
}
