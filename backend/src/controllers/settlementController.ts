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

export const listAccounts = asyncHandler(async (req: Request, res: Response) => {
  const { role, partyId } = req.user;
  const accounts = await settlementService.listCashAccounts(role, partyId);
  return res.json({ success: true, data: accounts });
});

export const execute = asyncHandler(async (req: Request, res: Response) => {
  const contractId = String(req.params.contractId);
  const result = await settlementService.executeSettlement(contractId);
  if (isServiceError(result)) return sendServiceError(res, result);
  return res.json({ success: true, data: result.data });
});

export const confirm = asyncHandler(async (req: Request, res: Response) => {
  const { token, partyId } = req.user;
  const contractId = String(req.params.contractId);
  const result = await settlementService.confirmSettlement(contractId, token, partyId);
  if (isServiceError(result)) return sendServiceError(res, result);
  return res.json({ success: true, data: result.data });
});
