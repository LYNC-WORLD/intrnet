import crypto from "crypto";

export function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function generateTemporaryPassword() {
  return `Nc!${crypto.randomBytes(6).toString("base64url")}`;
}
