import type { CostMethod, Lot, Position } from "@workspace/api-client-react";

export interface StrataLayer {
  id: string;
  mint: string;
  symbol: string;
  openedAt: string;
  quantity: number;
  /** Market value of the remaining quantity. Drives layer thickness. */
  value: number;
  /** Cost per share at open, for display. */
  costPerShare: number | null;
  /** Remaining cost basis of the open part of the lot. Null when the basis is unknown. */
  costBasis: number | null;
  /**
   * Cost per share of the remaining quantity at the current multiplier. Within a mint this
   * orders lots exactly like the engine's cost per raw unit, so HIFO ranking uses it.
   */
  reliefCost: number | null;
  unrealizedPnl: number | null;
  pnlPct: number | null;
  basisUnknown: boolean;
  holdingDays: number;
  term: string;
}

export interface StrataColumn {
  mint: string;
  symbol: string;
  name: string;
  value: number;
  quantity: number;
  unrealizedPnl: number | null;
  pnlPct: number | null;
  markPrice: number | null;
  /** Oldest first. The physical stack order never changes with the cost method. */
  layers: StrataLayer[];
}

/**
 * Turns positions and their open lots into columns of layers.
 * Positions without lot detail still get one layer so every holding is drawn.
 */
export function buildStrata(positions: Position[], lots: Lot[] | undefined): StrataColumn[] {
  const byMint = new Map<string, Lot[]>();
  for (const lot of lots ?? []) {
    if (lot.remainingQuantity <= 0) continue;
    const list = byMint.get(lot.mint) ?? [];
    list.push(lot);
    byMint.set(lot.mint, list);
  }

  return positions
    .filter((p) => p.quantity > 0)
    .map<StrataColumn>((p) => {
      const price = p.mark.price ?? null;
      const open = (byMint.get(p.mint) ?? []).sort(
        (a, b) => new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime() || a.id.localeCompare(b.id),
      );
      const layers: StrataLayer[] = open.length
        ? open.map((lot) => {
            const value = lot.marketValue ?? (price !== null ? lot.remainingQuantity * price : 0);
            const cost = lot.remainingCostBasis;
            const pnlPct = cost && cost > 0 && lot.unrealizedPnl !== null ? (lot.unrealizedPnl / cost) * 100 : null;
            return {
              id: lot.id,
              mint: lot.mint,
              symbol: lot.symbol,
              openedAt: lot.openedAt,
              quantity: lot.remainingQuantity,
              value,
              costPerShare: lot.costPerShare,
              costBasis: cost,
              reliefCost: cost === null || lot.remainingQuantity <= 0 ? null : cost / lot.remainingQuantity,
              unrealizedPnl: lot.unrealizedPnl,
              pnlPct,
              basisUnknown: lot.basisStatus === "unknown",
              holdingDays: lot.holdingDays,
              term: lot.term,
            };
          })
        : [
            {
              id: `${p.mint}:position`,
              mint: p.mint,
              symbol: p.symbol,
              openedAt: "",
              quantity: p.quantity,
              value: p.marketValue ?? 0,
              costPerShare: p.averageCost,
              costBasis: p.costBasis,
              reliefCost: p.averageCost,
              unrealizedPnl: p.unrealizedPnl,
              pnlPct: p.unrealizedPnlPct,
              basisUnknown: p.basisStatus === "unknown",
              holdingDays: 0,
              term: "",
            },
          ];
      return {
        mint: p.mint,
        symbol: p.symbol,
        name: p.name,
        value: p.marketValue ?? layers.reduce((s, l) => s + l.value, 0),
        quantity: p.quantity,
        unrealizedPnl: p.unrealizedPnl,
        pnlPct: p.unrealizedPnlPct,
        markPrice: price,
        layers,
      };
    })
    .sort((a, b) => b.value - a.value);
}

/**
 * Mirrors the ledger engine (lib/ledger/src/engine/lots.ts orderLots): FIFO oldest first,
 * LIFO newest first, HIFO highest remaining cost per unit first with unknown cost last and
 * ties broken by open time.
 */
export function reliefOrder(column: StrataColumn, method: CostMethod): StrataLayer[] {
  const layers = [...column.layers];
  const t = (l: StrataLayer) => new Date(l.openedAt).getTime() || 0;
  switch (method) {
    case "lifo":
      return layers.sort((a, b) => t(b) - t(a) || a.id.localeCompare(b.id));
    case "hifo":
      return layers.sort((a, b) => {
        const diff = (b.reliefCost ?? -1) - (a.reliefCost ?? -1);
        if (diff !== 0) return diff;
        return t(a) - t(b) || a.id.localeCompare(b.id);
      });
    case "fifo":
    default:
      return layers.sort((a, b) => t(a) - t(b) || a.id.localeCompare(b.id));
  }
}

/**
 * Which layers a sale of `quantity` would relieve under the method, and how much of each.
 * Returns a map of layer id to fraction relieved in [0, 1].
 */
export function reliefPreview(column: StrataColumn, method: CostMethod, quantity: number): Map<string, number> {
  const out = new Map<string, number>();
  let remaining = Math.max(0, quantity);
  for (const layer of reliefOrder(column, method)) {
    if (remaining <= 0) break;
    const take = Math.min(layer.quantity, remaining);
    out.set(layer.id, layer.quantity > 0 ? take / layer.quantity : 0);
    remaining -= take;
  }
  return out;
}

export function reliefRank(column: StrataColumn, method: CostMethod): Map<string, number> {
  const out = new Map<string, number>();
  reliefOrder(column, method).forEach((l, i) => out.set(l.id, i));
  return out;
}

/** First and last dates the ledger can be rewound to. Null when there is no dated lot. */
export function ledgerSpan(lots: Lot[] | undefined): { start: Date; end: Date } | null {
  let start = Infinity;
  for (const lot of lots ?? []) {
    const t = new Date(lot.openedAt).getTime();
    if (Number.isFinite(t)) start = Math.min(start, t);
  }
  if (!Number.isFinite(start)) return null;
  return { start: new Date(start), end: new Date() };
}

/**
 * Rebuilds the ledger as it stood at the end of a past day, from every lot the wallet has held.
 * There are no historical marks, so layer thickness is cost basis. A lot that is still held today
 * (open or partly sold) is drawn at its remaining quantity and basis on every date it was open,
 * because partial disposals are undated in the lot record. A lot that has since closed is drawn at
 * its original size. Callers must label the result approximate.
 */
export function buildStrataAsOf(lots: Lot[] | undefined, asOf: Date): StrataColumn[] {
  const cutoff = asOf.getTime();
  const byMint = new Map<string, Lot[]>();
  for (const lot of lots ?? []) {
    const opened = new Date(lot.openedAt).getTime();
    if (!Number.isFinite(opened) || opened > cutoff) continue;
    const closed = lot.closedAt ? new Date(lot.closedAt).getTime() : null;
    if (closed !== null && closed <= cutoff) continue;
    const list = byMint.get(lot.mint) ?? [];
    list.push(lot);
    byMint.set(lot.mint, list);
  }

  const columns: StrataColumn[] = [];
  for (const [mint, open] of byMint) {
    open.sort((a, b) => new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime() || a.id.localeCompare(b.id));
    const layers: StrataLayer[] = open.map((lot) => {
      const held = lot.closedAt === null;
      const quantity = held ? lot.remainingQuantity : lot.quantity;
      const unknown = lot.basisStatus === "unknown";
      const basis = held ? lot.remainingCostBasis : lot.costBasis;
      const cost = unknown || basis === null ? null : basis;
      return {
        id: lot.id,
        mint: lot.mint,
        symbol: lot.symbol,
        openedAt: lot.openedAt,
        quantity,
        value: cost ?? 0,
        costPerShare: lot.costPerShare,
        costBasis: cost,
        reliefCost: cost === null || quantity <= 0 ? null : cost / quantity,
        unrealizedPnl: null,
        pnlPct: null,
        basisUnknown: unknown,
        holdingDays: Math.max(0, Math.floor((cutoff - new Date(lot.openedAt).getTime()) / 86_400_000)),
        term: "",
      };
    });
    if (layers.every((l) => l.quantity <= 0)) continue;
    const first = open[0];
    columns.push({
      mint,
      symbol: first.symbol,
      name: first.symbol,
      value: layers.reduce((s, l) => s + l.value, 0),
      quantity: layers.reduce((s, l) => s + l.quantity, 0),
      unrealizedPnl: null,
      pnlPct: null,
      markPrice: null,
      layers,
    });
  }
  return columns.sort((a, b) => b.value - a.value);
}
