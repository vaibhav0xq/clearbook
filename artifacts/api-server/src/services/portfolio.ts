import {
  deriveCorporateActions,
  getAsset,
  getDemoWallet,
  isDemoId,
  issuerLabel,
  rawToUi,
  runLedger,
  valuePositions,
  daysBetween,
  type CorporateAction,
  type CostMethod,
  type EngineResult,
  type LedgerEventInput,
  type MultiplierObservation,
  type PositionValuation,
  type ProcessedEvent,
  type RegistryAsset,
} from "@workspace/ledger";
import type { Wallet } from "@workspace/db";
import { env } from "../lib/env";
import { explorerTxUrl, shortAddress } from "../lib/http";
import { ensureWallet } from "./indexer";
import { priceMints, type MarkBundle, type MultiplierView, type PricingSnapshot } from "./pricing";
import { countEvents, listMultiplierObservations, recordMultiplier } from "./store";

export interface WalletContext {
  address: string;
  wallet: Wallet;
  method: CostMethod;
  events: LedgerEventInput[];
  pricing: PricingSnapshot;
  engine: EngineResult;
  positions: PositionValuation[];
  simulatedTrades: number;
  now: Date;
}

function unknownAsset(mint: string): RegistryAsset {
  return {
    mint,
    symbol: mint.slice(0, 6),
    name: "Unknown token",
    issuer: "unknown",
    underlyingSymbol: "",
    underlyingName: "",
    decimals: 0,
    tokenProgram: "",
    assetClass: "equity",
    pythEquityFeed: null,
    pythWrapperFeed: null,
    multiplierSupported: false,
    logoUrl: null,
    verified: false,
    exchange: null,
  };
}

export const assetOf = (mint: string): RegistryAsset => getAsset(mint) ?? unknownAsset(mint);

function demoMultiplierOverrides(address: string): Map<string, MultiplierView> {
  const out = new Map<string, MultiplierView>();
  const demo = getDemoWallet(address);
  if (!demo) return out;
  for (const obs of demo.multipliers) {
    const cur = out.get(obs.mint);
    if (!cur || (cur.observedAt && new Date(cur.observedAt) < obs.observedAt)) {
      out.set(obs.mint, {
        current: obs.multiplier,
        pending: null,
        pendingEffectiveAt: null,
        observedAt: obs.observedAt.toISOString(),
        source: "demo",
      });
    }
  }
  return out;
}

export async function loadContext(address: string, method: CostMethod): Promise<WalletContext> {
  const { wallet, events } = await ensureWallet(address);
  const now = new Date();
  const mints = [...new Set(events.map((e) => e.mint))];
  const isDemo = isDemoId(address);
  const pricing = await priceMints(mints, {
    now,
    multiplierOverrides: isDemo ? demoMultiplierOverrides(address) : undefined,
    allowDemoFallback: isDemo,
  });
  if (!isDemo) {
    for (const bundle of pricing.marks.values()) {
      if (bundle.multiplier.source === "onchain" || bundle.multiplier.source === "jupiter") {
        await recordMultiplier({
          mint: bundle.mint,
          multiplier: bundle.multiplier.current,
          pendingMultiplier: bundle.multiplier.pending,
          pendingEffectiveAt: bundle.multiplier.pendingEffectiveAt ? new Date(bundle.multiplier.pendingEffectiveAt) : null,
          observedAt: now,
          source: bundle.multiplier.source,
        });
      }
    }
  }
  const multipliers = new Map<string, number>();
  for (const [mint, b] of pricing.marks) multipliers.set(mint, b.multiplier.current);
  const engine = runLedger(events, { method, multipliers, resolveAsset: getAsset });
  const marks = new Map(
    [...pricing.marks.values()].map((b) => [
      b.mint,
      { mint: b.mint, price: b.mark.price, referencePrice: b.referencePrice, multiplier: b.multiplier.current },
    ]),
  );
  const positions = valuePositions(engine, marks, getAsset);
  const simulatedTrades = await countEvents(address, "simulated");
  return { address, wallet, method, events, pricing, engine, positions, simulatedTrades, now };
}

export function walletStatusView(wallet: Wallet, simulatedTrades: number) {
  const demo = wallet.isDemo ? getDemoWallet(wallet.address) : undefined;
  return {
    address: wallet.address,
    displayAddress: wallet.isDemo ? (demo?.label ?? wallet.address) : shortAddress(wallet.address),
    isDemo: wallet.isDemo,
    demoLabel: demo?.label ?? null,
    state: wallet.state,
    source: wallet.source,
    message: wallet.message,
    eventsIndexed: wallet.eventsIndexed,
    signaturesScanned: wallet.signaturesScanned,
    unknownTransactions: wallet.unknownTransactions,
    lastIndexedAt: wallet.lastIndexedAt ? wallet.lastIndexedAt.toISOString() : null,
    simulatedTrades,
    warnings: wallet.warnings,
  };
}

function emptyBundle(mint: string, now: Date): MarkBundle {
  return {
    mint,
    mark: {
      price: null,
      currency: "USD",
      source: "none",
      sourceLabel: "No price source",
      feed: null,
      publishTime: null,
      ageSeconds: null,
      confidence: null,
      status: "unavailable",
      statusLabel: "No price",
    },
    referencePrice: null,
    referenceSource: "No reference",
    session: { state: "unknown", label: "Session unknown", venue: "Unknown venue", timezone: "UTC", nextChangeAt: null, nextState: null },
    multiplier: { current: 1, pending: null, pendingEffectiveAt: null, observedAt: now.toISOString(), source: "none" },
    premiumDiscount: { tokenPrice: null, referencePrice: null, referenceLabel: "No reference", differencePct: null, direction: "unknown" },
    dayChangePct: null,
    wrapperFeed: null,
    referenceFeed: null,
  };
}

export function pricingStatusView(ctx: WalletContext) {
  const p = ctx.pricing;
  const held = new Set(ctx.positions.filter((x) => x.rawQuantity > 0n).map((x) => x.mint));
  const feeds = [...p.marks.values()]
    .filter((b) => held.has(b.mint))
    .map((b) => ({
      mint: b.mint,
      symbol: assetOf(b.mint).symbol,
      wrapperFeed: b.wrapperFeed,
      referenceFeed: b.referenceFeed,
      mark: b.mark,
      session: b.session,
    }));
  return {
    provider: p.provider,
    providerLabel: p.providerLabel,
    mode: p.mode,
    headline: p.headline,
    detail: p.detail,
    asOf: p.asOf.toISOString(),
    pythConfigured: p.pythConfigured,
    pythAuthorized: p.pythAuthorized,
    feedsResolved: feeds.filter((f) => f.mark.price !== null).length,
    feedsTotal: feeds.length,
    usSession: p.usSession,
    feeds,
  };
}

export function portfolioView(ctx: WalletContext) {
  const held = ctx.positions.filter((p) => p.rawQuantity > 0n);
  const netValue = held.reduce((acc, p) => acc + (p.marketValue ?? 0), 0);
  const positions = held.map((p) => {
    const asset = assetOf(p.mint);
    const b = ctx.pricing.marks.get(p.mint) ?? emptyBundle(p.mint, ctx.now);
    return {
      mint: p.mint,
      symbol: asset.symbol,
      name: asset.name,
      issuer: asset.issuer,
      underlyingSymbol: asset.underlyingSymbol,
      assetClass: asset.assetClass,
      logoUrl: asset.logoUrl,
      quantity: p.quantity,
      rawQuantity: Number(p.rawQuantity),
      multiplier: b.multiplier,
      mark: b.mark,
      session: b.session,
      premiumDiscount: b.premiumDiscount,
      marketValue: p.marketValue,
      costBasis: p.costBasis,
      averageCost: p.averageCost,
      unrealizedPnl: p.unrealizedPnl,
      unrealizedPnlPct: p.unrealizedPnlPct,
      realizedPnl: p.realizedPnl,
      incomeEstimate: p.incomeEstimate,
      basisStatus: p.basisStatus,
      basisNote: p.basisNote,
      openLots: p.openLots,
      weightPct: p.marketValue !== null && netValue > 0 ? (p.marketValue / netValue) * 100 : null,
      dayChangePct: b.dayChangePct,
    };
  });

  const yearStart = new Date(Date.UTC(ctx.now.getUTCFullYear(), 0, 1));
  let realizedYtd = 0;
  for (const e of ctx.engine.events) {
    if (e.realizedUsd !== null && e.input.blockTime >= yearStart) realizedYtd += e.realizedUsd;
  }
  const costBasis = held.reduce((acc, p) => acc + (p.costBasis ?? 0), 0);
  const unrealized = held.reduce((acc, p) => acc + (p.unrealizedPnl ?? 0), 0);
  const allocationMap = new Map<string, { marketValue: number; positions: number }>();
  for (const p of held) {
    const issuer = assetOf(p.mint).issuer;
    const cur = allocationMap.get(issuer) ?? { marketValue: 0, positions: 0 };
    cur.marketValue += p.marketValue ?? 0;
    cur.positions += 1;
    allocationMap.set(issuer, cur);
  }
  const allocation = [...allocationMap.entries()]
    .map(([issuer, v]) => ({
      issuer,
      label: issuerLabel(issuer as RegistryAsset["issuer"]),
      marketValue: v.marketValue,
      weightPct: netValue > 0 ? (v.marketValue / netValue) * 100 : 0,
      positions: v.positions,
    }))
    .sort((a, b) => b.marketValue - a.marketValue);

  const assumptions: string[] = [];
  assumptions.push(`Lots relieved ${methodSentence(ctx.method)}. Change the method to compare outcomes; the ledger is replayed, nothing is stored per method.`);
  if (held.some((p) => p.basisStatus !== "complete")) {
    assumptions.push("Positions marked estimated or unknown carry lots without a readable purchase price. Their cost and unrealized gain are excluded from totals where unknown.");
  }
  const unvaluedDisposals = ctx.engine.events.filter(
    (e) => e.input.kind !== "transfer_out" && e.input.rawDelta < 0n && e.reliefs.length > 0 && e.realizedUsd === null,
  ).length;
  if (unvaluedDisposals > 0) {
    assumptions.push(
      `${unvaluedDisposals} disposal${unvaluedDisposals === 1 ? "" : "s"} could not be valued because the proceeds or the cost of the relieved lots are unknown. Realized P/L excludes them.`,
    );
  }
  if (ctx.simulatedTrades > 0) assumptions.push(`${ctx.simulatedTrades} simulated trade${ctx.simulatedTrades === 1 ? "" : "s"} included. They never touched the chain and can be reset.`);
  if (ctx.pricing.mode === "demo") assumptions.push("Prices come from a stored snapshot because live sources were unreachable.");
  assumptions.push(...ctx.engine.warnings);

  return {
    address: ctx.address,
    displayAddress: walletStatusView(ctx.wallet, ctx.simulatedTrades).displayAddress,
    isDemo: ctx.wallet.isDemo,
    asOf: ctx.now.toISOString(),
    method: ctx.method,
    currency: "USD",
    totals: {
      netValue,
      costBasis,
      unrealizedPnl: unrealized,
      unrealizedPnlPct: costBasis > 0 ? (unrealized / costBasis) * 100 : null,
      realizedPnl: ctx.positions.reduce((acc, p) => acc + p.realizedPnl, 0),
      realizedPnlYtd: realizedYtd,
      incomeEstimate: held.reduce((acc, p) => acc + (p.incomeEstimate ?? 0), 0),
      feesPaid: ctx.events.reduce((acc, e) => acc + (e.feeUsd ?? 0), 0),
      positionsCount: held.length,
      unpricedValueCount: held.filter((p) => p.price === null).length,
      unknownBasisCount: held.filter((p) => p.basisStatus !== "complete").length,
    },
    positions,
    allocation,
    pricing: pricingStatusView(ctx),
    walletStatus: walletStatusView(ctx.wallet, ctx.simulatedTrades),
    assumptions,
  };
}

function methodSentence(method: CostMethod): string {
  return method === "fifo" ? "first in, first out" : method === "lifo" ? "last in, first out" : "highest cost first";
}

export function lotsView(ctx: WalletContext, filters: { mint?: string; status?: "open" | "closed" | "all" }) {
  const status = filters.status ?? "all";
  return ctx.engine.lots
    .filter((l) => !filters.mint || l.mint === filters.mint)
    .filter((l) => status === "all" || (status === "open" ? l.rawRemaining > 0n : l.rawRemaining === 0n))
    .map((l) => {
      const asset = assetOf(l.mint);
      const b = ctx.pricing.marks.get(l.mint);
      const multiplier = b?.multiplier.current ?? 1;
      const price = b?.mark.price ?? null;
      const quantity = rawToUi(l.rawQuantity, asset.decimals) * (l.multiplierAtOpen ?? multiplier);
      const remainingQuantity = rawToUi(l.rawRemaining, asset.decimals) * multiplier;
      const remainingCost = l.costBasisUsd === null ? null : (l.costBasisUsd * Number(l.rawRemaining)) / Number(l.rawQuantity);
      const marketValue = price === null ? null : remainingQuantity * price;
      const endsAt = l.closedAt ?? ctx.now;
      const holdingDays = daysBetween(l.openedAt, endsAt);
      return {
        id: l.id,
        mint: l.mint,
        symbol: asset.symbol,
        issuer: asset.issuer,
        openedAt: l.openedAt.toISOString(),
        openSignature: l.openSignature,
        openKind: l.openKind,
        quantity,
        remainingQuantity,
        costPerShare: l.costBasisUsd === null || quantity === 0 ? null : l.costBasisUsd / quantity,
        costBasis: l.costBasisUsd,
        remainingCostBasis: remainingCost,
        marketValue,
        unrealizedPnl: marketValue !== null && remainingCost !== null ? marketValue - remainingCost : null,
        realizedPnl: l.realizedUsd,
        holdingDays,
        term: holdingDays > 365 ? "long" : "short",
        status: l.rawRemaining === 0n ? "closed" : l.rawRemaining === l.rawQuantity ? "open" : "partial",
        basisStatus: l.basisStatus,
        basisNote: l.basisNote,
        closedAt: l.closedAt ? l.closedAt.toISOString() : null,
        explorerUrl: l.openSignature && !l.openSignature.startsWith("demo") ? explorerTxUrl(l.openSignature, env.cluster) : null,
      };
    })
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt));
}

const KIND_LABELS: Record<LedgerEventInput["kind"], string> = {
  buy: "Buy",
  sell: "Sell",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  wrapper_swap_in: "Wrapper swap in",
  wrapper_swap_out: "Wrapper swap out",
  multiplier_change: "Multiplier change",
  unknown: "Unclassified",
};

export function eventView(e: ProcessedEvent, ctx: WalletContext) {
  const asset = assetOf(e.input.mint);
  const multiplier = e.input.multiplierAtEvent ?? ctx.pricing.marks.get(e.input.mint)?.multiplier.current ?? 1;
  const isDemoSig = e.input.signature?.startsWith("demo") ?? true;
  return {
    id: e.input.id,
    signature: e.input.signature,
    slot: e.input.slot,
    blockTime: e.input.blockTime.toISOString(),
    kind: e.input.kind,
    kindLabel: KIND_LABELS[e.input.kind],
    mint: e.input.mint,
    symbol: asset.symbol,
    issuer: asset.issuer,
    quantity: rawToUi(e.input.rawDelta, asset.decimals) * multiplier,
    rawQuantity: Number(e.input.rawDelta),
    pricePerShare: e.pricePerShare,
    grossAmount: e.input.grossUsd,
    fee: e.input.feeUsd,
    counterAsset: e.input.counterAsset,
    counterAmount: e.input.counterAmount,
    realizedPnl: e.realizedUsd,
    reliefs: e.reliefs.map((r) => ({
      lotId: r.lotId,
      quantity: rawToUi(r.rawQuantity, asset.decimals) * multiplier,
      costBasis: r.costBasisUsd,
      proceeds: r.proceedsUsd,
      realizedPnl: r.realizedUsd,
      term: r.term,
    })),
    source: e.input.source,
    venue: e.input.venue,
    note: e.input.note,
    explorerUrl: e.input.signature && !isDemoSig ? explorerTxUrl(e.input.signature, env.cluster) : null,
  };
}

export function activityView(ctx: WalletContext, filters: { mint?: string; limit?: number; cursor?: string }) {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const all = ctx.engine.events
    .filter((e) => !filters.mint || e.input.mint === filters.mint)
    .sort((a, b) => b.input.blockTime.getTime() - a.input.blockTime.getTime() || b.input.id.localeCompare(a.input.id));
  const start = filters.cursor ? Math.max(0, Number(filters.cursor) || 0) : 0;
  const page = all.slice(start, start + limit);
  return {
    items: page.map((e) => eventView(e, ctx)),
    nextCursor: start + limit < all.length ? String(start + limit) : null,
    total: all.length,
  };
}

const ACTION_LABELS: Record<CorporateAction["kind"], string> = {
  dividend_reinvested: "Dividend reinvested",
  split: "Stock split",
  reverse_split: "Reverse split",
  multiplier_pending: "Pending multiplier change",
  multiplier_change: "Multiplier change",
};

const ACTION_API_KIND: Record<CorporateAction["kind"], string> = {
  dividend_reinvested: "dividend_reinvested",
  split: "stock_split",
  reverse_split: "reverse_split",
  multiplier_pending: "pending_multiplier",
  multiplier_change: "multiplier_change",
};

export async function corporateActionsForContext(ctx: WalletContext): Promise<CorporateAction[]> {
  const mints = [...new Set(ctx.events.map((e) => e.mint))];
  let observations: MultiplierObservation[];
  if (ctx.wallet.isDemo) {
    observations = getDemoWallet(ctx.address)?.multipliers ?? [];
  } else {
    observations = await listMultiplierObservations(mints);
    // Add the pending change reported by the live source, if any.
    for (const b of ctx.pricing.marks.values()) {
      if (b.multiplier.pending !== null) {
        observations.push({
          mint: b.mint,
          multiplier: b.multiplier.current,
          pendingMultiplier: b.multiplier.pending,
          pendingEffectiveAt: b.multiplier.pendingEffectiveAt ? new Date(b.multiplier.pendingEffectiveAt) : null,
          observedAt: ctx.now,
          source: b.multiplier.source === "none" ? "jupiter" : b.multiplier.source,
        });
      }
    }
  }
  const actions: CorporateAction[] = [];
  for (const mint of mints) {
    const asset = getAsset(mint);
    if (!asset) continue;
    actions.push(...deriveCorporateActions(asset, observations.filter((o) => o.mint === mint)));
  }
  return actions.sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime());
}

export function corporateActionView(action: CorporateAction, ctx: WalletContext) {
  const asset = assetOf(action.mint);
  const held = ctx.positions.find((p) => p.mint === action.mint);
  const price = ctx.pricing.marks.get(action.mint)?.mark.price ?? null;
  const rawHeldAt = rawHeldAtTime(ctx, action.mint, action.effectiveAt ?? action.observedAt);
  const tokens = rawToUi(rawHeldAt, asset.decimals);
  const quantityBefore = tokens > 0 ? tokens * action.previousMultiplier : null;
  const quantityAfter = tokens > 0 ? tokens * action.newMultiplier : null;
  const valueEffect = quantityBefore !== null && quantityAfter !== null && price !== null ? (quantityAfter - quantityBefore) * price : null;
  return {
    id: action.id,
    mint: action.mint,
    symbol: asset.symbol,
    issuer: asset.issuer,
    kind: ACTION_API_KIND[action.kind],
    kindLabel: ACTION_LABELS[action.kind],
    previousMultiplier: action.previousMultiplier,
    newMultiplier: action.newMultiplier,
    ratio: action.newMultiplier / action.previousMultiplier,
    effectiveAt: (action.effectiveAt ?? action.observedAt).toISOString(),
    detectedAt: action.observedAt.toISOString(),
    quantityBefore,
    quantityAfter,
    valueEffect,
    confidence: action.confidence === "pending" ? "inferred" : action.source === "demo" ? "scripted" : action.confidence,
    source: action.source === "demo" ? "Scripted demo history" : action.source === "onchain" ? "Token-2022 mint state" : action.source === "jupiter" ? "Jupiter token data" : action.source,
    note: held && held.rawQuantity === 0n ? `${action.note} The wallet no longer holds this token.` : action.note,
    explorerUrl: null,
  };
}

function rawHeldAtTime(ctx: WalletContext, mint: string, at: Date): bigint {
  let raw = 0n;
  for (const e of ctx.events) {
    if (e.mint !== mint || e.kind === "unknown" || e.kind === "multiplier_change") continue;
    if (e.blockTime.getTime() <= at.getTime()) raw += e.rawDelta;
  }
  return raw < 0n ? 0n : raw;
}
