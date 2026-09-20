import { describe, expect, it } from "vitest";
import {
  collectTaxLots,
  renderTaxLotsCsv,
  runLedger,
  summarizeTaxYears,
  uiToRaw,
  type LedgerEventInput,
  type RegistryAsset,
} from "../src";

const AAPLX: RegistryAsset = {
  mint: "AAPLXMINT",
  symbol: "AAPLx",
  name: "Apple xStock",
  issuer: "xstocks",
  underlyingSymbol: "AAPL",
  underlyingName: "Apple",
  decimals: 8,
  tokenProgram: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  assetClass: "equity",
  pythEquityFeed: null,
  pythWrapperFeed: null,
  multiplierSupported: true,
  logoUrl: null,
  verified: true,
  exchange: "XNAS",
};

const AAPLON: RegistryAsset = { ...AAPLX, mint: "AAPLONMINT", symbol: "AAPLon", name: "Apple Ondo", issuer: "ondo", decimals: 6 };

const resolveAsset = (mint: string) => (mint === AAPLX.mint ? AAPLX : mint === AAPLON.mint ? AAPLON : undefined);

function ev(partial: Partial<LedgerEventInput> & Pick<LedgerEventInput, "id" | "kind" | "rawDelta" | "blockTime">): LedgerEventInput {
  return {
    signature: null,
    slot: null,
    mint: AAPLX.mint,
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
const x = (n: number) => uiToRaw(n, AAPLX.decimals);

describe("tax lot rows", () => {
  it("produces one row per lot relieved with 1099-B figures", () => {
    const events = [
      ev({ id: "b1", kind: "buy", rawDelta: x(10), blockTime: d("2025-01-10T00:00:00Z"), grossUsd: 1000, feeUsd: 1 }),
      ev({ id: "b2", kind: "buy", rawDelta: x(10), blockTime: d("2025-06-10T00:00:00Z"), grossUsd: 1500 }),
      ev({ id: "s1", kind: "sell", rawDelta: x(-15), blockTime: d("2026-03-01T00:00:00Z"), grossUsd: 3000, feeUsd: 3 }),
    ];
    const rows = collectTaxLots(runLedger(events, { method: "fifo", resolveAsset }), resolveAsset);
    expect(rows).toHaveLength(2);
    const [first, second] = rows;
    expect(first.lotId).toBe("b1");
    expect(first.acquiredAt?.toISOString()).toBe("2025-01-10T00:00:00.000Z");
    expect(first.quantity).toBe(10);
    expect(first.proceeds).toBeCloseTo(1998, 2);
    expect(first.costBasis).toBeCloseTo(1001, 2);
    expect(first.gainLoss).toBeCloseTo(997, 2);
    expect(first.term).toBe("long");
    expect(second.lotId).toBe("b2");
    expect(second.quantity).toBe(5);
    expect(second.costBasis).toBeCloseTo(750, 2);
    expect(second.term).toBe("short");
    expect(rows.every((r) => r.disposalId === "s1")).toBe(true);
    expect(first.description).toBe("10 AAPLx (xStocks token for AAPL)");
  });

  it("marks opening balances as unknown and skips transfers out", () => {
    const events = [
      ev({ id: "t1", kind: "transfer_out", rawDelta: x(-2), blockTime: d("2026-01-05T00:00:00Z") }),
      ev({ id: "s1", kind: "sell", rawDelta: x(-3), blockTime: d("2026-02-01T00:00:00Z"), grossUsd: 600 }),
    ];
    const rows = collectTaxLots(runLedger(events, { method: "fifo", resolveAsset }), resolveAsset);
    expect(rows).toHaveLength(1);
    expect(rows[0].acquiredAt).toBeNull();
    expect(rows[0].term).toBe("unknown");
    expect(rows[0].basisStatus).toBe("unknown");
    expect(rows[0].costBasis).toBeNull();
    expect(rows[0].gainLoss).toBeNull();
    expect(rows[0].proceeds).toBe(600);
  });

  it("flags a loss with a replacement buy inside 30 days, including another wrapper", () => {
    const events = [
      ev({ id: "b1", kind: "buy", rawDelta: x(10), blockTime: d("2026-01-01T00:00:00Z"), grossUsd: 2000 }),
      ev({ id: "s1", kind: "sell", rawDelta: x(-10), blockTime: d("2026-02-01T00:00:00Z"), grossUsd: 1500 }),
      ev({ id: "b2", kind: "buy", mint: AAPLON.mint, rawDelta: uiToRaw(4, AAPLON.decimals), blockTime: d("2026-02-20T00:00:00Z"), grossUsd: 600 }),
    ];
    const rows = collectTaxLots(runLedger(events, { method: "fifo", resolveAsset }), resolveAsset);
    expect(rows).toHaveLength(1);
    expect(rows[0].gainLoss).toBe(-500);
    expect(rows[0].washSaleFlag).toBe(true);
    expect(rows[0].washSaleNote).toBe("4 AAPLon acquired 2026-02-20, another wrapper of the same stock.");
  });

  it("does not flag the sold lot itself, a gain or a buy outside the window", () => {
    const events = [
      ev({ id: "b1", kind: "buy", rawDelta: x(10), blockTime: d("2026-01-20T00:00:00Z"), grossUsd: 2000 }),
      ev({ id: "s1", kind: "sell", rawDelta: x(-10), blockTime: d("2026-02-01T00:00:00Z"), grossUsd: 1500 }),
      ev({ id: "b2", kind: "buy", rawDelta: x(10), blockTime: d("2026-03-10T00:00:00Z"), grossUsd: 1500 }),
      ev({ id: "s2", kind: "sell", rawDelta: x(-10), blockTime: d("2026-03-12T00:00:00Z"), grossUsd: 1800 }),
    ];
    const rows = collectTaxLots(runLedger(events, { method: "fifo", resolveAsset }), resolveAsset);
    expect(rows).toHaveLength(2);
    expect(rows[0].gainLoss).toBe(-500);
    expect(rows[0].washSaleFlag).toBe(false);
    expect(rows[1].gainLoss).toBe(300);
    expect(rows[1].washSaleFlag).toBe(false);
  });

  it("leaves proceeds and gain blank when the cash leg of a sale could not be read", () => {
    const events = [
      ev({ id: "b1", kind: "buy", rawDelta: x(10), blockTime: d("2026-01-01T00:00:00Z"), grossUsd: 1000 }),
      ev({ id: "s1", kind: "sell", rawDelta: x(-4), blockTime: d("2026-02-01T00:00:00Z"), grossUsd: null }),
      ev({ id: "s2", kind: "sell", rawDelta: x(-2), blockTime: d("2026-03-01T00:00:00Z"), grossUsd: 300 }),
    ];
    const rows = collectTaxLots(runLedger(events, { method: "fifo", resolveAsset }), resolveAsset);
    expect(rows[0].proceeds).toBeNull();
    expect(rows[0].costBasis).toBe(400);
    expect(rows[0].gainLoss).toBeNull();
    const [year] = summarizeTaxYears(rows);
    expect(year.unknownProceedsRows).toBe(1);
    expect(year.proceeds).toBe(300);
    expect(year.costBasis).toBe(600);
    expect(year.gainLoss).toBe(100);
    const csv = renderTaxLotsCsv(rows, { address: "wallet", year: 2026, method: "fifo", generatedAt: d("2026-09-20T00:00:00Z"), dataMode: "demo" });
    expect(csv).toContain("2026-02-01,Unknown,400,,Short term");
  });

  it("uses the multiplier in force at the sale for live events without one of their own", () => {
    const events = [
      ev({ id: "b1", kind: "buy", rawDelta: x(10), blockTime: d("2026-01-01T00:00:00Z"), grossUsd: 1000, multiplierAtEvent: null }),
      ev({ id: "s1", kind: "sell", rawDelta: x(-10), blockTime: d("2026-02-01T00:00:00Z"), grossUsd: 1200, multiplierAtEvent: null }),
    ];
    const multipliers = new Map([[AAPLX.mint, 1.02]]);
    const rows = collectTaxLots(runLedger(events, { method: "fifo", resolveAsset, multipliers }), resolveAsset);
    expect(rows[0].quantity).toBeCloseTo(10.2, 6);
    expect(rows[0].description).toBe("10.2 AAPLx (xStocks token for AAPL)");
  });

  it("treats a sale on the calendar anniversary as short term across a leap day", () => {
    const events = [
      ev({ id: "b1", kind: "buy", rawDelta: x(4), blockTime: d("2027-03-01T12:00:00Z"), grossUsd: 400 }),
      ev({ id: "s1", kind: "sell", rawDelta: x(-2), blockTime: d("2028-03-01T09:00:00Z"), grossUsd: 300 }),
      ev({ id: "s2", kind: "sell", rawDelta: x(-2), blockTime: d("2028-03-02T09:00:00Z"), grossUsd: 300 }),
    ];
    const rows = collectTaxLots(runLedger(events, { method: "fifo", resolveAsset }), resolveAsset);
    expect(rows.map((r) => r.term)).toEqual(["short", "long"]);
  });

  it("moves a 29 February anniversary to 28 February in a common year", () => {
    const events = [
      ev({ id: "b1", kind: "buy", rawDelta: x(4), blockTime: d("2028-02-29T12:00:00Z"), grossUsd: 400 }),
      ev({ id: "s1", kind: "sell", rawDelta: x(-2), blockTime: d("2029-02-28T09:00:00Z"), grossUsd: 300 }),
      ev({ id: "s2", kind: "sell", rawDelta: x(-2), blockTime: d("2029-03-01T09:00:00Z"), grossUsd: 300 }),
    ];
    const rows = collectTaxLots(runLedger(events, { method: "fifo", resolveAsset }), resolveAsset);
    expect(rows.map((r) => r.term)).toEqual(["short", "long"]);
  });

  it("keeps the rows of one sale adding up to its proceeds after rounding", () => {
    const events = [
      ev({ id: "b1", kind: "buy", rawDelta: x(1), blockTime: d("2026-01-01T00:00:00Z"), grossUsd: 1 }),
      ev({ id: "b2", kind: "buy", rawDelta: x(1), blockTime: d("2026-01-02T00:00:00Z"), grossUsd: 1 }),
      ev({ id: "b3", kind: "buy", rawDelta: x(1), blockTime: d("2026-01-03T00:00:00Z"), grossUsd: 1 }),
      ev({ id: "s1", kind: "sell", rawDelta: x(-3), blockTime: d("2026-02-01T00:00:00Z"), grossUsd: 0.02 }),
    ];
    const rows = collectTaxLots(runLedger(events, { method: "fifo", resolveAsset }), resolveAsset);
    expect(rows.map((r) => r.proceeds)).toEqual([0.01, 0.01, 0]);
    expect(rows[2].gainLoss).toBe(-1);
    expect(summarizeTaxYears(rows)[0].proceeds).toBe(0.02);
  });

  it("values a replacement buy in another wrapper at that wrapper's multiplier", () => {
    const events = [
      ev({ id: "b1", kind: "buy", rawDelta: x(10), blockTime: d("2026-01-01T00:00:00Z"), grossUsd: 2000, multiplierAtEvent: null }),
      ev({ id: "s1", kind: "sell", rawDelta: x(-10), blockTime: d("2026-02-01T00:00:00Z"), grossUsd: 1500, multiplierAtEvent: null }),
      ev({ id: "b2", kind: "buy", mint: AAPLON.mint, rawDelta: uiToRaw(4, AAPLON.decimals), blockTime: d("2026-02-10T00:00:00Z"), grossUsd: 600, multiplierAtEvent: null }),
    ];
    const multipliers = new Map([
      [AAPLX.mint, 1.5],
      [AAPLON.mint, 1.25],
    ]);
    const rows = collectTaxLots(runLedger(events, { method: "fifo", resolveAsset, multipliers }), resolveAsset);
    expect(rows[0].quantity).toBe(15);
    expect(rows[0].washSaleNote).toBe("5 AAPLon acquired 2026-02-10, another wrapper of the same stock.");
  });

  it("counts the wash sale window in calendar days", () => {
    const events = [
      ev({ id: "b1", kind: "buy", rawDelta: x(10), blockTime: d("2026-01-01T00:00:00Z"), grossUsd: 2000 }),
      ev({ id: "s1", kind: "sell", rawDelta: x(-5), blockTime: d("2026-02-01T01:00:00Z"), grossUsd: 500 }),
      ev({ id: "b2", kind: "buy", rawDelta: x(1), blockTime: d("2026-03-03T23:00:00Z"), grossUsd: 100 }),
      ev({ id: "s2", kind: "sell", rawDelta: x(-5), blockTime: d("2026-06-01T01:00:00Z"), grossUsd: 500 }),
      ev({ id: "b3", kind: "buy", rawDelta: x(1), blockTime: d("2026-07-02T00:30:00Z"), grossUsd: 100 }),
    ];
    const rows = collectTaxLots(runLedger(events, { method: "fifo", resolveAsset }), resolveAsset);
    expect(rows[0].washSaleFlag).toBe(true);
    expect(rows[1].washSaleFlag).toBe(false);
  });

  it("summarizes by UTC tax year and renders a CSV for one year", () => {
    const events = [
      ev({ id: "b1", kind: "buy", rawDelta: x(10), blockTime: d("2024-12-01T00:00:00Z"), grossUsd: 1000 }),
      ev({ id: "s1", kind: "sell", rawDelta: x(-4), blockTime: d("2025-12-31T23:30:00Z"), grossUsd: 800, source: "simulated" }),
      ev({ id: "s2", kind: "sell", rawDelta: x(-6), blockTime: d("2026-01-01T00:30:00Z"), grossUsd: 1200 }),
    ];
    const rows = collectTaxLots(runLedger(events, { method: "fifo", resolveAsset }), resolveAsset);
    const years = summarizeTaxYears(rows);
    expect(years.map((y) => y.year)).toEqual([2026, 2025]);
    expect(years[1].simulatedRows).toBe(1);
    expect(years[1].proceeds).toBe(800);
    expect(years[1].gainLoss).toBe(400);
    expect(years[1].longTermGainLoss).toBe(400);
    expect(years[1].shortTermGainLoss).toBe(0);
    expect(years[0].longTermGainLoss).toBe(600);
    const csv = renderTaxLotsCsv(rows, { address: "wallet", year: 2025, method: "fifo", generatedAt: d("2026-09-20T00:00:00Z"), dataMode: "demo" });
    expect(csv).toContain("Tax year,2025");
    expect(csv).toContain("Description of property (1a)");
    expect(csv.split("\n").filter((l) => l.startsWith("4 AAPLx"))).toHaveLength(1);
    expect(csv).not.toContain("6 AAPLx");
    expect(csv).toContain(",Simulated,");
  });
});
