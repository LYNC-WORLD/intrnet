import axios from "axios";
import jwt from "jsonwebtoken";

type CachedToken = {
  token: string;
  expiresAtMs: number;
};

let cachedToken: CachedToken | null = null;
let inFlight: Promise<string> | null = null;

function getRefreshSkewMs() {
  const raw = process.env.LEDGER_TOKEN_REFRESH_SKEW_MS;
  const parsed = raw ? Number(raw) : 300000;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 300000;
}

function decodeExpiryMs(token: string) {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded === "string" || typeof decoded.exp !== "number") {
    return Date.now() + 10 * 60 * 1000;
  }
  return decoded.exp * 1000;
}

function isStillValid(entry: CachedToken) {
  return Date.now() < entry.expiresAtMs - getRefreshSkewMs();
}

async function fetchOAuthToken() {
  const tokenUrl = process.env.LEDGER_OAUTH_TOKEN_URL;
  const clientId = process.env.LEDGER_OAUTH_CLIENT_ID;
  const clientSecret = process.env.LEDGER_OAUTH_CLIENT_SECRET;
  if (!tokenUrl || !clientId || !clientSecret) {
    throw new Error(
      "Missing OIDC env vars. Set LEDGER_OAUTH_TOKEN_URL, LEDGER_OAUTH_CLIENT_ID, LEDGER_OAUTH_CLIENT_SECRET.",
    );
  }

  const params = new URLSearchParams();
  params.set("grant_type", "client_credentials");
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);
  if (process.env.LEDGER_OAUTH_AUDIENCE) params.set("audience", process.env.LEDGER_OAUTH_AUDIENCE);
  if (process.env.LEDGER_OAUTH_SCOPE) params.set("scope", process.env.LEDGER_OAUTH_SCOPE);

  const res = await axios.post(tokenUrl, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 15000,
  });

  const token =
    res.data?.access_token ??
    res.data?.token ??
    res.data?.result?.access_token ??
    res.data?.result?.token;
  if (!token || typeof token !== "string") {
    throw new Error("OAuth token endpoint did not return access_token");
  }
  cachedToken = { token, expiresAtMs: decodeExpiryMs(token) };
  return token;
}

export async function getOperatorLedgerToken(): Promise<string> {
  if (cachedToken && isStillValid(cachedToken)) return cachedToken.token;
  if (!inFlight) {
    inFlight = fetchOAuthToken().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

export function clearOperatorLedgerTokenCache() {
  cachedToken = null;
}
