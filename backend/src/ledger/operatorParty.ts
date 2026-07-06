import { operatorClient } from "./client";
import { cachePartyByHint, getCachedPartyByHint } from "./partyHintCache";

let cachedOperatorPartyId: string | null = null;

export async function getOperatorPartyId(): Promise<string> {
  const hint = process.env.OPERATOR_PARTY?.trim();
  if (!hint) {
    throw new Error("OPERATOR_PARTY is required");
  }
  if (hint.includes("::")) return hint;

  if (cachedOperatorPartyId) return cachedOperatorPartyId;

  const fromShared = getCachedPartyByHint(hint);
  if (fromShared) {
    cachedOperatorPartyId = fromShared;
    return fromShared;
  }

  const client = await operatorClient();
  const resolved = await client.findPartyByHint(hint);

  if (!resolved) {
    throw new Error(`OPERATOR_PARTY '${hint}' was not found as a local ledger party`);
  }

  cachedOperatorPartyId = resolved;
  return cachedOperatorPartyId;
}
