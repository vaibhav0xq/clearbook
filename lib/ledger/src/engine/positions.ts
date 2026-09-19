import type { BasisStatus, EngineResult, LotState, RegistryAsset } from "../types";
import { pctChange, rawToUi } from "../math";

export interface MarkInput {
  mint: string;
  /** Price per share of exposure in USD, null when unavailable. */
  price: number | null;
  /** Reference market price per share, null when unavailable. */
  referencePrice: number | null;
  /** Current multiplier for the mint. */
  multiplier: number;
}

export type PositionBasisStatus = "complete" | "partial" | "unknown";

export interface PositionValuation {
  mint: string;
  rawQuantity: bigint;
  /** Raw tokens divided by decimals, before the multiplier. */
  tokenQuantity: number;
  /** Shares of exposure, after the multiplier. */
  quantity: number;
  multiplier: number;
  price: number | null;
  marketValue: number | null;
  /** Cost basis of the lots with known basis. */
  costBasis: number | null;
  /** Average cost per share of exposure over lots with known basis. */
  averageCost: number | null;
  unrealizedPnl: number | null;
  unrealizedPnlPct: number | null;
  realizedPnl: number;
  incomeEstimate: number | null;
  basisStatus: PositionBasisStatus;
  basisNote: string | null;
  openLots: number;
  /** Raw units whose basis is unknown. */
  rawUnknownBasis: bigint;
}

export function lotBasisSummary(lots: LotState[]): { status: PositionBasisStatus; note: string | null } {
  const open = lots.filter((l) => l.rawRemaining > 0n);
  if (open.length === 0) return { status: "complete", note: null };
  const statuses = new Set<BasisStatus>(open.map((l) => l.basisStatus));
  if (statuses.size === 1 && statuses.has("complete")) return { status: "complete", note: null };
  if (statuses.size === 1 && statuses.has("unknown")) {
    return { status: "unknown", note: open.find((l) => l.basisNote)?.basisNote ?? "Cost basis unknown." };
  }
  const notes = [...new Set(open.map((l) => l.basisNote).filter((n): n is string => !!n))];
  return { status: "partial", note: notes.join(" ") || "Some lots have estimated or unknown basis." };
}

/**
 * Values every mint with a non zero balance or realized history.
 */
export function valuePositions(
  result: EngineResult,
  marks: Map<string, MarkInput>,
  resolveAsset: (mint: string) => RegistryAsset | undefined,
): PositionValuation[] {
  const byMint = new Map<string, LotState[]>();
  for (const lot of result.lots) {
    const list = byMint.get(lot.mint) ?? [];
    list.push(lot);
    byMint.set(lot.mint, list);
  }
  const positions: PositionValuation[] = [];
  for (const [mint, lots] of byMint) {
    const asset = resolveAsset(mint);
    const decimals = asset?.decimals ?? 0;
    const mark = marks.get(mint);
    const multiplier = mark?.multiplier ?? 1;
    const price = mark?.price ?? null;
    const open = lots.filter((l) => l.rawRemaining > 0n);
    const rawQuantity = open.reduce((acc, l) => acc + l.rawRemaining, 0n);
    const tokenQuantity = rawToUi(rawQuantity, decimals);
    const quantity = tokenQuantity * multiplier;
    const realizedPnl = lots.reduce((acc, l) => acc + l.realizedUsd, 0);
    if (rawQuantity === 0n && realizedPnl === 0 && lots.length === 0) continue;

    let costKnown = 0;
    let rawKnown = 0n;
    let rawUnknown = 0n;
    let incomeEstimate: number | null = null;
    for (const lot of open) {
      if (lot.costBasisUsd !== null) {
        costKnown += (lot.costBasisUsd * Number(lot.rawRemaining)) / Number(lot.rawQuantity);
        rawKnown += lot.rawRemaining;
      } else {
        rawUnknown += lot.rawRemaining;
      }
      if (lot.multiplierAtOpen !== null && price !== null) {
        const gained = rawToUi(lot.rawRemaining, decimals) * (multiplier - lot.multiplierAtOpen) * price;
        incomeEstimate = (incomeEstimate ?? 0) + gained;
      }
    }
    const marketValue = price === null ? null : quantity * price;
    const knownExposure = rawToUi(rawKnown, decimals) * multiplier;
    const knownValue = price === null ? null : knownExposure * price;
    const costBasis = rawKnown > 0n ? costKnown : null;
    const averageCost = rawKnown > 0n && knownExposure > 0 ? costKnown / knownExposure : null;
    const unrealizedPnl = costBasis !== null && knownValue !== null ? knownValue - costBasis : null;
    const summary = lotBasisSummary(lots);
    positions.push({
      mint,
      rawQuantity,
      tokenQuantity,
      quantity,
      multiplier,
      price,
      marketValue,
      costBasis,
      averageCost,
      unrealizedPnl,
      unrealizedPnlPct: unrealizedPnl !== null && costBasis ? pctChange(costBasis + unrealizedPnl, costBasis) : null,
      realizedPnl,
      incomeEstimate,
      basisStatus: summary.status,
      basisNote: summary.note,
      openLots: open.length,
      rawUnknownBasis: rawUnknown,
    });
  }
  return positions.sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0));
}
