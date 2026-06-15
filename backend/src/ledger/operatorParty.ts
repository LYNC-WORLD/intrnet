import { operatorClient } from "./client";
import { resolvePartyHint } from "./v2";

let cachedOperatorPartyId: string | null = null;

export async function getOperatorPartyId(): Promise<string> {
  const hint = process.env.OPERATOR_PARTY ?? "operator";
  if (hint.includes("::")) return hint;

  if (cachedOperatorPartyId) return cachedOperatorPartyId;

  const parties = await operatorClient().listParties();
  const known = parties.map((p) => p.party);
  cachedOperatorPartyId = resolvePartyHint(hint, known);
  return cachedOperatorPartyId;
}
