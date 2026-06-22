import { operatorClient } from "./client";
import { cachePartyByHint, getCachedPartyByHint } from "./partyHintCache";

let cachedOperatorPartyId: string | null = null;

export async function getOperatorPartyId(): Promise<string> {
  const hint = process.env.OPERATOR_PARTY?.trim() ?? "operator";
  if (hint.includes("::")) return hint;

  if (cachedOperatorPartyId) return cachedOperatorPartyId;

  const fromShared = getCachedPartyByHint(hint);
  if (fromShared) {
    cachedOperatorPartyId = fromShared;
    return fromShared;
  }

  const client = await operatorClient();
  const resolved = await client.findPartyByHint(hint);
  cachedOperatorPartyId = resolved ?? hint;

  if (!resolved) {
    console.warn(
      `[OperatorParty] "${hint}" not found on ledger — using bare hint. ` +
        "Set OPERATOR_PARTY to the full party id (hint::fingerprint).",
    );
  }

  return cachedOperatorPartyId;
}
