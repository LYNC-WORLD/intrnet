import { partyClient } from "../ledger/client";
import { T } from "../ledger/templateIds";
import { extractRecreatedContractId } from "../ledger/v2";
import {
  getPosition,
  listPositions as pqsListPositions,
} from "../repositories/pqsLedgerReadRepository";
import { auditLedgerExercise } from "./ledgerAudit";

export async function listPositions(
  partyId: string,
  role: string,
  cycleId?: string,
  userAgreementId?: string | null,
  agreementId?: string,
) {
  return pqsListPositions({ partyId, role, cycleId, userAgreementId, agreementId });
}

export async function acknowledgePosition(contractId: string, token: string, partyId: string) {
  const position = await getPosition(contractId);
  if (!position) return { error: "Net position not found", status: 404 as const };
  if (position.participant !== partyId) {
    return { error: "Not authorized for this net position", status: 403 as const };
  }
  if (position.status !== "PENDING") {
    return { error: "Only PENDING positions can be acknowledged", status: 400 as const };
  }

  const data = await partyClient(token, partyId).exercise({
    templateId: T.NetPosition,
    contractId,
    choice: "AcknowledgePosition",
    argument: {},
  });

  await auditLedgerExercise(T.NetPosition, "AcknowledgePosition", contractId, data.events, {
    actorPartyId: partyId,
    beforePayload: position as unknown as Record<string, unknown>,
  });

  const newContractId = extractRecreatedContractId(
    data.exerciseResult,
    data.events as Array<{ created?: { contractId: string; templateId: string } }>,
    T.NetPosition,
  );

  return {
    data: {
      newContractId,
      exerciseResult: data.exerciseResult,
      events: data.events,
    },
  };
}
