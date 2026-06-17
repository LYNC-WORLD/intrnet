import { Request, Response } from "express";
import * as cyclesService from "../services/cyclesService";
import { asyncHandler } from "../utils/asyncHandler";
import { isServiceError, sendServiceError } from "../utils/http";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { role, agreementId: userAgreementId } = req.user;
  const { agreementId } = req.query as Record<string, string>;
  const cycles = await cyclesService.listCycles(role, userAgreementId, agreementId);
  return res.json({ success: true, data: cycles });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const contractId = String(req.params.contractId);
  const result = await cyclesService.getCycle(contractId);
  if (isServiceError(result)) return sendServiceError(res, result);
  return res.json({ success: true, data: result.data });
});

export const start = asyncHandler(async (req: Request, res: Response) => {
  const { cycleId, cutoffTime, agreementId, agreementContractId } = req.body;
  const result = await cyclesService.startCycle(
    cycleId,
    cutoffTime,
    agreementId,
    agreementContractId,
  );
  if (isServiceError(result)) return sendServiceError(res, result);
  return res.status(201).json({ success: true, data: result });
});

export const addObligations = asyncHandler(async (req: Request, res: Response) => {
  const contractId = String(req.params.contractId);
  const result = await cyclesService.addObligationsToCycle(contractId);
  if (isServiceError(result)) return sendServiceError(res, result);
  return res.json({ success: true, data: result.data });
});

export const compute = asyncHandler(async (req: Request, res: Response) => {
  const contractId = String(req.params.contractId);
  const result = await cyclesService.computeCyclePositions(contractId);
  return res.json({ success: true, data: result });
});
