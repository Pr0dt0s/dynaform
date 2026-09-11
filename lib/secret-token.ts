import crypto from "node:crypto";

// Capability-URL tokens (the `?s=` query param), unrelated to the E2E encryption keys.
export function generateSecret(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("base64url");
}

export function verifySecret(secret: string, hash: string): boolean {
  const candidate = Buffer.from(hashSecret(secret));
  const expected = Buffer.from(hash);
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

export function generateId(): string {
  return crypto.randomUUID();
}
