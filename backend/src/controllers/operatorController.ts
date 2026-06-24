import { Request, Response } from "express";
import * as operatorService from "../services/operatorService";
import { asyncHandler } from "../utils/asyncHandler";
import { isServiceError, sendServiceError } from "../utils/http";

export const fundAccount = asyncHandler(async (req: Request, res: Response) => {
  const { owner, currency, amount } = req.body as {
    owner: string;
    currency: string;
    amount: number;
  };
  const result = await operatorService.fundAccount(owner, currency, Number(amount));
  if (isServiceError(result)) return sendServiceError(res, result);
  return res.json({ success: true, data: result.data });
});
