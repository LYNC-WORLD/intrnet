import { operatorClient } from "../ledger/client";
import { T } from "../ledger/templateIds";
import { extractRecreatedContractId, encodeTuple2, type ExerciseEvents } from "../ledger/v2";
import {
  getObligation,
  listAcceptedObligations,
} from "../repositories/pqsLedgerReadRepository";
import { auditLedgerExercise } from "./ledgerAudit";
import {
  dedupeFxRatesByFromCurrency,
  oracleToCurrencyMatchesSettlement,
} from "../utils/fxCurrency";

async function markObligationsAsNetted(obligationCids: string[]) {
  if (obligationCids.length === 0) return;

  const client = await operatorClient();
  for (const obCid of obligationCids) {
    const obligation = await getObligation(obCid);
    if (!obligation) {
      throw new Error(`Obligation not found while marking as netted: ${obCid}`);
    }
    if (obligation.status === "NETTED") continue;
    if (obligation.status !== "ACCEPTED") {
      throw new Error(
        `Obligation ${obligation.invoiceRef} is ${obligation.status}; expected ACCEPTED before MarkAsNetted`,
      );
    }

    const markResult = await client.exercise({
      templateId: T.Obligation,
      contractId: obligation.contractId,
      choice: "MarkAsNetted",
      argument: {},
    });
    await auditLedgerExercise(
      T.Obligation,
      "MarkAsNetted",
      obligation.contractId,
      markResult.events,
    );
  }
}

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

    const newCycleCid = extractRecreatedContractId(
      result.exerciseResult,
      result.events as ExerciseEvents,
      T.NettingCycle,
    );
    if (!newCycleCid) {
      throw new Error(`Failed to resolve updated cycle contract while adding obligations for ${cycleId}`);
    }
    latestCycleCid = newCycleCid;
  }
  return latestCycleCid;
}

export async function computeNetPositions(cycleCid: string, ackDeadline: string) {
  const client = await operatorClient();
  const cycleContract = await client.fetchById(cycleCid);
  if (!cycleContract) throw new Error("NettingCycle contract not found");

  const settlementCurrency = cycleContract.payload.settlementCurrency as string;
  const fxOracles = await client.query(T.FxRateOracle);
  const eligible = fxOracles.filter((oracle) =>
    oracleToCurrencyMatchesSettlement(oracle.payload.toCurrency as string, settlementCurrency),
  );
  const fxRateCids = dedupeFxRatesByFromCurrency(
    eligible.map((oracle) => ({
      contractId: oracle.contractId,
      fromCurrency: oracle.payload.fromCurrency as string,
      toCurrency: oracle.payload.toCurrency as string,
      rate: Number(oracle.payload.rate),
      asOf: new Date(oracle.payload.asOf as string),
    })),
  ).map((oracle) => encodeTuple2(oracle.fromCurrency, oracle.contractId));

  const result = await client.exercise({
    templateId: T.NettingCycle,
    contractId: cycleCid,
    choice: "ComputeNetPositions",
    argument: { fxRateCids, ackDeadline },
  });

  await auditLedgerExercise(T.NettingCycle, "ComputeNetPositions", cycleCid, result.events, {
    argument: { fxRateCids, ackDeadline },
  });

  const newCycleCid = extractRecreatedContractId(
    result.exerciseResult,
    result.events as ExerciseEvents,
    T.NettingCycle,
  );
  if (!newCycleCid) {
    throw new Error("ComputeNetPositions did not return an updated NettingCycle contract id");
  }

  const cycle = await client.fetchById(newCycleCid);
  const obligationCids = Array.isArray(cycle?.payload.obligationCids)
    ? (cycle.payload.obligationCids as string[])
    : [];
  await markObligationsAsNetted(obligationCids);

  return {
    newContractId: newCycleCid,
    exerciseResult: result.exerciseResult,
    events: result.events,
  };
}
