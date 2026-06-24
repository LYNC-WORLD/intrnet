import { Request, Response } from "express";
import * as authService from "../services/authService";
import { asyncHandler } from "../utils/asyncHandler";
import { isServiceError, sendServiceError } from "../utils/http";

export const oauthLogin = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body as { token?: string };
  if (!token) {
    return res.status(400).json({ error: "token is required" });
  }

  const result = await authService.oauthLogin(token);
  if (isServiceError(result)) return sendServiceError(res, result);
  return res.json({ success: true, data: result.data });
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.getMe(req.user.userId);
  if (isServiceError(result)) return sendServiceError(res, result);
  return res.json({ success: true, data: result.data });
});
