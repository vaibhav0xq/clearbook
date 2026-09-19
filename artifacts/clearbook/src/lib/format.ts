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

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
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
