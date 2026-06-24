import { Request, Response } from "express";
import * as referenceService from "../services/referenceService";
import { asyncHandler } from "../utils/asyncHandler";
import { isServiceError, sendServiceError } from "../utils/http";

export const listParticipants = asyncHandler(async (_req: Request, res: Response) => {
  const req = _req as Request;
  const queryAgreementId = String((req.query as Record<string, string | undefined>).agreementId ?? "");
  const agreementId = req.user.role === "operator" ? queryAgreementId : (req.user.agreementId ?? "");
  if (!agreementId) {
    return res.status(400).json({ error: "agreementId is required" });
  }
  const participants = await referenceService.listParticipants(agreementId);
  return res.json({ success: true, data: participants });
});

export const getAgreement = asyncHandler(async (req: Request, res: Response) => {
  const queryAgreementId = String((req.query as Record<string, string | undefined>).agreementId ?? "");
  const agreementId = req.user.role === "operator" ? queryAgreementId : (req.user.agreementId ?? "");
  if (!agreementId) {
    return res.status(400).json({ error: "agreementId is required" });
  }
  const result = await referenceService.getAgreement(agreementId);
  if (isServiceError(result)) return sendServiceError(res, result);
  return res.json({ success: true, data: result.data });
});
