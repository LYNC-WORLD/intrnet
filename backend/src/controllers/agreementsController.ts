import { Request, Response } from "express";
import * as agreementsService from "../services/agreementsService";
import { FX_ORACLE_TARGET_CURRENCY } from "../utils/fxCurrency";
import { asyncHandler } from "../utils/asyncHandler";
import { isServiceError, sendServiceError } from "../utils/http";

export const create = asyncHandler(async (req: Request, res: Response) => {
  const { agreementId, settlementCurrency = FX_ORACLE_TARGET_CURRENCY, agreementDate } = req.body as {
    agreementId?: string;
    settlementCurrency?: string;
    agreementDate?: string;
  };

  if (!agreementId) {
    return res.status(400).json({ error: "agreementId is required" });
  }

  const result = await agreementsService.createAgreement({
    agreementId,
    settlementCurrency,
    agreementDate,
  });

  if (isServiceError(result)) return sendServiceError(res, result);
  return res.status(201).json({ success: true, data: result });
});

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const data = await agreementsService.listAgreements();
  return res.json({ success: true, data });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const result = await agreementsService.getAgreementByIdSvc(String(req.params.agreementId));
  if (isServiceError(result)) return sendServiceError(res, result);
  return res.json({ success: true, data: result.data });
});
