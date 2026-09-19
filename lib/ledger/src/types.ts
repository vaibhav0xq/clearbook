/**
 * Core domain types shared by the indexer, the lot engine, valuation and
 * statement generation. Everything monetary is USD. Token quantities are kept
 * in raw integer units (as bigint) wherever accounting happens so that
 * decimals and Token-2022 multipliers are applied explicitly and only once.
 */

export type IssuerId = "xstocks" | "ondo" | "prestocks" | "unknown";

export type CostMethod = "fifo" | "lifo" | "hifo";

export type AssetClass = "equity" | "etf" | "private_company";

export interface RegistryAsset {
  mint: string;
  symbol: string;
  name: string;
  issuer: IssuerId;
  underlyingSymbol: string;
  underlyingName: string;
  decimals: number;
  tokenProgram: string;
  assetClass: AssetClass;
  pythEquityFeed: string | null;
  pythWrapperFeed: string | null;
  multiplierSupported: boolean;
  logoUrl: string | null;
  verified: boolean;
  exchange: string | null;
}

export type EventKind =
  | "buy"
  | "sell"
  | "transfer_in"
  | "transfer_out"
  | "wrapper_swap_in"
  | "wrapper_swap_out"
  | "multiplier_change"
  | "unknown";

export type EventSource = "live" | "demo" | "simulated";

/**
 * A normalized ledger event: one change of a tokenized stock balance for one
 * wallet. Produced by the indexer (live), by demo scenarios or by a simulated
 * trade. The lot engine consumes these in block time order.
 */
export interface LedgerEventInput {
  id: string;
  signature: string | null;
  slot: number | null;
  blockTime: Date;
  kind: EventKind;
  mint: string;
  /** Signed raw token delta for the wallet. */
  rawDelta: bigint;
  /** Cash side in USD when known (positive number). */
  grossUsd: number | null;
  /** Fee in USD when known. */
  feeUsd: number | null;
  /** Counter asset symbol, for example USDC or another tokenized stock. */
  counterAsset: string | null;
  /** Counter asset amount in its own units. */
  counterAmount: number | null;
  /** Multiplier in force at the time of the event, when known. */
  multiplierAtEvent: number | null;
  /** Reference price per share at event time, used to value transfers when available. */
  referencePriceUsd: number | null;
  source: EventSource;
  venue: string | null;
  note: string | null;
}

export interface MultiplierObservation {
  mint: string;
  multiplier: number;
  pendingMultiplier: number | null;
  pendingEffectiveAt: Date | null;
  observedAt: Date;
  source: "onchain" | "jupiter" | "backed" | "demo" | "none";
}

export type BasisStatus = "complete" | "estimated" | "unknown";

export interface LotState {
  id: string;
  mint: string;
  openedAt: Date;
  openSignature: string | null;
  openKind: "buy" | "transfer_in" | "wrapper_swap" | "opening_balance";
  /** Raw units acquired. */
  rawQuantity: bigint;
  /** Raw units still open. */
  rawRemaining: bigint;
  /** Total cost basis in USD for the whole lot, null when unknown. */
  costBasisUsd: number | null;
  /** Multiplier at acquisition when known. */
  multiplierAtOpen: number | null;
  basisStatus: BasisStatus;
  basisNote: string | null;
  realizedUsd: number;
  closedAt: Date | null;
}

export interface ReliefRecord {
  lotId: string;
  rawQuantity: bigint;
  costBasisUsd: number | null;
  proceedsUsd: number;
  realizedUsd: number | null;
  term: "short" | "long";
  openedAt: Date;
}

export interface ProcessedEvent {
  input: LedgerEventInput;
  /** Price per share of exposure implied by the trade, when known. */
  pricePerShare: number | null;
  realizedUsd: number | null;
  reliefs: ReliefRecord[];
}

export interface EngineResult {
  lots: LotState[];
  events: ProcessedEvent[];
  /** Raw units per mint still held after all events. */
  rawBalances: Map<string, bigint>;
  warnings: string[];
}
