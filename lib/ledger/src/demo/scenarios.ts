import type { LedgerEventInput, MultiplierObservation } from "../types";
import { getAssetBySymbol } from "../registry/registry";
import { multiplierAt } from "../engine/multiplier";
import { uiToRaw } from "../math";
import demoPricesSnapshot from "./prices.json";

export interface DemoWalletDefinition {
  id: string;
  label: string;
  description: string;
  holdingsPreview: string[];
  events: LedgerEventInput[];
  multipliers: MultiplierObservation[];
}

export const DEMO_IDS = ["demo-holder", "demo-trader", "demo-empty"] as const;

export function isDemoId(address: string): boolean {
  return (DEMO_IDS as readonly string[]).includes(address);
}

interface Series {
  symbol: string;
  points: Array<[string, number]>;
}

/** Scripted multiplier histories. The latest value matches the live multiplier observed in September 2026. */
const MULTIPLIER_SERIES: Series[] = [
  {
    symbol: "AAPLx",
    points: [
      ["2025-06-30T00:00:00Z", 1],
      ["2025-08-14T00:30:00Z", 1.000784],
      ["2025-11-13T00:30:00Z", 1.001432],
      ["2026-02-12T00:30:00Z", 1.002034],
      ["2026-05-14T00:30:00Z", 1.002664],
      ["2026-08-08T00:30:00Z", 1.003269],
    ],
  },
  {
    symbol: "NVDAx",
    points: [
      ["2025-06-30T00:00:00Z", 1],
      ["2025-10-02T00:30:00Z", 1.000226],
      ["2026-01-05T00:30:00Z", 1.000455],
      ["2026-04-02T00:30:00Z", 1.00069],
      ["2026-07-03T00:30:00Z", 1.000918],
      ["2026-09-10T00:30:00Z", 1.001701],
    ],
  },
  {
    symbol: "SPYx",
    points: [
      ["2025-06-30T00:00:00Z", 1],
      ["2025-07-21T04:00:00Z", 1.0009],
      ["2025-10-20T04:00:00Z", 1.0019],
      ["2026-01-20T04:00:00Z", 1.0029],
      ["2026-04-20T04:00:00Z", 1.003909],
      ["2026-06-18T04:00:00Z", 1.005715],
    ],
  },
  {
    symbol: "QQQx",
    points: [
      ["2025-06-30T00:00:00Z", 1],
      ["2025-09-22T00:00:00Z", 1.0007],
      ["2025-12-22T00:00:00Z", 1.0013],
      ["2026-03-23T00:00:00Z", 1.001955],
      ["2026-06-21T23:55:00Z", 1.002725],
    ],
  },
  {
    symbol: "MSFTon",
    points: [
      ["2025-09-12T00:00:00Z", 1],
      ["2025-12-11T18:00:00Z", 1.0016],
      ["2026-03-12T18:00:00Z", 1.0031],
      ["2026-06-11T18:00:00Z", 1.0045],
      ["2026-09-10T18:00:00Z", 1.005731],
    ],
  },
  {
    symbol: "AAPLon",
    points: [
      ["2025-09-12T00:00:00Z", 1],
      ["2025-11-13T18:00:00Z", 1.00075],
      ["2026-02-12T18:00:00Z", 1.0015],
      ["2026-05-14T18:00:00Z", 1.00235],
      ["2026-08-13T18:00:00Z", 1.0029],
      ["2026-09-18T17:54:15Z", 1.003376],
    ],
  },
  { symbol: "TSLAx", points: [["2025-06-30T00:00:00Z", 1]] },
  { symbol: "COINx", points: [["2025-06-30T00:00:00Z", 1]] },
  { symbol: "HOODx", points: [["2025-06-30T00:00:00Z", 1]] },
  { symbol: "CRCLx", points: [["2025-06-30T00:00:00Z", 1]] },
  { symbol: "MSTRx", points: [["2025-06-30T00:00:00Z", 1]] },
  { symbol: "SPACEX", points: [["2025-12-01T00:00:00Z", 1], ["2026-06-10T04:30:00Z", 5]] },
  { symbol: "OPENAI", points: [["2026-01-01T00:00:00Z", 1], ["2026-07-17T16:30:00Z", 1.4861347]] },
];

function seriesFor(symbol: string): MultiplierObservation[] {
  const series = MULTIPLIER_SERIES.find((s) => s.symbol === symbol);
  const asset = getAssetBySymbol(symbol);
  if (!series || !asset) return [];
  return series.points.map(([at, multiplier]) => ({
    mint: asset.mint,
    multiplier,
    pendingMultiplier: null,
    pendingEffectiveAt: null,
    observedAt: new Date(at),
    source: "demo" as const,
  }));
}

function fakeSignature(seed: string): string {
  // Deterministic pseudo signature so explorer links are visibly demo, not real.
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let out = "demo";
  let x = h;
  for (let i = 0; i < 40; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    out += alphabet[x % alphabet.length];
  }
  return out;
}

class ScenarioBuilder {
  readonly events: LedgerEventInput[] = [];
  readonly multipliers: MultiplierObservation[] = [];
  private readonly seen = new Set<string>();
  private n = 0;

  constructor(private readonly walletId: string) {}

  private track(symbol: string): void {
    if (this.seen.has(symbol)) return;
    this.seen.add(symbol);
    this.multipliers.push(...seriesFor(symbol));
  }

  private base(symbol: string, at: string, kind: LedgerEventInput["kind"]) {
    this.track(symbol);
    const asset = getAssetBySymbol(symbol);
    if (!asset) throw new Error(`Demo scenario references unknown symbol ${symbol}`);
    const blockTime = new Date(at);
    const id = `${this.walletId}:${++this.n}`;
    const multiplier = multiplierAt(this.multipliers.filter((m) => m.mint === asset.mint), blockTime) ?? 1;
    return { asset, blockTime, id, multiplier, signature: fakeSignature(id + kind) };
  }

  buy(symbol: string, at: string, tokens: number, pricePerShare: number, feeUsd = 0, venue = "Jupiter"): this {
    const { asset, blockTime, id, multiplier, signature } = this.base(symbol, at, "buy");
    const gross = tokens * multiplier * pricePerShare;
    this.events.push({
      id,
      signature,
      slot: null,
      blockTime,
      kind: "buy",
      mint: asset.mint,
      rawDelta: uiToRaw(tokens, asset.decimals),
      grossUsd: round2(gross),
      feeUsd,
      counterAsset: "USDC",
      counterAmount: round2(gross + feeUsd),
      multiplierAtEvent: multiplier,
      referencePriceUsd: pricePerShare,
      source: "demo",
      venue,
      note: null,
    });
    return this;
  }

  sell(symbol: string, at: string, tokens: number, pricePerShare: number, feeUsd = 0, venue = "Jupiter"): this {
    const { asset, blockTime, id, multiplier, signature } = this.base(symbol, at, "sell");
    const gross = tokens * multiplier * pricePerShare;
    this.events.push({
      id,
      signature,
      slot: null,
      blockTime,
      kind: "sell",
      mint: asset.mint,
      rawDelta: -uiToRaw(tokens, asset.decimals),
      grossUsd: round2(gross),
      feeUsd,
      counterAsset: "USDC",
      counterAmount: round2(gross - feeUsd),
      multiplierAtEvent: multiplier,
      referencePriceUsd: pricePerShare,
      source: "demo",
      venue,
      note: null,
    });
    return this;
  }

  transferIn(symbol: string, at: string, tokens: number, note: string): this {
    const { asset, blockTime, id, multiplier, signature } = this.base(symbol, at, "transfer_in");
    this.events.push({
      id,
      signature,
      slot: null,
      blockTime,
      kind: "transfer_in",
      mint: asset.mint,
      rawDelta: uiToRaw(tokens, asset.decimals),
      grossUsd: null,
      feeUsd: null,
      counterAsset: null,
      counterAmount: null,
      multiplierAtEvent: multiplier,
      referencePriceUsd: null,
      source: "demo",
      venue: null,
      note,
    });
    return this;
  }

  wrapperSwap(fromSymbol: string, toSymbol: string, at: string, tokensOut: number, pricePerShare: number, tokensIn: number): this {
    const out = this.base(fromSymbol, at, "wrapper_swap_out");
    const value = tokensOut * out.multiplier * pricePerShare;
    this.events.push({
      id: out.id,
      signature: out.signature,
      slot: null,
      blockTime: out.blockTime,
      kind: "wrapper_swap_out",
      mint: out.asset.mint,
      rawDelta: -uiToRaw(tokensOut, out.asset.decimals),
      grossUsd: round2(value),
      feeUsd: 0,
      counterAsset: toSymbol,
      counterAmount: tokensIn,
      multiplierAtEvent: out.multiplier,
      referencePriceUsd: pricePerShare,
      source: "demo",
      venue: "Jupiter",
      note: `Swapped into ${toSymbol}`,
    });
    const inn = this.base(toSymbol, at, "wrapper_swap_in");
    this.events.push({
      id: inn.id,
      signature: out.signature,
      slot: null,
      blockTime: inn.blockTime,
      kind: "wrapper_swap_in",
      mint: inn.asset.mint,
      rawDelta: uiToRaw(tokensIn, inn.asset.decimals),
      grossUsd: round2(value),
      feeUsd: 0,
      counterAsset: fromSymbol,
      counterAmount: tokensOut,
      multiplierAtEvent: inn.multiplier,
      referencePriceUsd: pricePerShare,
      source: "demo",
      venue: "Jupiter",
      note: `Swapped from ${fromSymbol}`,
    });
    return this;
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function buildHolder(): DemoWalletDefinition {
  const b = new ScenarioBuilder("demo-holder");
  b.buy("AAPLx", "2025-07-08T14:41:12Z", 24, 212.4, 1.02)
    .buy("NVDAx", "2025-07-15T15:02:40Z", 40, 171.3, 1.37)
    .buy("SPYx", "2025-08-05T13:50:03Z", 9, 632.8, 1.14)
    .buy("AAPLx", "2025-10-14T17:22:51Z", 12, 248.6, 0.6)
    .buy("MSFTon", "2025-11-20T15:31:09Z", 14, 481.2, 1.35)
    .buy("QQQx", "2026-01-09T14:35:28Z", 6, 618.4, 0.74)
    .transferIn("TSLAx", "2026-02-24T09:12:44Z", 12, "Received from another wallet. No purchase record in this wallet.")
    .buy("NVDAx", "2026-03-18T14:02:11Z", 20, 189.7, 0.76)
    .buy("AAPLx", "2026-04-22T18:44:37Z", 10, 291.15, 0.58);
  return {
    id: "demo-holder",
    label: "Long term holder",
    description:
      "Held xStocks and Ondo positions since 2025 with reinvested dividends visible as multiplier increases and one transfer with unknown basis.",
    holdingsPreview: ["AAPLx", "NVDAx", "SPYx", "MSFTon", "QQQx", "TSLAx"],
    events: b.events,
    multipliers: b.multipliers,
  };
}

function buildTrader(): DemoWalletDefinition {
  const b = new ScenarioBuilder("demo-trader");
  b.buy("HOODx", "2025-09-08T14:12:05Z", 120, 84.1, 2.02)
    .buy("AAPLx", "2025-11-18T15:47:33Z", 20, 262.3, 1.05)
    .buy("COINx", "2025-12-05T16:20:18Z", 60, 168.4, 2.02)
    .buy("NVDAx", "2026-01-12T14:31:02Z", 40, 176.2, 1.41)
    .buy("TSLAx", "2026-02-02T15:05:49Z", 15, 402.7, 1.21)
    .sell("COINx", "2026-02-19T18:10:27Z", 60, 221.6, 2.66)
    .sell("NVDAx", "2026-03-03T14:55:16Z", 25, 205.4, 1.03)
    .sell("TSLAx", "2026-04-08T19:41:58Z", 15, 355.2, 1.07)
    .buy("NVDAx", "2026-04-20T13:36:44Z", 30, 198.1, 1.19)
    .sell("NVDAx", "2026-05-14T17:28:09Z", 20, 190.3, 0.76)
    .buy("CRCLx", "2026-06-16T14:09:12Z", 200, 118.4, 4.74)
    .wrapperSwap("AAPLx", "AAPLon", "2026-06-30T16:00:41Z", 10, 318.2, 10.02)
    .buy("SPACEX", "2026-07-21T11:22:37Z", 100, 98.4, 1.97, "PreStocks pool")
    .buy("OPENAI", "2026-08-12T09:14:55Z", 3, 890.5, 0.53, "PreStocks pool")
    .buy("MSTRx", "2026-08-25T14:47:20Z", 50, 141.2, 1.41)
    .sell("HOODx", "2026-09-10T15:33:01Z", 60, 118.2, 1.42);
  return {
    id: "demo-trader",
    label: "Active trader",
    description:
      "Twelve months of buys and sells across xStocks, Ondo and PreStocks with realized gains and losses, a wrapper swap and open pre IPO exposure.",
    holdingsPreview: ["NVDAx", "HOODx", "CRCLx", "MSTRx", "AAPLx", "AAPLon", "SPACEX", "OPENAI"],
    events: b.events,
    multipliers: b.multipliers,
  };
}

function buildEmpty(): DemoWalletDefinition {
  return {
    id: "demo-empty",
    label: "Empty wallet",
    description: "A wallet with no tokenized stock history, to show the empty state.",
    holdingsPreview: [],
    events: [],
    multipliers: [],
  };
}

let cache: DemoWalletDefinition[] | null = null;

export function listDemoWallets(): DemoWalletDefinition[] {
  if (!cache) cache = [buildHolder(), buildTrader(), buildEmpty()];
  return cache;
}

export function getDemoWallet(id: string): DemoWalletDefinition | undefined {
  return listDemoWallets().find((w) => w.id === id);
}

export interface DemoPriceSnapshot {
  capturedAt: string;
  prices: Record<string, { price: number; referencePrice: number; dayChangePct: number }>;
}

export const DEMO_PRICES = demoPricesSnapshot as DemoPriceSnapshot;
