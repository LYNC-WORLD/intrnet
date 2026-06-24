import { createRemoteJWKSet, jwtVerify } from "jose";

const PLACEHOLDER_EMAIL_SUFFIX = "@oauth.intrnet.local";

export interface OAuthIdentity {
  sub: string;
  email: string | null;
  issuer: string;
}

export function placeholderEmailFromSub(sub: string): string {
  return `${Buffer.from(sub, "utf8").toString("base64url")}${PLACEHOLDER_EMAIL_SUFFIX}`;
}

export function isPlaceholderEmail(email: string): boolean {
  return email.endsWith(PLACEHOLDER_EMAIL_SUFFIX);
}

let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksUrlCache = "";

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function getJwks() {
  const jwksUrl = getRequiredEnv("APP_OAUTH_JWKS_URL");
  if (!jwksCache || jwksUrl !== jwksUrlCache) {
    jwksCache = createRemoteJWKSet(new URL(jwksUrl));
    jwksUrlCache = jwksUrl;
  }
  return jwksCache;
}

export async function verifyOAuthToken(token: string): Promise<OAuthIdentity> {
  const issuer = getRequiredEnv("APP_OAUTH_ISSUER");
  const audience = getRequiredEnv("APP_OAUTH_AUDIENCE");

  const { payload } = await jwtVerify(token, getJwks(), {
    issuer,
    audience,
  });

  const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
  if (!sub) throw new Error("OAuth token missing subject");

  const email =
    typeof payload.email === "string" && payload.email.trim()
      ? payload.email.trim().toLowerCase()
      : null;

  return { sub, email, issuer };
}
