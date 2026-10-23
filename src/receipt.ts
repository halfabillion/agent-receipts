/**
 * AgentReceipts: evidence-grade receipts for machine-to-machine stablecoin payments (x402 and plain USDC transfers).
 * A receipt binds: who paid whom, how much, for what service, under which terms (hash-pinned),
 * the on-chain settlement (tx + log index), and a Chainlink USD valuation read AT the settlement block.
 */
import { decodeEventLog, getAddress, parseAbi, type Hex } from "viem";
import { canonicalize, sha256Hex } from "./canonical.js";
import { AGGREGATOR_ABI, ERC20_TRANSFER_TOPIC, NETWORKS, client, type NetworkId } from "./chain.js";
import { taxTreatment, type TaxInput } from "./tax.js";

export const RECEIPT_VERSION = "agentreceipts/1";
const TRANSFER_ABI = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

export interface SellerProfile {
  legalName: string;
  address: `0x${string}`;           // receiving wallet
  jurisdiction: string;             // ISO 3166 e.g. "GB"
  registeredOffice?: string;
  companyNumber?: string;
  vatId?: string;
  termsUrl: string;
  termsSha256: string;              // hash of the exact terms text the buyer accepted
  contact?: string;
}

export interface BuildInput {
  network: NetworkId;
  txHash: Hex;
  seller: SellerProfile;
  service: { resource: string; description: string; method?: string; quantity?: number };
  invoiceNumber: string;
  buyer?: { agentId?: string; operator?: string; country?: string; businessCustomer?: boolean; vatId?: string };
  /** Pick a specific Transfer log when a tx contains several. */
  logIndex?: number;
}

export interface Receipt {
  version: string;
  invoiceNumber: string;
  issuedAt: string;
  seller: SellerProfile;
  buyer: { address: string; agentId?: string; operator?: string; country?: string; businessCustomer?: boolean; vatId?: string };
  service: BuildInput["service"];
  payment: { network: NetworkId; asset: string; assetSymbol: "USDC"; amountAtomic: string; amount: string; txHash: string; blockNumber: string; blockTimestamp: string; logIndex: number; explorerUrl: string };
  valuation: { oracle: "Chainlink Data Feeds"; feed: string; feedDescription: string; readAtBlock: string; roundId: string; answer: string; decimals: number; updatedAt: string; usdPerUnit: string; usdValue: string };
  tax: ReturnType<typeof taxTreatment>;
  receiptHash: string;
}

export function hashReceipt(r: Omit<Receipt, "receiptHash"> | Receipt): string {
  const { receiptHash: _ignored, ...body } = r as Receipt;
  return sha256Hex(canonicalize(body));
}

const fmtUnits = (v: bigint, d: number) => {
  const neg = v < 0n; const a = neg ? -v : v; const s = a.toString().padStart(d + 1, "0");
  const out = `${s.slice(0, s.length - d)}.${s.slice(s.length - d)}`.replace(/\.?0+$/, "");
  return (neg ? "-" : "") + (out || "0");
};

export async function findUsdcTransfer(network: NetworkId, txHash: Hex, payTo: string, logIndex?: number) {
  const n = NETWORKS[network];
  const rc = await client(network).getTransactionReceipt({ hash: txHash });
  if (rc.status !== "success") throw new Error("Transaction reverted");
  const logs = rc.logs.filter((l) => getAddress(l.address) === getAddress(n.usdc) && l.topics[0] === ERC20_TRANSFER_TOPIC);
  const decoded = logs.map((l) => ({ l, ev: decodeEventLog({ abi: TRANSFER_ABI, data: l.data, topics: l.topics as any }) }))
    .filter(({ ev }) => getAddress((ev.args as any).to) === getAddress(payTo));
  const pick = logIndex != null ? decoded.find(({ l }) => l.logIndex === logIndex) : decoded[0];
  if (!pick) throw new Error(`No USDC transfer to ${payTo} in ${txHash}`);
  const a = pick.ev.args as any;
  return { from: getAddress(a.from), to: getAddress(a.to), value: a.value as bigint, blockNumber: rc.blockNumber, logIndex: pick.l.logIndex! };
}

/** Chainlink round in effect at the settlement block (historical eth_call at that block). */
export async function chainlinkAt(network: NetworkId, blockNumber: bigint) {
  const feed = NETWORKS[network].usdcUsdFeed as `0x${string}`;
  const c = client(network);
  const [round, decimals, description] = await Promise.all([
    c.readContract({ address: feed, abi: AGGREGATOR_ABI, functionName: "latestRoundData", blockNumber }),
    c.readContract({ address: feed, abi: AGGREGATOR_ABI, functionName: "decimals" }),
    c.readContract({ address: feed, abi: AGGREGATOR_ABI, functionName: "description" }),
  ]);
  return { feed, description, decimals: Number(decimals), roundId: round[0], answer: round[1], updatedAt: round[3] };
}

/**
 * Prove a round was the one in effect at time T using only current state (no archive node):
 * round.updatedAt <= T, and the next round (if any) was published after T.
 */
export async function verifyRound(network: NetworkId, roundId: bigint, t: number) {
  const feed = NETWORKS[network].usdcUsdFeed as `0x${string}`;
  const c = client(network);
  const [round, decimals, description] = await Promise.all([
    c.readContract({ address: feed, abi: AGGREGATOR_ABI, functionName: "getRoundData", args: [roundId] }),
    c.readContract({ address: feed, abi: AGGREGATOR_ABI, functionName: "decimals" }),
    c.readContract({ address: feed, abi: AGGREGATOR_ABI, functionName: "description" }),
  ]);
  const updatedAt = Number(round[3]);
  let inEffect = updatedAt <= t;
  let reason = inEffect ? "" : "round was published after settlement";
  if (inEffect) {
    const next = await c.readContract({ address: feed, abi: AGGREGATOR_ABI, functionName: "getRoundData", args: [roundId + 1n] }).catch(() => null);
    if (next && Number(next[3]) > 0 && Number(next[3]) <= t) { inEffect = false; reason = `a newer round (${roundId + 1n}) was already live at settlement`; }
  }
  return { answer: round[1], decimals: Number(decimals), description, updatedAt, inEffect, reason };
}

export async function buildReceipt(input: BuildInput, now = new Date()): Promise<Receipt> {
  const n = NETWORKS[input.network];
  const t = await findUsdcTransfer(input.network, input.txHash, input.seller.address, input.logIndex);
  const [block, cl] = await Promise.all([client(input.network).getBlock({ blockNumber: t.blockNumber }), chainlinkAt(input.network, t.blockNumber)]);
  const usdAtomic = (t.value * cl.answer) / 10n ** BigInt(cl.decimals); // still 6 decimals (USDC)
  const taxIn: TaxInput = { sellerCountry: input.seller.jurisdiction, sellerVatId: input.seller.vatId, buyerCountry: input.buyer?.country, buyerBusiness: input.buyer?.businessCustomer, buyerVatId: input.buyer?.vatId, netUsd: Number(fmtUnits(usdAtomic, 6)) };
  const body: Omit<Receipt, "receiptHash"> = {
    version: RECEIPT_VERSION,
    invoiceNumber: input.invoiceNumber,
    issuedAt: now.toISOString(),
    seller: input.seller,
    buyer: { address: t.from, ...input.buyer },
    service: { method: "GET", quantity: 1, ...input.service },
    payment: {
      network: input.network, asset: getAddress(n.usdc), assetSymbol: "USDC", amountAtomic: t.value.toString(), amount: fmtUnits(t.value, 6),
      txHash: input.txHash, blockNumber: t.blockNumber.toString(), blockTimestamp: new Date(Number(block.timestamp) * 1000).toISOString(), logIndex: t.logIndex,
      explorerUrl: `${n.explorer}/tx/${input.txHash}`,
    },
    valuation: {
      oracle: "Chainlink Data Feeds", feed: getAddress(cl.feed), feedDescription: cl.description, readAtBlock: t.blockNumber.toString(), roundId: cl.roundId.toString(),
      answer: cl.answer.toString(), decimals: cl.decimals, updatedAt: new Date(Number(cl.updatedAt) * 1000).toISOString(),
      usdPerUnit: fmtUnits(cl.answer, cl.decimals), usdValue: fmtUnits(usdAtomic, 6),
    },
    tax: taxTreatment(taxIn),
  };
  return { ...body, receiptHash: hashReceipt(body) };
}

export interface Check { name: string; ok: boolean; detail: string }

/** Independent verification: anyone can re-run this with only a public RPC. */
export async function verifyReceipt(r: Receipt, opts: { fetchTerms?: (url: string) => Promise<string> } = {}): Promise<{ valid: boolean; checks: Check[] }> {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
  add("version", r.version === RECEIPT_VERSION, r.version);
  const h = hashReceipt(r);
  add("receipt_hash", h === r.receiptHash, h === r.receiptHash ? "content matches hash" : `recomputed ${h}`);
  try {
    const t = await findUsdcTransfer(r.payment.network, r.payment.txHash as Hex, r.seller.address, r.payment.logIndex);
    add("settlement_tx", true, `USDC Transfer found in block ${t.blockNumber}`);
    add("payer", t.from === getAddress(r.buyer.address), t.from);
    add("payee", t.to === getAddress(r.seller.address), t.to);
    add("amount", t.value.toString() === r.payment.amountAtomic, `${fmtUnits(t.value, 6)} USDC on-chain`);
    add("block", t.blockNumber.toString() === r.payment.blockNumber, t.blockNumber.toString());
    const cl = await verifyRound(r.payment.network, BigInt(r.valuation.roundId), Date.parse(r.payment.blockTimestamp) / 1000);
    add("oracle_round", cl.answer.toString() === r.valuation.answer && cl.inEffect,
      `Chainlink ${cl.description} round ${r.valuation.roundId} = ${fmtUnits(cl.answer, cl.decimals)}; ${cl.inEffect ? "was the latest round at settlement time" : cl.reason}`);
    const usd = fmtUnits((t.value * cl.answer) / 10n ** BigInt(cl.decimals), 6);
    add("usd_value", usd === r.valuation.usdValue, `$${usd}`);
  } catch (e: any) {
    add("settlement_tx", false, e.message);
  }
  if (opts.fetchTerms) {
    try {
      const txt = await opts.fetchTerms(r.seller.termsUrl);
      const th = sha256Hex(txt);
      add("terms_hash", th === r.seller.termsSha256, th === r.seller.termsSha256 ? "terms at URL unchanged" : "terms at URL have changed since payment (receipt keeps the accepted version's hash)");
    } catch (e: any) { add("terms_hash", false, `could not fetch terms: ${e.message}`); }
  }
  return { valid: checks.every((c) => c.ok), checks };
}
