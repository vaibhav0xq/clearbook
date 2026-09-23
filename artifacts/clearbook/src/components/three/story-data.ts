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

/**
 * Copy for a chapter rises in over COPY_ENTER and leaves over COPY_EXIT, both in chapter local
 * progress. The hold phase between them is where the chapter reads settled.
 */
export const COPY_ENTER: readonly [number, number] = [0.04, 0.24];
export const COPY_EXIT: readonly [number, number] = [0.7, 0.9];

/**
 * Position of the pinned area (0 to 1) that scrolls chapter i into its hold phase. It sits past the
 * end of the copy's entry ramp, so a programmatic scroll never parks on a half faded, still blurred
 * chapter; anywhere inside the ramp the copy has less than full opacity and a residual blur.
 */
export function chapterAnchor(i: number): number {
  return (i + COPY_ENTER[1] + 0.06) / CHAPTER_COUNT;
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
  const enter = i === 0 ? 1 : seg(l, COPY_ENTER[0], COPY_ENTER[1]);
  const exit = i === CHAPTER_COUNT - 1 ? 0 : seg(l, COPY_EXIT[0], COPY_EXIT[1]);
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

/** Pixel height of the fixed landing header, which the stacked composition keeps clear. */
export const STORY_HEADER_PX = 64;

/**
 * Copy and scene sit side by side when the viewport is at least 48rem wide and wider than 23:20.
 * Below that the copy is anchored to the bottom of the viewport and the scene composes into the
 * band above it. The DOM uses the same query through the `wide` variant in index.css, so both
 * sides always make the same decision.
 */
export const WIDE_STORY_QUERY = "(min-width: 48rem) and (min-aspect-ratio: 23/20)";

/**
 * The band the scene composes into: the whole viewport when wide, otherwise from under the header
 * to the top of the copy, which sits in the lower half of the viewport.
 */
export function storyWindow(height: number, wide: boolean): { top: number; height: number } {
  if (wide) return { top: 0, height };
  const top = STORY_HEADER_PX + 12;
  return { top, height: Math.max(120, height * 0.5 - top) };
}
