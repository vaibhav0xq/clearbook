import {
  DEMO_PRICES,
  US_EQUITY_SESSIONS,
  continuousSession,
  getAsset,
  getPythFeed,
  sessionAt,
  unknownSession,
  venueName,
  type RegistryAsset,
  type SessionInfo,
} from "@workspace/ledger";
import { env } from "../lib/env";
import { fetchJson, UpstreamStatusError } from "../lib/http";
import { logger } from "../lib/logger";
import { effectiveMultiplier, rpc } from "./rpc";

/** API facing mark shape (mirrors the OpenAPI Mark schema). */
export interface MarkView {
  price: number | null;
  currency: string;
  source: "pyth" | "jupiter" | "prestocks" | "demo" | "none";
  sourceLabel: string;
  feed: string | null;
  publishTime: string | null;
  ageSeconds: number | null;
  confidence: number | null;
  status: "live" | "delayed" | "stale" | "closed" | "demo" | "unavailable";
  statusLabel: string;
}

export interface SessionView {
  state: SessionInfo["state"];
  label: string;
  venue: string;
  timezone: string;
  nextChangeAt: string | null;
  nextState: string | null;
}

export interface MultiplierView {
  current: number;
  pending: number | null;
  pendingEffectiveAt: string | null;
  observedAt: string | null;
  source: "onchain" | "jupiter" | "backed" | "demo" | "none";
}

export interface PremiumDiscountView {
  tokenPrice: number | null;
  referencePrice: number | null;
  referenceLabel: string;
  differencePct: number | null;
  direction: "premium" | "discount" | "par" | "unknown";
}

export interface MarkBundle {
  mint: string;
  mark: MarkView;
  referencePrice: number | null;
  referenceSource: string;
  session: SessionView;
  multiplier: MultiplierView;
  premiumDiscount: PremiumDiscountView;
  dayChangePct: number | null;
  wrapperFeed: string | null;
  referenceFeed: string | null;
}

export interface PricingSnapshot {
  asOf: Date;
  marks: Map<string, MarkBundle>;
  provider: "pyth" | "jupiter" | "prestocks" | "mixed" | "demo" | "none";
  providerLabel: string;
  mode: "live" | "fallback" | "demo" | "unavailable";
  headline: string;
  detail: string;
  pythConfigured: boolean;
  pythAuthorized: boolean | null;
  feedsResolved: number;
  feedsTotal: number;
  usSession: SessionView;
  errors: string[];
}

interface RawQuote {
  price: number;
  publishTime: Date | null;
  confidence: number | null;
  feed: string | null;
}

interface JupiterPrice {
  usdPrice: number;
  priceChange24h?: number;
  blockId?: number;
  stockData?: { price?: number; updatedAt?: string };
  scaledUiConfig?: { multiplier?: number; newMultiplier?: number; newMultiplierEffectiveAt?: string };
}

interface PreStocksEntry {
  symbol: string;
  contract_address: string;
  markPrice: number;
  tokenPrice: number;
}

interface CacheEntry<T> {
  at: number;
  value: T;
}

const TTL_MS = 20_000;
const MULTIPLIER_TTL_MS = 60_000;

const jupiterCache = new Map<string, CacheEntry<JupiterPrice | null>>();
const multiplierCache = new Map<string, CacheEntry<MultiplierView>>();
let prestocksCache: CacheEntry<Map<string, PreStocksEntry>> | null = null;
let pythAuthorized: boolean | null = null;
let pythLastError: string | null = null;

export function toSessionView(info: SessionInfo): SessionView {
  return {
    state: info.state,
    label: info.label,
    venue: info.venue,
    timezone: info.timezone,
    nextChangeAt: info.nextChangeAt ? info.nextChangeAt.toISOString() : null,
    nextState: info.nextState,
  };
}

export function sessionForAsset(asset: RegistryAsset | undefined, now: Date): SessionInfo {
  if (!asset) return unknownSession("Unknown venue");
  if (asset.issuer === "prestocks") return continuousSession("PreStocks");
  const feed = asset.pythEquityFeed ? getPythFeed(asset.pythEquityFeed) : null;
  const venue = venueName(asset.exchange);
  if (feed) return sessionAt(feed.sessions, now, venue);
  if (!asset.exchange || ["XNAS", "XNYS", "ARCX", "XASE", "BATS"].includes(asset.exchange)) {
    return sessionAt(US_EQUITY_SESSIONS, now, venue);
  }
  return unknownSession(venue);
}

export function usSessionView(now: Date): SessionView {
  return toSessionView(sessionAt(US_EQUITY_SESSIONS, now, "US equities"));
}

function statusFor(source: MarkView["source"], publishTime: Date | null, now: Date, session: SessionInfo): {
  status: MarkView["status"];
  statusLabel: string;
  ageSeconds: number | null;
} {
  if (source === "none") return { status: "unavailable", statusLabel: "No price", ageSeconds: null };
  if (source === "demo") return { status: "demo", statusLabel: "Demo snapshot", ageSeconds: null };
  const ageSeconds = publishTime ? Math.max(0, (now.getTime() - publishTime.getTime()) / 1000) : 0;
  if (source === "pyth" && (session.state === "closed" || session.state === "unknown") && ageSeconds > 900) {
    return { status: "closed", statusLabel: "Last close", ageSeconds };
  }
  if (ageSeconds <= 90) return { status: "live", statusLabel: "Live", ageSeconds };
  if (ageSeconds <= 900) return { status: "delayed", statusLabel: "Delayed", ageSeconds };
  return { status: "stale", statusLabel: "Stale", ageSeconds };
}

async function fetchJupiter(mints: string[]): Promise<Map<string, JupiterPrice | null>> {
  const out = new Map<string, JupiterPrice | null>();
  const now = Date.now();
  const missing: string[] = [];
  for (const m of mints) {
    const c = jupiterCache.get(m);
    if (c && now - c.at < TTL_MS) out.set(m, c.value);
    else missing.push(m);
  }
  for (let i = 0; i < missing.length; i += 50) {
    const chunk = missing.slice(i, i + 50);
    const json = await fetchJson<Record<string, JupiterPrice | null>>(
      `https://lite-api.jup.ag/price/v3?ids=${chunk.join(",")}`,
      { timeoutMs: 8_000 },
    );
    for (const m of chunk) {
      const v = json[m] ?? null;
      jupiterCache.set(m, { at: now, value: v });
      out.set(m, v);
    }
  }
  return out;
}

async function fetchPreStocks(): Promise<Map<string, PreStocksEntry>> {
  const now = Date.now();
  if (prestocksCache && now - prestocksCache.at < TTL_MS) return prestocksCache.value;
  const list = await fetchJson<PreStocksEntry[]>("https://prestocks.com/api/prestocks", { timeoutMs: 8_000 });
  const map = new Map<string, PreStocksEntry>();
  for (const e of list) map.set(e.contract_address, e);
  prestocksCache = { at: now, value: map };
  return map;
}

interface LazerFeed {
  priceFeedId: number;
  price?: string | number | null;
  exponent?: number | null;
  publisherCount?: number | null;
  bestBidPrice?: string | number | null;
  bestAskPrice?: string | number | null;
}

interface LazerResponse {
  parsed?: { timestampUs?: string | number; priceFeeds?: LazerFeed[] };
}

/**
 * Pyth Pro (Lazer) latest prices. Requires PYTH_API_KEY. A 401 or 403 marks
 * the key as unauthorized and the caller falls back to the next source.
 */
async function fetchPyth(feedSymbols: string[]): Promise<Map<string, RawQuote>> {
  const out = new Map<string, RawQuote>();
  const key = env.pythApiKey;
  if (!key || feedSymbols.length === 0) return out;
  const feeds = feedSymbols
    .map((symbol) => ({ symbol, feed: getPythFeed(symbol) }))
    .filter((f): f is { symbol: string; feed: NonNullable<ReturnType<typeof getPythFeed>> } => !!f.feed);
  if (feeds.length === 0) return out;
  try {
    const json = await fetchJson<LazerResponse>(`${env.pythBaseUrl}/v1/latest_price`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
      body: {
        priceFeedIds: feeds.map((f) => f.feed.id),
        properties: ["price", "exponent", "publisherCount"],
        channel: "fixed_rate@200ms",
        jsonBinaryEncoding: "hex",
      },
      timeoutMs: 8_000,
    });
    pythAuthorized = true;
    pythLastError = null;
    const ts = json.parsed?.timestampUs ? new Date(Number(json.parsed.timestampUs) / 1000) : new Date();
    const byId = new Map(feeds.map((f) => [f.feed.id, f]));
    for (const pf of json.parsed?.priceFeeds ?? []) {
      const f = byId.get(pf.priceFeedId);
      if (!f || pf.price === null || pf.price === undefined) continue;
      const exponent = pf.exponent ?? f.feed.exponent ?? -8;
      const price = Number(pf.price) * 10 ** exponent;
      if (!Number.isFinite(price) || price <= 0) continue;
      out.set(f.symbol, { price, publishTime: ts, confidence: null, feed: f.symbol });
    }
  } catch (err) {
    if (err instanceof UpstreamStatusError && (err.status === 401 || err.status === 403)) {
      pythAuthorized = false;
      pythLastError = "Pyth rejected the API key.";
    } else {
      pythLastError = err instanceof Error ? err.message : String(err);
    }
    logger.warn({ err: pythLastError }, "Pyth request failed");
  }
  return out;
}

async function readMultipliers(assets: RegistryAsset[], jupiter: Map<string, JupiterPrice | null>, now: Date): Promise<Map<string, MultiplierView>> {
  const out = new Map<string, MultiplierView>();
  const missing: RegistryAsset[] = [];
  for (const a of assets) {
    const c = multiplierCache.get(a.mint);
    if (c && now.getTime() - c.at < MULTIPLIER_TTL_MS) out.set(a.mint, c.value);
    else missing.push(a);
  }
  if (missing.length > 0) {
    try {
      const states = await rpc().getMintMultipliers(missing.map((a) => a.mint));
      for (const a of missing) {
        const s = states.get(a.mint);
        if (!s || s.multiplier === null) continue;
        const eff = effectiveMultiplier(s, now);
        const view: MultiplierView = {
          current: eff.current,
          pending: eff.pending,
          pendingEffectiveAt: eff.pendingAt ? eff.pendingAt.toISOString() : null,
          observedAt: now.toISOString(),
          source: "onchain",
        };
        multiplierCache.set(a.mint, { at: now.getTime(), value: view });
        out.set(a.mint, view);
      }
    } catch (err) {
      logger.warn({ err }, "Could not read multipliers from RPC");
    }
  }
  for (const a of assets) {
    if (out.has(a.mint)) continue;
    const j = jupiter.get(a.mint);
    const cfg = j?.scaledUiConfig;
    if (cfg && typeof cfg.multiplier === "number") {
      const effAt = cfg.newMultiplierEffectiveAt ? new Date(cfg.newMultiplierEffectiveAt) : null;
      const pendingActive = cfg.newMultiplier !== undefined && effAt !== null && effAt.getTime() > now.getTime();
      const current = !pendingActive && cfg.newMultiplier !== undefined && effAt !== null ? cfg.newMultiplier : cfg.multiplier;
      const view: MultiplierView = {
        current,
        pending: pendingActive ? (cfg.newMultiplier ?? null) : null,
        pendingEffectiveAt: pendingActive && effAt ? effAt.toISOString() : null,
        observedAt: now.toISOString(),
        source: "jupiter",
      };
      multiplierCache.set(a.mint, { at: now.getTime(), value: view });
      out.set(a.mint, view);
      continue;
    }
    out.set(a.mint, { current: 1, pending: null, pendingEffectiveAt: null, observedAt: null, source: "none" });
  }
  return out;
}

export interface PricingOptions {
  now?: Date;
  /** Multiplier overrides, used by demo wallets whose multiplier history is scripted. */
  multiplierOverrides?: Map<string, MultiplierView>;
  /** Allow the demo snapshot as a last resort. */
  allowDemoFallback?: boolean;
}

/** Resolves marks for a set of mints using every available source. */
export async function priceMints(mints: string[], options: PricingOptions = {}): Promise<PricingSnapshot> {
  const now = options.now ?? new Date();
  const assets = mints.map((m) => getAsset(m)).filter((a): a is RegistryAsset => !!a);
  const errors: string[] = [];

  const [jupiterResult, prestocksResult, pythResult] = await Promise.allSettled([
    assets.length ? fetchJupiter(assets.map((a) => a.mint)) : Promise.resolve(new Map<string, JupiterPrice | null>()),
    assets.some((a) => a.issuer === "prestocks") ? fetchPreStocks() : Promise.resolve(new Map<string, PreStocksEntry>()),
    fetchPyth([
      ...new Set(assets.flatMap((a) => [a.pythWrapperFeed, a.pythEquityFeed].filter((f): f is string => !!f))),
    ]),
  ]);
  const jupiter = jupiterResult.status === "fulfilled" ? jupiterResult.value : new Map<string, JupiterPrice | null>();
  if (jupiterResult.status === "rejected") errors.push(`Jupiter: ${reason(jupiterResult.reason)}`);
  const prestocks = prestocksResult.status === "fulfilled" ? prestocksResult.value : new Map<string, PreStocksEntry>();
  if (prestocksResult.status === "rejected") errors.push(`PreStocks: ${reason(prestocksResult.reason)}`);
  const pyth = pythResult.status === "fulfilled" ? pythResult.value : new Map<string, RawQuote>();
  if (pythLastError && env.pythApiKey) errors.push(`Pyth: ${pythLastError}`);

  const multipliers = await readMultipliers(assets, jupiter, now);
  const marks = new Map<string, MarkBundle>();
  const sourcesUsed = new Set<string>();

  for (const asset of assets) {
    const session = sessionForAsset(asset, now);
    const j = jupiter.get(asset.mint) ?? null;
    const p = asset.issuer === "prestocks" ? prestocks.get(asset.mint) ?? null : null;
    const pythWrapper = asset.pythWrapperFeed ? pyth.get(asset.pythWrapperFeed) ?? null : null;
    const pythEquity = asset.pythEquityFeed ? pyth.get(asset.pythEquityFeed) ?? null : null;

    let source: MarkView["source"] = "none";
    let sourceLabel = "No price source";
    let price: number | null = null;
    let publishTime: Date | null = null;
    let feed: string | null = null;
    let confidence: number | null = null;

    if (pythWrapper) {
      source = "pyth";
      sourceLabel = "Pyth";
      price = pythWrapper.price;
      publishTime = pythWrapper.publishTime;
      feed = pythWrapper.feed;
      confidence = pythWrapper.confidence;
    } else if (j && typeof j.usdPrice === "number" && j.usdPrice > 0) {
      source = "jupiter";
      sourceLabel = "Jupiter";
      price = j.usdPrice;
      publishTime = now;
    } else if (p && p.tokenPrice > 0) {
      source = "prestocks";
      sourceLabel = "PreStocks";
      price = p.tokenPrice;
      publishTime = now;
    } else if (options.allowDemoFallback && DEMO_PRICES.prices[asset.symbol]) {
      source = "demo";
      sourceLabel = "Demo snapshot";
      price = DEMO_PRICES.prices[asset.symbol].price;
      publishTime = new Date(DEMO_PRICES.capturedAt);
    }

    let referencePrice: number | null = null;
    let referenceSource = "No reference";
    const referenceFeed: string | null = asset.pythEquityFeed;
    if (pythEquity) {
      referencePrice = pythEquity.price;
      referenceSource = "Pyth";
    } else if (p && p.markPrice > 0) {
      referencePrice = p.markPrice;
      referenceSource = "PreStocks mark";
    } else if (j?.stockData?.price && j.stockData.price > 0) {
      referencePrice = j.stockData.price;
      referenceSource = asset.issuer === "prestocks" ? "PreStocks mark" : "Jupiter reference";
    } else if (source === "demo" && DEMO_PRICES.prices[asset.symbol]) {
      referencePrice = DEMO_PRICES.prices[asset.symbol].referencePrice;
      referenceSource = "Demo snapshot";
    }

    if (source !== "none") sourcesUsed.add(source);
    const st = statusFor(source, publishTime, now, session);
    const mark: MarkView = {
      price,
      currency: "USD",
      source,
      sourceLabel,
      feed,
      publishTime: publishTime ? publishTime.toISOString() : null,
      ageSeconds: st.ageSeconds,
      confidence,
      status: st.status,
      statusLabel: st.statusLabel,
    };
    const multiplier = options.multiplierOverrides?.get(asset.mint) ?? multipliers.get(asset.mint) ?? {
      current: 1,
      pending: null,
      pendingEffectiveAt: null,
      observedAt: null,
      source: "none" as const,
    };
    const dayChangePct =
      typeof j?.priceChange24h === "number" ? j.priceChange24h : source === "demo" ? DEMO_PRICES.prices[asset.symbol]?.dayChangePct ?? null : null;
    marks.set(asset.mint, {
      mint: asset.mint,
      mark,
      referencePrice,
      referenceSource,
      session: toSessionView(session),
      multiplier,
      premiumDiscount: premiumDiscount(price, referencePrice, asset, referenceSource),
      dayChangePct,
      wrapperFeed: asset.pythWrapperFeed,
      referenceFeed,
    });
  }

  const feedsResolved = [...marks.values()].filter((m) => m.mark.price !== null).length;
  const summary = summarize(sourcesUsed, feedsResolved, assets.length, errors);
  return {
    asOf: now,
    marks,
    ...summary,
    pythConfigured: !!env.pythApiKey,
    pythAuthorized: env.pythApiKey ? pythAuthorized : null,
    feedsResolved,
    feedsTotal: assets.length,
    usSession: usSessionView(now),
    errors,
  };
}

function premiumDiscount(price: number | null, referencePrice: number | null, asset: RegistryAsset, referenceSource: string): PremiumDiscountView {
  const referenceLabel =
    asset.issuer === "prestocks" ? `${referenceSource} for ${asset.underlyingName}` : `${asset.underlyingSymbol} on ${venueName(asset.exchange)} (${referenceSource})`;
  if (price === null || referencePrice === null || referencePrice <= 0) {
    return { tokenPrice: price, referencePrice, referenceLabel, differencePct: null, direction: "unknown" };
  }
  const differencePct = ((price - referencePrice) / referencePrice) * 100;
  const direction = Math.abs(differencePct) < 0.1 ? "par" : differencePct > 0 ? "premium" : "discount";
  return { tokenPrice: price, referencePrice, referenceLabel, differencePct, direction };
}

function summarize(
  sources: Set<string>,
  resolved: number,
  total: number,
  errors: string[],
): Pick<PricingSnapshot, "provider" | "providerLabel" | "mode" | "headline" | "detail"> {
  const live = [...sources].filter((s) => s !== "demo");
  const key = env.pythApiKey;
  if (total === 0) {
    return {
      provider: "none",
      providerLabel: "No positions to price",
      mode: "unavailable",
      headline: "Nothing to price",
      detail: "Prices appear once the wallet holds a tokenized stock.",
    };
  }
  if (live.length === 0 && sources.has("demo")) {
    return {
      provider: "demo",
      providerLabel: "Demo snapshot",
      mode: "demo",
      headline: "Snapshot prices",
      detail: `Live price sources were unreachable, so values use a snapshot captured ${DEMO_PRICES.capturedAt.slice(0, 10)}. ${errors.join(" ")}`.trim(),
    };
  }
  if (live.length === 0) {
    return {
      provider: "none",
      providerLabel: "Unavailable",
      mode: "unavailable",
      headline: "Prices unavailable",
      detail: errors.length ? errors.join(" ") : "No source returned a price for these positions.",
    };
  }
  const provider: PricingSnapshot["provider"] = live.length > 1 ? "mixed" : (live[0] as PricingSnapshot["provider"]);
  const labelFor: Record<string, string> = { pyth: "Pyth", jupiter: "Jupiter", prestocks: "PreStocks" };
  const providerLabel = live.length > 1 ? live.map((s) => labelFor[s] ?? s).join(" and ") : labelFor[live[0]] ?? live[0];
  const pythNote = !key
    ? "Add PYTH_API_KEY to mark against Pyth wrapper and equity feeds."
    : pythAuthorized === false
      ? "Pyth rejected the configured key, so marks come from Jupiter and PreStocks."
      : sources.has("pyth")
        ? "Pyth feeds supply token and reference prices."
        : "Pyth returned no prices for these feeds.";
  return {
    provider,
    providerLabel,
    mode: sources.has("demo") || resolved < total ? "fallback" : "live",
    headline: resolved === total ? `Marked with ${providerLabel}` : `${resolved} of ${total} positions priced`,
    detail: [pythNote, ...errors].join(" "),
  };
}

function reason(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function pythState(): { configured: boolean; authorized: boolean | null; lastError: string | null } {
  return { configured: !!env.pythApiKey, authorized: env.pythApiKey ? pythAuthorized : null, lastError: pythLastError };
}
