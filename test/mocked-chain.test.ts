import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, pad } from "viem";

// Fake Base client: one USDC Transfer + a Chainlink feed with rounds 100 (in effect) and 101 (later).
const PAYER = "0x0c073E8266a02d734274fc51B3952c6ED63Eb964", PAYEE = "0x7284D41b5b852F2bd4c99bDf95043D84452d299C";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const TX = ("0x" + "ab".repeat(32)) as `0x${string}`;
const BLOCK_TS = 1_800_000_000n;
const rounds: Record<string, [bigint, bigint, bigint, bigint, bigint]> = {
  "100": [100n, 99_990_000n, BLOCK_TS - 600n, BLOCK_TS - 600n, 100n],
  "101": [101n, 100_010_000n, BLOCK_TS + 900n, BLOCK_TS + 900n, 101n],
};
let nextRoundAt = BLOCK_TS + 900n;
const fake = {
  getTransactionReceipt: vi.fn(async () => ({ status: "success", blockNumber: 123n, logs: [{
    address: USDC.toLowerCase(), logIndex: 7,
    topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", pad(PAYER.toLowerCase() as `0x${string}`), pad(PAYEE.toLowerCase() as `0x${string}`)],
    data: encodeAbiParameters([{ type: "uint256" }], [20_000n]) }] })),
  getBlock: vi.fn(async () => ({ timestamp: BLOCK_TS })),
  readContract: vi.fn(async ({ functionName, args }: any) => {
    if (functionName === "decimals") return 8;
    if (functionName === "description") return "USDC / USD";
    if (functionName === "latestRoundData") return rounds["100"];
    if (functionName === "getRoundData") {
      const r = rounds[String(args[0])]; if (!r) throw new Error("No data present");
      return String(args[0]) === "101" ? [r[0], r[1], nextRoundAt, nextRoundAt, r[4]] : r;
    }
    throw new Error(functionName);
  }),
};
vi.mock("../src/chain.js", async (orig) => ({ ...(await orig<any>()), client: () => fake }));
const { buildReceipt, verifyReceipt, hashReceipt } = await import("../src/receipt.js");
const seller = { legalName: "Seller Ltd", address: PAYEE as `0x${string}`, jurisdiction: "GB", termsUrl: "https://x/terms", termsSha256: "0x00" };
const build = () => buildReceipt({ network: "eip155:8453", txHash: TX, seller, service: { resource: "https://api/x", description: "d" }, invoiceNumber: "AR-1" }, new Date("2027-01-15T00:00:00Z"));

describe("receipt build/verify (mocked chain)", () => {
  beforeEach(() => { nextRoundAt = BLOCK_TS + 900n; });
  it("builds a receipt from the on-chain transfer and Chainlink round", async () => {
    const r = await build();
    expect(r.payment).toMatchObject({ amount: "0.02", amountAtomic: "20000", logIndex: 7, blockNumber: "123" });
    expect(r.buyer.address).toBe(PAYER);
    expect(r.valuation).toMatchObject({ roundId: "100", usdPerUnit: "0.9999", usdValue: "0.019998" });
    expect(r.receiptHash).toBe(hashReceipt(r));
  });
  it("verifies a genuine receipt", async () => { const v = await verifyReceipt(await build()); expect(v.valid).toBe(true); });
  it("rejects edited amount even if attacker recomputes the hash", async () => {
    const r = await build(); r.payment.amountAtomic = "2000000"; r.receiptHash = hashReceipt(r);
    const v = await verifyReceipt(r); expect(v.valid).toBe(false); expect(v.checks.find((c) => c.name === "amount")!.ok).toBe(false);
  });
  it("rejects a cherry-picked oracle round (a newer round was live at settlement)", async () => {
    const r = await build(); nextRoundAt = BLOCK_TS - 60n;
    const v = await verifyReceipt(r); expect(v.checks.find((c) => c.name === "oracle_round")!.ok).toBe(false);
  });
  it("rejects a receipt issued to the wrong payee", async () => {
    await expect(buildReceipt({ network: "eip155:8453", txHash: TX, seller: { ...seller, address: "0x000000000000000000000000000000000000dEaD" }, service: { resource: "r", description: "d" }, invoiceNumber: "X" })).rejects.toThrow();
  });
  it("flags changed terms", async () => {
    const v = await verifyReceipt(await build(), { fetchTerms: async () => "new terms" });
    expect(v.checks.find((c) => c.name === "terms_hash")!.ok).toBe(false);
  });
});
