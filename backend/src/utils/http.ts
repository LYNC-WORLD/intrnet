import { AxiosError } from "axios";
import { Response } from "express";

export type ServiceError = { error: string; status: number };

export function isServiceError(result: unknown): result is ServiceError {
  return typeof result === "object" && result !== null && "error" in result && "status" in result;
}

export function sendServiceError(res: Response, result: ServiceError) {
  return res.status(result.status).json({ error: result.error });
}

export function sendResult(res: Response, result: unknown, opts?: { status?: number }) {
  if (isServiceError(result)) return sendServiceError(res, result);
  if (result && typeof result === "object" && "data" in result) {
    return res.status(opts?.status ?? 200).json({
      success: true,
      data: (result as { data: unknown }).data,
    });
  }
  return res.status(opts?.status ?? 200).json({ success: true, data: result });
}

export function extractErrorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as Record<string, unknown> | string | undefined;
    if (typeof data === "string" && data.trim()) return data;
    if (data && typeof data === "object") {
      if (typeof data.cause === "string" && data.cause.trim()) return data.cause;
      if (typeof data.message === "string" && data.message.trim()) return data.message;
      if (typeof data.error === "string" && data.error.trim()) return data.error;
      if (data.cause && typeof data.cause === "object") {
        const cause = data.cause as Record<string, unknown>;
        if (typeof cause.message === "string" && cause.message.trim()) return cause.message;
      }
    }
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return "Ledger operation failed";
}

export function toConflictError(err: unknown): ServiceError {
  return { error: extractErrorMessage(err), status: 409 };
}
