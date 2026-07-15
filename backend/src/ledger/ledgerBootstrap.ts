import jwt from "jsonwebtoken";
import { operatorAdminClient, partyActReadRights, partyReadRights } from "./client";
import { getOperatorPartyId } from "./operatorParty";
import { getOperatorLedgerToken } from "./tokenProvider";

export async function getLedgerAdminUserId(): Promise<string> {
  const fromEnv = process.env.LEDGER_API_ADMIN_USER?.trim();
  if (fromEnv) return fromEnv;

  const token = await getOperatorLedgerToken();
  const decoded = jwt.decode(token);
  if (decoded && typeof decoded !== "string" && typeof decoded.sub === "string") {
    return decoded.sub;
  }

  throw new Error("LEDGER_API_ADMIN_USER is not set and OAuth token has no sub claim");
}

export async function grantOperatorReadAsParty(partyId: string): Promise<void> {
  const adminUserId = await getLedgerAdminUserId();
  const client = await operatorAdminClient();
  await client.grantRights(adminUserId, partyReadRights(partyId));
}

export async function bootstrapLedgerRights(): Promise<void> {
  const adminUserId = await getLedgerAdminUserId();

  let operatorPartyId: string;
  try {
    operatorPartyId = await getOperatorPartyId();
    console.log(
      `[Bootstrap] Operator party: OPERATOR_PARTY=${process.env.OPERATOR_PARTY ?? "(unset)"} → ${operatorPartyId}`,
    );
  } catch (err) {
    console.warn("[Bootstrap] Could not resolve operator party:", err);
    return;
  }

  const client = await operatorAdminClient();
  try {
    await client.grantRights(adminUserId, partyActReadRights(operatorPartyId));
    console.log(`[Bootstrap] Granted CanActAs/CanReadAs for ${operatorPartyId} to ${adminUserId}`);
  } catch (err: any) {
    const details = err?.response?.data ? JSON.stringify(err.response.data) : err?.message ?? String(err);
    console.warn(`[Bootstrap] Failed to grant operator party rights: ${details}`);
  }
}
