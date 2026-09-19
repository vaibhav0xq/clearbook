import { describe, expect, it } from "vitest";
import {
  runLedger,
  valuePositions,
  buildStatement,
  deriveCorporateActions,
  sessionAt,
  US_EQUITY_SESSIONS,
  uiToRaw,
  rawToUi,
  hashStatement,
  getDemoWallet,
  getAssetBySymbol,
  getAsset,
  type LedgerEventInput,
  type RegistryAsset,
} from "../src";

const AAPL: RegistryAsset = {
  mint: "AAPLMINT",
  symbol: "AAPLx",
  name: "Apple xStock",
  issuer: "xstocks",
  underlyingSymbol: "AAPL",
  underlyingName: "Apple",
  decimals: 8,
  tokenProgram: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  assetClass: "equity",
  pythEquityFeed: "Equity.US.AAPL/USD",
  pythWrapperFeed: "Crypto.AAPLX/USD",
  multiplierSupported: true,
  logoUrl: null,
  verified: true,
  exchange: "XNAS",
};

const resolveAsset = (mint: string) => (mint === AAPL.mint ? AAPL : undefined);

function ev(partial: Partial<LedgerEventInput> & Pick<LedgerEventInput, "id" | "kind" | "rawDelta" | "blockTime">): LedgerEventInput {
  return {
    signature: null,
    slot: null,
    mint: AAPL.mint,
    grossUsd: null,
    feeUsd: null,
    counterAsset: null,
    counterAmount: null,
    multiplierAtEvent: 1,
    referencePriceUsd: null,
    source: "demo",
    venue: null,
    note: null,
    ...partial,
  };
}

const d = (s: string) => new Date(s);

describe("raw unit helpers", () => {
  it("round trips ui amounts through raw units", () => {
    expect(uiToRaw(12.5, 8)).toBe(1_250_000_000n);
    expect(rawToUi(1_250_000_000n, 8)).toBe(12.5);
    expect(rawToUi(-1n, 8)).toBe(-0.00000001);
  });
});

describe("lot engine", () => {
  const events = [
    ev({ id: "b1", kind: "buy", rawDelta: uiToRaw(10, 8), blockTime: d("2025-01-01T00:00:00Z"), grossUsd: 1000, feeUsd: 1 }),
    ev({ id: "b2", kind: "buy", rawDelta: uiToRaw(10, 8), blockTime: d("2025-02-01T00:00:00Z"), grossUsd: 1500, feeUsd: 1 }),
    ev({ id: "b3", kind: "buy", rawDelta: uiToRaw(10, 8), blockTime: d("2025-03-01T00:00:00Z"), grossUsd: 1200, feeUsd: 1 }),
    ev({ id: "s1", kind: "sell", rawDelta: -uiToRaw(15, 8), blockTime: d("2026-03-15T00:00:00Z"), grossUsd: 2400, feeUsd: 2 }),
  ];

  it("relieves FIFO and computes realized gains net of fees", () => {
    const r = runLedger(events, { method: "fifo", resolveAsset });
    const sell = r.events.find((e) => e.input.id === "s1")!;
    // Proceeds 2398. Cost: full lot b1 (1001) plus half of b2 (750.5) = 1751.5
    expect(sell.realizedUsd).toBeCloseTo(2398 - 1751.5, 6);
    expect(sell.reliefs.map((x) => x.lotId)).toEqual(["b1", "b2"]);
    expect(sell.reliefs[0].term).toBe("long");
    const open = r.lots.filter((l) => l.rawRemaining > 0n);
    expect(open.map((l) => l.id)).toEqual(["b2", "b3"]);
    expect(r.rawBalances.get(AAPL.mint)).toBe(uiToRaw(15, 8));
  });

  it("relieves LIFO from the newest lot", () => {
    const r = runLedger(events, { method: "lifo", resolveAsset });
    const sell = r.events.find((e) => e.input.id === "s1")!;
    // Cost: full b3 (1201) plus half b2 (750.5)
    expect(sell.realizedUsd).toBeCloseTo(2398 - 1951.5, 6);
    expect(sell.reliefs.map((x) => x.lotId)).toEqual(["b3", "b2"]);
  });

  it("relieves HIFO from the most expensive lot", () => {
    const r = runLedger(events, { method: "hifo", resolveAsset });
    const sell = r.events.find((e) => e.input.id === "s1")!;
    // Cost: full b2 (1501) plus half b3 (600.5)
    expect(sell.realizedUsd).toBeCloseTo(2398 - 2101.5, 6);
    expect(sell.reliefs.map((x) => x.lotId)).toEqual(["b2", "b3"]);
  });

  it("creates an opening balance with unknown basis when history is missing", () => {
    const r = runLedger(
      [ev({ id: "s0", kind: "sell", rawDelta: -uiToRaw(5, 8), blockTime: d("2026-01-01T00:00:00Z"), grossUsd: 800 })],
      { method: "fifo", resolveAsset },
    );
    const sell = r.events[0];
    expect(sell.realizedUsd).toBeNull();
    expect(r.lots[0].basisStatus).toBe("unknown");
    expect(r.warnings.length).toBe(1);
  });

  it("does not recognize gains on transfers out and values transfers in at the reference price", () => {
    const r = runLedger(
      [
        ev({ id: "t1", kind: "transfer_in", rawDelta: uiToRaw(4, 8), blockTime: d("2026-01-01T00:00:00Z"), referencePriceUsd: 200 }),
        ev({ id: "t2", kind: "transfer_out", rawDelta: -uiToRaw(1, 8), blockTime: d("2026-02-01T00:00:00Z") }),
      ],
      { method: "fifo", resolveAsset },
    );
    expect(r.lots[0].costBasisUsd).toBe(800);
    expect(r.lots[0].basisStatus).toBe("estimated");
    expect(r.events[1].realizedUsd).toBeNull();
    expect(r.lots[0].rawRemaining).toBe(uiToRaw(3, 8));
  });

  it("applies the multiplier to exposure without changing lot cost", () => {
    const r = runLedger(
      [ev({ id: "b1", kind: "buy", rawDelta: uiToRaw(10, 8), blockTime: d("2025-01-01T00:00:00Z"), grossUsd: 2000, multiplierAtEvent: 1 })],
      { method: "fifo", resolveAsset },
    );
    const marks = new Map([[AAPL.mint, { mint: AAPL.mint, price: 250, referencePrice: 250, multiplier: 1.01 }]]);
    const [p] = valuePositions(r, marks, resolveAsset);
    expect(p.quantity).toBeCloseTo(10.1, 9);
    expect(p.marketValue).toBeCloseTo(2525, 6);
    expect(p.costBasis).toBe(2000);
    expect(p.unrealizedPnl).toBeCloseTo(525, 6);
    // 0.1 extra shares at 250 came from the multiplier increase
    expect(p.incomeEstimate).toBeCloseTo(25, 6);
    expect(p.basisStatus).toBe("complete");
  });
});

describe("corporate actions", () => {
  it("classifies small multiplier increases as reinvested dividends", () => {
    const actions = deriveCorporateActions(AAPL, [
      { mint: AAPL.mint, multiplier: 1, pendingMultiplier: null, pendingEffectiveAt: null, observedAt: d("2025-07-01T00:00:00Z"), source: "demo" },
      { mint: AAPL.mint, multiplier: 1.0008, pendingMultiplier: 1.0016, pendingEffectiveAt: d("2025-11-15T00:00:00Z"), observedAt: d("2025-08-15T00:00:00Z"), source: "demo" },
    ]);
    expect(actions.map((a) => a.kind).sort()).toEqual(["dividend_reinvested", "multiplier_pending"]);
    const div = actions.find((a) => a.kind === "dividend_reinvested")!;
    expect(div.changePct).toBeCloseTo(0.08, 6);
  });

  it("classifies large ratio changes as splits", () => {
    const actions = deriveCorporateActions(AAPL, [
      { mint: AAPL.mint, multiplier: 1, pendingMultiplier: null, pendingEffectiveAt: null, observedAt: d("2026-01-01T00:00:00Z"), source: "onchain" },
      { mint: AAPL.mint, multiplier: 5, pendingMultiplier: null, pendingEffectiveAt: null, observedAt: d("2026-06-10T00:00:00Z"), source: "onchain" },
    ]);
    expect(actions[0].kind).toBe("split");
  });
});

describe("market sessions", () => {
  it("resolves the US regular session and its next change", () => {
    // Wednesday 2026-09-16 15:00 UTC is 11:00 New York, regular session.
    const info = sessionAt(US_EQUITY_SESSIONS, d("2026-09-16T15:00:00Z"), "Nasdaq");
    expect(info.state).toBe("regular");
    expect(info.nextChangeAt?.toISOString()).toBe("2026-09-16T20:00:00.000Z");
    expect(info.nextState).toBe("post_market");
  });

  it("resolves pre market, after hours and closed weekends", () => {
    expect(sessionAt(US_EQUITY_SESSIONS, d("2026-09-16T09:00:00Z"), "Nasdaq").state).toBe("pre_market");
    expect(sessionAt(US_EQUITY_SESSIONS, d("2026-09-16T22:00:00Z"), "Nasdaq").state).toBe("post_market");
    const saturday = sessionAt(US_EQUITY_SESSIONS, d("2026-09-19T15:00:00Z"), "Nasdaq");
    expect(["closed", "overnight"]).toContain(saturday.state);
  });

  it("honours holiday overrides", () => {
    // 2026-11-27 early close at 13:00 New York (18:00 UTC).
    expect(sessionAt(US_EQUITY_SESSIONS, d("2026-11-27T17:30:00Z"), "Nasdaq").state).toBe("regular");
    expect(sessionAt(US_EQUITY_SESSIONS, d("2026-11-27T18:30:00Z"), "Nasdaq").state).not.toBe("regular");
  });
});

describe("statements", () => {
  it("aggregates a period and hashes deterministically", () => {
    const events = [
      ev({ id: "b1", kind: "buy", rawDelta: uiToRaw(10, 8), blockTime: d("2025-01-01T00:00:00Z"), grossUsd: 1000 }),
      ev({ id: "s1", kind: "sell", rawDelta: -uiToRaw(4, 8), blockTime: d("2026-02-10T00:00:00Z"), grossUsd: 600 }),
    ];
    const marks = new Map([
      [
        AAPL.mint,
        { mint: AAPL.mint, price: 180, referencePrice: 180, multiplier: 1, source: "demo", sourceLabel: "Demo", publishTime: null, status: "demo" },
      ],
    ]);
    const input = {
      address: "wallet",
      periodStart: d("2026-01-01T00:00:00Z"),
      periodEnd: d("2026-03-31T23:59:59Z"),
      method: "fifo" as const,
      events,
      marks,
      corporateActions: [],
      resolveAsset,
      generatedAt: d("2026-04-01T00:00:00Z"),
      dataMode: "demo" as const,
    };
    const s = buildStatement(input);
    expect(s.totals.realizedPnl).toBeCloseTo(200, 6);
    expect(s.totals.closingValue).toBeCloseTo(1080, 6);
    expect(s.totals.openingValue).toBeCloseTo(1800, 6);
    expect(s.positions[0].openingQuantity).toBe(10);
    expect(s.positions[0].closingQuantity).toBe(6);
    expect(s.closedLots).toHaveLength(1);
    expect(s.assumptions.some((a) => a.includes("first in, first out"))).toBe(true);
    expect(hashStatement(s)).toBe(hashStatement(buildStatement(input)));
  });
});

describe("demo scenarios", () => {
  it("builds the trader wallet against the real registry with realized gains", () => {
    const trader = getDemoWallet("demo-trader")!;
    const r = runLedger(trader.events, { method: "fifo", resolveAsset: getAsset });
    expect(r.warnings).toEqual([]);
    const coin = getAssetBySymbol("COINx")!;
    const coinSell = r.events.find((e) => e.input.mint === coin.mint && e.input.kind === "sell")!;
    expect(coinSell.realizedUsd).toBeGreaterThan(3000);
    const hood = getAssetBySymbol("HOODx")!;
    const hoodSell = r.events.find((e) => e.input.mint === hood.mint && e.input.kind === "sell")!;
    expect(hoodSell.reliefs[0].term).toBe("long");
    expect(r.rawBalances.get(coin.mint)).toBe(0n);
  });
});
