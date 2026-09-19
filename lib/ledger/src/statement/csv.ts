import type { StatementData } from "./build";
import { methodLabel } from "./build";

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(6).replace(/\.?0+$/, "");
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function row(values: unknown[]): string {
  return values.map(cell).join(",");
}

/** Renders a statement as a sectioned CSV file. */
export function renderStatementCsv(s: StatementData, hash: string): string {
  const lines: string[] = [];
  lines.push(row(["Clearbook statement"]));
  lines.push(row(["Wallet", s.address]));
  lines.push(row(["Period start", s.periodStart]));
  lines.push(row(["Period end", s.periodEnd]));
  lines.push(row(["Cost method", methodLabel(s.method)]));
  lines.push(row(["Generated at", s.generatedAt]));
  lines.push(row(["Data mode", s.dataMode]));
  lines.push(row(["Statement hash", hash]));
  lines.push("");

  lines.push(row(["Summary"]));
  lines.push(row(["Metric", "USD"]));
  const t = s.totals;
  lines.push(row(["Opening value", t.openingValue]));
  lines.push(row(["Closing value", t.closingValue]));
  lines.push(row(["Cash invested in period", t.netCashInvested]));
  lines.push(row(["Cash withdrawn in period", t.netCashWithdrawn]));
  lines.push(row(["Realized gain or loss", t.realizedPnl]));
  lines.push(row(["Realized short term", t.realizedShortTerm]));
  lines.push(row(["Realized long term", t.realizedLongTerm]));
  lines.push(row(["Unrealized gain or loss", t.unrealizedPnl]));
  lines.push(row(["Cost basis of open positions", t.costBasis]));
  lines.push(row(["Income estimate", t.incomeEstimate]));
  lines.push(row(["Fees paid", t.feesPaid]));
  lines.push(row(["Positions", t.positionsCount]));
  lines.push(row(["Positions without price", t.unpricedCount]));
  lines.push(row(["Positions with estimated or unknown basis", t.unknownBasisCount]));
  lines.push("");

  lines.push(row(["Positions"]));
  lines.push(
    row([
      "Symbol",
      "Name",
      "Issuer",
      "Mint",
      "Opening quantity",
      "Closing quantity",
      "Closing price",
      "Closing value",
      "Cost basis",
      "Average cost",
      "Unrealized",
      "Realized in period",
      "Income estimate",
      "Basis status",
      "Price source",
      "Price time",
    ]),
  );
  for (const p of s.positions) {
    lines.push(
      row([
        p.symbol,
        p.name,
        p.issuer,
        p.mint,
        p.openingQuantity,
        p.closingQuantity,
        p.closingPrice,
        p.closingValue,
        p.costBasis,
        p.averageCost,
        p.unrealizedPnl,
        p.realizedPnlInPeriod,
        p.incomeEstimate,
        p.basisStatus,
        p.priceSource,
        p.priceTime,
      ]),
    );
  }
  lines.push("");

  lines.push(row(["Activity"]));
  lines.push(
    row([
      "Time",
      "Type",
      "Symbol",
      "Quantity",
      "Price per share",
      "Gross USD",
      "Fee USD",
      "Realized",
      "Counter asset",
      "Signature",
      "Source",
      "Note",
    ]),
  );
  for (const a of s.activity) {
    lines.push(
      row([
        a.blockTime,
        a.kind,
        a.symbol,
        a.quantity,
        a.pricePerShare,
        a.grossUsd,
        a.feeUsd,
        a.realizedUsd,
        a.counterAsset,
        a.signature,
        a.source,
        a.note,
      ]),
    );
  }
  lines.push("");

  lines.push(row(["Closed lots"]));
  lines.push(row(["Lot", "Symbol", "Opened", "Closed", "Quantity", "Cost basis", "Proceeds", "Realized", "Term"]));
  for (const l of s.closedLots) {
    lines.push(row([l.lotId, l.symbol, l.openedAt, l.closedAt, l.quantity, l.costBasis, l.proceeds, l.realized, l.term]));
  }
  lines.push("");

  lines.push(row(["Corporate actions"]));
  lines.push(row(["Observed", "Effective", "Type", "Mint", "Previous multiplier", "New multiplier", "Change %", "Confidence", "Note"]));
  for (const c of s.corporateActions) {
    lines.push(
      row([c.observedAt, c.effectiveAt, c.kind, c.mint, c.previousMultiplier, c.newMultiplier, c.changePct, c.confidence, c.note]),
    );
  }
  lines.push("");

  lines.push(row(["Assumptions"]));
  for (const a of s.assumptions) lines.push(row([a]));
  lines.push("");
  lines.push(row(["Data sources"]));
  for (const src of s.sources) lines.push(row([src]));
  return lines.join("\r\n") + "\r\n";
}
