import { Request, Response } from "express";
import * as positionsService from "../services/positionsService";
import { asyncHandler } from "../utils/asyncHandler";
import { isServiceError, sendServiceError } from "../utils/http";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { partyId, role, agreementId: userAgreementId } = req.user;
  const { cycleId, agreementId } = req.query as Record<string, string>;
  const positions = await positionsService.listPositions(
    partyId,
    role,
    cycleId,
    userAgreementId,
    agreementId,
  );
  return res.json({ success: true, data: positions });
});

export const acknowledge = asyncHandler(async (req: Request, res: Response) => {
  const { token, partyId } = req.user;
  const contractId = String(req.params.contractId);
  const result = await positionsService.acknowledgePosition(contractId, token, partyId);
  if (isServiceError(result)) return sendServiceError(res, result);
  return res.json({ success: true, data: result.data });
});
