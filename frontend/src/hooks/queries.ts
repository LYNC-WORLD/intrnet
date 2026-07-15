import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  obligationsApi,
  participantsApi,
  fxApi,
  cyclesApi,
  positionsApi,
  settlementApi,
  authApi,
} from "../services/api";
import { useAuth } from "../context/AuthContext";

const POLL_INTERVAL = 1000 * 30;
const SLOW_POLL = 1000 * 60 * 5;

export const QK = {
  me: () => ["me"],
  obligations: (params?: Record<string, unknown>) => ["obligations", params],
  obligation: (cid: string) => ["obligation", cid],
  participants: () => ["participants"],
  agreement: (agreementId?: string) => ["agreement", agreementId],
  fxRates: () => ["fx-rates"],
  cycles: (params?: { page?: number; limit?: number }) => ["cycles", params],
  positions: (params?: Record<string, string>) => ["positions", params],
  instructions: (params?: Record<string, string>) => ["instructions", params],
  accounts: (params?: Record<string, string>) => ["accounts", params],
};

// ─── Auth ────────────────────────────────────────────────────────────────────
export function useMe() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: QK.me(),
    queryFn: () => authApi.me().then((r) => r.data),
    enabled: isAuthenticated,
    staleTime: POLL_INTERVAL,
    refetchInterval: POLL_INTERVAL,
    refetchOnWindowFocus: true,
  });
}

// ─── Obligations ─────────────────────────────────────────────────────────────
export function useObligations(
  params?: Record<string, string | number | undefined>,
) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: QK.obligations(params),
    queryFn: () => obligationsApi.list(params).then((r) => r.data),
    enabled: isAuthenticated,
    staleTime: POLL_INTERVAL,
    refetchInterval: POLL_INTERVAL,
    refetchOnWindowFocus: true,
  });
}

export function useObligation(contractId: string) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: QK.obligation(contractId),
    queryFn: () => obligationsApi.get(contractId).then((r) => r.data),
    enabled: isAuthenticated && !!contractId,
    staleTime: POLL_INTERVAL,
    refetchInterval: POLL_INTERVAL,
    refetchOnWindowFocus: true,
  });
}

export function useAcceptObligation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cid: string) => obligationsApi.accept(cid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["obligations"] }),
  });
}

export function useRejectObligation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cid, reason }: { cid: string; reason: string }) =>
      obligationsApi.reject(cid, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["obligations"] }),
  });
}

export function useCreateObligation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => obligationsApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["obligations"] }),
  });
}

// ─── Participants ─────────────────────────────────────────────────────────────
export function useParticipants() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: QK.participants(),
    queryFn: () => participantsApi.list().then((r) => r.data),
    enabled: isAuthenticated,
    staleTime: SLOW_POLL,
    refetchInterval: SLOW_POLL,
    refetchOnWindowFocus: false,
  });
}

export function useAgreement(agreementId?: string) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: QK.agreement(agreementId),
    queryFn: () => participantsApi.agreement(agreementId).then((r) => r.data),
    enabled: isAuthenticated,
    staleTime: SLOW_POLL,
    refetchInterval: SLOW_POLL,
    refetchOnWindowFocus: false,
  });
}

// ─── FX Rates ─────────────────────────────────────────────────────────────────
export function useFxRates() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: QK.fxRates(),
    queryFn: () => fxApi.list().then((r) => r.data),
    enabled: isAuthenticated,
    staleTime: SLOW_POLL,
    refetchInterval: SLOW_POLL,
    refetchOnWindowFocus: false,
  });
}

// ─── Cycles ──────────────────────────────────────────────────────────────────
export function useCycles(params?: { page?: number; limit?: number }) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: QK.cycles(params),
    queryFn: () => cyclesApi.list(params).then((r) => r.data),
    enabled: isAuthenticated,
    staleTime: POLL_INTERVAL,
    refetchInterval: POLL_INTERVAL,
    refetchOnWindowFocus: true,
  });
}

// ─── Positions ────────────────────────────────────────────────────────────────
export function usePositions(params?: Record<string, string>) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: QK.positions(params),
    queryFn: () => positionsApi.list(params).then((r) => r.data),
    enabled: isAuthenticated,
    staleTime: POLL_INTERVAL,
    refetchInterval: POLL_INTERVAL,
    refetchOnWindowFocus: true,
  });
}

export function useAcknowledgePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cid: string) => positionsApi.acknowledge(cid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["positions"] }),
  });
}

// ─── Settlement ──────────────────────────────────────────────────────────────
export function useSettlementInstructions(params?: Record<string, string>) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: QK.instructions(params),
    queryFn: () => settlementApi.instructions(params).then((r) => r.data),
    enabled: isAuthenticated,
    staleTime: POLL_INTERVAL,
    refetchInterval: POLL_INTERVAL,
    refetchOnWindowFocus: true,
  });
}

export function useSettlementBalance() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["balance"],
    queryFn: () => settlementApi.balance().then((r) => r.data),
    enabled: isAuthenticated,
    staleTime: POLL_INTERVAL,
    refetchInterval: POLL_INTERVAL,
    refetchOnWindowFocus: true,
  });
}

export function useExecuteSettlement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cid: string) => settlementApi.execute(cid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["instructions"] }),
  });
}

export function useConfirmSettlement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cid: string) => settlementApi.confirm(cid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instructions"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}
