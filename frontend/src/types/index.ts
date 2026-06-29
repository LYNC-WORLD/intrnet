export type Role = "participant";
export type UserStatus = "PENDING" | "ACTIVE" | "REJECTED" | "SUSPENDED";

export interface User {
  userId: string;
  partyId: string | null;
  companyName: string | null;
  role: Role;
  email: string;
  agreementId?: string | null;
  status?: UserStatus;
  onboardingState?: string | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface OAuthLoginResponse {
  token: string;
  user: User;
  isNewUser: boolean;
}

export interface OnboardingPayload {
  email: string;
  companyName: string;
  contactName: string;
  phone: string;
  country: string;
  partyHint: string;
}

// Obligations
export type ObligationStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "NETTED";

export interface Obligation {
  contractId: string;
  payer: string;
  payerName?: string;
  receiver: string;
  receiverName?: string;
  amount: number;
  currency: string;
  description: string;
  invoiceRef: string;
  status: ObligationStatus;
  createdAt: string;
  cycleId?: string;
  agreementId?: string;
}

// Cycles
export type CycleStatus = "OPEN" | "COMPLETED" | "CLOSED";

export interface NettingCycle {
  cycleId: string;
  contractId: string;
  status: CycleStatus;
  settlementCurrency: string;
  cutoffTime: string;
  createdAt: string;
  obligationCount?: number;
  participantCount?: number;
  netComputed?: boolean;
  settled?: boolean;
}

// Net Positions
export type PositionStatus = "PENDING" | "ACKNOWLEDGED";

export interface NetPosition {
  contractId: string;
  cycleId: string;
  partyId?: string;
  companyName?: string;
  netAmountSettlement: number;
  currency: string;
  status: PositionStatus;
  createdAt: string;
}

// Settlement
export type InstructionStatus = "PENDING" | "EXECUTED" | "CONFIRMED";

export interface SettlementInstruction {
  contractId: string;
  cycleId: string;
  payer: string;
  payerName?: string;
  receiver: string;
  receiverName?: string;
  amount: number;
  currency: string;
  status: InstructionStatus;
  executedAt?: string;
  confirmedAt?: string;
  createdAt: string;
}

export interface CashAccount {
  contractId: string;
  owner: string;
  currency: string;
  balance: number;
}

// FX Rates
export interface FxRate {
  contractId: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  asOf: string;
}

// Participants
export interface Participant {
  partyId: string;
  companyName: string;
  email?: string;
  country?: string;
  status?: string;
  balance?: number;
  obligationCount?: number;
  joinedAt?: string;
}

// Agreement
export interface Agreement {
  contractId: string;
  agreementId: string;
  settlementCurrency: string;
  participants: string[];
  agreementDate?: string;
}

// Paginated response
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
