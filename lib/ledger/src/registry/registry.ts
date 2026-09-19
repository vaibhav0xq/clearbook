import assetsSnapshot from "./assets.json";
import type { IssuerId, RegistryAsset } from "../types";

interface AssetsSnapshot {
  generatedAt: string;
  sources: string[];
  assets: RegistryAsset[];
}

const snapshot = assetsSnapshot as AssetsSnapshot;

export const REGISTRY_SNAPSHOT_AT = snapshot.generatedAt;

export const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

/** Stable assets accepted as the cash leg of a trade. */
export const CASH_MINTS: Record<string, { symbol: string; decimals: number }> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: "USDC", decimals: 6 },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCdF9y4ffN: { symbol: "USDT", decimals: 6 },
  "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH": { symbol: "USDG", decimals: 6 },
  "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo": { symbol: "PYUSD", decimals: 6 },
  USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB: { symbol: "USD1", decimals: 6 },
};

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const WSOL_MINT = "So11111111111111111111111111111111111111112";

export interface IssuerProfile {
  id: IssuerId;
  name: string;
  shortName: string;
  structure: string;
  dividendHandling: string;
  redemption: string;
  website: string;
  eligibilityNote: string;
  tokenProgram: string;
}

export const ISSUERS: IssuerProfile[] = [
  {
    id: "xstocks",
    name: "xStocks by Backed",
    shortName: "xStocks",
    structure:
      "Swiss law tracker certificates issued by Backed Assets (JE) Limited, fully collateralised by the underlying shares held with regulated custodians.",
    dividendHandling:
      "Cash dividends are reinvested net of withholding tax. The reinvestment appears as an increase of the Token-2022 multiplier, not as a new token transfer.",
    redemption:
      "Primary issuance and redemption for professional investors through Backed. Retail holders trade on Solana DEXs and supported exchanges.",
    website: "https://xstocks.com",
    eligibilityNote:
      "Not offered to US persons and other restricted jurisdictions. Check the issuer terms before buying.",
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  },
  {
    id: "ondo",
    name: "Ondo Global Markets",
    shortName: "Ondo",
    structure:
      "Tokens issued by Ondo Global Markets, backed one to one by shares held with a US broker dealer.",
    dividendHandling:
      "Dividends are reinvested and reflected through the Token-2022 scaled amount multiplier.",
    redemption:
      "Mint and redeem through Ondo with 24/5 access for eligible non US investors.",
    website: "https://ondo.finance/global-markets",
    eligibilityNote:
      "Not available to US persons. Eligibility depends on Ondo onboarding and jurisdiction.",
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  },
  {
    id: "prestocks",
    name: "PreStocks",
    shortName: "PreStocks",
    structure:
      "Tokens backed one to one by exposure to private company shares held in a special purpose vehicle.",
    dividendHandling:
      "Private companies do not pay regular dividends. Corporate events are handled by the issuer and announced separately.",
    redemption:
      "No public redemption. Liquidity is provided on Solana. Positions are marked against the PreStocks mark price.",
    website: "https://prestocks.com",
    eligibilityNote:
      "Private company exposure is illiquid and the mark price is an estimate published by the issuer.",
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  },
];

const byMint = new Map<string, RegistryAsset>();
const bySymbol = new Map<string, RegistryAsset>();

for (const asset of snapshot.assets) {
  byMint.set(asset.mint, asset);
  bySymbol.set(asset.symbol.toLowerCase(), asset);
}

export function listAssets(): RegistryAsset[] {
  return snapshot.assets;
}

export function getAsset(mint: string): RegistryAsset | undefined {
  return byMint.get(mint);
}

export function getAssetBySymbol(symbol: string): RegistryAsset | undefined {
  return bySymbol.get(symbol.toLowerCase());
}

export function requireAsset(mint: string): RegistryAsset {
  const asset = byMint.get(mint);
  if (!asset) {
    throw new Error(`Unknown tokenized stock mint ${mint}`);
  }
  return asset;
}

export function isVerifiedMint(mint: string): boolean {
  return byMint.has(mint);
}

/**
 * Registers or refreshes an asset discovered at runtime from an issuer API.
 * Only verified issuer sources should call this.
 */
export function upsertAsset(asset: RegistryAsset): void {
  const existing = byMint.get(asset.mint);
  const merged = existing ? { ...existing, ...asset } : asset;
  if (!existing) {
    snapshot.assets.push(merged);
  } else {
    Object.assign(existing, merged);
  }
  byMint.set(asset.mint, merged);
  bySymbol.set(asset.symbol.toLowerCase(), merged);
}

export function getIssuer(id: IssuerId): IssuerProfile | undefined {
  return ISSUERS.find((i) => i.id === id);
}

export function issuerLabel(id: IssuerId): string {
  return getIssuer(id)?.shortName ?? "Unknown";
}

export function assetCountByIssuer(): Record<IssuerId, number> {
  const counts: Record<IssuerId, number> = { xstocks: 0, ondo: 0, prestocks: 0, unknown: 0 };
  for (const asset of snapshot.assets) counts[asset.issuer] += 1;
  return counts;
}

/** Cash mint helpers for the transaction classifier. */
export function cashInfo(mint: string): { symbol: string; decimals: number } | undefined {
  return CASH_MINTS[mint];
}
