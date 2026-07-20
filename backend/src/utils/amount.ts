import { Prisma } from "@prisma/client";

export function parsePositiveAmount(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

export function assertPositiveAmount(amount: number, label = "amount"): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
}

export function decimalAmount(amount: number): Prisma.Decimal {
  return new Prisma.Decimal(amount);
}

export function toNumber(value: Prisma.Decimal): number {
  return Number(value.toString());
}

export function formatRegistryTokenAmount(amount: number): string {
  assertPositiveAmount(amount);
  return decimalAmount(amount).toFixed(10);
}
