import { randomBytes } from "crypto";

function randomSlugSuffix(length = 5): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i]! % alphabet.length]!;
  }
  return out;
}

export function slugify(input: string) {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 34);
  const suffix = randomSlugSuffix(5);
  return base ? `${base}-${suffix}` : suffix;
}
