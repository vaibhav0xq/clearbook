import { env } from "../lib/env";
import { upstream } from "../lib/errors";
import { UpstreamStatusError } from "../lib/http";

/**
 * Thin JSON-RPC client for Solana. Uses fetch directly so that it works with
 * any provider (Helius, Triton, public endpoint) and keeps request shapes
 * explicit. Batch requests are used for transaction fetches.
 */

interface RpcResponse<T> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

export interface SignatureInfo {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: unknown;
}

export interface ParsedTokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  programId?: string;
  uiTokenAmount: { amount: string; decimals: number; uiAmount: number | null; uiAmountString: string };
}

export interface ParsedTransaction {
  slot: number;
  blockTime: number | null;
  meta: {
    err: unknown;
    fee: number;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: ParsedTokenBalance[];
    postTokenBalances?: ParsedTokenBalance[];
    logMessages?: string[];
    innerInstructions?: unknown[];
  } | null;
  transaction: {
    signatures: string[];
    message: {
      accountKeys: Array<{ pubkey: string; signer: boolean; writable: boolean; source?: string }>;
      instructions: Array<{ programId: string; program?: string; parsed?: unknown; accounts?: string[]; data?: string }>;
    };
  };
}

export interface TokenAccount {
  pubkey: string;
  mint: string;
  owner: string;
  amount: string;
  decimals: number;
  programId: string;
}

export interface MintMultiplierState {
  mint: string;
  decimals: number;
  multiplier: number | null;
  newMultiplier: number | null;
  newMultiplierEffectiveAt: Date | null;
}

let idCounter = 1;

export interface BatchRow<T> {
  result: T | null;
  error: string | null;
  rateLimited: boolean;
}

export /** Mainnet now carries version 1 transactions. Asking for version 0 only makes getTransaction fail with -32015. */
const MAX_TX_VERSION = 1;

/**
 * The public endpoint counts calls of one method per ten second window and a batch counts each
 * row. The window is shared by everyone behind the same address, so the usable rate varies.
 */
const PUBLIC_BATCH_SPACING_MS = 3_200;
const PUBLIC_WINDOW_MS = 10_000;
const MAX_RETRY_AFTER_MS = 15_000;

/** Pause the endpoint asked for after a 429 response, when it named one. */
function retryAfterMs(res: Response): number | null {
  const seconds = Number(res.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS) : null;
}

export interface TransactionRead {
  /** One entry per requested signature. Null when the endpoint has no such transaction or could not deliver it. */
  transactions: Array<ParsedTransaction | null>;
  /** Signatures the endpoint failed to deliver after retries. */
  unreadable: number;
  /** How many signatures were attempted before the deadline stopped the read. */
  attempted: number;
}

/**
 * Thrown when a request could not start, or a rate limit pause could not be waited out, before
 * the caller's deadline. Readers treat it as a cut, not as a failed endpoint.
 */
export class RpcDeadline extends Error {
  constructor() {
    super("The RPC did not answer within the time budget.");
  }
}

class RpcClient {
  private lastBatchAt = 0;

  constructor(private readonly url: string = env.rpcUrl) {}

  get endpoint(): string {
    return this.url;
  }

  async call<T>(method: string, params: unknown[], deadline = Number.POSITIVE_INFINITY): Promise<T> {
    const body = { jsonrpc: "2.0", id: idCounter++, method, params };
    const res = await this.post(body, deadline);
    const json = (await res.json()) as RpcResponse<T>;
    if (json.error) throw upstream(`RPC ${method} failed: ${json.error.message}`, { code: json.error.code });
    return json.result as T;
  }

  /**
   * One answer per request. The public endpoint rate limits single rows of a batch with a 429
   * error while the rest of the batch succeeds, so the row level outcome is returned rather than
   * folded into null.
   */
  async batch<T>(method: string, paramsList: unknown[][], deadline = Number.POSITIVE_INFINITY): Promise<Array<BatchRow<T>>> {
    if (paramsList.length === 0) return [];
    const body = paramsList.map((params) => ({ jsonrpc: "2.0", id: idCounter++, method, params }));
    const res = await this.post(body, deadline);
    const json = (await res.json()) as RpcResponse<T>[] | RpcResponse<T>;
    if (!Array.isArray(json)) {
      if (json.error) throw upstream(`RPC batch ${method} failed: ${json.error.message}`, { code: json.error.code });
      return [{ result: json.result ?? null, error: null, rateLimited: false }];
    }
    const byId = new Map(json.map((r) => [r.id, r]));
    return body.map((req) => {
      const r = byId.get(req.id);
      if (!r) return { result: null, error: "The batch response has no row for this request.", rateLimited: false };
      if (r.error) return { result: null, error: r.error.message, rateLimited: r.error.code === 429 };
      return { result: r.result ?? null, error: null, rateLimited: false };
    });
  }

  /**
   * Public endpoints answer 429 quickly under light load, so retry a few times with a growing
   * pause before giving up. No attempt starts and no pause is taken past the deadline, so a caller
   * with a time budget gets control back at the budget and not one retry window later.
   */
  private async post(body: unknown, deadline = Number.POSITIVE_INFINITY): Promise<Response> {
    const attempts = env.rpcConfigured ? 2 : 5;
    let retryAfter: number | null = null;
    for (let attempt = 1; ; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new RpcDeadline();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(15_000, remaining));
      try {
        const res = await fetch(this.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          retryAfter = retryAfterMs(res);
          throw new UpstreamStatusError(this.url, res.status, text.slice(0, 300));
        }
        return res;
      } catch (err) {
        if (err instanceof UpstreamStatusError) {
          if (err.status === 401 || err.status === 403) throw upstream("RPC rejected the request. Check SOLANA_RPC_URL or HELIUS_API_KEY.");
          if (err.status === 429) {
            if (attempt < attempts) {
              const pause = retryAfter ?? 1_500 * attempt;
              if (Date.now() + pause >= deadline) throw new RpcDeadline();
              await sleep(pause);
              continue;
            }
            throw upstream("RPC rate limit reached. Configure a dedicated RPC to index wallets reliably.");
          }
          throw upstream(`RPC returned ${err.status}.`);
        }
        if (controller.signal.aborted && Date.now() >= deadline) throw new RpcDeadline();
        const reason = err instanceof Error ? err.message : String(err);
        throw upstream(`RPC request failed: ${reason}`);
      } finally {
        clearTimeout(timer);
      }
    }
  }

  async getTokenAccountsByOwner(owner: string, deadline = Number.POSITIVE_INFINITY): Promise<TokenAccount[]> {
    const programs = ["TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"];
    const results = await mapSequential(programs, (programId) =>
        this.call<{ value: Array<{ pubkey: string; account: { data: { parsed: { info: { mint: string; owner: string; tokenAmount: { amount: string; decimals: number } } } } } }> }>(
          "getTokenAccountsByOwner",
          [owner, { programId }, { encoding: "jsonParsed", commitment: "confirmed" }],
          deadline,
        ).then((r) => r.value.map((v) => ({
          pubkey: v.pubkey,
          mint: v.account.data.parsed.info.mint,
          owner: v.account.data.parsed.info.owner,
          amount: v.account.data.parsed.info.tokenAmount.amount,
          decimals: v.account.data.parsed.info.tokenAmount.decimals,
          programId,
        })),
      ),
    );
    return results.flat();
  }

  async getSignaturesForAddress(address: string, limit: number, before?: string, deadline = Number.POSITIVE_INFINITY): Promise<SignatureInfo[]> {
    return this.call<SignatureInfo[]>("getSignaturesForAddress", [
      address,
      { limit, before, commitment: "confirmed" },
    ], deadline);
  }

  /**
   * Reads transactions in batches. Rows the endpoint rate limited are retried with a growing
   * pause, because dropping them silently turns real trades into opening balances. Rows that still
   * fail, or fail with another error, come back as null and are counted in `unreadable`. No new
   * batch starts after the deadline and a batch the deadline cuts short is not counted as
   * attempted, so a caller can tell attempted signatures from skipped ones.
   */
  async getParsedTransactions(signatures: string[], deadline = Number.POSITIVE_INFINITY): Promise<TransactionRead> {
    const transactions: Array<ParsedTransaction | null> = new Array<ParsedTransaction | null>(signatures.length).fill(null);
    const chunk = env.rpcConfigured ? 25 : 10;
    const params = (signature: string) => [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: MAX_TX_VERSION, commitment: "confirmed" }];
    let unreadable = 0;
    let attempted = 0;
    for (let i = 0; i < signatures.length; i += chunk) {
      if (Date.now() > deadline) break;
      let pending = signatures.slice(i, i + chunk).map((signature, j) => ({ signature, index: i + j }));
      attempted += pending.length;
      // Rows the deadline leaves behind count as skipped, not as unreadable.
      let cut = false;
      try {
        for (let attempt = 1; pending.length > 0 && attempt <= 5; attempt++) {
          if (attempt > 1) {
            // A rate limited row clears when the window has passed, so the public endpoint gets a full window.
            const pause = env.rpcConfigured ? 2_000 * attempt : PUBLIC_WINDOW_MS;
            if (Date.now() + pause > deadline) {
              cut = true;
              break;
            }
            await sleep(pause);
          }
          await this.spaceBatches();
          const rows = await this.batch<ParsedTransaction>("getTransaction", pending.map((p) => params(p.signature)), deadline);
          const retry: typeof pending = [];
          rows.forEach((row, j) => {
            if (row.rateLimited) {
              retry.push(pending[j]);
              return;
            }
            transactions[pending[j].index] = row.result;
            if (row.error) unreadable += 1;
          });
          pending = retry;
        }
      } catch (err) {
        if (!(err instanceof RpcDeadline)) throw err;
        cut = true;
      }
      if (cut) {
        attempted -= pending.length;
        break;
      }
      unreadable += pending.length;
    }
    return { transactions, unreadable, attempted };
  }

  private async spaceBatches(): Promise<void> {
    if (!env.rpcConfigured) {
      const wait = this.lastBatchAt + PUBLIC_BATCH_SPACING_MS - Date.now();
      if (wait > 0) await sleep(wait);
    }
    this.lastBatchAt = Date.now();
  }

  async getTransaction(signature: string): Promise<ParsedTransaction | null> {
    return this.call<ParsedTransaction | null>("getTransaction", [
      signature,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: MAX_TX_VERSION, commitment: "confirmed" },
    ]);
  }

  async getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
    const r = await this.call<{ value: { blockhash: string; lastValidBlockHeight: number } }>("getLatestBlockhash", [
      { commitment: "confirmed" },
    ]);
    return r.value;
  }

  async getBalanceLamports(address: string): Promise<number> {
    const r = await this.call<{ value: number }>("getBalance", [address, { commitment: "confirmed" }]);
    return r.value;
  }

  /** Reads the Token-2022 scaled UI amount extension for a set of mints. */
  async getMintMultipliers(mints: string[]): Promise<Map<string, MintMultiplierState>> {
    const out = new Map<string, MintMultiplierState>();
    const chunk = 100;
    for (let i = 0; i < mints.length; i += chunk) {
      const slice = mints.slice(i, i + chunk);
      const r = await this.call<{
        value: Array<{
          data: { parsed?: { info?: { decimals: number; extensions?: Array<{ extension: string; state: Record<string, unknown> }> } } };
        } | null>;
      }>("getMultipleAccounts", [slice, { encoding: "jsonParsed", commitment: "confirmed" }]);
      r.value.forEach((account, idx) => {
        const mint = slice[idx];
        const info = account?.data?.parsed?.info;
        if (!info) return;
        const ext = info.extensions?.find((e) => e.extension === "scaledUiAmountConfig");
        const state = ext?.state ?? {};
        const multiplier = numberOrNull(state["multiplier"]);
        const newMultiplier = numberOrNull(state["newMultiplier"]);
        const ts = numberOrNull(state["newMultiplierEffectiveTimestamp"]);
        out.set(mint, {
          mint,
          decimals: info.decimals,
          multiplier,
          newMultiplier,
          newMultiplierEffectiveAt: ts !== null && ts > 0 ? new Date(ts * 1000) : null,
        });
      });
    }
    return out;
  }
}

async function mapSequential<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (const item of items) out.push(await fn(item));
  return out;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function numberOrNull(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

let shared: RpcClient | null = null;

export function rpc(): RpcClient {
  if (!shared || shared.endpoint !== env.rpcUrl) shared = new RpcClient(env.rpcUrl);
  return shared;
}

/** Effective multiplier now, given the extension state. */
export function effectiveMultiplier(state: MintMultiplierState, now = new Date()): { current: number; pending: number | null; pendingAt: Date | null } {
  const base = state.multiplier ?? 1;
  if (state.newMultiplier !== null && state.newMultiplierEffectiveAt) {
    if (state.newMultiplierEffectiveAt.getTime() <= now.getTime()) {
      return { current: state.newMultiplier, pending: null, pendingAt: null };
    }
    if (state.newMultiplier !== base) {
      return { current: base, pending: state.newMultiplier, pendingAt: state.newMultiplierEffectiveAt };
    }
  }
  return { current: base, pending: null, pendingAt: null };
}
