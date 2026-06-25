export interface PqsAgreement {
  contractId: string;
  agreementId: string;
  operator: string;
  participants: string[];
  settlementCurrency: string;
  agreementDate: Date;
}

export interface PqsObligation {
  contractId: string;
  payer: string;
  receiver: string;
  amount: number;
  currency: string;
  description: string;
  invoiceRef: string;
  agreementId: string;
  status: string;
  createdAt: Date;
  archivedAt?: Date | null;
}

export interface PqsNettingCycle {
  contractId: string;
  cycleId: string;
  operator: string;
  settlementCurrency: string;
  status: string;
  cutoffTime: Date;
  agreementId: string;
  ackDeadline: Date | null;
  positionCids: string[];
  settlementInstructionCids: string[];
  settlementPhase: string;
  forceSettled: boolean;
  settledAt: Date | null;
  createdAt: Date;
}

export interface PqsNetPosition {
  contractId: string;
  participant: string;
  cycleId: string;
  netAmountSettlement: number;
  settlementCurrency: string;
  status: string;
}

export interface PqsSettlementInstruction {
  contractId: string;
  payer: string;
  receiver: string;
  amount: number;
  currency: string;
  cycleId: string;
  status: string;
  failureReason: string | null;
  createdAt: Date;
}

export interface PqsCashAccount {
  contractId: string;
  owner: string;
  currency: string;
  balance: number;
}

export interface PqsFxRate {
  contractId: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  asOf: Date;
}
