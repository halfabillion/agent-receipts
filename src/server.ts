import express from "express";
import { readFileSync } from "node:fs";
import type { Hex } from "viem";
import { TERMS_SHA256, TERMS_TEXT, sellerFromEnv } from "./config.js";
import { buildReceipt, verifyReceipt, type Receipt, type SellerProfile } from "./receipt.js";
import { ReceiptStore } from "./store.js";
import { renderReceiptHtml } from "./render.js";

export function createServer(opts: { dataDir?: string; publicBaseUrl?: string } = {}) {
  const publicBaseUrl = (opts.publicBaseUrl || process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 8787}`).replace(/\/$/, "");
  const store = new ReceiptStore(opts.dataDir || process.env.DATA_DIR || new URL("../data/receipts", import.meta.url).pathname);
  const defaultSeller = sellerFromEnv(publicBaseUrl);
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "200kb" }));

  app.get("/", (_req, res) => res.type("html").send(readFileSync(new URL("../public/index.html", import.meta.url), "utf8")));
  app.get("/terms/v1.txt", (_req, res) => res.type("text/plain").send(TERMS_TEXT));
  app.get("/api/health", (_req, res) => res.json({ ok: true, termsSha256: TERMS_SHA256 }));
  app.get("/api/seller", (_req, res) => res.json(defaultSeller));

  app.post("/api/receipts", async (req, res) => {
    try {
      const b = req.body || {};
      if (!/^0x[0-9a-fA-F]{64}$/.test(b.txHash || "")) return res.status(400).json({ error: "txHash must be a 32-byte hex transaction hash" });
      const network = b.network || "eip155:8453";
      if (network !== "eip155:8453" && network !== "eip155:84532") return res.status(400).json({ error: "network must be eip155:8453 or eip155:84532" });
      const seller: SellerProfile = { ...defaultSeller, ...(b.seller || {}) };
      if (!/^0x[0-9a-fA-F]{40}$/.test(seller.address)) return res.status(400).json({ error: "seller.address must be an EVM address" });
      const existing = store.findByTx(b.txHash, b.logIndex);
      if (existing && existing.seller.address.toLowerCase() === seller.address.toLowerCase()) return res.json({ receipt: existing, url: `${publicBaseUrl}/r/${existing.receiptHash}`, existing: true });
      const r = await buildReceipt({ network, txHash: b.txHash as Hex, seller, logIndex: b.logIndex,
        service: { resource: b.service?.resource || "unspecified", description: b.service?.description || "Electronically supplied service", method: b.service?.method },
        invoiceNumber: b.invoiceNumber || store.nextInvoiceNumber(), buyer: b.buyer });
      store.save(r);
      res.status(201).json({ receipt: r, url: `${publicBaseUrl}/r/${r.receiptHash}` });
    } catch (e: any) {
      res.status(422).json({ error: e.shortMessage || e.message });
    }
  });
  app.get("/api/receipts/:hash", (req, res) => {
    const r = store.get(req.params.hash);
    return r ? res.json(r) : res.status(404).json({ error: "not_found" });
  });
  app.get("/r/:hash", (req, res) => {
    const r = store.get(req.params.hash);
    return r ? res.type("html").send(renderReceiptHtml(r)) : res.status(404).send("Receipt not found");
  });
  app.post("/api/verify", async (req, res) => {
    const r = req.body as Receipt;
    if (!r || typeof r !== "object" || !r.payment || !r.valuation) return res.status(400).json({ error: "body must be an AgentReceipt JSON" });
    try {
      // Only check terms we host ourselves: never fetch arbitrary user-supplied URLs server-side (SSRF).
      const ours = typeof r.seller?.termsUrl === "string" && r.seller.termsUrl.startsWith(publicBaseUrl + "/terms/");
      const out = await verifyReceipt(r, ours ? { fetchTerms: async () => TERMS_TEXT } : {});
      res.json(out);
    } catch (e: any) { res.status(422).json({ error: e.message }); }
  });
  return app;
}

if (process.argv[1]?.match(/server\.(ts|js)$/)) {
  const port = Number(process.env.PORT || 8787);
  createServer().listen(port, () => console.log(`[agent-receipts] http://localhost:${port}`));
}
