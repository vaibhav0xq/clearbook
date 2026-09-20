import { PublicKey } from "@solana/web3.js";
import {
  CASH_MINTS,
  WSOL_MINT,
  getAsset,
  getDemoWallet,
  isDemoId,
  type LedgerEventInput,
} from "@workspace/ledger";
import type { Wallet } from "@workspace/db";
import { env } from "../lib/env";
import { badRequest, HttpError } from "../lib/errors";
import { logger } from "../lib/logger";
import { rpc, type ParsedTransaction, type SignatureInfo } from "./rpc";
import { countEvents, getWallet, listEvents, replaceEvents, upsertWallet } from "./store";

export function isValidAddress(address: string): boolean {
  if (isDemoId(address)) return true;
  try {
    return PublicKey.isOnCurve(new PublicKey(address).toBytes()) || new PublicKey(address).toBase58() === address;
  } catch {
    return false;
  }
}

export function assertAddress(address: string): void {
  if (!isValidAddress(address)) throw badRequest("Not a valid Solana address.", { address });
}

interface Classified {
  events: LedgerEventInput[];
  unknown: boolean;
}

interface TokenDelta {
  mint: string;
  raw: bigint;
  decimals: number;
}

export function tokenDeltasForOwner(tx: ParsedTransaction, owner: string): TokenDelta[] {
  const pre = new Map<string, { amount: bigint; decimals: number; mint: string }>();
  const post = new Map<string, { amount: bigint; decimals: number; mint: string }>();
  for (const b of tx.meta?.preTokenBalances ?? []) {
    if (b.owner !== owner) continue;
    pre.set(`${b.accountIndex}`, { amount: BigInt(b.uiTokenAmount.amount), decimals: b.uiTokenAmount.decimals, mint: b.mint });
  }
  for (const b of tx.meta?.postTokenBalances ?? []) {
    if (b.owner !== owner) continue;
    post.set(`${b.accountIndex}`, { amount: BigInt(b.uiTokenAmount.amount), decimals: b.uiTokenAmount.decimals, mint: b.mint });
  }
  const byMint = new Map<string, TokenDelta>();
  const keys = new Set([...pre.keys(), ...post.keys()]);
  for (const k of keys) {
    const a = pre.get(k);
    const b = post.get(k);
    const mint = (b ?? a)!.mint;
    const decimals = (b ?? a)!.decimals;
    const delta = (b?.amount ?? 0n) - (a?.amount ?? 0n);
    if (delta === 0n) continue;
    const cur = byMint.get(mint);
    byMint.set(mint, { mint, raw: (cur?.raw ?? 0n) + delta, decimals });
  }
  return [...byMint.values()];
}

function solDeltaLamports(tx: ParsedTransaction, owner: string): number {
  const idx = tx.transaction.message.accountKeys.findIndex((k) => k.pubkey === owner);
  if (idx < 0 || !tx.meta) return 0;
  let delta = tx.meta.postBalances[idx] - tx.meta.preBalances[idx];
  if (idx === 0) delta += tx.meta.fee; // exclude the network fee paid by this wallet
  return delta;
}

function classify(sig: SignatureInfo, tx: ParsedTransaction, owner: string): Classified {
  const blockTime = new Date((tx.blockTime ?? sig.blockTime ?? 0) * 1000);
  const deltas = tokenDeltasForOwner(tx, owner);
  const stock = deltas.filter((d) => getAsset(d.mint));
  if (stock.length === 0) return { events: [], unknown: false };

  let cashUsd = 0;
  let cashSymbol: string | null = null;
  let cashAmount = 0;
  for (const d of deltas) {
    const cash = CASH_MINTS[d.mint];
    if (cash) {
      const amount = Number(d.raw) / 10 ** cash.decimals;
      cashUsd += amount;
      cashAmount += amount;
      cashSymbol = cashSymbol && cashSymbol !== cash.symbol ? "stables" : cash.symbol;
    }
  }
  let solAmount = 0;
  const wsol = deltas.find((d) => d.mint === WSOL_MINT);
  if (wsol) solAmount += Number(wsol.raw) / 1e9;
  solAmount += solDeltaLamports(tx, owner) / 1e9;
  if (Math.abs(solAmount) < 0.0005) solAmount = 0;

  const programs = new Set(tx.transaction.message.instructions.map((i) => i.programId));
  const venue = programs.has("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4") || programs.has("JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB")
    ? "Jupiter"
    : null;
  const base = (suffix: string, kind: LedgerEventInput["kind"], d: TokenDelta): LedgerEventInput => ({
    id: `${owner}:${sig.signature}:${suffix}`,
    signature: sig.signature,
    slot: tx.slot,
    blockTime,
    kind,
    mint: d.mint,
    rawDelta: d.raw,
    grossUsd: null,
    feeUsd: null,
    counterAsset: null,
    counterAmount: null,
    multiplierAtEvent: null,
    referencePriceUsd: null,
    source: "live",
    venue,
    note: null,
  });

  if (stock.length === 1) {
    const d = stock[0];
    const cashOpposite = cashUsd !== 0 && Math.sign(cashUsd) !== Math.sign(Number(d.raw));
    const solOpposite = solAmount !== 0 && Math.sign(solAmount) !== Math.sign(Number(d.raw));
    if (cashOpposite) {
      const kind = d.raw > 0n ? "buy" : "sell";
      const e = base(d.mint, kind, d);
      e.grossUsd = Math.abs(cashUsd);
      e.feeUsd = 0;
      e.counterAsset = cashSymbol;
      e.counterAmount = Math.abs(cashAmount);
      return { events: [e], unknown: false };
    }
    if (solOpposite) {
      const kind = d.raw > 0n ? "buy" : "sell";
      const e = base(d.mint, kind, d);
      e.counterAsset = "SOL";
      e.counterAmount = Math.abs(solAmount);
      e.note = "Settled in SOL. The USD value at trade time was not available, so the cash leg is unknown.";
      return { events: [e], unknown: false };
    }
    const kind = d.raw > 0n ? "transfer_in" : "transfer_out";
    const e = base(d.mint, kind, d);
    e.note = d.raw > 0n ? "Received without a cash leg in this wallet." : "Sent out without a cash leg in this wallet.";
    return { events: [e], unknown: false };
  }

  if (stock.length === 2 && Math.sign(Number(stock[0].raw)) !== Math.sign(Number(stock[1].raw))) {
    const out = stock.find((d) => d.raw < 0n)!;
    const inn = stock.find((d) => d.raw > 0n)!;
    const outAsset = getAsset(out.mint)!;
    const inAsset = getAsset(inn.mint)!;
    const sameUnderlying = outAsset.underlyingSymbol === inAsset.underlyingSymbol;
    const value = cashUsd !== 0 ? Math.abs(cashUsd) : null;
    const eOut = base(out.mint, "wrapper_swap_out", out);
    eOut.grossUsd = value;
    eOut.counterAsset = inAsset.symbol;
    eOut.counterAmount = Number(inn.raw) / 10 ** inn.decimals;
    eOut.note = sameUnderlying
      ? `Swapped into ${inAsset.symbol}, another wrapper of ${outAsset.underlyingSymbol}.`
      : `Swapped into ${inAsset.symbol}. Treated as a disposal and a new acquisition.`;
    const eIn = base(inn.mint, "wrapper_swap_in", inn);
    eIn.grossUsd = value;
    eIn.counterAsset = outAsset.symbol;
    eIn.counterAmount = Number(-out.raw) / 10 ** out.decimals;
    eIn.note = `Swapped from ${outAsset.symbol}.`;
    return { events: [eOut, eIn], unknown: false };
  }

  const events = stock.map((d) => {
    const e = base(d.mint, "unknown", d);
    e.note = "Several tokenized stocks moved in one transaction. Not classified. Balance change recorded without basis.";
    return e;
  });
  return { events, unknown: true };
}

interface SignatureScan {
  signatures: SignatureInfo[];
  truncated: boolean;
  ownerHistoryRead: boolean;
  accountsSkipped: number;
}

/**
 * Reads signatures for the tokenized stock accounts the wallet holds. The owner level
 * history is only read when it is short, so that busy wallets do not drag in thousands of
 * unrelated transactions through a rate limited endpoint. Accounts with a balance are read
 * first so that a deadline cut costs closed positions before open ones.
 */
async function collectSignatures(owner: string, accounts: TokenAccountRef[], deadline: number): Promise<SignatureScan> {
  const client = rpc();
  const cap = env.maxSignatures;
  const seen = new Map<string, SignatureInfo>();
  let truncated = false;
  let accountsSkipped = 0;
  const pull = async (address: string, limit: number) => {
    let before: string | undefined;
    let fetched = 0;
    while (fetched < limit) {
      if (Date.now() > deadline) return true;
      const page = await client.getSignaturesForAddress(address, Math.min(100, limit - fetched), before);
      for (const s of page) if (!s.err) seen.set(s.signature, s);
      fetched += page.length;
      if (page.length < 100) return false;
      before = page[page.length - 1].signature;
    }
    return true;
  };
  const ownerPage = await client.getSignaturesForAddress(owner, 100);
  const ownerHistoryRead = ownerPage.length < 100;
  if (ownerHistoryRead) for (const s of ownerPage) if (!s.err) seen.set(s.signature, s);
  const ordered = [...accounts].sort((a, b) => Number(BigInt(b.amount) > 0n) - Number(BigInt(a.amount) > 0n));
  const perAccount = Math.max(50, Math.floor(cap / Math.max(1, ordered.length)));
  for (const account of ordered) {
    if (Date.now() > deadline) {
      accountsSkipped += 1;
      truncated = true;
      continue;
    }
    truncated = (await pull(account.pubkey, perAccount)) || truncated;
  }
  const signatures = [...seen.values()].sort((a, b) => (a.blockTime ?? 0) - (b.blockTime ?? 0) || a.slot - b.slot);
  return { signatures: signatures.slice(-cap), truncated: truncated || signatures.length > cap, ownerHistoryRead, accountsSkipped };
}

/** One warning per symbol reads fine for a handful of positions and drowns everything else for a market maker. */
function summariseSymbols(symbols: string[], suffix: string): string[] {
  if (symbols.length === 0) return [];
  if (symbols.length <= 6) return symbols.map((symbol) => `${symbol}: ${suffix}`);
  return [`${symbols.length} positions (${symbols.slice(0, 5).join(", ")} and ${symbols.length - 5} more): ${suffix}`];
}

interface TokenAccountRef {
  pubkey: string;
  amount: string;
}

/** Wall clock budget for one indexing run. Public endpoints are slow, so the run degrades to a partial ledger instead of hanging. */
const INDEX_TIME_BUDGET_MS = 90_000;
/** A wallet stuck in "indexing" longer than this is treated as abandoned and indexed again on the next request. */
export const INDEX_STALE_MS = 4 * 60_000;

export interface IndexOutcome {
  wallet: Wallet;
}

/** Indexes a wallet from the chain, or loads a scripted demo wallet. */
/** In flight runs per address, so two requests for the same wallet share one run instead of racing on the ledger. */
const inFlight = new Map<string, Promise<Wallet>>();

export function indexWallet(address: string): Promise<Wallet> {
  assertAddress(address);
  if (isDemoId(address)) return loadDemoWallet(address);
  const running = inFlight.get(address);
  if (running) return running;
  const run = indexLiveWallet(address).finally(() => inFlight.delete(address));
  inFlight.set(address, run);
  return run;
}

async function indexLiveWallet(address: string): Promise<Wallet> {

  await upsertWallet({ address, isDemo: false, state: "indexing", source: "live", message: "Reading transaction history." });
  const client = rpc();
  try {
    const accounts = await client.getTokenAccountsByOwner(address);
    const stockAccounts = accounts.filter((a) => getAsset(a.mint));
    const startedAt = Date.now();
    const deadline = startedAt + INDEX_TIME_BUDGET_MS;
    const scan = await collectSignatures(
      address,
      stockAccounts.map((a) => ({ pubkey: a.pubkey, amount: a.amount })),
      deadline,
    );
    let { truncated } = scan;
    const { signatures } = scan;
    const events: LedgerEventInput[] = [];
    const warnings: string[] = [];
    const openingSymbols: string[] = [];
    const closingSymbols: string[] = [];
    if (scan.accountsSkipped > 0) {
      warnings.push(`${scan.accountsSkipped} token account${scan.accountsSkipped === 1 ? "" : "s"} could not be read within the time budget. Their history is summarized as opening balances.`);
    }
    let unknownCount = 0;
    let scanned = 0;
    for (let i = 0; i < signatures.length; i += 50) {
      if (Date.now() > deadline) {
        truncated = true;
        warnings.push(`Indexing stopped after ${Math.round(INDEX_TIME_BUDGET_MS / 1000)} seconds. Older activity is summarized as an opening balance.`);
        break;
      }
      // Newest first, so that a time budget cut drops the oldest history.
      const slice = signatures.slice(Math.max(0, signatures.length - i - 50), signatures.length - i);
      const txs = await client.getParsedTransactions(slice.map((s) => s.signature));
      txs.forEach((tx, j) => {
        if (!tx || !tx.meta || tx.meta.err) return;
        const c = classify(slice[j], tx, address);
        events.push(...c.events);
        if (c.unknown) unknownCount += 1;
      });
      scanned += slice.length;
    }
    events.sort((a, b) => a.blockTime.getTime() - b.blockTime.getTime());

    // Reconcile indexed flows with the balances actually held.
    const indexedByMint = new Map<string, bigint>();
    for (const e of events) if (e.kind !== "unknown") indexedByMint.set(e.mint, (indexedByMint.get(e.mint) ?? 0n) + e.rawDelta);
    const heldByMint = new Map<string, bigint>();
    for (const a of stockAccounts) heldByMint.set(a.mint, (heldByMint.get(a.mint) ?? 0n) + BigInt(a.amount));
    const earliest = events.reduce<Date | null>((acc, e) => (!acc || e.blockTime < acc ? e.blockTime : acc), null) ?? new Date();
    const latest = events.reduce<Date | null>((acc, e) => (!acc || e.blockTime > acc ? e.blockTime : acc), null) ?? new Date();
    for (const [mint, held] of new Set([...heldByMint.keys(), ...indexedByMint.keys()].map((m) => [m, heldByMint.get(m) ?? 0n] as const))) {
      const indexed = indexedByMint.get(mint) ?? 0n;
      const diff = held - indexed;
      if (diff === 0n) continue;
      const asset = getAsset(mint)!;
      if (diff > 0n) {
        events.push({
          id: `${address}:${mint}:opening`,
          signature: null,
          slot: null,
          blockTime: new Date(earliest.getTime() - 1000),
          kind: "transfer_in",
          mint,
          rawDelta: diff,
          grossUsd: null,
          feeUsd: null,
          counterAsset: null,
          counterAmount: null,
          multiplierAtEvent: null,
          referencePriceUsd: null,
          source: "live",
          venue: null,
          note: "Held before the indexed history begins. Cost basis unknown.",
        });
        openingSymbols.push(asset.symbol);
      } else {
        events.push({
          id: `${address}:${mint}:closing`,
          signature: null,
          slot: null,
          blockTime: new Date(latest.getTime() + 1000),
          kind: "transfer_out",
          mint,
          rawDelta: diff,
          grossUsd: null,
          feeUsd: null,
          counterAsset: null,
          counterAmount: null,
          multiplierAtEvent: null,
          referencePriceUsd: null,
          source: "live",
          venue: null,
          note: "Left the wallet in a transaction outside the indexed history.",
        });
        closingSymbols.push(asset.symbol);
      }
    }
    warnings.push(...summariseSymbols(openingSymbols, "part of the balance predates the indexed history. Its cost basis is unknown."));
    warnings.push(...summariseSymbols(closingSymbols, "some tokens left the wallet outside the indexed history. Recorded as a transfer out."));
    if (truncated && !warnings.some((w) => w.startsWith("Indexing stopped"))) warnings.push(`History capped at ${env.maxSignatures} signatures. Older activity is summarized as an opening balance.`);
    if (!scan.ownerHistoryRead) warnings.push("Only transactions touching the current tokenized stock accounts were read. Stocks held in closed token accounts are not included.");
    if (unknownCount > 0) warnings.push(`${unknownCount} transaction${unknownCount === 1 ? "" : "s"} could not be classified.`);
    if (!env.rpcConfigured) warnings.push("Indexed through the public RPC endpoint. Set SOLANA_RPC_URL or HELIUS_API_KEY for deeper history.");

    await replaceEvents(address, events, "simulated");
    const hasStocks = stockAccounts.length > 0 || events.length > 0;
    const state = !hasStocks ? "empty" : truncated || unknownCount > 0 ? "partial" : "ready";
    const message = !hasStocks
      ? "No tokenized stocks found in this wallet."
      : state === "partial"
        ? "Indexed with gaps. See the warnings for what could not be reconstructed."
        : "Indexed from Solana mainnet.";
    return upsertWallet({
      address,
      isDemo: false,
      state,
      source: "live",
      message,
      eventsIndexed: events.length,
      signaturesScanned: signatures.length,
      unknownTransactions: unknownCount,
      lastSignature: signatures.length ? signatures[signatures.length - 1].signature : null,
      lastIndexedAt: new Date(),
      warnings,
    });
  } catch (err) {
    const message = err instanceof HttpError ? err.message : err instanceof Error ? err.message : "Indexing failed.";
    logger.error({ err, address }, "Indexing failed");
    return upsertWallet({ address, isDemo: false, state: "error", source: "unavailable", message, lastIndexedAt: new Date(), warnings: [] });
  }
}

export async function loadDemoWallet(id: string): Promise<Wallet> {
  const demo = getDemoWallet(id);
  if (!demo) throw badRequest("Unknown demo wallet.", { id });
  await replaceEvents(id, demo.events, "simulated");
  return upsertWallet({
    address: id,
    isDemo: true,
    state: demo.events.length === 0 ? "empty" : "ready",
    source: "demo",
    message: demo.events.length === 0 ? "This demo wallet holds nothing." : `Demo ledger loaded. ${demo.description}`,
    eventsIndexed: demo.events.length,
    signaturesScanned: demo.events.length,
    unknownTransactions: 0,
    lastSignature: null,
    lastIndexedAt: new Date(),
    warnings: [],
  });
}

/** Returns the stored wallet, indexing it first when it has never been seen. */
export async function ensureWallet(address: string): Promise<{ wallet: Wallet; events: LedgerEventInput[] }> {
  assertAddress(address);
  let wallet = await getWallet(address);
  const abandoned = wallet?.state === "indexing" && Date.now() - wallet.updatedAt.getTime() > INDEX_STALE_MS;
  if (!wallet || wallet.state === "not_indexed" || abandoned || (isDemoId(address) && (await countEvents(address, "demo")) === 0 && getDemoWallet(address)!.events.length > 0)) {
    wallet = await indexWallet(address);
  }
  const events = await listEvents(address);
  return { wallet, events };
}
