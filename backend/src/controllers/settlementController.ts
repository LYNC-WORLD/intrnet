import { Request, Response } from "express";
import * as settlementService from "../services/settlementService";
import { asyncHandler } from "../utils/asyncHandler";
import { isServiceError, sendServiceError } from "../utils/http";

export const listInstructions = asyncHandler(async (req: Request, res: Response) => {
  const { role, partyId, agreementId: userAgreementId } = req.user;
  const { agreementId } = req.query as Record<string, string>;
  const instructions = await settlementService.listSettlementInstructions(
    role,
    partyId,
    userAgreementId,
    agreementId,
  );
  return res.json({ success: true, data: instructions });
});

export const listBalances = asyncHandler(async (req: Request, res: Response) => {
  const { role, partyId, token } = req.user;
  const balances = await settlementService.listSettlementBalances(role, partyId, {
    ledgerToken: token,
  });
  return res.json({ success: true, data: balances });
});

export const getBalance = asyncHandler(async (req: Request, res: Response) => {
  const { role, partyId, token } = req.user;
  const balance = await settlementService.getSettlementBalance(role, partyId, {
    ledgerToken: token,
  });
  return res.json({ success: true, data: balance });
});

export const execute = asyncHandler(async (req: Request, res: Response) => {
  const contractId = String(req.params.contractId);
  const body = req.body as { paymentReference?: string; autoTransfer?: boolean } | undefined;
  if (body?.paymentReference?.trim() || body?.autoTransfer === false) {
    return res.status(400).json({
      error:
        "Settlement execute performs an automatic CIP-56 custody payout; paymentReference and manual attestation are not supported.",
    });
  }
  const result = await settlementService.executeSettlement(contractId);
  if (isServiceError(result)) return sendServiceError(res, result);
  return res.json({ success: true, data: result.data });
});

export const fail = asyncHandler(async (req: Request, res: Response) => {
  const contractId = String(req.params.contractId);
  const { reason } = req.body as { reason?: string };
  const result = await settlementService.failSettlement(contractId, reason);
  if (isServiceError(result)) return sendServiceError(res, result);
  return res.json({ success: true, data: result.data });
});

export const confirm = asyncHandler(async (req: Request, res: Response) => {
  const { token, partyId } = req.user;
  if (!partyId) {
    return res.status(403).json({ error: "User has no provisioned party id" });
  }
  const contractId = String(req.params.contractId);
  const result = await settlementService.confirmSettlement(contractId, token, partyId, req.user.userId);
  if (isServiceError(result)) return sendServiceError(res, result);
  return res.json({ success: true, data: result.data });
});
