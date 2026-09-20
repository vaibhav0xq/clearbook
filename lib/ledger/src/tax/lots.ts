import type {
  BasisStatus,
  CostMethod,
  EngineResult,
  EventSource,
  IssuerId,
  LotState,
  ProcessedEvent,
  RegistryAsset,
} from "../types";
import { rawToUi, roundUsd } from "../math";
import { issuerLabel } from "../registry/registry";

/**
 * Tax lot rows follow the column layout of Form 1099-B so the figures carry to Form 8949. One row
 * is one lot relieved by one disposal. A sale that relieves three lots produces three rows with the
 * same disposal id. Transfers out are not disposals and never appear here.
 */
export interface TaxLotRow {
  /** Id of the disposal event. Shared by every lot the same disposal relieved. */
  disposalId: string;
  signature: string | null;
  source: EventSource;
  disposal: "sale" | "wrapper_swap";
  mint: string;
  symbol: string;
  issuer: IssuerId;
  underlyingSymbol: string;
  /** Box 1a. */
  description: string;
  lotId: string;
  /** Box 1b. Null when the lot predates the indexed history. */
  acquiredAt: Date | null;
  /** Box 1c. */
  soldAt: Date;
  /** Shares of exposure relieved from this lot, at the multiplier in force at the sale. */
  quantity: number;
  /** Box 1d. Proceeds net of fees, in USD. Null when the cash leg of the sale could not be read. */
  proceeds: number | null;
  /** Box 1e. Null when the basis is unknown. */
  costBasis: number | null;
  /** Proceeds less basis from the rounded figures, so a row always reconciles. Null when either is unknown. */
  gainLoss: number | null;
  term: "short" | "long" | "unknown";
  basisStatus: BasisStatus;
  basisNote: string | null;
  /** A loss with a buy of the same stock within 30 days on either side. A check, not a determination. */
  washSaleFlag: boolean;
  washSaleNote: string | null;
}

export interface TaxYearSummary {
  year: number;
  /** Distinct disposals in the year. */
  disposals: number;
  /** Lot rows in the year. */
  rows: number;
  /** Proceeds of the rows whose proceeds are known. */
  proceeds: number;
  /** Cost basis of the rows whose basis is known. */
  costBasis: number;
  /** Gain or loss of the rows whose proceeds and basis are both known. */
  gainLoss: number;
  shortTermGainLoss: number;
  longTermGainLoss: number;
  unknownProceedsRows: number;
  estimatedBasisRows: number;
  unknownBasisRows: number;
  simulatedRows: number;
  washSaleFlags: number;
}

/** Calendar days on either side of the sale, counted on UTC dates. */
const WASH_SALE_WINDOW_DAYS = 30;
const REPLACEMENT_KINDS = new Set(["buy", "wrapper_swap_in"]);

function utcDayIndex(d: Date): number {
  return Math.floor(d.getTime() / 86_400_000);
}

function issuerName(issuer: IssuerId): string {
  return issuer === "unknown" ? "Unknown issuer" : issuerLabel(issuer);
}

function formatQuantity(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toFixed(6).replace(/\.?0+$/, "");
}

function dayLabel(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Every lot relieved by a sale or wrapper swap, as Form 1099-B style rows sorted by sale time. */
export function collectTaxLots(
  result: EngineResult,
  resolveAsset: (mint: string) => RegistryAsset | undefined,
): TaxLotRow[] {
  const lotIndex = new Map<string, LotState>(result.lots.map((l) => [l.id, l]));
  const underlyingOf = (mint: string): string => {
    const asset = resolveAsset(mint);
    return asset?.underlyingSymbol || asset?.symbol || mint;
  };

  // Acquisitions that can turn a loss into a wash sale: buys and wrapper swaps in, keyed by the
  // underlying stock so a buy of another wrapper of the same stock counts.
  const replacements = new Map<string, ProcessedEvent[]>();
  for (const e of result.events) {
    if (!REPLACEMENT_KINDS.has(e.input.kind) || e.input.rawDelta <= 0n) continue;
    const key = underlyingOf(e.input.mint);
    const list = replacements.get(key);
    if (list) list.push(e);
    else replacements.set(key, [e]);
  }

  const rows: TaxLotRow[] = [];
  for (const e of result.events) {
    const kind = e.input.kind;
    if ((kind !== "sell" && kind !== "wrapper_swap_out") || e.reliefs.length === 0) continue;
    const asset = resolveAsset(e.input.mint);
    const decimals = asset?.decimals ?? 0;
    const symbol = asset?.symbol ?? e.input.mint.slice(0, 6);
    const issuer = asset?.issuer ?? "unknown";
    const underlying = underlyingOf(e.input.mint);
    const soldAt = e.input.blockTime;
    const soldDay = utcDayIndex(soldAt);
    const proceedsKnown = e.input.grossUsd !== null;
    const relievedLotIds = new Set(e.reliefs.map((r) => r.lotId));
    const disposalRows: TaxLotRow[] = [];

    for (const r of e.reliefs) {
      const lot = lotIndex.get(r.lotId);
      const opening = lot?.openKind === "opening_balance";
      const quantity = rawToUi(r.rawQuantity, decimals) * r.multiplier;
      const costBasis = r.costBasisUsd === null ? null : roundUsd(r.costBasisUsd);
      const proceeds = proceedsKnown ? roundUsd(r.proceedsUsd) : null;
      const gainLoss = proceeds === null || costBasis === null ? null : roundUsd(proceeds - costBasis);

      let washSaleNote: string | null = null;
      if (gainLoss !== null && gainLoss < 0) {
        const match = (replacements.get(underlying) ?? []).find(
          (a) => !relievedLotIds.has(a.input.id) && Math.abs(utcDayIndex(a.input.blockTime) - soldDay) <= WASH_SALE_WINDOW_DAYS,
        );
        if (match) {
          const matchAsset = resolveAsset(match.input.mint);
          const matchSymbol = matchAsset?.symbol ?? match.input.mint.slice(0, 6);
          const matchQuantity = rawToUi(match.input.rawDelta, matchAsset?.decimals ?? 0) * match.multiplier;
          const sameWrapper = match.input.mint === e.input.mint;
          washSaleNote = `${formatQuantity(matchQuantity)} ${matchSymbol} acquired ${dayLabel(match.input.blockTime)}${sameWrapper ? "" : ", another wrapper of the same stock"}.`;
        }
      }

      disposalRows.push({
        disposalId: e.input.id,
        signature: e.input.signature,
        source: e.input.source,
        disposal: kind === "sell" ? "sale" : "wrapper_swap",
        mint: e.input.mint,
        symbol,
        issuer,
        underlyingSymbol: underlying,
        description: `${formatQuantity(quantity)} ${symbol} (${issuerName(issuer)} token for ${underlying})`,
        lotId: r.lotId,
        acquiredAt: opening ? null : r.openedAt,
        soldAt,
        quantity,
        proceeds,
        costBasis,
        gainLoss,
        term: opening ? "unknown" : r.term,
        basisStatus: lot?.basisStatus ?? (costBasis === null ? "unknown" : "complete"),
        basisNote: lot?.basisNote ?? null,
        washSaleFlag: washSaleNote !== null,
        washSaleNote,
      });
    }

    // Rounding each lot's share can leave the rows a cent away from the sale itself. The last row
    // absorbs the difference so the rows always add up to the proceeds of the disposal.
    if (proceedsKnown && disposalRows.length > 0) {
      const total = roundUsd((e.input.grossUsd ?? 0) - (e.input.feeUsd ?? 0));
      const listed = roundUsd(disposalRows.reduce((acc, row) => acc + (row.proceeds ?? 0), 0));
      const residual = roundUsd(total - listed);
      if (residual !== 0) {
        const last = disposalRows[disposalRows.length - 1];
        last.proceeds = roundUsd((last.proceeds ?? 0) + residual);
        last.gainLoss = last.costBasis === null ? null : roundUsd(last.proceeds - last.costBasis);
      }
    }
    rows.push(...disposalRows);
  }
  return rows.sort((a, b) => a.soldAt.getTime() - b.soldAt.getTime() || a.disposalId.localeCompare(b.disposalId));
}

/** Calendar year of the sale in UTC, the same day boundary statements use. */
export function taxYearOf(row: TaxLotRow): number {
  return row.soldAt.getUTCFullYear();
}

/** One summary per calendar year that has at least one disposal, newest first. */
export function summarizeTaxYears(rows: TaxLotRow[]): TaxYearSummary[] {
  const byYear = new Map<number, TaxYearSummary & { disposalIds: Set<string> }>();
  for (const row of rows) {
    const year = taxYearOf(row);
    let s = byYear.get(year);
    if (!s) {
      s = {
        year,
        disposals: 0,
        rows: 0,
        proceeds: 0,
        costBasis: 0,
        gainLoss: 0,
        shortTermGainLoss: 0,
        longTermGainLoss: 0,
        unknownProceedsRows: 0,
        estimatedBasisRows: 0,
        unknownBasisRows: 0,
        simulatedRows: 0,
        washSaleFlags: 0,
        disposalIds: new Set(),
      };
      byYear.set(year, s);
    }
    s.disposalIds.add(row.disposalId);
    s.rows += 1;
    if (row.proceeds === null) s.unknownProceedsRows += 1;
    else s.proceeds += row.proceeds;
    if (row.costBasis !== null) s.costBasis += row.costBasis;
    if (row.gainLoss !== null) {
      s.gainLoss += row.gainLoss;
      if (row.term === "long") s.longTermGainLoss += row.gainLoss;
      else s.shortTermGainLoss += row.gainLoss;
    }
    if (row.basisStatus === "estimated") s.estimatedBasisRows += 1;
    if (row.basisStatus === "unknown") s.unknownBasisRows += 1;
    if (row.source === "simulated") s.simulatedRows += 1;
    if (row.washSaleFlag) s.washSaleFlags += 1;
  }
  return [...byYear.values()]
    .map(({ disposalIds, ...s }) => ({
      ...s,
      disposals: disposalIds.size,
      proceeds: roundUsd(s.proceeds),
      costBasis: roundUsd(s.costBasis),
      gainLoss: roundUsd(s.gainLoss),
      shortTermGainLoss: roundUsd(s.shortTermGainLoss),
      longTermGainLoss: roundUsd(s.longTermGainLoss),
    }))
    .sort((a, b) => b.year - a.year);
}

export interface TaxLotsCsvMeta {
  address: string;
  year: number;
  method: CostMethod;
  generatedAt: Date;
  dataMode: string;
}

const METHOD_LABEL: Record<CostMethod, string> = {
  fifo: "first in, first out",
  lifo: "last in, first out",
  hifo: "highest cost first",
};

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(6).replace(/\.?0+$/, "");
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function row(values: unknown[]): string {
  return values.map(cell).join(",");
}

/** Renders one tax year as a CSV file in the Form 1099-B column order, with a summary block first. */
export function renderTaxLotsCsv(rows: TaxLotRow[], meta: TaxLotsCsvMeta): string {
  const inYear = rows.filter((r) => taxYearOf(r) === meta.year);
  const summary = summarizeTaxYears(inYear)[0];
  const lines: string[] = [];
  lines.push(row(["Clearbook tax lot export"]));
  lines.push(row(["Wallet", meta.address]));
  lines.push(row(["Tax year", meta.year]));
  lines.push(row(["Cost method", METHOD_LABEL[meta.method]]));
  lines.push(row(["Generated at", meta.generatedAt.toISOString()]));
  lines.push(row(["Data mode", meta.dataMode]));
  lines.push(row(["Layout", "Columns follow Form 1099-B boxes 1a to 1e so the figures carry to Form 8949. Clearbook is not a broker and files nothing."]));
  lines.push(row(["Dates", "Sale dates are UTC calendar days. Amounts are USD."]));
  lines.push(row(["Basis", "Rows with unknown proceeds or an estimated or unknown basis need figures from your own records before filing. Their gain is left blank."]));
  lines.push(row(["Wash sales", "A flag means a loss with a buy of the same stock within 30 days before or after the sale. It is a check, not a determination. No basis is adjusted."]));
  lines.push("");

  lines.push(row(["Summary"]));
  lines.push(row(["Metric", "Value"]));
  lines.push(row(["Disposals", summary?.disposals ?? 0]));
  lines.push(row(["Lot rows", summary?.rows ?? 0]));
  lines.push(row(["Proceeds of rows with known proceeds", summary?.proceeds ?? 0]));
  lines.push(row(["Cost basis of rows with known basis", summary?.costBasis ?? 0]));
  lines.push(row(["Gain or loss of rows with known proceeds and basis", summary?.gainLoss ?? 0]));
  lines.push(row(["Short term gain or loss", summary?.shortTermGainLoss ?? 0]));
  lines.push(row(["Long term gain or loss", summary?.longTermGainLoss ?? 0]));
  lines.push(row(["Rows with unknown proceeds", summary?.unknownProceedsRows ?? 0]));
  lines.push(row(["Rows with estimated basis", summary?.estimatedBasisRows ?? 0]));
  lines.push(row(["Rows with unknown basis", summary?.unknownBasisRows ?? 0]));
  lines.push(row(["Rows from simulated sales", summary?.simulatedRows ?? 0]));
  lines.push(row(["Wash sale flags", summary?.washSaleFlags ?? 0]));
  lines.push("");

  lines.push(row(["Lots"]));
  lines.push(
    row([
      "Description of property (1a)",
      "Date acquired (1b)",
      "Date sold (1c)",
      "Proceeds (1d)",
      "Cost or other basis (1e)",
      "Gain or loss",
      "Term",
      "Quantity",
      "Symbol",
      "Issuer",
      "Underlying",
      "Mint",
      "Disposal",
      "Source",
      "Transaction",
      "Basis status",
      "Basis note",
      "Wash sale flag",
      "Wash sale note",
      "Lot id",
      "Disposal id",
    ]),
  );
  for (const r of inYear) {
    lines.push(
      row([
        r.description,
        r.acquiredAt ?? "Unknown",
        r.soldAt,
        r.proceeds ?? "Unknown",
        r.costBasis ?? "Unknown",
        r.gainLoss,
        r.term === "unknown" ? "Unknown" : r.term === "long" ? "Long term" : "Short term",
        r.quantity,
        r.symbol,
        issuerName(r.issuer),
        r.underlyingSymbol,
        r.mint,
        r.disposal === "sale" ? "Sale" : "Wrapper swap",
        r.source === "simulated" ? "Simulated" : r.source === "demo" ? "Demo" : "Chain",
        r.signature,
        r.basisStatus,
        r.basisNote,
        r.washSaleFlag ? "Yes" : "No",
        r.washSaleNote,
        r.lotId,
        r.disposalId,
      ]),
    );
  }
  return lines.join("\n") + "\n";
}
