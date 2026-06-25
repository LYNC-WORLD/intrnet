import { Response } from "express";

export type ServiceError = { error: string; status: number };

export function isServiceError(result: unknown): result is ServiceError {
  return typeof result === "object" && result !== null && "error" in result && "status" in result;
}

export function sendServiceError(res: Response, result: ServiceError) {
  return res.status(result.status).json({ error: result.error });
}

export function toConflictError(err: unknown): ServiceError {
  if (err instanceof Error) return { error: err.message, status: 409 };
  return { error: "Ledger operation failed", status: 409 };
}
