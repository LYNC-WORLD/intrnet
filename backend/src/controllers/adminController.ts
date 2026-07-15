import { Request, Response } from "express";
import { prisma } from "../db";
import * as adminService from "../services/adminService";
import { pqsHealthCheck } from "../repositories/pqsLedgerReadRepository";
import { asyncHandler } from "../utils/asyncHandler";
import { reconcileDeposits } from "../settlementToken/depositIndexer";
import { discoverInstrumentAdmin, listRegistryInstruments } from "../settlementToken/registryClient";
import {
  creditDeposit,
  creditManualBalance,
  getOrCreatePartyBalance,
  getPartyBalance,
} from "../services/balanceService";
import { getSettlementCurrency } from "../config/settlementToken";
import { parsePagination } from "../utils/pagination";

export const listCompanies = asyncHandler(async (req: Request, res: Response) => {
  const { agreementId, page, limit } = req.query as Record<string, string | undefined>;
  const result = await adminService.listCompanies({
    agreementId,
    ...parsePagination({ page, limit }),
  });
  return res.json({ success: true, data: result });
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

export const creditPartyBalance = asyncHandler(async (req: Request, res: Response) => {
  const { partyId, amount, referenceId, holdingContractId, note } = req.body as {
    partyId?: string;
    amount?: number | string;
    referenceId?: string;
    holdingContractId?: string;
    note?: string;
  };

  const resolvedPartyId = partyId?.trim();
  if (!resolvedPartyId) {
    return res.status(400).json({ error: "partyId is required" });
  }

  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: "amount must be a positive number" });
  }

  const user = await prisma.user.findFirst({
    where: { partyId: resolvedPartyId, status: "ACTIVE" },
    select: { partyId: true, email: true },
  });
  if (!user) {
    return res.status(404).json({ error: "No ACTIVE user found for partyId" });
  }

  const currency = getSettlementCurrency();
  const creditNote =
    note?.trim() ||
    (holdingContractId
      ? `Manual ${currency} credit for custody holding ${holdingContractId}`
      : `Manual ${currency} balance credit`);

  if (holdingContractId?.trim()) {
    const credited = await creditDeposit({
      partyId: resolvedPartyId,
      amount: parsedAmount,
      holdingContractId: holdingContractId.trim(),
      createdBy: req.user.userId,
      note: creditNote,
    });
    const balance = credited ?? (await getPartyBalance(resolvedPartyId)) ?? (await getOrCreatePartyBalance(resolvedPartyId, 0));
    return res.json({
      success: true,
      data: {
        balance,
        alreadyApplied: credited === null,
        creditType: "DEPOSIT",
        referenceId: holdingContractId.trim(),
      },
    });
  }

  const manualReferenceId = referenceId?.trim();
  if (!manualReferenceId) {
    return res.status(400).json({
      error: "referenceId is required when holdingContractId is not provided",
    });
  }

  const result = await creditManualBalance({
    partyId: resolvedPartyId,
    amount: parsedAmount,
    referenceId: manualReferenceId,
    createdBy: req.user.userId,
    note: creditNote,
  });

  return res.json({
    success: true,
    data: {
      balance: result.balance,
      alreadyApplied: result.alreadyApplied,
      creditType: "MANUAL_CREDIT",
      referenceId: manualReferenceId,
    },
  });
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

export const dashboard = asyncHandler(async (req: Request, res: Response) => {
  const { limit } = req.query as Record<string, string | undefined>;
  const parsedLimit = limit ? parseInt(limit, 10) : 10;
  const data = await adminService.getDashboard(
    Number.isFinite(parsedLimit) ? parsedLimit : 10,
  );
  return res.json({ success: true, data });
});
