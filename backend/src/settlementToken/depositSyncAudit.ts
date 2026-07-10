export interface DepositAttributionAuditStep {
  step: string;
  detail?: string;
  data?: Record<string, unknown>;
}

export interface DepositAttributionAudit {
  holdingContractId: string;
  amount?: number;
  resolvedPartyId: string | null;
  steps: DepositAttributionAuditStep[];
}

export function depositSyncDebug(message: string, data?: Record<string, unknown>): void {
  if (data) {
    console.info(`[deposit-sync] ${message}`, JSON.stringify(data));
    return;
  }
  console.info(`[deposit-sync] ${message}`);
}

export function createAttributionAudit(holdingContractId: string, amount?: number): DepositAttributionAudit {
  return {
    holdingContractId,
    amount,
    resolvedPartyId: null,
    steps: [],
  };
}

export function auditStep(
  audit: DepositAttributionAudit,
  step: string,
  detail?: string,
  data?: Record<string, unknown>,
): void {
  audit.steps.push({ step, ...(detail ? { detail } : {}), ...(data ? { data } : {}) });
  depositSyncDebug(`${holdingContractIdShort(audit.holdingContractId)} ${step}`, {
    detail,
    ...data,
  });
}

function holdingContractIdShort(contractId: string): string {
  return contractId.length > 16 ? `${contractId.slice(0, 12)}...` : contractId;
}
