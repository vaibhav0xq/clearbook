import { UpstreamStatusError, upstream } from "./errors";

export interface FetchJsonOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

export { UpstreamStatusError };

/** Small fetch wrapper with a timeout and JSON handling. Throws UpstreamStatusError on non 2xx. */
export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000);
  try {
    const res = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(options.headers ?? {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new UpstreamStatusError(url, res.status, text.slice(0, 500));
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof UpstreamStatusError) throw err;
    const reason = err instanceof Error ? err.message : String(err);
    throw upstream(`Request to ${new URL(url).host} failed: ${reason}`);
  } finally {
    clearTimeout(timer);
  }
}

export function explorerTxUrl(signature: string, cluster: string): string {
  const suffix = cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`;
  return `https://solscan.io/tx/${signature}${suffix}`;
}

export function explorerAccountUrl(address: string, cluster: string): string {
  const suffix = cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`;
  return `https://solscan.io/account/${address}${suffix}`;
}

export function shortAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
