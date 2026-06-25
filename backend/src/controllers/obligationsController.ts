import { Request, Response } from "express";
import * as obligationsService from "../services/obligationsService";
import { asyncHandler } from "../utils/asyncHandler";
import { isServiceError, sendServiceError } from "../utils/http";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { partyId, role: userRole, agreementId: userAgreementId } = req.user;
  const { status, role, currency, agreementId, page = "1", limit = "20" } = req.query as Record<
    string,
    string
  >;

  const result = await obligationsService.listObligations({
    partyId,
    userRole,
    userAgreementId,
    agreementId,
    status,
    role,
    currency,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
  });

  return res.json({ success: true, data: result });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const { partyId, role } = req.user;
  const contractId = String(req.params.contractId);
  const result = await obligationsService.getObligationSvc(contractId, partyId, role);
  if (isServiceError(result)) return sendServiceError(res, result);
  return res.json({ success: true, data: result.data });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const { partyId, token, role: userRole, agreementId: userAgreementId } = req.user;
  const { receiver, amount, currency, description, invoiceRef, agreementId } = req.body;
  const result = await obligationsService.createObligation({
    token,
    partyId,
    userRole,
    userAgreementId,
    receiver,
    amount,
    currency,
    description,
    invoiceRef,
    agreementId,
  });
  return res.status(201).json({ success: true, data: result });
});

export const accept = asyncHandler(async (req: Request, res: Response) => {
  const { token, partyId } = req.user;
  const contractId = String(req.params.contractId);
  const result = await obligationsService.acceptObligation(contractId, token, partyId);
  if (isServiceError(result)) return sendServiceError(res, result);
  return res.json({ success: true, data: result.data });
});

export const reject = asyncHandler(async (req: Request, res: Response) => {
  const { token, partyId } = req.user;
  const contractId = String(req.params.contractId);
  const result = await obligationsService.rejectObligation(
    contractId,
    token,
    partyId,
    req.body.reason ?? "",
  );
  if (isServiceError(result)) return sendServiceError(res, result);
  return res.json({ success: true, data: result.data });
});
