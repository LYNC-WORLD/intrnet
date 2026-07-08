import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as onboardingService from "../services/onboardingService";

export const submitMyRequest = asyncHandler(async (req: Request, res: Response) => {
  const {
    email,
    companyName,
    contactName,
    phone,
    country,
    partyHint,
    referenceEmail,
  } = req.body as {
    email?: string;
    companyName?: string;
    contactName?: string;
    phone?: string;
    country?: string;
    partyHint?: string;
    referenceEmail: string;
  };

  if (!email) return res.status(400).json({ error: "email is required" });
  if (!companyName) return res.status(400).json({ error: "companyName is required" });

  const request = await onboardingService.submitOnboardingRequest(req.user.userId, {
    email,
    companyName,
    contactName,
    phone,
    country,
    partyHint,
    referenceEmail,
  });
  return res.json({ success: true, data: request });
});

export const verityEmail = asyncHandler(async (req: Request, res: Response) => {
  const {
    email,
  } = req.body as {
    email?: string;
  };

  if (!email) return res.status(400).json({ error: "email is required" });

  const request = await onboardingService.verifyOnboardEmail(email);
  
  return res.json({ success: true, data: request });
});
