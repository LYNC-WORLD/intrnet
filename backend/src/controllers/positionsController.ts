import { Request, Response } from "express";
import * as positionsService from "../services/positionsService";
import { asyncHandler } from "../utils/asyncHandler";
import { isServiceError, sendServiceError } from "../utils/http";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { partyId, role } = req.user;
  const { cycleId } = req.query as Record<string, string>;
  const positions = await positionsService.listPositions(partyId, role, cycleId);
  return res.json({ success: true, data: positions });
});
