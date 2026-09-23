import {
  DEMO_IDS,
  DEMO_PRICES,
  US_EQUITY_SESSIONS,
  continuousSession,
  getAsset,
  getDemoWallet,
  getPythFeed,
  listAssets,
  sessionAt,
  unknownSession,
  venueName,
  type RegistryAsset,
  type SessionInfo,
} from "@workspace/ledger";
import { waitUntil } from "@vercel/functions";
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
/**
 * Prices older than TTL_MS but younger than this are served at once and refreshed in the
 * background, so a visitor never waits on Jupiter or PreStocks once the cache is warm. The age
 * shown next to each mark is the time the price was fetched, so a served-from-cache price is
 * still reported honestly. The limit stays under the 90 second "live" threshold in statusFor.
 */
const SERVE_STALE_MS = 60_000;
const MULTIPLIER_TTL_MS = 60_000;

const jupiterCache = new Map<string, CacheEntry<JupiterPrice | null>>();
const multiplierCache = new Map<string, CacheEntry<MultiplierView>>();
let prestocksCache: CacheEntry<Map<string, PreStocksEntry>> | null = null;
let pythAuthorized: boolean | null = null;
let pythLastError: string | null = null;

/** What this instance has seen from a keyless source: the last good answer and the last failure. */
export interface SourceHealth {
  lastOkAt: number | null;
  lastError: string | null;
  lastErrorAt: number | null;
}
const jupiterHealth: SourceHealth = { lastOkAt: null, lastError: null, lastErrorAt: null };
const prestocksHealth: SourceHealth = { lastOkAt: null, lastError: null, lastErrorAt: null };

function noteOk(health: SourceHealth): void {
  health.lastOkAt = Date.now();
  health.lastError = null;
  health.lastErrorAt = null;
}

function noteFailure(health: SourceHealth, err: unknown): void {
  health.lastError = reason(err);
  health.lastErrorAt = Date.now();
}

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

/** A cached upstream value with the time its request started, kept together so ages stay honest. */
export type Observed<T> = Readonly<CacheEntry<T>>;

const jupiterInflight = new Map<string, Promise<void>>();
let prestocksInflight: Promise<Observed<Map<string, PreStocksEntry>>> | null = null;

async function loadJupiter(mints: string[]): Promise<void> {
  for (let i = 0; i < mints.length; i += 50) {
    const chunk = mints.slice(i, i + 50);
    // Stamped before the request so the reported age is never younger than the price.
    const at = Date.now();
    let json: Record<string, JupiterPrice | null>;
    try {
      json = await fetchJson<Record<string, JupiterPrice | null>>(
        `https://lite-api.jup.ag/price/v3?ids=${chunk.join(",")}`,
        { timeoutMs: 8_000 },
      );
    } catch (err) {
      noteFailure(jupiterHealth, err);
      throw err;
    }
    noteOk(jupiterHealth);
    for (const m of chunk) jupiterCache.set(m, { at, value: json[m] ?? null });
  }
}

/**
 * Loads the given mints, joining any request already in flight for a mint instead of repeating it.
 * Chunks go out one after another so a large warm up does not burst the endpoint, and each mint is
 * released as soon as its own chunk lands rather than when the whole list is done.
 */
function loadJupiterShared(mints: string[]): Promise<void> {
  const waits: Promise<void>[] = [];
  const fresh: string[] = [];
  for (const m of mints) {
    const inflight = jupiterInflight.get(m);
    if (inflight) waits.push(inflight);
    else fresh.push(m);
  }
  let previous: Promise<void> = Promise.resolve();
  for (let i = 0; i < fresh.length; i += 50) {
    const chunk = fresh.slice(i, i + 50);
    const load: Promise<void> = previous
      .then(() => loadJupiter(chunk))
      .finally(() => {
        for (const m of chunk) if (jupiterInflight.get(m) === load) jupiterInflight.delete(m);
      });
    previous = load.catch(() => undefined);
    for (const m of chunk) jupiterInflight.set(m, load);
    waits.push(load);
  }
  return Promise.all(waits).then(() => undefined);
}

/**
 * Jupiter prices for the given mints. Fresh cache entries are returned as they are, entries older
 * than TTL_MS but younger than SERVE_STALE_MS are returned at once while a refresh runs in the
 * background, and anything older is fetched before returning. Each entry carries its own fetch
 * time, so a background refresh landing mid request cannot make an older price look newer.
 */
async function fetchJupiter(mints: string[]): Promise<Map<string, Observed<JupiterPrice | null>>> {
  const now = Date.now();
  const missing: string[] = [];
  const stale: string[] = [];
  for (const m of mints) {
    const c = jupiterCache.get(m);
    if (!c || now - c.at >= SERVE_STALE_MS) missing.push(m);
    else if (now - c.at >= TTL_MS) stale.push(m);
  }
  if (missing.length) await loadJupiterShared(missing);
  if (stale.length) {
    loadJupiterShared(stale).catch((err) => logger.warn({ err: reason(err) }, "Background Jupiter refresh failed"));
  }
  const out = new Map<string, Observed<JupiterPrice | null>>();
  for (const m of mints) {
    const c = jupiterCache.get(m);
    if (c) out.set(m, c);
  }
  return out;
}

function loadPreStocks(): Promise<Observed<Map<string, PreStocksEntry>>> {
  if (prestocksInflight) return prestocksInflight;
  const at = Date.now();
  const load = fetchJson<PreStocksEntry[]>("https://prestocks.com/api/prestocks", { timeoutMs: 8_000 })
    .then((list) => {
      noteOk(prestocksHealth);
      const map = new Map<string, PreStocksEntry>();
      for (const e of list) map.set(e.contract_address, e);
      const entry: Observed<Map<string, PreStocksEntry>> = { at, value: map };
      prestocksCache = entry;
      return entry;
    })
    .catch((err: unknown) => {
      noteFailure(prestocksHealth, err);
      throw err;
    })
    .finally(() => {
      if (prestocksInflight === load) prestocksInflight = null;
    });
  prestocksInflight = load;
  return load;
}

/** The PreStocks price list with the same fresh, serve stale and refetch rules as fetchJupiter. */
async function fetchPreStocks(): Promise<Observed<Map<string, PreStocksEntry>>> {
  const now = Date.now();
  const cached = prestocksCache;
  if (cached && now - cached.at < TTL_MS) return cached;
  if (cached && now - cached.at < SERVE_STALE_MS) {
    loadPreStocks().catch((err) => logger.warn({ err: reason(err) }, "Background PreStocks refresh failed"));
    return cached;
  }
  return loadPreStocks();
}

/**
 * Fills the price caches for every registry asset. Called once at startup so the first visitor
 * gets a warm response; failures are logged and the next request fetches on demand.
 */
export async function warmPricing(): Promise<void> {
  // The demo ledgers are the first thing a visitor opens, so their mints go out first.
  const demoMints = new Set(DEMO_IDS.flatMap((id) => getDemoWallet(id)?.events.map((e) => e.mint) ?? []));
  const mints = listAssets()
    .map((a) => a.mint)
    .sort((a, b) => Number(demoMints.has(b)) - Number(demoMints.has(a)));
  if (!mints.length) return;
  try {
    const snapshot = await priceMints(mints);
    if (snapshot.errors.length) logger.warn({ errors: snapshot.errors }, "Price warm up finished with errors");
    else logger.info({ mints: mints.length }, "Price caches warmed");
  } catch (err) {
    logger.warn({ err: reason(err) }, "Price warm up failed");
  }
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

type PythFeedRef = { symbol: string; feed: NonNullable<ReturnType<typeof getPythFeed>> };

/**
 * Feeds the current plan does not cover. Pyth answers a request that contains one such feed
 * with 403 "Not entitled: feed <id>" for the whole batch, so denied ids are remembered and left
 * out of later requests. The entry expires so a plan upgrade is picked up without a restart.
 */
const PYTH_DENIED_TTL_MS = 6 * 60 * 60 * 1000;
const pythDenied = new Map<number, number>();
const pythCovered = new Set<string>();
const NOT_ENTITLED = /Not entitled: feed (\d+)/;

function pythDeniedFeed(err: unknown): number | null {
  if (!(err instanceof UpstreamStatusError) || err.status !== 403) return null;
  const m = NOT_ENTITLED.exec(err.bodyText);
  return m ? Number(m[1]) : null;
}

async function pythLatest(feeds: PythFeedRef[]): Promise<LazerResponse> {
  return fetchJson<LazerResponse>(`${env.pythBaseUrl}/v1/latest_price`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.pythApiKey}` },
    body: {
      priceFeedIds: feeds.map((f) => f.feed.id),
      properties: ["price", "exponent", "publisherCount"],
      formats: [],
      channel: "fixed_rate@200ms",
    },
    timeoutMs: 8_000,
  });
}

function readPythResponse(json: LazerResponse, feeds: PythFeedRef[], out: Map<string, RawQuote>): void {
  const ts = json.parsed?.timestampUs ? new Date(Number(json.parsed.timestampUs) / 1000) : new Date();
  const byId = new Map(feeds.map((f) => [f.feed.id, f]));
  for (const pf of json.parsed?.priceFeeds ?? []) {
    const f = byId.get(pf.priceFeedId);
    if (!f) continue;
    pythCovered.add(f.symbol);
    if (pf.price === null || pf.price === undefined) continue;
    const exponent = pf.exponent ?? f.feed.exponent ?? -8;
    const price = Number(pf.price) * 10 ** exponent;
    if (!Number.isFinite(price) || price <= 0) continue;
    out.set(f.symbol, { price, publishTime: ts, confidence: null, feed: f.symbol });
  }
}

/** Records a failed Pyth request. Returns true when the failure was a plan coverage refusal. */
function notePythFailure(err: unknown, now: number): boolean {
  const denied = pythDeniedFeed(err);
  if (denied !== null) {
    // The key itself was accepted; the plan does not include this feed.
    pythDenied.set(denied, now + PYTH_DENIED_TTL_MS);
    pythAuthorized = true;
    return true;
  }
  if (err instanceof UpstreamStatusError && (err.status === 401 || err.status === 403)) {
    pythAuthorized = false;
    pythLastError = "Pyth rejected the API key.";
  } else {
    pythLastError = err instanceof Error ? err.message : String(err);
  }
  logger.warn({ err: pythLastError }, "Pyth request failed");
  return false;
}

/**
 * Pyth Pro latest prices. Requires PYTH_API_KEY. Feeds outside the plan are learned from the
 * first refusal and skipped afterwards; a 401, or a 403 that names no feed, marks the key as
 * rejected and the caller falls back to the next source.
 */
async function fetchPyth(feedSymbols: string[]): Promise<Map<string, RawQuote>> {
  const out = new Map<string, RawQuote>();
  if (!env.pythApiKey || feedSymbols.length === 0) return out;
  const now = Date.now();
  const feeds = feedSymbols
    .map((symbol) => ({ symbol, feed: getPythFeed(symbol) }))
    .filter((f): f is PythFeedRef => !!f.feed)
    .filter((f) => (pythDenied.get(f.feed.id) ?? 0) <= now);
  if (feeds.length === 0) return out;
  try {
    readPythResponse(await pythLatest(feeds), feeds, out);
    pythAuthorized = true;
    pythLastError = null;
    return out;
  } catch (err) {
    if (!notePythFailure(err, now)) return out;
  }
  // The batch held at least one feed outside the plan. Ask for the rest one feed at a time so
  // every refusal is learned at once; the next call batches the covered feeds again.
  const rest = feeds.filter((f) => (pythDenied.get(f.feed.id) ?? 0) <= now);
  await Promise.all(
    Array.from({ length: Math.min(6, rest.length) }, async (_, worker) => {
      for (let i = worker; i < rest.length; i += 6) {
        const feed = rest[i];
        try {
          readPythResponse(await pythLatest([feed]), [feed], out);
          pythAuthorized = true;
          pythLastError = null;
        } catch (err) {
          notePythFailure(err, now);
        }
      }
    }),
  );
  return out;
}

async function readMultipliers(assets: RegistryAsset[], jupiter: Map<string, Observed<JupiterPrice | null>>, now: Date): Promise<Map<string, MultiplierView>> {
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
    const j = jupiter.get(a.mint)?.value;
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
    assets.length ? fetchJupiter(assets.map((a) => a.mint)) : Promise.resolve(new Map<string, Observed<JupiterPrice | null>>()),
    assets.some((a) => a.issuer === "prestocks") ? fetchPreStocks() : Promise.resolve<Observed<Map<string, PreStocksEntry>> | null>(null),
    fetchPyth([
      ...new Set(assets.flatMap((a) => [a.pythWrapperFeed, a.pythEquityFeed].filter((f): f is string => !!f))),
    ]),
  ]);
  const jupiter = jupiterResult.status === "fulfilled" ? jupiterResult.value : new Map<string, Observed<JupiterPrice | null>>();
  if (jupiterResult.status === "rejected") errors.push(`Jupiter: ${reason(jupiterResult.reason)}`);
  const prestocks = prestocksResult.status === "fulfilled" ? prestocksResult.value : null;
  if (prestocksResult.status === "rejected") errors.push(`PreStocks: ${reason(prestocksResult.reason)}`);
  const pyth = pythResult.status === "fulfilled" ? pythResult.value : new Map<string, RawQuote>();
  if (pythLastError && env.pythApiKey) errors.push(`Pyth: ${pythLastError}`);

  const multipliers = await readMultipliers(assets, jupiter, now);
  const marks = new Map<string, MarkBundle>();
  const sourcesUsed = new Set<string>();
  let pythReferences = 0;

  for (const asset of assets) {
    const session = sessionForAsset(asset, now);
    const jupiterEntry = jupiter.get(asset.mint) ?? null;
    const j = jupiterEntry?.value ?? null;
    const p = asset.issuer === "prestocks" ? prestocks?.value.get(asset.mint) ?? null : null;
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
      publishTime = jupiterEntry ? new Date(jupiterEntry.at) : now;
    } else if (p && p.tokenPrice > 0) {
      source = "prestocks";
      sourceLabel = "PreStocks";
      price = p.tokenPrice;
      publishTime = prestocks ? new Date(prestocks.at) : now;
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
      pythReferences++;
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
  const summary = summarize(sourcesUsed, feedsResolved, assets.length, errors, pythReferences);
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
  pythReferences: number,
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
        : pythReferences > 0
          ? `Pyth supplies the reference price for ${pythReferences} of ${total} positions. The plan does not cover the other feeds.`
          : pythLastError
            ? "Pyth returned no prices for these feeds."
            : "The Pyth plan does not cover these feeds.";
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

export function sourceHealth(): { jupiter: SourceHealth; prestocks: SourceHealth } {
  return { jupiter: { ...jupiterHealth }, prestocks: { ...prestocksHealth } };
}

let probeInflight: Promise<void> | null = null;

/**
 * Exercises every pricing source this instance has not heard from yet, so a status page reports
 * what was observed rather than what is configured. One Pyth covered stock and one PreStocks mint
 * touch all three sources through the same fetch paths the marks use, without the multiplier
 * reads. Concurrent callers share one run. The caller waits at most the budget; the run itself is
 * handed to the host so it can finish and leave its answer for the next reader. Cheap when
 * everything has been seen: no request goes out.
 */
export function probeSources(budgetMs: number): Promise<void> {
  if (!probeInflight) {
    const run = runSourceProbe().finally(() => {
      if (probeInflight === run) probeInflight = null;
    });
    probeInflight = run;
    waitUntil(run);
  }
  const run = probeInflight;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, budgetMs);
  });
  return Promise.race([run, budget]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * How long a keyless source keeps reporting a failure before a status read asks it again. Without
 * this one timeout would pin the light red until a wallet holding that issuer's mints got priced.
 */
const PROBE_RETRY_MS = 60_000;

/** A keyless source is due when this instance has never asked it or its last answer was a failure that has aged past the retry window. */
function probeDue(health: SourceHealth, now: number): boolean {
  if (health.lastError !== null) return health.lastErrorAt === null || now - health.lastErrorAt >= PROBE_RETRY_MS;
  return health.lastOkAt === null;
}

async function runSourceProbe(): Promise<void> {
  const pyth = pythState();
  const now = Date.now();
  const due = {
    pyth: pyth.configured && pyth.authorized === null && pyth.lastError === null,
    jupiter: probeDue(jupiterHealth, now),
    prestocks: probeDue(prestocksHealth, now),
  };
  if (!due.pyth && !due.jupiter && !due.prestocks) return;
  const assets = listAssets();
  const stock =
    assets.find((a) => a.issuer === "xstocks" && a.underlyingSymbol === "TSLA" && a.pythEquityFeed) ?? assets.find((a) => a.pythEquityFeed);
  const tasks: Promise<unknown>[] = [];
  if (due.pyth && stock) tasks.push(fetchPyth([stock.pythWrapperFeed, stock.pythEquityFeed].filter((f): f is string => !!f)));
  if (due.jupiter && stock) tasks.push(fetchJupiter([stock.mint]));
  if (due.prestocks && assets.some((a) => a.issuer === "prestocks")) tasks.push(fetchPreStocks());
  for (const result of await Promise.allSettled(tasks)) {
    if (result.status === "rejected") logger.warn({ err: reason(result.reason) }, "Source probe failed");
  }
}

export function pythState(): {
  configured: boolean;
  authorized: boolean | null;
  lastError: string | null;
  /** Feeds that returned data under the current plan and feeds the plan refused, so far. */
  coveredFeeds: number;
  deniedFeeds: number;
} {
  const now = Date.now();
  let deniedFeeds = 0;
  for (const expires of pythDenied.values()) if (expires > now) deniedFeeds++;
  return {
    configured: !!env.pythApiKey,
    authorized: env.pythApiKey ? pythAuthorized : null,
    lastError: pythLastError,
    coveredFeeds: pythCovered.size,
    deniedFeeds,
  };
}
