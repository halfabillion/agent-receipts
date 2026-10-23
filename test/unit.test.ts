import { describe, expect, it } from "vitest";
import { canonicalize, sha256Hex } from "../src/canonical.js";
import { taxTreatment } from "../src/tax.js";
import { hashReceipt, type Receipt } from "../src/receipt.js";
import { renderReceiptHtml } from "../src/render.js";
import { readFileSync } from "node:fs";

const example: Receipt = JSON.parse(readFileSync(new URL("../examples/receipt-ax1-base-mainnet.json", import.meta.url), "utf8"));

describe("canonical hashing", () => {
  it("is key-order independent and drops undefined", () => {
    expect(canonicalize({ b: 1, a: [true, null, "x"], c: undefined })).toBe('{"a":[true,null,"x"],"b":1}');
    expect(canonicalize({ a: 1, b: 2 })).toBe(canonicalize({ b: 2, a: 1 }));
  });
  it("rejects non-finite numbers", () => expect(() => canonicalize({ x: Infinity })).toThrow());
  it("sha256 matches a known vector", () => expect(sha256Hex("abc")).toBe("0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"));
  it("example receipt hash is stable and changes on any edit", () => {
    expect(hashReceipt(example)).toBe(example.receiptHash);
    const edited = structuredClone(example); edited.service.description += " ";
    expect(hashReceipt(edited)).not.toBe(example.receiptHash);
  });
});

describe("VAT treatment (indicative)", () => {
  const base = { sellerCountry: "GB", netUsd: 10 };
  it("unknown buyer location needs evidence", () => expect(taxTreatment(base).treatment).toBe("customer-location-evidence-required"));
  it("UK B2C is standard rated at 20%", () => { const t = taxTreatment({ ...base, buyerCountry: "GB" }); expect(t.vatRatePct).toBe(20); expect(t.vatUsd).toBe(2); });
  it("EU B2B is reverse charge", () => { const t = taxTreatment({ ...base, buyerCountry: "DE", buyerVatId: "DE123" }); expect(t.treatment).toMatch(/reverse-charge/); expect(t.vatUsd).toBeNull(); });
  it("EU B2C uses destination rate", () => { const t = taxTreatment({ ...base, buyerCountry: "IE" }); expect(t.vatRatePct).toBe(23); expect(t.treatment).toMatch(/OSS/); });
  it("non-UK seller to UK consumer", () => expect(taxTreatment({ sellerCountry: "US", buyerCountry: "GB", netUsd: 1 }).treatment).toMatch(/UK VAT due/));
  it("rest of world is outside seller VAT scope", () => expect(taxTreatment({ ...base, buyerCountry: "US" }).treatment).toMatch(/outside-scope/));
  it("always carries a disclaimer", () => expect(taxTreatment(base).disclaimer).toMatch(/not tax advice/));
});

describe("render", () => {
  it("escapes HTML in user-controlled fields", () => {
    const r = structuredClone(example); r.service.description = "<script>alert(1)</script>";
    const html = renderReceiptHtml(r);
    expect(html).not.toContain("<script>alert(1)"); expect(html).toContain("&lt;script&gt;");
    expect(html).toContain(example.payment.txHash);
  });
});
