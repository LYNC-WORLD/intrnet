import "./env";
import cors from "cors";
import express from "express";
import adminRouter from "./routes/admin";
import authRouter from "./routes/auth";
import obligationsRouter from "./routes/obligations";
import cyclesRouter from "./routes/cycles";
import positionsRouter from "./routes/positions";
import referenceRouter from "./routes/reference";
import fxRatesRouter from "./routes/fxRates";
import agreementsRouter from "./routes/agreements";
import settlementRouter from "./routes/settlement";
import operatorRouter from "./routes/operator";
import onboardingRouter from "./routes/onboarding";
import { operatorClient } from "./ledger/client";
import { bootstrapLedgerRights } from "./ledger/ledgerBootstrap";
import { startEventProcessor } from "./services/eventProcessor";
import { startFxOracleScheduler } from "./services/fxOracle";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3001", 10);

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRouter);
app.use("/api/onboarding", onboardingRouter);
app.use("/api/admin", adminRouter);
app.use("/api/obligations", obligationsRouter);
app.use("/api/cycles", cyclesRouter);
app.use("/api/positions", positionsRouter);
app.use("/api", referenceRouter);
app.use("/api/fx-rates", fxRatesRouter);
app.use("/api/agreements", agreementsRouter);
app.use("/api/settlement", settlementRouter);
app.use("/api/operator", operatorRouter);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("[Error]", err);
  res.status(500).json({ error: err.message ?? "Internal server error" });
});

async function validateLedgerAccess() {
  const client = await operatorClient();
  await client.listParties();
  await bootstrapLedgerRights();
}

async function main() {
  await validateLedgerAccess();
  app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
  await startEventProcessor();
  startFxOracleScheduler();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
