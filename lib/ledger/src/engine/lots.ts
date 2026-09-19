import type {
  CostMethod,
  EngineResult,
  LedgerEventInput,
  LotState,
  ProcessedEvent,
  RegistryAsset,
  ReliefRecord,
} from "../types";
import { daysBetween, exposure, proportion } from "../math";

export interface EngineOptions {
  method: CostMethod;
  /** Only events at or before this instant are applied. */
  asOf?: Date;
  /** Current multiplier per mint, used when an event does not carry its own. */
  multipliers?: Map<string, number>;
  /** Holding period in days after which a disposal counts as long term. */
  longTermDays?: number;
  resolveAsset: (mint: string) => RegistryAsset | undefined;
}

const INFLOW = new Set(["buy", "transfer_in", "wrapper_swap_in"]);
const OUTFLOW = new Set(["sell", "transfer_out", "wrapper_swap_out"]);

export function sortEvents(events: LedgerEventInput[]): LedgerEventInput[] {
  return [...events].sort((a, b) => {
    const t = a.blockTime.getTime() - b.blockTime.getTime();
    if (t !== 0) return t;
    const s = (a.slot ?? 0) - (b.slot ?? 0);
    if (s !== 0) return s;
    // Outflows before inflows inside the same transaction so wrapper swaps relieve first.
    const ao = OUTFLOW.has(a.kind) ? 0 : 1;
    const bo = OUTFLOW.has(b.kind) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return a.id.localeCompare(b.id);
  });
}

function orderLots(lots: LotState[], method: CostMethod): LotState[] {
  const open = lots.filter((l) => l.rawRemaining > 0n);
  const costPerRaw = (l: LotState): number =>
    l.costBasisUsd === null ? -1 : l.costBasisUsd / Number(l.rawQuantity);
  switch (method) {
    case "fifo":
      return open.sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime() || a.id.localeCompare(b.id));
    case "lifo":
      return open.sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime() || a.id.localeCompare(b.id));
    case "hifo":
      return open.sort((a, b) => {
        const diff = costPerRaw(b) - costPerRaw(a);
        if (diff !== 0) return diff;
        return a.openedAt.getTime() - b.openedAt.getTime() || a.id.localeCompare(b.id);
      });
  }
}

/**
 * Replays ledger events into lots. Pure and deterministic: the same events and
 * options always produce the same lots, reliefs and realized figures.
 */
export function runLedger(inputs: LedgerEventInput[], options: EngineOptions): EngineResult {
  const longTermDays = options.longTermDays ?? 365;
  const asOf = options.asOf;
  const events = sortEvents(inputs).filter((e) => !asOf || e.blockTime.getTime() <= asOf.getTime());
  const lotsByMint = new Map<string, LotState[]>();
  const processed: ProcessedEvent[] = [];
  const rawBalances = new Map<string, bigint>();
  const warnings: string[] = [];
  const shortfallWarned = new Set<string>();

  const multiplierFor = (e: LedgerEventInput): number =>
    e.multiplierAtEvent ?? options.multipliers?.get(e.mint) ?? 1;

  const lotsFor = (mint: string): LotState[] => {
    let lots = lotsByMint.get(mint);
    if (!lots) {
      lots = [];
      lotsByMint.set(mint, lots);
    }
    return lots;
  };

  for (const e of events) {
    const asset = options.resolveAsset(e.mint);
    const decimals = asset?.decimals ?? 0;
    const symbol = asset?.symbol ?? e.mint.slice(0, 6);
    const multiplier = multiplierFor(e);
    const exposureDelta = exposure(e.rawDelta, decimals, multiplier);

    if (e.kind !== "multiplier_change" && e.kind !== "unknown") {
      rawBalances.set(e.mint, (rawBalances.get(e.mint) ?? 0n) + e.rawDelta);
    }

    if (INFLOW.has(e.kind) && e.rawDelta > 0n) {
      const lot = openLot(e, exposureDelta, multiplier);
      lotsFor(e.mint).push(lot);
      const pricePerShare =
        lot.costBasisUsd !== null && exposureDelta > 0 ? lot.costBasisUsd / exposureDelta : null;
      processed.push({ input: e, pricePerShare, realizedUsd: null, reliefs: [] });
      continue;
    }

    if (OUTFLOW.has(e.kind) && e.rawDelta < 0n) {
      let remaining = -e.rawDelta;
      const lots = lotsFor(e.mint);
      const available = lots.reduce((acc, l) => acc + l.rawRemaining, 0n);
      if (available < remaining) {
        const shortfall = remaining - available;
        const opening: LotState = {
          id: `${e.id}:opening`,
          mint: e.mint,
          openedAt: e.blockTime,
          openSignature: null,
          openKind: "opening_balance",
          rawQuantity: shortfall,
          rawRemaining: shortfall,
          costBasisUsd: null,
          multiplierAtOpen: null,
          basisStatus: "unknown",
          basisNote: "Acquired before the indexed history. Cost basis unknown.",
          realizedUsd: 0,
          closedAt: null,
        };
        lots.push(opening);
        if (!shortfallWarned.has(e.mint)) {
          shortfallWarned.add(e.mint);
          warnings.push(
            `${symbol}: disposed more than the indexed acquisitions. An opening balance with unknown basis was created.`,
          );
        }
      }

      const proceedsTotal = disposalProceeds(e);
      const reliefs: ReliefRecord[] = [];
      const totalRaw = -e.rawDelta;
      for (const lot of orderLots(lots, options.method)) {
        if (remaining === 0n) break;
        const take = lot.rawRemaining < remaining ? lot.rawRemaining : remaining;
        const cost =
          lot.costBasisUsd === null ? null : proportion(lot.costBasisUsd, take, lot.rawQuantity);
        const proceeds = proceedsTotal === null ? 0 : proportion(proceedsTotal, take, totalRaw);
        const recognize = e.kind !== "transfer_out";
        const realized = recognize && cost !== null && proceedsTotal !== null ? proceeds - cost : null;
        lot.rawRemaining -= take;
        remaining -= take;
        if (realized !== null) lot.realizedUsd += realized;
        if (lot.rawRemaining === 0n) lot.closedAt = e.blockTime;
        reliefs.push({
          lotId: lot.id,
          rawQuantity: take,
          costBasisUsd: cost,
          proceedsUsd: proceeds,
          realizedUsd: realized,
          term: daysBetween(lot.openedAt, e.blockTime) > longTermDays ? "long" : "short",
          openedAt: lot.openedAt,
        });
      }
      const allKnown = reliefs.every((r) => r.realizedUsd !== null);
      const realizedUsd =
        e.kind === "transfer_out" || !allKnown || reliefs.length === 0
          ? null
          : reliefs.reduce((acc, r) => acc + (r.realizedUsd ?? 0), 0);
      const pricePerShare =
        proceedsTotal !== null && exposureDelta !== 0 ? proceedsTotal / Math.abs(exposureDelta) : null;
      processed.push({ input: e, pricePerShare, realizedUsd, reliefs });
      continue;
    }

    processed.push({ input: e, pricePerShare: null, realizedUsd: null, reliefs: [] });
  }

  const lots = [...lotsByMint.values()].flat();
  return { lots, events: processed, rawBalances, warnings };
}

function openLot(e: LedgerEventInput, exposureDelta: number, multiplier: number): LotState {
  let costBasisUsd: number | null = null;
  let basisStatus: LotState["basisStatus"] = "unknown";
  let basisNote: string | null = null;
  let openKind: LotState["openKind"] = "buy";

  if (e.kind === "buy") {
    if (e.grossUsd !== null) {
      costBasisUsd = e.grossUsd + (e.feeUsd ?? 0);
      basisStatus = "complete";
    } else {
      basisNote = "Purchase found but the cash leg could not be read. Cost basis unknown.";
    }
  } else if (e.kind === "transfer_in") {
    openKind = "transfer_in";
    if (e.referencePriceUsd !== null && exposureDelta > 0) {
      costBasisUsd = e.referencePriceUsd * exposureDelta;
      basisStatus = "estimated";
      basisNote = "Received by transfer. Basis estimated at the reference price when received.";
    } else {
      basisNote = "Received by transfer. No price at receipt, cost basis unknown.";
    }
  } else {
    openKind = "wrapper_swap";
    if (e.grossUsd !== null) {
      costBasisUsd = e.grossUsd;
      basisStatus = "complete";
      basisNote = "Opened by a swap between wrappers, valued at the market value of the leg given up.";
    } else {
      basisNote = "Opened by a swap between wrappers without a readable value. Cost basis unknown.";
    }
  }

  if (e.multiplierAtEvent === null && basisStatus === "complete" && multiplier !== 1) {
    basisStatus = "estimated";
    basisNote =
      "Multiplier at acquisition not reconstructed. Per share cost assumes the current multiplier.";
  }

  return {
    id: e.id,
    mint: e.mint,
    openedAt: e.blockTime,
    openSignature: e.signature,
    openKind,
    rawQuantity: e.rawDelta,
    rawRemaining: e.rawDelta,
    costBasisUsd,
    multiplierAtOpen: e.multiplierAtEvent,
    basisStatus,
    basisNote,
    realizedUsd: 0,
    closedAt: null,
  };
}

function disposalProceeds(e: LedgerEventInput): number | null {
  // Transfers out are not disposals. The lot leaves at cost and no gain is recognized.
  if (e.kind === "transfer_out") return null;
  if (e.grossUsd === null) return null;
  return e.grossUsd - (e.feeUsd ?? 0);
}
