import { readFileSync, existsSync } from "node:fs";
import { sha256Hex } from "./canonical.js";
import type { SellerProfile } from "./receipt.js";

export const TERMS_PATH = new URL("../terms/agent-terms-v1.txt", import.meta.url);
export const TERMS_TEXT = readFileSync(TERMS_PATH, "utf8");
export const TERMS_SHA256 = sha256Hex(TERMS_TEXT);

export function sellerFromEnv(publicBaseUrl: string): SellerProfile {
  const file = process.env.SELLER_PROFILE || new URL("../seller.json", import.meta.url).pathname;
  const base: Partial<SellerProfile> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  return {
    legalName: base.legalName || process.env.SELLER_NAME || "Demo Seller Ltd",
    address: (base.address || process.env.PAYOUT_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`,
    jurisdiction: base.jurisdiction || process.env.SELLER_COUNTRY || "GB",
    companyNumber: base.companyNumber, vatId: base.vatId, registeredOffice: base.registeredOffice, contact: base.contact,
    termsUrl: base.termsUrl || `${publicBaseUrl}/terms/v1.txt`,
    termsSha256: base.termsSha256 || TERMS_SHA256,
  };
}
