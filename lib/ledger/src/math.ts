/** Numeric helpers for raw token units and USD rounding. */

export function pow10(decimals: number): bigint {
  return 10n ** BigInt(decimals);
}

/** Converts raw integer units to a floating point token amount. */
export function rawToUi(raw: bigint, decimals: number): number {
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const base = pow10(decimals);
  const whole = abs / base;
  const frac = abs % base;
  const value = Number(whole) + Number(frac) / Number(base);
  return negative ? -value : value;
}

/** Converts a token amount to raw integer units, rounding to the nearest unit. */
export function uiToRaw(amount: number, decimals: number): bigint {
  if (!Number.isFinite(amount)) throw new Error("amount must be finite");
  const scaled = Math.round(amount * 10 ** decimals);
  return BigInt(scaled);
}

/** Shares of exposure represented by raw units under a multiplier. */
export function exposure(raw: bigint, decimals: number, multiplier: number): number {
  return rawToUi(raw, decimals) * multiplier;
}

export function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

export function roundTo(value: number, places: number): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

/** Splits an amount proportionally by raw units, avoiding drift on the last slice. */
export function proportion(total: number, part: bigint, whole: bigint): number {
  if (whole === 0n) return 0;
  return (total * Number(part)) / Number(whole);
}

export function pctChange(current: number, base: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(base) || base === 0) return null;
  return ((current - base) / Math.abs(base)) * 100;
}

export function sum(values: Array<number | null | undefined>): number {
  let total = 0;
  for (const v of values) if (typeof v === "number" && Number.isFinite(v)) total += v;
  return total;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * Long term means held for more than one year by the calendar, so a sale on the anniversary of the
 * acquisition is still short term even when a leap day made that year 366 days long.
 */
export function isLongTerm(openedAt: Date, closedAt: Date): boolean {
  const year = openedAt.getUTCFullYear() + 1;
  const month = openedAt.getUTCMonth();
  // A 29 February acquisition has its anniversary on 28 February in a common year.
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const anniversary = Date.UTC(year, month, Math.min(openedAt.getUTCDate(), lastDay));
  const soldDay = Date.UTC(closedAt.getUTCFullYear(), closedAt.getUTCMonth(), closedAt.getUTCDate());
  return soldDay > anniversary;
}
