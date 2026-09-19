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

export /** Mainnet now carries version 1 transactions. Asking for version 0 only makes getTransaction fail with -32015. */
const MAX_TX_VERSION = 1;

class RpcClient {
  constructor(private readonly url: string = env.rpcUrl) {}

  get endpoint(): string {
    return this.url;
  }

  async call<T>(method: string, params: unknown[]): Promise<T> {
    const body = { jsonrpc: "2.0", id: idCounter++, method, params };
    const res = await this.post(body);
    const json = (await res.json()) as RpcResponse<T>;
    if (json.error) throw upstream(`RPC ${method} failed: ${json.error.message}`, { code: json.error.code });
    return json.result as T;
  }

  async batch<T>(method: string, paramsList: unknown[][]): Promise<Array<T | null>> {
    if (paramsList.length === 0) return [];
    const body = paramsList.map((params) => ({ jsonrpc: "2.0", id: idCounter++, method, params }));
    const res = await this.post(body);
    const json = (await res.json()) as RpcResponse<T>[] | RpcResponse<T>;
    if (!Array.isArray(json)) {
      if (json.error) throw upstream(`RPC batch ${method} failed: ${json.error.message}`, { code: json.error.code });
      return [json.result ?? null];
    }
    const byId = new Map(json.map((r) => [r.id, r]));
    return body.map((req) => {
      const r = byId.get(req.id);
      if (!r || r.error) return null;
      return r.result ?? null;
    });
  }

  /** Public endpoints answer 429 quickly under light load, so retry a few times with a growing pause before giving up. */
  private async post(body: unknown): Promise<Response> {
    const attempts = env.rpcConfigured ? 2 : 5;
    for (let attempt = 1; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const res = await fetch(this.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new UpstreamStatusError(this.url, res.status, text.slice(0, 300));
        }
        return res;
      } catch (err) {
        if (err instanceof UpstreamStatusError) {
          if (err.status === 401 || err.status === 403) throw upstream("RPC rejected the request. Check SOLANA_RPC_URL or HELIUS_API_KEY.");
          if (err.status === 429) {
            if (attempt < attempts) {
              await sleep(1_500 * attempt);
              continue;
            }
            throw upstream("RPC rate limit reached. Configure a dedicated RPC to index wallets reliably.");
          }
          throw upstream(`RPC returned ${err.status}.`);
        }
        const reason = err instanceof Error ? err.message : String(err);
        throw upstream(`RPC request failed: ${reason}`);
      } finally {
        clearTimeout(timer);
      }
    }
  }

  async getTokenAccountsByOwner(owner: string): Promise<TokenAccount[]> {
    const programs = ["TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"];
    const results = await mapSequential(programs, (programId) =>
        this.call<{ value: Array<{ pubkey: string; account: { data: { parsed: { info: { mint: string; owner: string; tokenAmount: { amount: string; decimals: number } } } } } }> }>(
          "getTokenAccountsByOwner",
          [owner, { programId }, { encoding: "jsonParsed", commitment: "confirmed" }],
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

  async getSignaturesForAddress(address: string, limit: number, before?: string): Promise<SignatureInfo[]> {
    return this.call<SignatureInfo[]>("getSignaturesForAddress", [
      address,
      { limit, before, commitment: "confirmed" },
    ]);
  }

  async getParsedTransactions(signatures: string[]): Promise<Array<ParsedTransaction | null>> {
    const out: Array<ParsedTransaction | null> = [];
    const chunk = env.rpcConfigured ? 25 : 10;
    for (let i = 0; i < signatures.length; i += chunk) {
      const slice = signatures.slice(i, i + chunk);
      const results = await this.batch<ParsedTransaction>(
        "getTransaction",
        slice.map((s) => [s, { encoding: "jsonParsed", maxSupportedTransactionVersion: MAX_TX_VERSION, commitment: "confirmed" }]),
      );
      out.push(...results);
    }
    return out;
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
