import { partyClient } from "../ledger/client";
import {
  getTokenConfig,
  resolveInstrumentAdmin,
} from "../config/settlementToken";

const TRANSFER_PREAPPROVAL_TEMPLATE =
  "#utility-registry-app-v0:Utility.Registry.App.V0.Model.TransferPreapproval:TransferPreapproval";

const PREAPPROVAL_SUFFIX =
  "Utility.Registry.App.V0.Model.TransferPreapproval:TransferPreapproval";

function allowancesCoverInstrument(
  allowances: unknown,
  instrumentId: string,
): boolean {
  if (!Array.isArray(allowances) || allowances.length === 0) return true;
  return allowances.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const id = (entry as { id?: unknown }).id;
    return typeof id === "string" && id === instrumentId;
  });
}

export async function findActiveTransferPreapproval(params: {
  partyId: string;
  ledgerToken: string;
  instrumentAdmin: string;
  instrumentId: string;
}): Promise<{ contractId: string } | null> {
  const client = partyClient(params.ledgerToken, params.partyId);
  const contracts = await client.query(PREAPPROVAL_SUFFIX);

  for (const contract of contracts) {
    const payload = contract.payload;
    if (payload.receiver !== params.partyId) continue;
    if (payload.instrumentAdmin !== params.instrumentAdmin) continue;
    if (!allowancesCoverInstrument(payload.instrumentAllowances, params.instrumentId)) {
      continue;
    }
    return { contractId: contract.contractId };
  }
  return null;
}

export async function ensureTusdTransferPreapproval(params: {
  partyId: string;
  ledgerToken: string;
}): Promise<{ contractId: string; created: boolean }> {
  const partyId = params.partyId.trim();
  const ledgerToken = params.ledgerToken.trim();
  if (!partyId) throw new Error("partyId is required for transfer preapproval");
  if (!ledgerToken) throw new Error("ledgerToken is required for transfer preapproval");

  const { instrumentId } = getTokenConfig();
  const instrumentAdmin = await resolveInstrumentAdmin();

  const existing = await findActiveTransferPreapproval({
    partyId,
    ledgerToken,
    instrumentAdmin,
    instrumentId,
  });
  if (existing) {
    return { contractId: existing.contractId, created: false };
  }

  const client = partyClient(ledgerToken, partyId);
  try {
    const created = await client.create({
      templateId: TRANSFER_PREAPPROVAL_TEMPLATE,
      payload: {
        operator: instrumentAdmin,
        receiver: partyId,
        instrumentAdmin,
        instrumentAllowances: [{ id: instrumentId }],
      },
    });
    return { contractId: created.contractId, created: true };
  } catch (err) {
    const raced = await findActiveTransferPreapproval({
      partyId,
      ledgerToken,
      instrumentAdmin,
      instrumentId,
    });
    if (raced) {
      return { contractId: raced.contractId, created: false };
    }
    throw err;
  }
}
