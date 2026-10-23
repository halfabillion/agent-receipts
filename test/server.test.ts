import { describe, expect, it } from "vitest";
import request from "supertest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../src/server.js";
import { TERMS_SHA256 } from "../src/config.js";

const app = createServer({ dataDir: mkdtempSync(join(tmpdir(), "ar-")), publicBaseUrl: "http://test.local" });
const LIVE = process.env.LIVE === "1";

describe("HTTP API", () => {
  it("serves UI, health and hash-pinned terms", async () => {
    expect((await request(app).get("/")).text).toContain("AgentReceipts");
    expect((await request(app).get("/api/health")).body.termsSha256).toBe(TERMS_SHA256);
    expect((await request(app).get("/terms/v1.txt")).text).toContain("MACHINE-READABLE TERMS");
  });
  it("validates input", async () => {
    expect((await request(app).post("/api/receipts").send({ txHash: "nope" })).status).toBe(400);
    expect((await request(app).post("/api/receipts").send({ txHash: "0x" + "1".repeat(64), network: "eip155:1" })).status).toBe(400);
    expect((await request(app).post("/api/verify").send({})).status).toBe(400);
    expect((await request(app).get("/api/receipts/../../etc/passwd")).status).toBe(404);
    expect((await request(app).get("/r/0x" + "0".repeat(64))).status).toBe(404);
  });
  it.skipIf(!LIVE)("issues and verifies a real Base mainnet x402 receipt", async () => {
    const res = await request(app).post("/api/receipts").send({ txHash: "0x91575d9f4f8db027ec0f3f307d80433827b9b8aaef2c7287a26db397c388e47b",
      seller: { legalName: "Demo", address: "0x7284D41b5b852F2bd4c99bDf95043D84452d299C", jurisdiction: "GB" }, service: { resource: "https://ax1.vc", description: "API call" } });
    expect(res.status).toBe(201);
    const v = await request(app).post("/api/verify").send(res.body.receipt);
    expect(v.body.valid).toBe(true);
    expect(v.body.checks.map((c: any) => c.name)).toContain("terms_hash");
    expect((await request(app).get(`/r/${res.body.receipt.receiptHash}`)).text).toContain("0.02 USDC");
  }, 60000);
});
