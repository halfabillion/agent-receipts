#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import type { Hex } from "viem";
import { buildReceipt, verifyReceipt, type Receipt } from "./receipt.js";
import { TERMS_SHA256, TERMS_TEXT } from "./config.js";
import type { NetworkId } from "./chain.js";

const DEMO = { network: "eip155:8453" as NetworkId, tx: "0x91575d9f4f8db027ec0f3f307d80433827b9b8aaef2c7287a26db397c388e47b" as Hex,
  payTo: "0x7284D41b5b852F2bd4c99bDf95043D84452d299C" as const };
const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const print = (v: Awaited<ReturnType<typeof verifyReceipt>>) => {
  for (const c of v.checks) console.log(`  ${c.ok ? "✔" : "✘"} ${c.name.padEnd(13)} ${c.detail}`);
  console.log(v.valid ? "  => VALID" : "  => INVALID");
};

async function main() {
  const [cmd, file] = process.argv.slice(2);
  if (cmd === "issue" || cmd === "demo") {
    const r = await buildReceipt({
      network: (arg("network") as NetworkId) || DEMO.network, txHash: (arg("tx") as Hex) || DEMO.tx, invoiceNumber: arg("invoice") || "AR-DEMO-000001",
      seller: { legalName: arg("seller") || "AX1 demo seller (illustrative)", address: (arg("payto") as `0x${string}`) || DEMO.payTo, jurisdiction: arg("country") || "GB",
        termsUrl: "http://localhost:8787/terms/v1.txt", termsSha256: TERMS_SHA256 },
      service: { resource: arg("resource") || "https://ax1.vc/api/x402", description: arg("desc") || "Pay-per-call data API request" },
      buyer: arg("buyer-country") ? { country: arg("buyer-country") } : undefined,
    });
    const out = arg("out") || "receipt.json"; writeFileSync(out, JSON.stringify(r, null, 2));
    console.log(`Issued ${r.invoiceNumber}: ${r.payment.amount} USDC ($${r.valuation.usdValue} @ Chainlink ${r.valuation.usdPerUnit}) ${r.buyer.address} -> ${r.seller.address}`);
    console.log(`receiptHash ${r.receiptHash}  -> ${out}`);
    if (cmd === "demo") {
      console.log("\nVerify (independent, against Base + Chainlink):");
      print(await verifyReceipt(r, { fetchTerms: async () => TERMS_TEXT }));
      const forged: Receipt = JSON.parse(JSON.stringify(r)); forged.payment.amount = "200.00"; forged.payment.amountAtomic = "200000000";
      console.log("\nForged copy (amount edited to 200 USDC):"); print(await verifyReceipt(forged));
      const rehashed: Receipt = JSON.parse(JSON.stringify(forged));
      const { hashReceipt } = await import("./receipt.js"); rehashed.receiptHash = hashReceipt(rehashed);
      console.log("\nForged copy with recomputed hash (attacker re-hashes):"); print(await verifyReceipt(rehashed));
    }
  } else if (cmd === "verify" && file) {
    const v = await verifyReceipt(JSON.parse(readFileSync(file, "utf8"))); print(v); process.exit(v.valid ? 0 : 1);
  } else {
    console.log("usage: agent-receipts demo | issue --tx 0x.. --payto 0x.. [--network eip155:8453] [--out receipt.json] | verify receipt.json");
    process.exit(2);
  }
}
main().catch((e) => { console.error(e.shortMessage || e.message); process.exit(1); });
