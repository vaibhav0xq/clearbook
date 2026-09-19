import type { CostMethod } from "@workspace/api-client-react";
import { reliefPreview, type StrataColumn } from "./strata-data";

/**
 * The landing page is one pinned scene driven by scroll progress in [0, 1].
 * Seven chapters share the range equally. Every visual state below is a pure
 * function of progress so the DOM copy and the WebGL scene can never disagree.
 */
export const CHAPTERS = [
  { id: "balance", label: "Balance" },
  { id: "lots", label: "Lots" },
  { id: "relief", label: "Relief" },
  { id: "income", label: "Income" },
  { id: "marks", label: "Marks" },
  { id: "proof", label: "Proof" },
  { id: "open", label: "Open" },
] as const;

export const CHAPTER_COUNT = CHAPTERS.length;
export const RELIEF_METHODS: CostMethod[] = ["fifo", "lifo", "hifo"];

export const METHOD_COPY: Record<CostMethod, { word: string; rule: string }> = {
  fifo: { word: "FIFO", rule: "Oldest lots leave first." },
  lifo: { word: "LIFO", rule: "Newest lots leave first." },
  hifo: { word: "HIFO", rule: "Highest cost per share leaves first." },
};

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Smoothstep ramp from a to b. */
export function seg(x: number, a: number, b: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Index of the chapter that owns progress p. */
export function chapterAt(p: number): number {
  return Math.min(CHAPTER_COUNT - 1, Math.max(0, Math.floor(p * CHAPTER_COUNT)));
}

/**
 * Progress inside chapter i, clamped to [0, 1]. Chapters before i read 0 and
 * chapters after it read 1, which lets a state persist once its chapter is done.
 */
export function local(p: number, i: number): number {
  return clamp01(p * CHAPTER_COUNT - i);
}

/** Position of the pinned area (0 to 1) that scrolls chapter i into its hold phase. */
export function chapterAnchor(i: number): number {
  return (i + 0.18) / CHAPTER_COUNT;
}

/** Layers separate into lots at the start of chapter one. */
export function split(p: number): number {
  return seg(local(p, 1), 0, 0.42);
}

/** Loss and gain colours flood in during the marks chapter. */
export function colorize(p: number): number {
  return seg(local(p, 4), 0.04, 0.5);
}

/** The multiplier increase in the income chapter. */
export function dividendWave(p: number): number {
  return seg(local(p, 3), 0.1, 0.62);
}

/** The hashing beam in the proof chapter. */
export function scan(p: number): number {
  return seg(local(p, 5), 0.06, 0.82);
}

/** Copy for chapter i fades in early and out late. Chapter zero starts visible. */
export function copyVisibility(p: number, i: number): number {
  const l = p * CHAPTER_COUNT - i;
  const enter = i === 0 ? 1 : seg(l, 0.04, 0.24);
  const exit = i === CHAPTER_COUNT - 1 ? 0 : seg(l, 0.7, 0.9);
  return enter * (1 - exit);
}

/** A sale large enough that the relief order matters but never the whole position. */
export function storySaleQuantity(column: StrataColumn | undefined): number {
  if (!column) return 0;
  const raw = column.quantity * 0.65;
  if (raw >= 20) return Math.round(raw / 10) * 10;
  if (raw >= 2) return Math.round(raw);
  return Number(raw.toFixed(2));
}

export interface ReliefStory {
  method: CostMethod;
  methodIndex: number;
  /** How far the sale has progressed inside the current method, 0 to 1. */
  sweep: number;
  saleQuantity: number;
  relieved: number;
  fractions: Map<string, number>;
  /** Estimated realized result at the current mark for the relieved part. Null when any cost is unknown. */
  realized: number | null;
}

/**
 * The relief chapter walks the same sale through FIFO, LIFO and HIFO in turn.
 * Outside the chapter this returns null and the scene shows no relief.
 */
export function reliefStory(p: number, column: StrataColumn | undefined): ReliefStory | null {
  const l = p * CHAPTER_COUNT - 2;
  if (!column || l < 0 || l >= 1) return null;
  const methodIndex = Math.min(2, Math.floor(l * 3));
  const method = RELIEF_METHODS[methodIndex];
  const sweep = seg(l * 3 - methodIndex, 0.14, 0.78);
  const saleQuantity = storySaleQuantity(column);
  const relieved = saleQuantity * sweep;
  const fractions = reliefPreview(column, method, relieved);
  const mark = column.markPrice;
  let realized: number | null = mark === null ? null : 0;
  for (const layer of column.layers) {
    const f = fractions.get(layer.id) ?? 0;
    if (f <= 0 || realized === null) continue;
    if (layer.basisUnknown || layer.costBasis === null) {
      realized = null;
      break;
    }
    realized += layer.quantity * f * (mark as number) - layer.costBasis * f;
  }
  return { method, methodIndex, sweep, saleQuantity, relieved, fractions, realized };
}

/** Deterministic pseudo random in [0, 1) for scramble effects. */
export function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const HEX = "0123456789abcdef";

/**
 * Reveals a hex digest from left to right as the beam passes. Digits just ahead
 * of the front flicker through random hex so the string reads as being computed.
 */
export function revealDigest(digest: string, t: number, tick: number): string {
  const n = digest.length;
  const front = Math.floor(t * n);
  let out = "";
  for (let i = 0; i < n; i++) {
    if (i < front) out += digest[i];
    else if (i < front + 6) out += HEX[Math.floor(hash01(i * 7 + tick) * 16)];
    else out += "·";
  }
  return out;
}
