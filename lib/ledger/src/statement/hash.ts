import { createHash } from "node:crypto";

/** Serializes a value with sorted object keys so the hash is stable. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortValue((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hashStatement(body: unknown): string {
  return sha256Hex(canonicalJson(body));
}

export const MEMO_PREFIX = "clearbook:v1:";

export function memoForHash(hash: string): string {
  return `${MEMO_PREFIX}${hash}`;
}
