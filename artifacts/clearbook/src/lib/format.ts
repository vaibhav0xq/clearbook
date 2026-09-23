export function formatUSD(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatQuantity(value: number | null | undefined, maxDecimals = 6): string {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  }).format(value);
}

/** A positive quantity that rounds to zero at the shown precision reads as a bound, not as nothing. */
export function formatQuantityBound(value: number, maxDecimals: number): string {
  if (!Number.isFinite(value)) return "-";
  const step = 10 ** -maxDecimals;
  if (value !== 0 && Math.abs(value) < step / 2) return `${value > 0 ? "<" : ">-"}${step.toFixed(maxDecimals)}`;
  return formatQuantity(value === 0 ? 0 : value, maxDecimals);
}

/** A value below one cent in either direction reads as a bound, not as $0.00. */
export function formatUSDBound(value: number): string {
  if (!Number.isFinite(value)) return "-";
  if (value !== 0 && Math.abs(value) < 0.005) return value > 0 ? "<$0.01" : ">-$0.01";
  return formatUSD(value === 0 ? 0 : value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

/** Shares with the unit, for cells that mix quantities and money. */
export function formatShares(value: number | null | undefined, maxDecimals = 6): string {
  if (value === null || value === undefined) return "-";
  return `${formatQuantity(value, maxDecimals)} sh`;
}

/** Multiplier between token units and shares, four decimals with the x suffix. */
export function formatMultiplier(value: number | null | undefined, suffix = true): string {
  if (value === null || value === undefined) return "-";
  return `${value.toFixed(4)}${suffix ? "x" : ""}`;
}

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const DATE_TIME = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

const DATE_UTC = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "Sep 19, 2026" in the viewer's time zone, for timestamps. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? "-" : DATE.format(d);
}

/**
 * "Sep 19, 2026" for a calendar day such as a statement period bound. Period days are UTC days on the
 * server and arrive as midnight UTC, so they are printed as that day everywhere instead of shifting a
 * day earlier for viewers west of UTC.
 */
export function formatDay(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? "-" : DATE_UTC.format(d);
}

/** "Sep 19, 2026, 2:02 PM" in the viewer's time zone. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? "-" : DATE_TIME.format(d);
}

/** "2:02 PM" in the viewer's time zone. */
export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? "-" : TIME.format(d);
}

const DAY_TIME = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Time of day for today, otherwise the day as well, so "Indexed 3:13 PM" cannot refer to yesterday. */
export function formatRecentTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "-";
  const now = new Date();
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return sameDay ? TIME.format(d) : DAY_TIME.format(d);
}

/** Truncated hash or signature, for table cells. */
export function truncateHash(value: string, chars = 6): string {
  if (!value) return "";
  return value.length <= chars * 2 + 3 ? value : `${value.slice(0, chars)}...${value.slice(-chars)}`;
}

export function truncateAddress(address: string, chars = 4): string {
  if (!address) return "";
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function formatAge(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "";
  if (seconds < 1) return "just now";
  if (seconds < 60) return `${Math.round(seconds)} sec ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  return `${hours} hr ago`;
}

const ISSUER_LABELS: Record<string, string> = {
  xstocks: "xStocks",
  ondo: "Ondo",
  prestocks: "PreStocks",
  unknown: "Unknown issuer",
};

export function issuerLabel(issuer: string | null | undefined): string {
  if (!issuer) return "Unknown issuer";
  return ISSUER_LABELS[issuer] ?? issuer;
}

const KIND_LABELS: Record<string, string> = {
  buy: "Buy",
  sell: "Sell",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  wrapper_swap_in: "Wrapper swap in",
  wrapper_swap_out: "Wrapper swap out",
  multiplier_change: "Multiplier change",
  unknown: "Unclassified",
};

/** Sentence case label for a ledger event kind, matching the API's kindLabel. */
export function eventKindLabel(kind: string | null | undefined): string {
  if (!kind) return "Unclassified";
  return KIND_LABELS[kind] ?? kind.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
