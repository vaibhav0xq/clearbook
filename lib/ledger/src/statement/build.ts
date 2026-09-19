import type { CostMethod, LedgerEventInput, LotState, ProcessedEvent, RegistryAsset } from "../types";
import { runLedger } from "../engine/lots";
import { valuePositions, type MarkInput, type PositionValuation } from "../engine/positions";
import type { CorporateAction } from "../engine/multiplier";
import { rawToUi, roundUsd } from "../math";

export interface StatementMark extends MarkInput {
  source: string;
  sourceLabel: string;
  publishTime: Date | null;
  status: string;
}

export interface StatementBuildInput {
  address: string;
  periodStart: Date;
  periodEnd: Date;
  method: CostMethod;
  events: LedgerEventInput[];
  marks: Map<string, StatementMark>;
  corporateActions: CorporateAction[];
  resolveAsset: (mint: string) => RegistryAsset | undefined;
  generatedAt: Date;
  dataMode: "live" | "fallback" | "demo";
}

export interface StatementPositionRow {
  mint: string;
  symbol: string;
  name: string;
  issuer: string;
  openingQuantity: number;
  closingQuantity: number;
  closingPrice: number | null;
  closingValue: number | null;
  costBasis: number | null;
  averageCost: number | null;
  unrealizedPnl: number | null;
  realizedPnlInPeriod: number;
  incomeEstimate: number | null;
  basisStatus: string;
  priceSource: string;
  priceTime: Date | null;
}

export interface StatementActivityRow {
  id: string;
  blockTime: Date;
  kind: string;
  symbol: string;
  mint: string;
  quantity: number;
  pricePerShare: number | null;
  grossUsd: number | null;
  feeUsd: number | null;
  realizedUsd: number | null;
  counterAsset: string | null;
  signature: string | null;
  source: string;
  note: string | null;
}

export interface StatementClosedLotRow {
  lotId: string;
  symbol: string;
  openedAt: Date;
  closedAt: Date;
  quantity: number;
  costBasis: number | null;
  proceeds: number;
  realized: number | null;
  term: "short" | "long";
}

export interface StatementData {
  address: string;
  periodStart: Date;
  periodEnd: Date;
  method: CostMethod;
  generatedAt: Date;
  dataMode: string;
  totals: {
    openingValue: number | null;
    closingValue: number;
    netCashInvested: number;
    netCashWithdrawn: number;
    realizedPnl: number;
    realizedShortTerm: number;
    realizedLongTerm: number;
    unrealizedPnl: number;
    costBasis: number;
    incomeEstimate: number;
    feesPaid: number;
    positionsCount: number;
    unpricedCount: number;
    unknownBasisCount: number;
  };
  positions: StatementPositionRow[];
  activity: StatementActivityRow[];
  closedLots: StatementClosedLotRow[];
  corporateActions: CorporateAction[];
  assumptions: string[];
  sources: string[];
}

const METHOD_LABEL: Record<CostMethod, string> = {
  fifo: "first in, first out",
  lifo: "last in, first out",
  hifo: "highest cost first",
};

export function methodLabel(method: CostMethod): string {
  return METHOD_LABEL[method];
}

export function buildStatement(input: StatementBuildInput): StatementData {
  const { resolveAsset } = input;
  const multipliers = new Map<string, number>();
  for (const [mint, mark] of input.marks) multipliers.set(mint, mark.multiplier);

  const full = runLedger(input.events, { method: input.method, asOf: input.periodEnd, multipliers, resolveAsset });
  const opening = runLedger(input.events, {
    method: input.method,
    asOf: new Date(input.periodStart.getTime() - 1),
    multipliers,
    resolveAsset,
  });
  const closingPositions = valuePositions(full, input.marks, resolveAsset);
  const openingPositions = valuePositions(opening, input.marks, resolveAsset);
  const openingByMint = new Map(openingPositions.map((p) => [p.mint, p]));

  const inPeriod = (d: Date): boolean =>
    d.getTime() >= input.periodStart.getTime() && d.getTime() <= input.periodEnd.getTime();
  const periodEvents = full.events.filter((e) => inPeriod(e.input.blockTime));

  const realizedByMint = new Map<string, number>();
  let realizedShort = 0;
  let realizedLong = 0;
  for (const e of periodEvents) {
    for (const r of e.reliefs) {
      if (r.realizedUsd === null) continue;
      realizedByMint.set(e.input.mint, (realizedByMint.get(e.input.mint) ?? 0) + r.realizedUsd);
      if (r.term === "long") realizedLong += r.realizedUsd;
      else realizedShort += r.realizedUsd;
    }
  }

  const positions: StatementPositionRow[] = closingPositions
    .filter((p) => p.rawQuantity > 0n || (realizedByMint.get(p.mint) ?? 0) !== 0 || openingByMint.has(p.mint))
    .map((p) => toPositionRow(p, openingByMint.get(p.mint), realizedByMint.get(p.mint) ?? 0, input, resolveAsset));

  const activity: StatementActivityRow[] = periodEvents
    .filter((e) => e.input.kind !== "multiplier_change")
    .map((e) => toActivityRow(e, resolveAsset));

  const closedLots = collectClosedLots(full, periodEvents, resolveAsset, inPeriod);

  const cashIn = periodEvents
    .filter((e) => e.input.kind === "buy" && e.input.grossUsd !== null)
    .reduce((acc, e) => acc + (e.input.grossUsd ?? 0) + (e.input.feeUsd ?? 0), 0);
  const cashOut = periodEvents
    .filter((e) => e.input.kind === "sell" && e.input.grossUsd !== null)
    .reduce((acc, e) => acc + (e.input.grossUsd ?? 0) - (e.input.feeUsd ?? 0), 0);
  const fees = periodEvents.reduce((acc, e) => acc + (e.input.feeUsd ?? 0), 0);

  const closingValue = closingPositions.reduce((acc, p) => acc + (p.marketValue ?? 0), 0);
  const openingValue = openingPositions.length
    ? openingPositions.reduce((acc, p) => acc + (p.marketValue ?? 0), 0)
    : 0;
  const unrealized = closingPositions.reduce((acc, p) => acc + (p.unrealizedPnl ?? 0), 0);
  const costBasis = closingPositions.reduce((acc, p) => acc + (p.costBasis ?? 0), 0);
  const income = closingPositions.reduce((acc, p) => acc + (p.incomeEstimate ?? 0), 0);
  const held = closingPositions.filter((p) => p.rawQuantity > 0n);

  const corporateActions = input.corporateActions.filter((a) => inPeriod(a.observedAt) || a.confidence === "pending");

  return {
    address: input.address,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    method: input.method,
    generatedAt: input.generatedAt,
    dataMode: input.dataMode,
    totals: {
      openingValue: roundUsd(openingValue),
      closingValue: roundUsd(closingValue),
      netCashInvested: roundUsd(cashIn),
      netCashWithdrawn: roundUsd(cashOut),
      realizedPnl: roundUsd(realizedShort + realizedLong),
      realizedShortTerm: roundUsd(realizedShort),
      realizedLongTerm: roundUsd(realizedLong),
      unrealizedPnl: roundUsd(unrealized),
      costBasis: roundUsd(costBasis),
      incomeEstimate: roundUsd(income),
      feesPaid: roundUsd(fees),
      positionsCount: held.length,
      unpricedCount: held.filter((p) => p.price === null).length,
      unknownBasisCount: held.filter((p) => p.basisStatus !== "complete").length,
    },
    positions,
    activity,
    closedLots,
    corporateActions,
    assumptions: buildAssumptions(input, closingPositions, full.warnings, periodEvents),
    sources: buildSources(input),
  };
}

function toPositionRow(
  p: PositionValuation,
  openingPosition: PositionValuation | undefined,
  realizedInPeriod: number,
  input: StatementBuildInput,
  resolveAsset: (mint: string) => RegistryAsset | undefined,
): StatementPositionRow {
  const asset = resolveAsset(p.mint);
  const mark = input.marks.get(p.mint);
  return {
    mint: p.mint,
    symbol: asset?.symbol ?? p.mint.slice(0, 6),
    name: asset?.name ?? "Unknown token",
    issuer: asset?.issuer ?? "unknown",
    openingQuantity: openingPosition?.quantity ?? 0,
    closingQuantity: p.quantity,
    closingPrice: p.price,
    closingValue: p.marketValue === null ? null : roundUsd(p.marketValue),
    costBasis: p.costBasis === null ? null : roundUsd(p.costBasis),
    averageCost: p.averageCost,
    unrealizedPnl: p.unrealizedPnl === null ? null : roundUsd(p.unrealizedPnl),
    realizedPnlInPeriod: roundUsd(realizedInPeriod),
    incomeEstimate: p.incomeEstimate === null ? null : roundUsd(p.incomeEstimate),
    basisStatus: p.basisStatus,
    priceSource: mark?.sourceLabel ?? "No price",
    priceTime: mark?.publishTime ?? null,
  };
}

function toActivityRow(e: ProcessedEvent, resolveAsset: (mint: string) => RegistryAsset | undefined): StatementActivityRow {
  const asset = resolveAsset(e.input.mint);
  const decimals = asset?.decimals ?? 0;
  return {
    id: e.input.id,
    blockTime: e.input.blockTime,
    kind: e.input.kind,
    symbol: asset?.symbol ?? e.input.mint.slice(0, 6),
    mint: e.input.mint,
    quantity: rawToUi(e.input.rawDelta, decimals) * (e.input.multiplierAtEvent ?? 1),
    pricePerShare: e.pricePerShare,
    grossUsd: e.input.grossUsd,
    feeUsd: e.input.feeUsd,
    realizedUsd: e.realizedUsd === null ? null : roundUsd(e.realizedUsd),
    counterAsset: e.input.counterAsset,
    signature: e.input.signature,
    source: e.input.source,
    note: e.input.note,
  };
}

function collectClosedLots(
  full: ReturnType<typeof runLedger>,
  periodEvents: ProcessedEvent[],
  resolveAsset: (mint: string) => RegistryAsset | undefined,
  inPeriod: (d: Date) => boolean,
): StatementClosedLotRow[] {
  const lotIndex = new Map<string, LotState>(full.lots.map((l) => [l.id, l]));
  const rows: StatementClosedLotRow[] = [];
  for (const e of periodEvents) {
    if (!inPeriod(e.input.blockTime)) continue;
    for (const r of e.reliefs) {
      const lot = lotIndex.get(r.lotId);
      const asset = resolveAsset(e.input.mint);
      const decimals = asset?.decimals ?? 0;
      rows.push({
        lotId: r.lotId,
        symbol: asset?.symbol ?? e.input.mint.slice(0, 6),
        openedAt: r.openedAt,
        closedAt: e.input.blockTime,
        quantity: rawToUi(r.rawQuantity, decimals) * (lot?.multiplierAtOpen ?? e.input.multiplierAtEvent ?? 1),
        costBasis: r.costBasisUsd === null ? null : roundUsd(r.costBasisUsd),
        proceeds: roundUsd(r.proceedsUsd),
        realized: r.realizedUsd === null ? null : roundUsd(r.realizedUsd),
        term: r.term,
      });
    }
  }
  return rows;
}

function buildAssumptions(
  input: StatementBuildInput,
  positions: PositionValuation[],
  warnings: string[],
  periodEvents: ProcessedEvent[],
): string[] {
  const list: string[] = [];
  list.push(
    `Lots are relieved ${METHOD_LABEL[input.method]}. Realized gains are proceeds net of fees minus the cost basis of the lots relieved.`,
  );
  list.push(
    "Quantities are shares of exposure: raw token units scaled by the Token-2022 multiplier in force. Cost basis is attached to raw units, so multiplier increases grow the shares in a lot without changing its cost.",
  );
  const unknown = positions.filter((p) => p.rawQuantity > 0n && p.basisStatus !== "complete");
  if (unknown.length > 0) {
    list.push(
      `${unknown.length} position${unknown.length === 1 ? "" : "s"} carr${unknown.length === 1 ? "ies" : "y"} lots with estimated or unknown basis. Their cost and unrealized gain are excluded from the totals where unknown.`,
    );
  }
  if (periodEvents.some((e) => e.input.kind === "transfer_in")) {
    list.push(
      "Tokens received by transfer are valued at the reference price at receipt when one is available, otherwise their basis is unknown.",
    );
  }
  if (periodEvents.some((e) => e.input.kind === "transfer_out")) {
    list.push("Tokens sent out are removed at cost. No gain or loss is recognized on transfers out.");
  }
  if (periodEvents.some((e) => e.input.kind.startsWith("wrapper_swap"))) {
    list.push(
      "Swaps between wrappers of the same stock are treated as a disposal and a new acquisition at the market value of the leg given up.",
    );
  }
  if (periodEvents.some((e) => e.input.source === "simulated")) {
    list.push("This ledger contains simulated trades that never touched the chain. They are labeled simulated in the activity table.");
  }
  const unvalued = periodEvents.filter(
    (e) => e.input.kind !== "transfer_out" && e.input.rawDelta < 0n && e.reliefs.length > 0 && e.realizedUsd === null,
  ).length;
  if (unvalued > 0) {
    list.push(
      `${unvalued} disposal${unvalued === 1 ? "" : "s"} in the period could not be valued because the proceeds or the cost of the relieved lots are unknown. Realized gains exclude them.`,
    );
  }
  if (input.dataMode === "demo") {
    list.push("Demo wallet. The positions and history are scripted for demonstration. Prices come from the live sources listed below when available.");
  }
  const priced = positions.filter((p) => p.price !== null);
  if (priced.length > 0) {
    list.push(
      "Closing values use the latest available mark at generation time, which may differ from the price at the end of the period. Each position lists its price source and time.",
    );
  }
  if (positions.some((p) => p.incomeEstimate !== null)) {
    list.push(
      "Income estimate is the value of exposure gained through multiplier increases on lots still held, priced at the closing mark. It is an estimate, not a cash figure.",
    );
  }
  list.push("Network fees paid in SOL are not converted to USD. Fees shown are those charged in the cash asset of the trade.");
  list.push("This statement is an accounting summary generated from public blockchain data. It is not tax advice.");
  for (const w of warnings) list.push(w);
  return list;
}

function buildSources(input: StatementBuildInput): string[] {
  const labels = new Set<string>();
  for (const mark of input.marks.values()) labels.add(mark.sourceLabel);
  const sources = [...labels];
  sources.push(input.dataMode === "demo" ? "Scripted demo ledger" : "Solana mainnet transaction history");
  return sources;
}
