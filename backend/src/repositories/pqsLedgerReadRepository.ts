import { pqs } from "../db/pqs";
import { T } from "../ledger/templateIds";
import {
  PqsAgreement,
  PqsCashAccount,
  PqsFxRate,
  PqsNettingCycle,
  PqsNetPosition,
  PqsObligation,
  PqsSettlementInstruction,
} from "../types/ledger";

function pkg(): string {
  const id = process.env.INTRNET_PACKAGE_ID?.trim();
  if (!id) {
    throw new Error(
      "INTRNET_PACKAGE_ID is required for PQS contract reads (set to your deployed Intrnet package hash)",
    );
  }
  return id;
}

function wherePkg(extra: string[] = []): string {
  if (!extra.length) return "WHERE package_id = $2";
  return `WHERE package_id = $2 AND ${extra.join(" AND ")}`;
}

function rowToAgreement(row: { contract_id: string; payload: Record<string, unknown> }): PqsAgreement {
  const p = row.payload;
  return {
    contractId: row.contract_id,
    agreementId: p.agreementId as string,
    operator: p.operator as string,
    participants: Array.isArray(p.participants) ? (p.participants as string[]) : [],
    settlementCurrency: p.settlementCurrency as string,
    agreementDate: new Date(p.agreementDate as string),
  };
}

function rowToObligation(
  row: { contract_id: string; payload: Record<string, unknown>; archived_effective_at?: Date | string | null },
  options?: { rejected?: boolean },
): PqsObligation {
  const p = row.payload;
  const archivedAt = row.archived_effective_at ? new Date(row.archived_effective_at) : null;
  const payloadStatus = p.status as string;
  return {
    contractId: row.contract_id,
    payer: p.payer as string,
    receiver: p.receiver as string,
    amount: parseFloat(p.amount as string),
    currency: p.currency as string,
    description: p.description as string,
    invoiceRef: p.invoiceRef as string,
    agreementId: p.agreementId as string,
    status: options?.rejected || (archivedAt && payloadStatus === "PENDING") ? "REJECTED" : payloadStatus,
    createdAt: new Date(p.createdAt as string),
    archivedAt,
  };
}

function buildObligationFilterClauses(params: {
  partyId: string;
  userRole: string;
  userAgreementId?: string | null;
  agreementId?: string;
  status?: string;
  role?: string;
  currency?: string;
}) {
  const { partyId, userRole, userAgreementId, agreementId, status, role, currency } = params;
  const conditions: string[] = [];
  const args: unknown[] = [];
  let idx = 3;

  if (userRole !== "operator") {
    const payerArg = idx++;
    const receiverArg = idx++;
    conditions.push(`(payload->>'payer' = $${payerArg} OR payload->>'receiver' = $${receiverArg})`);
    args.push(partyId, partyId);
    if (userAgreementId) {
      conditions.push(`payload->>'agreementId' = $${idx++}`);
      args.push(userAgreementId);
    }
  } else if (agreementId) {
    conditions.push(`payload->>'agreementId' = $${idx++}`);
    args.push(agreementId);
  }

  if (status && status !== "REJECTED") {
    conditions.push(`payload->>'status' = $${idx++}`);
    args.push(status);
  }
  if (currency) {
    conditions.push(`payload->>'currency' = $${idx++}`);
    args.push(currency);
  }
  if (role === "payer") {
    conditions.push(`payload->>'payer' = $${idx++}`);
    args.push(partyId);
  } else if (role === "receiver") {
    conditions.push(`payload->>'receiver' = $${idx++}`);
    args.push(partyId);
  }

  return { conditions, args, nextIdx: idx };
}

function rowToCycle(row: { contract_id: string; payload: Record<string, unknown> }): PqsNettingCycle {
  const p = row.payload;
  return {
    contractId: row.contract_id,
    cycleId: p.cycleId as string,
    operator: p.operator as string,
    settlementCurrency: p.settlementCurrency as string,
    status: p.status as string,
    cutoffTime: new Date(p.cutoffTime as string),
    agreementId: p.agreementId as string,
    obligationCids: Array.isArray(p.obligationCids) ? (p.obligationCids as string[]) : [],
    ackDeadline: p.ackDeadline ? new Date(p.ackDeadline as string) : null,
    positionCids: Array.isArray(p.positionCids) ? (p.positionCids as string[]) : [],
    settlementInstructionCids: Array.isArray(p.settlementInstructionCids)
      ? (p.settlementInstructionCids as string[])
      : [],
    settlementPhase: (p.settlementPhase as string) ?? "NOT_SETTLED",
    forceSettled: Boolean(p.forceSettled),
    settledAt: p.settledAt ? new Date(p.settledAt as string) : null,
    createdAt: new Date(),
  };
}

function rowToPosition(row: { contract_id: string; payload: Record<string, unknown> }): PqsNetPosition {
  const p = row.payload;
  return {
    contractId: row.contract_id,
    participant: p.participant as string,
    cycleId: p.cycleId as string,
    netAmountSettlement: parseFloat(p.netAmountSettlement as string),
    settlementCurrency: p.settlementCurrency as string,
    status: p.status as string,
  };
}

function rowToInstruction(row: {
  contract_id: string;
  payload: Record<string, unknown>;
}): PqsSettlementInstruction {
  const p = row.payload;
  return {
    contractId: row.contract_id,
    payer: p.payer as string,
    receiver: p.receiver as string,
    amount: parseFloat(p.amount as string),
    currency: p.currency as string,
    cycleId: p.cycleId as string,
    status: p.status as string,
    failureReason: p.failureReason ? String(p.failureReason) : null,
    createdAt: new Date(),
  };
}

function rowToCashAccount(row: { contract_id: string; payload: Record<string, unknown> }): PqsCashAccount {
  const p = row.payload;
  return {
    contractId: row.contract_id,
    owner: p.owner as string,
    currency: p.currency as string,
    balance: parseFloat(p.balance as string),
  };
}

function rowToFxRate(row: { contract_id: string; payload: Record<string, unknown> }): PqsFxRate {
  const p = row.payload;
  return {
    contractId: row.contract_id,
    fromCurrency: p.fromCurrency as string,
    toCurrency: p.toCurrency as string,
    rate: parseFloat(p.rate as string),
    asOf: new Date(p.asOf as string),
  };
}

export async function listAgreements(): Promise<PqsAgreement[]> {
  const packageId = pkg();
  const { rows } = await pqs.query(
    `SELECT contract_id, payload FROM active($1)
     WHERE package_id = $2
     ORDER BY payload->>'agreementId'`,
    [T.NettingAgreement, packageId],
  );
  return rows.map(rowToAgreement);
}

export async function getAgreementById(agreementId: string): Promise<PqsAgreement | null> {
  const packageId = pkg();
  const { rows } = await pqs.query(
    `SELECT contract_id, payload FROM active($1)
     WHERE package_id = $2 AND payload->>'agreementId' = $3
     LIMIT 1`,
    [T.NettingAgreement, packageId, agreementId],
  );
  return rows.length > 0 ? rowToAgreement(rows[0]) : null;
}

export async function getAgreementContractId(agreementId: string): Promise<string | null> {
  const packageId = pkg();
  const { rows } = await pqs.query(
    `SELECT contract_id FROM active($1)
     WHERE package_id = $2 AND payload->>'agreementId' = $3
     LIMIT 1`,
    [T.NettingAgreement, packageId, agreementId],
  );
  return rows.length > 0 ? (rows[0].contract_id as string) : null;
}

export async function getAgreementParticipants(agreementId: string): Promise<string[]> {
  const agreement = await getAgreementById(agreementId);
  return agreement?.participants ?? [];
}

async function findActiveObligationByKey(
  agreementId: string,
  invoiceRef: string,
): Promise<PqsObligation | null> {
  const packageId = pkg();
  const { rows } = await pqs.query(
    `SELECT contract_id, payload FROM active($1)
     WHERE package_id = $2
       AND payload->>'agreementId' = $3
       AND payload->>'invoiceRef' = $4
     LIMIT 1`,
    [T.Obligation, packageId, agreementId, invoiceRef],
  );
  return rows.length > 0 ? rowToObligation(rows[0]) : null;
}

export async function getObligation(contractId: string): Promise<PqsObligation | null> {
  const packageId = pkg();
  const { rows } = await pqs.query(
    `SELECT contract_id, payload FROM active($1)
     WHERE package_id = $2 AND contract_id = $3
     LIMIT 1`,
    [T.Obligation, packageId, contractId],
  );
  if (rows.length > 0) return rowToObligation(rows[0]);
  return getArchivedObligation(contractId);
}

export async function getArchivedObligation(contractId: string): Promise<PqsObligation | null> {
  const packageId = pkg();
  const { rows } = await pqs.query(
    `SELECT contract_id, payload, archived_effective_at
     FROM archives($1)
     WHERE package_id = $2
       AND contract_id = $3
     LIMIT 1`,
    [T.Obligation, packageId, contractId],
  );
  if (rows.length === 0) return null;

  const payloadStatus = rows[0].payload.status as string;
  const successor = await findActiveObligationByKey(
    rows[0].payload.agreementId as string,
    rows[0].payload.invoiceRef as string,
  );
  if (successor && successor.contractId !== contractId) {
    return successor;
  }

  if (payloadStatus === "PENDING") {
    return rowToObligation(rows[0], { rejected: true });
  }

  return rowToObligation(rows[0]);
}

export async function getObligationsByContractIds(contractIds: string[]): Promise<PqsObligation[]> {
  const obligations: PqsObligation[] = [];
  for (const contractId of contractIds) {
    const obligation = await getObligation(contractId);
    if (obligation) obligations.push(obligation);
  }
  return obligations;
}

async function listRejectedObligations(params: {
  partyId: string;
  userRole: string;
  userAgreementId?: string | null;
  agreementId?: string;
  role?: string;
  currency?: string;
  page: number;
  limit: number;
}): Promise<{ obligations: PqsObligation[]; total: number; page: number }> {
  const packageId = pkg();
  const { page, limit } = params;
  const { conditions, args, nextIdx } = buildObligationFilterClauses({ ...params, status: "REJECTED" });
  conditions.push(`payload->>'status' = 'PENDING'`);
  const where = wherePkg(conditions);
  const queryArgs = [T.Obligation, packageId, ...args, limit, offsetVal(page, limit)];

  const countRes = await pqs.query(
    `SELECT COUNT(*) AS cnt FROM archives($1) ${where}`,
    [T.Obligation, packageId, ...args],
  );
  const total = parseInt(countRes.rows[0].cnt as string, 10);

  const dataRes = await pqs.query(
    `SELECT contract_id, payload, archived_effective_at
     FROM archives($1)
     ${where}
     ORDER BY archived_effective_at DESC
     LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`,
    queryArgs,
  );

  return {
    obligations: dataRes.rows.map((row) => rowToObligation(row, { rejected: true })),
    total,
    page,
  };
}

function offsetVal(page: number, limit: number): number {
  return (page - 1) * limit;
}

export async function listObligations(params: {
  partyId: string;
  userRole: string;
  userAgreementId?: string | null;
  agreementId?: string;
  status?: string;
  role?: string;
  currency?: string;
  page: number;
  limit: number;
}): Promise<{ obligations: PqsObligation[]; total: number; page: number }> {
  if (params.status === "REJECTED") {
    return listRejectedObligations(params);
  }

  const packageId = pkg();
  const { page, limit } = params;
  const { conditions, args, nextIdx } = buildObligationFilterClauses(params);
  const where = wherePkg(conditions);
  const queryArgs = [T.Obligation, packageId, ...args, limit, offsetVal(page, limit)];

  const countRes = await pqs.query(
    `SELECT COUNT(*) AS cnt FROM active($1) ${where}`,
    [T.Obligation, packageId, ...args],
  );
  const total = parseInt(countRes.rows[0].cnt as string, 10);

  const dataRes = await pqs.query(
    `SELECT contract_id, payload FROM active($1)
     ${where}
     ORDER BY payload->>'createdAt' DESC
     LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`,
    queryArgs,
  );

  return { obligations: dataRes.rows.map((row) => rowToObligation(row)), total, page };
}

export async function listAcceptedObligations(agreementId: string): Promise<PqsObligation[]> {
  const packageId = pkg();
  const { rows } = await pqs.query(
    `SELECT contract_id, payload FROM active($1)
     WHERE package_id = $2
       AND payload->>'agreementId' = $3
       AND payload->>'status' = 'ACCEPTED'`,
    [T.Obligation, packageId, agreementId],
  );
  return rows.map((row) => rowToObligation(row));
}

export async function getCycleByContractId(contractId: string): Promise<PqsNettingCycle | null> {
  const packageId = pkg();
  const { rows } = await pqs.query(
    `SELECT contract_id, payload FROM active($1)
     WHERE package_id = $2 AND contract_id = $3
     LIMIT 1`,
    [T.NettingCycle, packageId, contractId],
  );
  return rows.length > 0 ? rowToCycle(rows[0]) : null;
}

function pickPreferredCycle(cycles: PqsNettingCycle[]): PqsNettingCycle {
  return [...cycles].sort((a, b) => {
    const score = (cycle: PqsNettingCycle) =>
      (cycle.positionCids.length > 0 ? 4 : 0) +
      (cycle.obligationCids.length > 0 ? 2 : 0) +
      (cycle.settlementPhase === "SETTLED" ? 1 : 0);
    return score(b) - score(a) || b.contractId.localeCompare(a.contractId);
  })[0]!;
}

export async function getCycleByCycleId(cycleId: string): Promise<PqsNettingCycle | null> {
  const packageId = pkg();
  const { rows } = await pqs.query(
    `SELECT contract_id, payload FROM active($1)
     WHERE package_id = $2 AND payload->>'cycleId' = $3`,
    [T.NettingCycle, packageId, cycleId],
  );
  if (rows.length === 0) return null;
  const cycles = rows.map(rowToCycle);
  return cycles.length === 1 ? cycles[0]! : pickPreferredCycle(cycles);
}

export async function listCycles(params: {
  role: string;
  userAgreementId?: string | null;
  agreementId?: string;
}): Promise<PqsNettingCycle[]> {
  const packageId = pkg();
  const { role, userAgreementId, agreementId } = params;

  const conditions: string[] = [];
  const args: unknown[] = [T.NettingCycle, packageId];
  let idx = 3;

  if (role !== "operator" && userAgreementId) {
    conditions.push(`payload->>'agreementId' = $${idx++}`);
    args.push(userAgreementId);
  } else if (role === "operator" && agreementId) {
    conditions.push(`payload->>'agreementId' = $${idx++}`);
    args.push(agreementId);
  }

  const where = wherePkg(conditions);
  const { rows } = await pqs.query(
    `SELECT contract_id, payload FROM active($1) ${where}
     ORDER BY payload->>'cycleId' DESC`,
    args,
  );
  return rows.map(rowToCycle);
}

export async function listCycleIdsByAgreement(agreementId: string): Promise<string[]> {
  const packageId = pkg();
  const { rows } = await pqs.query(
    `SELECT payload->>'cycleId' AS cycle_id FROM active($1)
     WHERE package_id = $2 AND payload->>'agreementId' = $3`,
    [T.NettingCycle, packageId, agreementId],
  );
  return rows.map((r: { cycle_id: string }) => r.cycle_id);
}

export async function getPosition(contractId: string): Promise<PqsNetPosition | null> {
  const packageId = pkg();
  const { rows } = await pqs.query(
    `SELECT contract_id, payload FROM active($1)
     WHERE package_id = $2 AND contract_id = $3
     LIMIT 1`,
    [T.NetPosition, packageId, contractId],
  );
  return rows.length > 0 ? rowToPosition(rows[0]) : null;
}

export async function listPositions(params: {
  partyId: string;
  role: string;
  cycleId?: string;
  userAgreementId?: string | null;
  agreementId?: string;
}): Promise<PqsNetPosition[]> {
  const packageId = pkg();
  const { partyId, role, cycleId, userAgreementId, agreementId } = params;

  const conditions: string[] = [];
  const args: unknown[] = [T.NetPosition, packageId];
  let idx = 3;

  if (role !== "operator") {
    conditions.push(`payload->>'participant' = $${idx++}`);
    args.push(partyId);
  }
  if (cycleId) {
    conditions.push(`payload->>'cycleId' = $${idx++}`);
    args.push(cycleId);
  }

  const filterAgreementId = role !== "operator" ? userAgreementId : agreementId;
  if (filterAgreementId) {
    const cycleTemplateArg = idx++;
    const cyclePackageArg = idx++;
    const agreementArg = idx++;
    conditions.push(
      `payload->>'cycleId' IN (
         SELECT payload->>'cycleId' FROM active($${cycleTemplateArg})
         WHERE package_id = $${cyclePackageArg} AND payload->>'agreementId' = $${agreementArg}
       )`,
    );
    args.push(T.NettingCycle, packageId, filterAgreementId);
  }

  const where = wherePkg(conditions);
  const { rows } = await pqs.query(
    `SELECT contract_id, payload FROM active($1) ${where}`,
    args,
  );
  return rows.map(rowToPosition);
}

export async function getActivePositionsForCycle(
  cycleId: string,
  status?: string,
): Promise<PqsNetPosition[]> {
  const packageId = pkg();
  const args: unknown[] = [T.NetPosition, packageId, cycleId];
  let statusClause = "";
  if (status) {
    statusClause = `AND payload->>'status' = $4`;
    args.push(status);
  }
  const { rows } = await pqs.query(
    `SELECT contract_id, payload FROM active($1)
     WHERE package_id = $2 AND payload->>'cycleId' = $3 ${statusClause}`,
    args,
  );
  return rows.map(rowToPosition);
}

export async function getInstruction(contractId: string): Promise<PqsSettlementInstruction | null> {
  const packageId = pkg();
  const { rows } = await pqs.query(
    `SELECT contract_id, payload FROM active($1)
     WHERE package_id = $2 AND contract_id = $3
     LIMIT 1`,
    [T.SettlementInstruction, packageId, contractId],
  );
  return rows.length > 0 ? rowToInstruction(rows[0]) : null;
}

export async function listSettlementInstructions(params: {
  role: string;
  partyId: string;
  cycleIds?: string[];
}): Promise<PqsSettlementInstruction[]> {
  const packageId = pkg();
  const { role, partyId, cycleIds } = params;

  const conditions: string[] = [];
  const args: unknown[] = [T.SettlementInstruction, packageId];
  let idx = 3;

  if (cycleIds && cycleIds.length > 0) {
    conditions.push(`payload->>'cycleId' = ANY($${idx++}::text[])`);
    args.push(cycleIds);
  }
  if (role !== "operator") {
    const payerArg = idx++;
    const receiverArg = idx++;
    conditions.push(`(payload->>'payer' = $${payerArg} OR payload->>'receiver' = $${receiverArg})`);
    args.push(partyId, partyId);
  }

  const where = wherePkg(conditions);
  const { rows } = await pqs.query(
    `SELECT contract_id, payload FROM active($1) ${where}
     ORDER BY payload->>'createdAt' DESC`,
    args,
  );
  return rows.map(rowToInstruction);
}

export async function getActiveInstructionsForCycle(cycleId: string): Promise<PqsSettlementInstruction[]> {
  const packageId = pkg();
  const { rows } = await pqs.query(
    `SELECT contract_id, payload FROM active($1)
     WHERE package_id = $2 AND payload->>'cycleId' = $3`,
    [T.SettlementInstruction, packageId, cycleId],
  );
  return rows.map(rowToInstruction);
}

export async function getCashAccount(owner: string, currency: string): Promise<PqsCashAccount | null> {
  const packageId = pkg();
  const { rows } = await pqs.query(
    `SELECT contract_id, payload FROM active($1)
     WHERE package_id = $2 AND payload->>'owner' = $3 AND payload->>'currency' = $4
     LIMIT 1`,
    [T.CashAccount, packageId, owner, currency],
  );
  return rows.length > 0 ? rowToCashAccount(rows[0]) : null;
}

export async function listCashAccounts(owner?: string): Promise<PqsCashAccount[]> {
  const packageId = pkg();
  const args: unknown[] = [T.CashAccount, packageId];
  const where = owner
    ? `WHERE package_id = $2 AND payload->>'owner' = $3`
    : "WHERE package_id = $2";
  if (owner) args.push(owner);

  const { rows } = await pqs.query(
    `SELECT contract_id, payload FROM active($1) ${where}
     ORDER BY payload->>'owner', payload->>'currency'`,
    args,
  );
  return rows.map(rowToCashAccount);
}

export async function listFxRates(fromCurrency?: string, toCurrency?: string): Promise<PqsFxRate[]> {
  const packageId = pkg();
  const conditions: string[] = [];
  const args: unknown[] = [T.FxRateOracle, packageId];
  let idx = 3;

  if (fromCurrency) {
    conditions.push(`payload->>'fromCurrency' = $${idx++}`);
    args.push(fromCurrency);
  }
  if (toCurrency) {
    conditions.push(`payload->>'toCurrency' = $${idx++}`);
    args.push(toCurrency);
  }

  const where = wherePkg(conditions);
  const { rows } = await pqs.query(
    `SELECT contract_id, payload FROM active($1) ${where}
     ORDER BY payload->>'fromCurrency', payload->>'toCurrency'`,
    args,
  );
  return rows.map(rowToFxRate);
}

export async function pqsHealthCheck(): Promise<{
  connected: boolean;
  agreementCount: number;
  cycleCount: number;
  obligationCount: number;
  cashAccountCount: number;
  packageId?: string;
  error?: string;
}> {
  try {
    const packageId = pkg();
    const countSql = `SELECT COUNT(*) AS cnt FROM active($1) WHERE package_id = $2`;
    const [agreements, cycles, obligations, accounts] = await Promise.all([
      pqs.query(countSql, [T.NettingAgreement, packageId]),
      pqs.query(countSql, [T.NettingCycle, packageId]),
      pqs.query(countSql, [T.Obligation, packageId]),
      pqs.query(countSql, [T.CashAccount, packageId]),
    ]);
    return {
      connected: true,
      packageId,
      agreementCount: parseInt(agreements.rows[0].cnt as string, 10),
      cycleCount: parseInt(cycles.rows[0].cnt as string, 10),
      obligationCount: parseInt(obligations.rows[0].cnt as string, 10),
      cashAccountCount: parseInt(accounts.rows[0].cnt as string, 10),
    };
  } catch (err) {
    return {
      connected: false,
      agreementCount: 0,
      cycleCount: 0,
      obligationCount: 0,
      cashAccountCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
