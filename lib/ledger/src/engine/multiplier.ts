import type { MultiplierObservation, RegistryAsset } from "../types";

export type CorporateActionKind =
  | "dividend_reinvested"
  | "split"
  | "reverse_split"
  | "multiplier_pending"
  | "multiplier_change";

export interface CorporateAction {
  id: string;
  mint: string;
  kind: CorporateActionKind;
  observedAt: Date;
  effectiveAt: Date | null;
  previousMultiplier: number;
  newMultiplier: number;
  /** Percentage change of exposure per raw token. */
  changePct: number;
  confidence: "confirmed" | "inferred" | "pending";
  source: MultiplierObservation["source"];
  note: string;
}

/**
 * Turns a time series of multiplier observations for one mint into corporate
 * action events. Small increases on issuers that reinvest dividends are
 * labelled as reinvested dividends, large ratio changes as splits.
 */
export function deriveCorporateActions(
  asset: RegistryAsset,
  observations: MultiplierObservation[],
): CorporateAction[] {
  const sorted = [...observations].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  const actions: CorporateAction[] = [];
  let previous: MultiplierObservation | null = null;
  for (const obs of sorted) {
    if (previous && obs.multiplier !== previous.multiplier) {
      const ratio = obs.multiplier / previous.multiplier;
      const changePct = (ratio - 1) * 100;
      const kind = classifyChange(ratio);
      actions.push({
        id: `${asset.mint}:${obs.observedAt.toISOString()}:${obs.multiplier}`,
        mint: asset.mint,
        kind,
        observedAt: obs.observedAt,
        effectiveAt: obs.observedAt,
        previousMultiplier: previous.multiplier,
        newMultiplier: obs.multiplier,
        changePct,
        confidence: obs.source === "demo" ? "confirmed" : "inferred",
        source: obs.source,
        note: describeChange(asset, kind, changePct, ratio),
      });
    }
    previous = obs;
  }
  const latest = sorted[sorted.length - 1];
  if (latest && latest.pendingMultiplier !== null && latest.pendingMultiplier !== latest.multiplier) {
    const ratio = latest.pendingMultiplier / latest.multiplier;
    const changePct = (ratio - 1) * 100;
    const kind = classifyChange(ratio);
    actions.push({
      id: `${asset.mint}:pending:${latest.pendingMultiplier}`,
      mint: asset.mint,
      kind: "multiplier_pending",
      observedAt: latest.observedAt,
      effectiveAt: latest.pendingEffectiveAt,
      previousMultiplier: latest.multiplier,
      newMultiplier: latest.pendingMultiplier,
      changePct,
      confidence: "pending",
      source: latest.source,
      note: `Scheduled multiplier change on chain. ${describeChange(asset, kind, changePct, ratio)}`,
    });
  }
  return actions.sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime());
}

function classifyChange(ratio: number): CorporateActionKind {
  if (ratio >= 1.5) return "split";
  if (ratio <= 0.67) return "reverse_split";
  if (ratio > 1 && ratio < 1.05) return "dividend_reinvested";
  return "multiplier_change";
}

function describeChange(asset: RegistryAsset, kind: CorporateActionKind, changePct: number, ratio: number): string {
  const pct = `${changePct >= 0 ? "+" : ""}${changePct.toFixed(4)}%`;
  switch (kind) {
    case "dividend_reinvested":
      return `${asset.symbol} multiplier rose ${pct}. Consistent with a cash dividend reinvested by the issuer. Exposure per token increased, no tokens were transferred.`;
    case "split":
      return `${asset.symbol} multiplier changed by ${ratio.toFixed(4)}x. Consistent with a stock split.`;
    case "reverse_split":
      return `${asset.symbol} multiplier changed by ${ratio.toFixed(4)}x. Consistent with a reverse split.`;
    default:
      return `${asset.symbol} multiplier changed ${pct}. Cause not classified.`;
  }
}

/** Multiplier in force at a given instant according to the observations. */
export function multiplierAt(observations: MultiplierObservation[], at: Date): number | null {
  let best: MultiplierObservation | null = null;
  for (const obs of observations) {
    if (obs.observedAt.getTime() <= at.getTime() && (!best || obs.observedAt > best.observedAt)) best = obs;
  }
  return best ? best.multiplier : null;
}
