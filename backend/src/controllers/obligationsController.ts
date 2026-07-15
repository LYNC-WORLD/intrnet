import { Request, Response } from "express";
import * as obligationsService from "../services/obligationsService";
import { asyncHandler } from "../utils/asyncHandler";
import { sendResult } from "../utils/http";
import { parsePagination } from "../utils/pagination";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { partyId, role: userRole, agreementId: userAgreementId } = req.user;
  const {
    status,
    role,
    currency,
    agreementId,
    cycleId,
    page,
    limit,
  } = req.query as Record<string, string>;

  const result = await obligationsService.listObligations({
    partyId,
    userRole,
    userAgreementId,
    agreementId,
    status,
    role,
    currency,
    cycleId,
    ...parsePagination({ page, limit }),
  });

  return sendResult(res, result);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const { partyId, role } = req.user;
  const contractId = String(req.params.contractId);
  const result = await obligationsService.getObligationSvc(contractId, partyId, role);
  return sendResult(res, result);
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
  return sendResult(res, result, { status: 201 });
});

export const accept = asyncHandler(async (req: Request, res: Response) => {
  const { token, partyId } = req.user;
  const contractId = String(req.params.contractId);
  const result = await obligationsService.acceptObligation(contractId, token, partyId);
  return sendResult(res, result);
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
  return sendResult(res, result);
});
