import { Pool } from "pg";

if (!process.env.PQS_DATABASE_URL) {
  throw new Error("PQS_DATABASE_URL is required. Set it in .env to point at the PQS Postgres database.");
}

export const pqs = new Pool({
  connectionString: process.env.PQS_DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pqs.on("error", (err) => {
  console.error("[PQS] Unexpected pool error:", err);
});
