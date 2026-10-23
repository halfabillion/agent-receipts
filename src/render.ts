import type { Receipt } from "./receipt.js";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function renderReceiptHtml(r: Receipt): string {
  const row = (k: string, v: unknown) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Receipt ${esc(r.invoiceNumber)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:820px;margin:32px auto;padding:0 16px;color:#111}h1{font-size:22px;margin:0}
.muted{color:#666}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top}
th{width:34%;color:#444;font-weight:600}code{word-break:break-all}.hash{font-family:ui-monospace,monospace;font-size:12px;background:#f5f5f5;padding:8px;border-radius:6px;word-break:break-all}
@media print{a{color:#000}}</style></head><body>
<h1>Receipt ${esc(r.invoiceNumber)}</h1><p class="muted">Issued ${esc(r.issuedAt)} · ${esc(r.version)}</p>
<h3>Seller</h3><table>${row("Legal name", r.seller.legalName)}${row("Jurisdiction", r.seller.jurisdiction)}${r.seller.companyNumber ? row("Company no.", r.seller.companyNumber) : ""}${r.seller.vatId ? row("VAT ID", r.seller.vatId) : ""}${row("Receiving wallet", r.seller.address)}${row("Terms", `${r.seller.termsUrl} (sha256 ${r.seller.termsSha256})`)}</table>
<h3>Buyer</h3><table>${row("Paying wallet", r.buyer.address)}${r.buyer.agentId ? row("Agent ID", r.buyer.agentId) : ""}${r.buyer.country ? row("Country", r.buyer.country) : ""}</table>
<h3>Service</h3><table>${row("Resource", r.service.resource)}${row("Description", r.service.description)}${row("Quantity", r.service.quantity)}</table>
<h3>Payment</h3><table>${row("Amount", `${r.payment.amount} USDC`)}${row("USD value", `$${r.valuation.usdValue} (Chainlink ${r.valuation.feedDescription} ${r.valuation.usdPerUnit}, round ${r.valuation.roundId}, updated ${r.valuation.updatedAt})`)}
${row("Network", r.payment.network)}${row("Settled", `${r.payment.blockTimestamp} · block ${r.payment.blockNumber}`)}<tr><th>Transaction</th><td><a href="${esc(r.payment.explorerUrl)}"><code>${esc(r.payment.txHash)}</code></a> (log ${r.payment.logIndex})</td></tr></table>
<h3>Tax (indicative)</h3><table>${row("Supply", r.tax.supplyType)}${row("Place of supply", r.tax.placeOfSupply)}${row("Treatment", r.tax.treatment)}${r.tax.vatRatePct != null ? row("VAT rate", r.tax.vatRatePct + "%") : ""}${r.tax.notes.map((n) => row("Note", n)).join("")}${row("Disclaimer", r.tax.disclaimer)}</table>
<h3>Receipt hash</h3><div class="hash">${esc(r.receiptHash)}</div>
<p class="muted">Verify independently: POST this receipt's JSON to /api/verify, or run <code>npx agent-receipts verify receipt.json</code>. The hash is SHA-256 over the canonical JSON of every field above.</p>
</body></html>`;
}
