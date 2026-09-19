import { randomUUID } from "node:crypto";
import { CASH_MINTS, USDC_MINT, getAsset, isDemoId, rawToUi, runLedger, type CostMethod, type LedgerEventInput } from "@workspace/ledger";
import { env } from "../lib/env";
import { badRequest, notFound } from "../lib/errors";
import { explorerTxUrl, fetchJson } from "../lib/http";
import { logger } from "../lib/logger";
import { indexWallet, isValidAddress } from "./indexer";
import { eventView, loadContext, walletStatusView } from "./portfolio";
import { rpc } from "./rpc";
import { getTradeQuote, insertEvent, insertTradeQuote, updateTradeQuoteStatus } from "./store";

const JUP = "https://lite-api.jup.ag/swap/v1";
/** Jupiter aggregator v6 program. Confirmed swaps must touch it. */
const JUPITER_PROGRAM_ID = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const QUOTE_TTL_MS = 90_000;

interface JupiterQuote {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: Array<{ swapInfo: { label?: string; ammKey?: string }; percent: number }>;
  contextSlot?: number;
}

export interface QuoteInput {
  mint: string;
  quantity: number;
  method?: CostMethod;
  slippageBps?: number;
  outputMint?: string;
}

export async function quoteTrade(address: string, input: QuoteInput) {
  const asset = getAsset(input.mint);
  if (!asset) throw badRequest("Unknown mint. Only registered tokenized stocks can be sold here.", { mint: input.mint });
  if (!(input.quantity > 0)) throw badRequest("quantity must be greater than zero.");
  const outputMint = input.outputMint ?? USDC_MINT;
  const cash = CASH_MINTS[outputMint];
  if (!cash) throw badRequest("Output must be a supported stablecoin.", { outputMint });
  const slippageBps = Math.min(Math.max(input.slippageBps ?? 50, 1), 1000);
  const method = input.method ?? "fifo";
  const ctx = await loadContext(address, method);
  const position = ctx.positions.find((p) => p.mint === input.mint && p.rawQuantity > 0n);
  if (!position) throw badRequest(`${asset.symbol} is not held in this wallet.`, { mint: input.mint });
  const bundle = ctx.pricing.marks.get(input.mint);
  const multiplier = bundle?.multiplier.current ?? 1;
  let raw = BigInt(Math.round((input.quantity / multiplier) * 10 ** asset.decimals));
  if (raw <= 0n) throw badRequest("Quantity is too small for this token.");
  const clipped = raw > position.rawQuantity;
  if (clipped) raw = position.rawQuantity;
  const quantity = rawToUi(raw, asset.decimals) * multiplier;

  const warnings: string[] = [];
  if (clipped) warnings.push("Quantity reduced to the amount held.");
  let route: JupiterQuote | null = null;
  let routeError: string | null = null;
  try {
    route = await fetchJson<JupiterQuote>(
      `${JUP}/quote?inputMint=${input.mint}&outputMint=${outputMint}&amount=${raw.toString()}&slippageBps=${slippageBps}&swapMode=ExactIn`,
      { timeoutMs: 8_000 },
    );
  } catch (err) {
    routeError = err instanceof Error ? err.message : String(err);
    logger.warn({ err: routeError, mint: input.mint }, "Jupiter quote failed");
  }

  const markPrice = bundle?.mark.price ?? null;
  let expectedProceeds: number;
  let minimumProceeds: number;
  let priceImpactPct: number | null = null;
  let routeLabels: string[] = [];
  let mode: "live" | "simulated" | "unavailable" = "simulated";
  if (route) {
    expectedProceeds = Number(route.outAmount) / 10 ** cash.decimals;
    minimumProceeds = Number(route.otherAmountThreshold) / 10 ** cash.decimals;
    priceImpactPct = Number(route.priceImpactPct) * 100;
    routeLabels = [...new Set(route.routePlan.map((r) => r.swapInfo.label ?? "Unknown venue"))];
    mode = "live";
  } else if (markPrice !== null) {
    expectedProceeds = quantity * markPrice;
    minimumProceeds = expectedProceeds * (1 - slippageBps / 10_000);
    routeLabels = ["Mark price"];
    warnings.push(`No Jupiter route was available (${routeError ?? "unknown error"}). Proceeds are estimated from the current mark.`);
  } else {
    throw badRequest("No route and no mark price for this token, so a quote cannot be produced.");
  }
  const pricePerShare = quantity > 0 ? expectedProceeds / quantity : 0;

  const hypothetical: LedgerEventInput = {
    id: `quote:${randomUUID()}`,
    signature: null,
    slot: null,
    blockTime: new Date(ctx.now.getTime() + 1),
    kind: "sell",
    mint: input.mint,
    rawDelta: -raw,
    grossUsd: expectedProceeds,
    feeUsd: 0,
    counterAsset: cash.symbol,
    counterAmount: expectedProceeds,
    multiplierAtEvent: multiplier,
    referencePriceUsd: null,
    source: "simulated",
    venue: "Jupiter",
    note: null,
  };
  const multipliers = new Map<string, number>();
  for (const [mint, b] of ctx.pricing.marks) multipliers.set(mint, b.multiplier.current);
  const projected = runLedger([...ctx.events, hypothetical], { method, multipliers, resolveAsset: getAsset });
  const processed = projected.events.find((e) => e.input.id === hypothetical.id);
  const reliefs = (processed?.reliefs ?? []).map((r) => ({
    lotId: r.lotId,
    quantity: rawToUi(r.rawQuantity, asset.decimals) * multiplier,
    costBasis: r.costBasisUsd,
    proceeds: r.proceedsUsd,
    realizedPnl: r.realizedUsd,
    term: r.term,
  }));
  if (reliefs.some((r) => r.costBasis === null)) warnings.push("Some lots being sold have no known cost, so the realized P/L estimate is partial.");
  if (bundle && (bundle.session.state === "closed" || bundle.session.state === "overnight")) {
    const state = bundle.session.state === "closed" ? "closed" : "in its overnight session";
    warnings.push(`${bundle.session.venue} is ${state}. The token still trades on Solana. Expect wider spreads.`);
  }
  if (bundle && bundle.premiumDiscount.differencePct !== null && Math.abs(bundle.premiumDiscount.differencePct) > 1) {
    warnings.push(`Token trades at a ${bundle.premiumDiscount.differencePct.toFixed(2)}% ${bundle.premiumDiscount.direction} to the reference market.`);
  }
  const isDemo = ctx.wallet.isDemo;
  const canExecuteOnChain = !isDemo && route !== null;
  const blockedReason = isDemo
    ? "Demo wallets cannot sign transactions. Simulate the sale to see the ledger update."
    : route === null
      ? "No Jupiter route was available for this size."
      : null;
  const expiresAt = new Date(ctx.now.getTime() + QUOTE_TTL_MS);
  const quoteId = `q_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const view = {
    quoteId,
    address,
    mint: input.mint,
    symbol: asset.symbol,
    issuer: asset.issuer,
    side: "sell" as const,
    quantity,
    rawAmount: raw.toString(),
    outputMint,
    outputSymbol: cash.symbol,
    expectedProceeds,
    minimumProceeds,
    pricePerShare,
    referencePrice: bundle?.referencePrice ?? null,
    priceImpactPct,
    slippageBps,
    route: routeLabels,
    mode,
    modeLabel: mode === "live" ? "Live Jupiter quote" : "Estimated from mark price",
    canExecuteOnChain,
    blockedReason,
    expiresAt: expiresAt.toISOString(),
    estimatedRealizedPnl: processed?.realizedUsd ?? null,
    reliefs,
    session: bundle?.session ?? { state: "unknown", label: "Session unknown", venue: "Unknown venue", timezone: "UTC", nextChangeAt: null, nextState: null },
    warnings,
  };
  await insertTradeQuote({
    id: quoteId,
    address,
    mint: input.mint,
    rawAmount: raw.toString(),
    quantity,
    quote: { ...view, method, multiplier },
    routeQuote: route ? (route as unknown as Record<string, unknown>) : null,
    status: "open",
    expiresAt,
  });
  return view;
}

async function requireQuote(address: string, quoteId: string) {
  const row = await getTradeQuote(quoteId);
  if (!row || row.address !== address) throw notFound("Quote not found.", { quoteId });
  return row;
}

/** A quote can be acted on once, before it expires. */
function assertActionable(row: Awaited<ReturnType<typeof requireQuote>>) {
  if (row.status === "confirmed" || row.status === "simulated") {
    throw badRequest(`This quote was already ${row.status}. Request a new quote.`, { quoteId: row.id });
  }
  if (row.expiresAt.getTime() < Date.now()) throw badRequest("Quote expired. Request a new quote.", { quoteId: row.id });
}

export async function prepareTrade(address: string, input: { quoteId: string; userPublicKey: string }) {
  const row = await requireQuote(address, input.quoteId);
  assertActionable(row);
  const quote = row.quote as { canExecuteOnChain?: boolean; blockedReason?: string | null };
  if (!quote.canExecuteOnChain) throw badRequest(quote.blockedReason ?? "This quote cannot be executed on chain.", { quoteId: row.id });
  if (!row.routeQuote) throw badRequest("This quote has no Jupiter route and cannot be executed on chain.", { quoteId: row.id });
  if (input.userPublicKey !== address) throw badRequest("userPublicKey must match the wallet address.");
  if (!isValidAddress(input.userPublicKey) || isDemoId(input.userPublicKey)) throw badRequest("userPublicKey is not a valid public key.");
  const res = await fetchJson<{ swapTransaction: string; lastValidBlockHeight: number }>(`${JUP}/swap`, {
    method: "POST",
    body: {
      quoteResponse: row.routeQuote,
      userPublicKey: input.userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: "auto",
    },
    timeoutMs: 12_000,
  });
  await updateTradeQuoteStatus(row.id, "prepared");
  return {
    quoteId: row.id,
    swapTransaction: res.swapTransaction,
    lastValidBlockHeight: res.lastValidBlockHeight,
    rpcUrl: env.rpcUrlPublic,
    expiresAt: row.expiresAt.toISOString(),
  };
}

export async function confirmTrade(address: string, input: { quoteId: string; signature: string }) {
  const row = await requireQuote(address, input.quoteId);
  if (row.status === "simulated") throw badRequest("This quote was simulated and cannot be confirmed on chain.", { quoteId: row.id });
  const quote = row.quote as { method?: CostMethod; expectedProceeds?: number };
  const tx = await rpc().getTransaction(input.signature);
  if (tx && !tx.transaction.message.accountKeys.some((k) => k.signer && k.pubkey === address)) {
    throw badRequest("The transaction was not signed by this wallet.", { signature: input.signature });
  }
  if (tx && !tx.transaction.message.accountKeys.some((k) => k.pubkey === JUPITER_PROGRAM_ID)) {
    throw badRequest("The transaction is not a Jupiter swap.", { signature: input.signature });
  }
  if (!tx) {
    const ctx = await loadContext(address, quote.method ?? "fifo");
    return {
      status: "pending" as const,
      mode: "live" as const,
      signature: input.signature,
      explorerUrl: explorerTxUrl(input.signature, env.cluster),
      event: null,
      realizedPnl: null,
      proceeds: 0,
      message: "Transaction not confirmed yet. Refresh the wallet in a moment to pick it up.",
      walletStatus: walletStatusView(ctx.wallet, ctx.simulatedTrades),
    };
  }
  if (tx.meta?.err) {
    await updateTradeQuoteStatus(row.id, "failed");
    const ctx = await loadContext(address, quote.method ?? "fifo");
    return {
      status: "failed" as const,
      mode: "live" as const,
      signature: input.signature,
      explorerUrl: explorerTxUrl(input.signature, env.cluster),
      event: null,
      realizedPnl: null,
      proceeds: 0,
      message: "The swap transaction failed on chain. Nothing was recorded.",
      walletStatus: walletStatusView(ctx.wallet, ctx.simulatedTrades),
    };
  }
  await indexWallet(address);
  await updateTradeQuoteStatus(row.id, "confirmed");
  const ctx = await loadContext(address, quote.method ?? "fifo");
  const processed = ctx.engine.events.find((e) => e.input.signature === input.signature && e.input.kind === "sell");
  return {
    status: "confirmed" as const,
    mode: "live" as const,
    signature: input.signature,
    explorerUrl: explorerTxUrl(input.signature, env.cluster),
    event: processed ? eventView(processed, ctx) : null,
    realizedPnl: processed?.realizedUsd ?? null,
    proceeds: processed?.input.grossUsd ?? quote.expectedProceeds ?? 0,
    message: processed ? "Swap confirmed and recorded in the ledger." : "Swap confirmed. The ledger was re-indexed but the sale was not recognized as a sell; check the activity list.",
    walletStatus: walletStatusView(ctx.wallet, ctx.simulatedTrades),
  };
}

export async function simulateTrade(address: string, input: { quoteId: string }) {
  const row = await requireQuote(address, input.quoteId);
  assertActionable(row);
  const quote = row.quote as {
    method?: CostMethod;
    multiplier?: number;
    expectedProceeds: number;
    outputSymbol: string;
    route: string[];
    mode: string;
  };
  // Holdings may have changed since the quote, for example through an earlier simulated sale.
  const before = await loadContext(address, quote.method ?? "fifo");
  const held = before.positions.find((p) => p.mint === row.mint)?.rawQuantity ?? 0n;
  if (held < BigInt(row.rawAmount)) {
    throw badRequest("The wallet no longer holds the quoted quantity. Request a new quote.", { quoteId: row.id });
  }
  const now = new Date();
  const event: LedgerEventInput = {
    id: `sim_${row.id}`,
    signature: null,
    slot: null,
    blockTime: now,
    kind: "sell",
    mint: row.mint,
    rawDelta: -BigInt(row.rawAmount),
    grossUsd: quote.expectedProceeds,
    feeUsd: 0,
    counterAsset: quote.outputSymbol,
    counterAmount: quote.expectedProceeds,
    multiplierAtEvent: quote.multiplier ?? null,
    referencePriceUsd: null,
    source: "simulated",
    venue: quote.mode === "live" ? "Jupiter (simulated)" : "Mark price (simulated)",
    note: "Simulated sale. No transaction was sent. Proceeds use the quoted amount.",
  };
  await insertEvent(address, event);
  await updateTradeQuoteStatus(row.id, "simulated");
  const ctx = await loadContext(address, quote.method ?? "fifo");
  const processed = ctx.engine.events.find((e) => e.input.id === event.id);
  return {
    status: "simulated" as const,
    mode: "simulated" as const,
    signature: null,
    explorerUrl: null,
    event: processed ? eventView(processed, ctx) : null,
    realizedPnl: processed?.realizedUsd ?? null,
    proceeds: quote.expectedProceeds,
    message: "Simulated sale recorded. Lots were relieved and realized P/L updated. Reset the wallet to remove simulated trades.",
    walletStatus: walletStatusView(ctx.wallet, ctx.simulatedTrades),
  };
}
