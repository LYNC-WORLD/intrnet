import { Request, Response } from "express";
import * as agreementsService from "../services/agreementsService";
import { asyncHandler } from "../utils/asyncHandler";
import { isServiceError, sendServiceError } from "../utils/http";

export const create = asyncHandler(async (req: Request, res: Response) => {
  const { agreementId, settlementCurrency = "USD", agreementDate } = req.body as {
    agreementId?: string;
    settlementCurrency?: string;
    agreementDate?: string;
  };

  if (!agreementId) {
    return res.status(400).json({ error: "agreementId is required" });
  }

  const data = await agreementsService.createAgreement({
    agreementId,
    settlementCurrency,
    agreementDate,
  });

  return res.status(201).json({ success: true, data });
});

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const data = await agreementsService.listAgreements();
  return res.json({ success: true, data });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const result = await agreementsService.getAgreementById(String(req.params.agreementId));
  if (isServiceError(result)) return sendServiceError(res, result);
  return res.json({ success: true, data: result.data });
});
