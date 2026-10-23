import { createHash } from "node:crypto";

/** RFC 8785-style canonical JSON (sorted keys, no whitespace). Numbers must be safe integers or finite. */
export function canonicalize(v: unknown): string {
  if (v === null || typeof v === "boolean") return JSON.stringify(v);
  if (typeof v === "number") { if (!Number.isFinite(v)) throw new Error("non-finite number"); return JSON.stringify(v); }
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalize).join(",")}]`;
  if (typeof v === "object") {
    return `{${Object.keys(v as object).filter((k) => (v as any)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalize((v as any)[k])}`).join(",")}}`;
  }
  throw new Error(`cannot canonicalize ${typeof v}`);
}
export const sha256Hex = (s: string | Buffer) => "0x" + createHash("sha256").update(s).digest("hex");
