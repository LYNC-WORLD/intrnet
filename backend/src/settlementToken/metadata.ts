const PARTY_ID_PATTERN = /^[^:]+::[0-9a-f]+$/i;

const REFERENCE_META_KEYS = [
  "reference",
  "depositor",
  "depositorPartyId",
  "partyId",
  "party_id",
  "recipient",
];

export function isPartyId(value: string): boolean {
  return PARTY_ID_PATTERN.test(value.trim());
}

export function parseMetaValues(meta: unknown): Record<string, string> {
  if (!meta || typeof meta !== "object") return {};
  const record = meta as Record<string, unknown>;
  const raw = record.values;
  if (!raw) return {};

  if (typeof raw === "object" && !Array.isArray(raw)) {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === "string") out[key] = value;
    }
    return out;
  }

  if (Array.isArray(raw)) {
    const out: Record<string, string> = {};
    for (const entry of raw) {
      if (Array.isArray(entry) && entry.length >= 2) {
        const key = entry[0];
        const value = entry[1];
        if (typeof key === "string" && typeof value === "string") out[key] = value;
      } else if (entry && typeof entry === "object") {
        const pair = entry as Record<string, unknown>;
        const key = pair.key ?? pair._1 ?? pair.fst;
        const value = pair.value ?? pair._2 ?? pair.snd;
        if (typeof key === "string" && typeof value === "string") out[key] = value;
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

export function parseReferenceFromMeta(meta: unknown): string | null {
  const values = parseMetaValues(meta);
  for (const key of REFERENCE_META_KEYS) {
    const candidate = values[key];
    if (typeof candidate === "string" && isPartyId(candidate)) {
      return candidate.trim();
    }
  }

  for (const [key, candidate] of Object.entries(values)) {
    if (!/reference|depositor|party/i.test(key)) continue;
    if (typeof candidate === "string" && isPartyId(candidate)) {
      return candidate.trim();
    }
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
