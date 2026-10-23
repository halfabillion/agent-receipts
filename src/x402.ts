/**
 * Drop-in for x402 sellers: turn a facilitator SettleResponse into an AgentReceipt.
 *
 *   import { x402ResourceServer } from "@x402/express";
 *   server.onAfterSettle(async ({ result, requirements, paymentPayload }) => {   // @x402/core >= 2.28
 *     const r = await receiptFromSettlement(result, requirements, paymentPayload.resource, seller, nextInvoiceNo());
 *     store.save(r);   // and expose  GET /receipts/:hash
 *   });
 *
 * The 402 offer should also advertise the terms (extensions.terms = { url, sha256 }) so the paying agent
 * accepts a specific, hash-pinned version.
 */
import type { Hex } from "viem";
import { buildReceipt, type Receipt, type SellerProfile } from "./receipt.js";
import type { NetworkId } from "./chain.js";

export interface SettlementLike { success: boolean; transaction: string; network: string; payer?: string }
export interface RequirementsLike { payTo: string; amount?: string; network: string }

export async function receiptFromSettlement(
  settle: SettlementLike, req: RequirementsLike, resource: { url: string; description?: string } | undefined,
  seller: SellerProfile, invoiceNumber: string,
): Promise<Receipt> {
  if (!settle.success) throw new Error("settlement failed; no receipt");
  if (settle.network !== "eip155:8453" && settle.network !== "eip155:84532") throw new Error(`unsupported network ${settle.network}`);
  if (req.payTo.toLowerCase() !== seller.address.toLowerCase()) throw new Error("payTo does not match seller profile");
  return buildReceipt({ network: settle.network as NetworkId, txHash: settle.transaction as Hex, seller,
    service: { resource: resource?.url || "unspecified", description: resource?.description || resource?.url || "x402 resource" }, invoiceNumber });
}

/** Extension block to put in the 402 offer so the buyer agent sees exactly which terms it accepts. */
export const termsExtension = (url: string, sha256: string) => ({ terms: { url, sha256, version: "agent-terms-v1" } });
