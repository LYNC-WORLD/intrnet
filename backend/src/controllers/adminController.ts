import { Request, Response } from "express";
import * as adminService from "../services/adminService";
import { asyncHandler } from "../utils/asyncHandler";

export const createCompany = asyncHandler(async (req: Request, res: Response) => {
  const { companyName, email, partyHint, agreementContractId, initialPassword } = req.body as {
    companyName?: string;
    email?: string;
    partyHint?: string;
    agreementContractId?: string;
    initialPassword?: string;
  };

  if (!companyName || !email || !agreementContractId) {
    return res
      .status(400)
      .json({ error: "companyName, email and agreementContractId are required" });
  }

  const result = await adminService.createCompany({
    companyName,
    email,
    partyHint: partyHint ?? companyName,
    agreementContractId,
    initialPassword,
  });

  return res.status(201).json({ success: true, data: result });
});

export const listCompanies = asyncHandler(async (_req: Request, res: Response) => {
  const companies = await adminService.listCompanies();
  return res.json({ success: true, data: companies });
});

export const listParties = asyncHandler(async (_req: Request, res: Response) => {
  const parties = await adminService.listParties();
  return res.json({ success: true, data: parties });
});
