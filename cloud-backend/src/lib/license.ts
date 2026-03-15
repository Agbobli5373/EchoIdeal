import { sha256Hex } from "./crypto.js";

export function normalizeLicenseKey(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function licenseKeyHash(input: string): string {
  return sha256Hex(normalizeLicenseKey(input));
}

export function licenseKeyLast4(input: string): string {
  const norm = normalizeLicenseKey(input);
  return norm.slice(-4);
}

