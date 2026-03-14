import { describe, expect, it } from "vitest";
import { normalizeLicenseKey, licenseKeyLast4, licenseKeyHash } from "../src/lib/license.js";

describe("license utils", () => {
  it("normalizes license keys", () => {
    expect(normalizeLicenseKey(" EI-abcd-efgh ")).toBe("EIABCDEFGH");
    expect(licenseKeyLast4("EI-ABCD-EFGH")).toBe("EFGH");
  });

  it("hashes deterministically", () => {
    const a = licenseKeyHash("ei-abcd-efgh");
    const b = licenseKeyHash("EIABCD EFGH");
    expect(a).toBe(b);
  });
});

