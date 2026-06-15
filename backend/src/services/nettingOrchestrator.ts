import { prisma } from "../db";
import { operatorClient } from "../ledger/client";
import { T } from "../ledger/templateIds";

export async function bulkAddObligations(cycleCid: string, cycleId: string) {
  const client = operatorClient();
  const current = await client.fetchById(cycleCid);
  if (!current) throw new Error("NettingCycle contract not found");

  const accepted = await prisma.obligation.findMany({
    where: { status: "ACCEPTED" },
  });

  let latestCycleCid = cycleCid;
  for (const ob of accepted) {
    const result = await client.exercise({
      templateId: T.NettingCycle,
      contractId: latestCycleCid,
      choice: "AddObligation",
      argument: { obCid: ob.contractId },
    });

    const created = (result.events as any[]).find((e) => e.created);
    if (!created?.created?.contractId) {
      throw new Error(`Failed to resolve updated cycle contract while adding obligations for ${cycleId}`);
    }
    latestCycleCid = created.created.contractId;

    await client.exercise({
      templateId: T.Obligation,
      contractId: ob.contractId,
      choice: "MarkAsNetted",
      argument: {},
    });
  }
  return latestCycleCid;
}

export async function computeNetPositions(cycleCid: string) {
  const client = operatorClient();
  const fxOracles = await client.query(T.FxRateOracle);

  const fxRateCids: [string, string][] = fxOracles.map((o) => [
    o.payload.fromCurrency as string,
    o.contractId,
  ]);

  return client.exercise({
    templateId: T.NettingCycle,
    contractId: cycleCid,
    choice: "ComputeNetPositions",
    argument: { fxRateCids },
  });
}
