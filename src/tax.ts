/**
 * Indicative VAT treatment for cross-border B2B/B2C electronically supplied services (ESS).
 * Informational only — not tax advice. Encodes the general place-of-supply rules (UK VATA 1994 s7A / EU VAT Directive art. 44 & 58).
 */
const EU = new Set(["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE"]);
const RATES: Record<string, number> = { GB: 20, DE: 19, FR: 20, IE: 23, NL: 21, ES: 21, IT: 22 };

export interface TaxInput { sellerCountry: string; sellerVatId?: string; buyerCountry?: string; buyerBusiness?: boolean; buyerVatId?: string; netUsd: number }

export function taxTreatment(t: TaxInput) {
  const s = t.sellerCountry.toUpperCase();
  const b = t.buyerCountry?.toUpperCase();
  const evidence: string[] = [];
  if (!b) {
    return { supplyType: "electronically supplied service", placeOfSupply: "undetermined", treatment: "customer-location-evidence-required",
      vatRatePct: null, vatUsd: null, notes: ["Buyer is identified only by a wallet address; collect two non-contradictory pieces of location evidence (or a business VAT ID) before finalising VAT treatment."], disclaimer: "Indicative only; not tax advice." };
  }
  const business = !!(t.buyerBusiness || t.buyerVatId);
  if (business) evidence.push(t.buyerVatId ? `buyer VAT ID ${t.buyerVatId}` : "buyer declared business customer");
  let placeOfSupply = b;
  let treatment: string;
  let rate: number | null = null;
  if (business) {
    treatment = b === s ? "domestic-standard-rated" : "reverse-charge (customer accounts for VAT)";
    if (b === s) rate = RATES[s] ?? null;
  } else {
    if (s === "GB" && b === "GB") { treatment = "domestic-standard-rated"; rate = 20; }
    else if (EU.has(b)) { treatment = s === b ? "domestic-standard-rated" : "destination-VAT (EU OSS/IOSS) unless seller is under EU €10k threshold"; rate = RATES[b] ?? null; }
    else if (b === "GB") { treatment = "UK VAT due from first £ for non-established sellers of digital services to UK consumers"; rate = 20; }
    else { treatment = "outside-scope-of-seller-VAT (check buyer-country digital services tax rules)"; }
  }
  if (!t.sellerVatId && (treatment.startsWith("domestic") || treatment.startsWith("UK VAT"))) evidence.push("seller has no VAT ID on file: confirm registration threshold");
  return {
    supplyType: "electronically supplied service", placeOfSupply, treatment,
    vatRatePct: rate, vatUsd: rate != null && !treatment.startsWith("reverse") ? +(t.netUsd * rate / 100).toFixed(6) : null,
    notes: evidence, disclaimer: "Indicative only; not tax advice.",
  };
}
