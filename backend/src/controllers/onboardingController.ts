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
  } = req.body as {
    email?: string;
    companyName?: string;
    contactName?: string;
    phone?: string;
    country?: string;
    partyHint?: string;
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
  });
  return res.json({ success: true, data: request });
});
