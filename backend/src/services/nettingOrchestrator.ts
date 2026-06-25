import { operatorClient } from "../ledger/client";
import { T } from "../ledger/templateIds";
import { listAcceptedObligations } from "../repositories/pqsLedgerReadRepository";
import { auditLedgerExercise } from "./ledgerAudit";

export async function bulkAddObligations(cycleCid: string, cycleId: string, agreementId: string) {
  const client = await operatorClient();
  const current = await client.fetchById(cycleCid);
  if (!current) throw new Error("NettingCycle contract not found");

  const accepted = await listAcceptedObligations(agreementId);

  let latestCycleCid = cycleCid;
  for (const ob of accepted) {
    const result = await client.exercise({
      templateId: T.NettingCycle,
      contractId: latestCycleCid,
      choice: "AddObligation",
      argument: { obCid: ob.contractId },
    });

    await auditLedgerExercise(T.NettingCycle, "AddObligation", latestCycleCid, result.events, {
      argument: { obCid: ob.contractId },
    });

    const newCycleEvent = (result.events as Array<{ created?: { contractId: string; templateId: string } }>)
      .find((e) => e.created && e.created.templateId?.includes("NettingCycle"))?.created;
    if (!newCycleEvent) {
      throw new Error(`Failed to resolve updated cycle contract while adding obligations for ${cycleId}`);
    }
    latestCycleCid = newCycleEvent.contractId;

    const markResult = await client.exercise({
      templateId: T.Obligation,
      contractId: ob.contractId,
      choice: "MarkAsNetted",
      argument: {},
    });
    await auditLedgerExercise(T.Obligation, "MarkAsNetted", ob.contractId, markResult.events);
  }
  return latestCycleCid;
}

export async function computeNetPositions(cycleCid: string, ackDeadline: string) {
  const client = await operatorClient();
  const fxOracles = await client.query(T.FxRateOracle);

  const fxRateCids: [string, string][] = fxOracles.map((o) => [
    o.payload.fromCurrency as string,
    o.contractId,
  ]);

  const result = await client.exercise({
    templateId: T.NettingCycle,
    contractId: cycleCid,
    choice: "ComputeNetPositions",
    argument: { fxRateCids, ackDeadline },
  });

  await auditLedgerExercise(T.NettingCycle, "ComputeNetPositions", cycleCid, result.events, {
    argument: { fxRateCids, ackDeadline },
  });

  return result;
}
