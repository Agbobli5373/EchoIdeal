import crypto from "node:crypto";

export function timingSafeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

export function randomLicenseKey(): string {
  // Human-friendly, easy to paste.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(20);
  let out = "EI-";
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] ?? 0;
    const idx = byte % alphabet.length;
    out += alphabet[idx] ?? "X";
    if ((i + 1) % 4 === 0 && i !== bytes.length - 1) out += "-";
  }
  return out;
}
