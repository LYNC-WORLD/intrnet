export const PARTY_ID_PATTERN = /^[^:]+::[0-9a-f]+$/i;

export function amountsMatch(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.00000001;
}

export function shouldEnforceInstrumentAdmin(): boolean {
  return Boolean(process.env.SETTLEMENT_INSTRUMENT_ADMIN?.trim());
}

export function parseInstrument(
  payload: Record<string, unknown>,
): { id: string; admin: string | null } | null {
  const instrument = payload.instrumentId ?? payload.instrument;
  if (!instrument || typeof instrument !== "object") return null;
  const record = instrument as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : null;
  if (!id) return null;
  const admin = typeof record.admin === "string" ? record.admin : null;
  return { id, admin };
}

export function toLedgerDisclosed(
  disclosed: Array<{
    templateId: string;
    contractId: string;
    createdEventBlob: string;
    synchronizerId?: string;
  }>,
) {
  return disclosed.map((d) => ({
    templateId: d.templateId,
    contractId: d.contractId,
    createdEventBlob: d.createdEventBlob,
    ...(d.synchronizerId ? { synchronizerId: d.synchronizerId } : {}),
  }));
}
