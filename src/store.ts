import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Receipt } from "./receipt.js";

export class ReceiptStore {
  constructor(private dir: string) { mkdirSync(dir, { recursive: true }); }
  save(r: Receipt) { writeFileSync(join(this.dir, `${r.receiptHash}.json`), JSON.stringify(r, null, 2)); return r.receiptHash; }
  get(hash: string): Receipt | null {
    if (!/^0x[0-9a-f]{64}$/.test(hash)) return null;
    const p = join(this.dir, `${hash}.json`);
    return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
  }
  findByTx(tx: string, logIndex?: number): Receipt | null {
    for (const f of readdirSync(this.dir)) {
      const r: Receipt = JSON.parse(readFileSync(join(this.dir, f), "utf8"));
      if (r.payment.txHash.toLowerCase() === tx.toLowerCase() && (logIndex == null || r.payment.logIndex === logIndex)) return r;
    }
    return null;
  }
  nextInvoiceNumber(prefix = "AR") {
    const n = readdirSync(this.dir).filter((f) => f.endsWith(".json")).length + 1;
    return `${prefix}-${new Date().getUTCFullYear()}-${String(n).padStart(6, "0")}`;
  }
}
