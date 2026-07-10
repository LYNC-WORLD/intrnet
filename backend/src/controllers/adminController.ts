import { Request, Response } from "express";
import * as adminService from "../services/adminService";
import { pqsHealthCheck } from "../repositories/pqsLedgerReadRepository";
import { asyncHandler } from "../utils/asyncHandler";
import { reconcileDeposits } from "../settlementToken/depositIndexer";
import { discoverInstrumentAdmin, listRegistryInstruments } from "../settlementToken/registryClient";

export const listCompanies = asyncHandler(async (req: Request, res: Response) => {
  const { agreementId } = req.query as Record<string, string | undefined>;
  const companies = await adminService.listCompanies(agreementId);
  return res.json({ success: true, data: companies });
});

export const listParties = asyncHandler(async (_req: Request, res: Response) => {
  const parties = await adminService.listParties();
  return res.json({ success: true, data: parties });
});

export const listOnboardingRequests = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.query as Record<string, string | undefined>;
  const requests = await adminService.listOnboardingRequests(status);
  return res.json({ success: true, data: requests });
});

export const getOnboardingRequest = asyncHandler(async (req: Request, res: Response) => {
  const requestId = String(req.params.id ?? "");
  const request = await adminService.getOnboardingRequest(requestId);
  if (!request) return res.status(404).json({ error: "Onboarding request not found" });
  return res.json({ success: true, data: request });
});

export const approveOnboardingRequest = asyncHandler(async (req: Request, res: Response) => {
  const requestId = String(req.params.id ?? "");
  const { partyHint, agreementId, agreementContractId } = req.body as {
    partyHint?: string;
    agreementId?: string;
    agreementContractId?: string;
  };
  const result = await adminService.approveOnboardingRequest({
    requestId,
    approverUserId: req.user.userId,
    partyHint,
    agreementId,
    agreementContractId,
  });
  return res.json({ success: true, data: result });
});

export const rejectOnboarding = asyncHandler(async (req: Request, res: Response) => {
  const requestId = String(req.params.id ?? "");
  const { reason } = req.body as { reason?: string };
  if (!reason) return res.status(400).json({ error: "reason is required" });
  const result = await adminService.rejectRequest(requestId, req.user.userId, reason);
  return res.json({ success: true, data: result });
});

export const syncDeposits = asyncHandler(async (req: Request, res: Response) => {
  const result = await reconcileDeposits(req.user.userId);
  return res.json({ success: true, data: result });
});

export const listInstruments = asyncHandler(async (_req: Request, res: Response) => {
  const [instruments, discoveredAdmin] = await Promise.all([
    listRegistryInstruments(),
    discoverInstrumentAdmin(),
  ]);
  return res.json({ success: true, data: { instruments, discoveredAdmin } });
});

export const pqsHealth = asyncHandler(async (_req: Request, res: Response) => {
  const result = await pqsHealthCheck();
  const statusCode = result.connected ? 200 : 503;
  return res.status(statusCode).json({ success: result.connected, data: result });
});
