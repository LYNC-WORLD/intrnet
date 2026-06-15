import { Request, Response } from "express";
import * as fxRatesService from "../services/fxRatesService";
import { asyncHandler } from "../utils/asyncHandler";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { fromCurrency, toCurrency } = req.query as Record<string, string>;
  const rates = await fxRatesService.listFxRates(fromCurrency, toCurrency);
  return res.json({ success: true, data: rates });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const { fromCurrency, toCurrency, rate, asOf } = req.body as {
    fromCurrency?: string;
    toCurrency?: string;
    rate?: number | string;
    asOf?: string;
  };
  if (!fromCurrency || !toCurrency || rate === undefined || rate === null) {
    return res.status(400).json({ error: "fromCurrency, toCurrency and rate are required" });
  }

  const created = await fxRatesService.createFxRate({ fromCurrency, toCurrency, rate, asOf });
  return res.status(201).json({ success: true, data: created });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const contractId = String(req.params.contractId);
  const { rate, asOf } = req.body as { rate?: number | string; asOf?: string };
  if (rate === undefined || rate === null) {
    return res.status(400).json({ error: "rate is required" });
  }

  const updated = await fxRatesService.updateFxRate(contractId, rate, asOf);
  return res.json({ success: true, data: updated });
});

export const refresh = asyncHandler(async (_req: Request, res: Response) => {
  await fxRatesService.refreshRates();
  return res.json({ success: true });
});
