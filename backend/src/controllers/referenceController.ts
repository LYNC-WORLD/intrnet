import { Request, Response } from "express";
import * as referenceService from "../services/referenceService";
import { asyncHandler } from "../utils/asyncHandler";
import { isServiceError, sendServiceError } from "../utils/http";

export const listParticipants = asyncHandler(async (_req: Request, res: Response) => {
  const participants = await referenceService.listParticipants();
  return res.json({ success: true, data: participants });
});

export const getAgreement = asyncHandler(async (_req: Request, res: Response) => {
  const result = await referenceService.getAgreement();
  if (isServiceError(result)) return sendServiceError(res, result);
  return res.json({ success: true, data: result.data });
});
