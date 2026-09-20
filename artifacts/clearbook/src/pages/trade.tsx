import { useState, useEffect } from "react";
import { Link, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Loader2, Info, CheckCircle2, Clock, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { invalidateWalletQueries } from "@/lib/wallet-queries";
import { 
  useGetPortfolio, 
  useListLots,
  useQuoteTrade, 
  usePrepareTrade, 
  useConfirmTrade, 
  useSimulateTrade,
  type CostMethod,
  type TradeQuote
} from "@workspace/api-client-react";
import { useCostMethod } from "@/hooks/use-cost-method";
import { useWalletSession } from "@/lib/wallet";
import { formatUSD, formatQuantity, formatPercent, formatDate, formatTime, eventKindLabel } from "@/lib/format";
import { useStage, useStageContext } from "@/components/layout/stage";

import { Panel, PageHeader, SectionTitle, Pill, Skeleton, ErrorState, EmptyState } from "@/components/surface";
import { Figure } from "@/components/figure";
import { Reveal, EASE_OUT } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";
import { DataTable, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/data-table";
import { reliefPreview, reliefOrder } from "@/components/three/strata-data";

/** Execution state is bound to the quote it belongs to, so a late result can never attach to another quote. */
type Execution =
  | { phase: "error"; quoteId: string; message: string }
  | { phase: "pending"; quoteId: string; signature: string; message: string; explorerUrl: string | null }
  | { phase: "failed"; quoteId: string; message: string; explorerUrl: string | null }
  | { phase: "recorded"; quoteId: string; simulated: boolean; message: string; explorerUrl: string | null };

/** The stages of a sale, shown in the quote panel before a quantity is entered. */
const SALE_STEPS: { title: string; detail: string }[] = [
  { title: "Quote", detail: "Jupiter prices the sale and the lots it relieves are estimated." },
  { title: "Review", detail: "Proceeds, price impact and the realized result, valid for a short window." },
  { title: "Sign", detail: "The owning wallet signs. Without one the sale is recorded as a simulation." },
  { title: "Confirm", detail: "The transaction is checked on chain and the ledger and activity update." },
];

export default function Trade() {
  const [, params] = useRoute("/w/:address/trade");
  const address = params?.address || "";
  const { method } = useCostMethod();
  const wallet = useWalletSession();
  const queryClient = useQueryClient();

  const [selectedMint, setSelectedMint] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");

  const { data: portfolio, isLoading: isPortfolioLoading, error: portfolioError } = useGetPortfolio(address, { method });
  const { data: lots, isLoading: isLotsLoading, error: lotsError } = useListLots(address, { method, status: "open" });
  const quoteQuery = useQuoteTrade();
  const prepareMutation = usePrepareTrade();
  const confirmMutation = useConfirmTrade();
  const simulateMutation = useSimulateTrade();

  // A quote is only valid for the asset, quantity and method it was requested with. Keying it this way
  // drops a quote the moment any of those change, including one that resolves after the change.
  const [quoteState, setQuoteState] = useState<{ key: string; method: CostMethod; quote: TradeQuote } | null>(null);
  const quoteKey = `${selectedMint}|${quantity}|${method}`;
  const [isExecuting, setIsExecuting] = useState(false);
  // "error" means nothing was sent and the quote is still usable. Every other phase consumes the quote:
  // "pending" has a transaction on the network that is not confirmed yet, "failed" failed on chain.
  const [executionState, setExecutionState] = useState<Execution | null>(null);
  // Only the execution of the quote on screen counts. Anything else belongs to a quote that is gone.
  const execution = executionState && quoteState && executionState.quoteId === quoteState.quote.quoteId ? executionState : null;
  const quoteConsumed = execution !== null && execution.phase !== "error";
  // A quote that was acted on stays on screen with its result even if the method control changes.
  const quote = quoteState && (quoteState.key === quoteKey || quoteConsumed) ? quoteState.quote : null;
  const quoteMethod = quoteState?.method ?? method;
  // While a transaction is being signed, sent or awaited nothing on the page may change under it.
  const locked = isExecuting || execution?.phase === "pending";
  const resetExecution = () => {
    if (locked) return;
    setQuoteState(null);
    setExecutionState(null);
  };

  // The largest position is preselected so the page and the stage never start empty. A position that
  // was sold in full stays selected while its confirmation is on screen, then the next one takes over.
  useEffect(() => {
    if (!portfolio?.positions.length) return;
    const stillHeld = portfolio.positions.some((p) => p.mint === selectedMint);
    if (!selectedMint || (!stillHeld && execution?.phase !== "recorded")) setSelectedMint(portfolio.positions[0].mint);
  }, [portfolio, selectedMint, execution]);

  // Quotes expire. The clock only runs while a quote is on screen and stops once it is used.
  const [now, setNow] = useState(() => Date.now());
  const quoteExpiresAt = quote ? new Date(quote.expiresAt).getTime() : null;
  useEffect(() => {
    if (quoteExpiresAt === null || quoteConsumed) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [quoteExpiresAt, quoteConsumed]);
  const quoteExpired = quoteExpiresAt !== null && !quoteConsumed && quoteExpiresAt <= now;

  const numQuantity = Number(quantity);
  
  const { columns } = useStageContext();
  
  const selectedColumn = columns.find(c => c.mint === selectedMint);
  const selectedPosition = portfolio?.positions.find(p => p.mint === selectedMint);

  // The holding is shown to six decimals, so the maximum is floored to the same precision. The API clips
  // anything above the balance held, but a clear message here is better than a warning on the quote.
  const maxQuantity = selectedPosition ? Math.floor(selectedPosition.quantity * 1e6) / 1e6 : 0;
  const quantityProblem =
    quantity === ""
      ? null
      : !Number.isFinite(numQuantity) || numQuantity <= 0
        ? "Enter a quantity above zero."
        : selectedPosition && numQuantity > selectedPosition.quantity + 1e-9
          ? `Only ${formatQuantity(selectedPosition.quantity)} sh of ${selectedPosition.symbol} are held.`
          : null;
  const canQuote = quantity !== "" && quantityProblem === null && !quoteQuery.isPending && !locked;

  const hasLotDetail = !!lots && !lotsError;
  const previewQuantity = quantityProblem === null && numQuantity > 0 ? numQuantity : 0;
  const previewMap = hasLotDetail && selectedColumn && previewQuantity > 0 && !quote
    ? reliefPreview(selectedColumn, method, previewQuantity)
    : null;
  // The queue reads before any quantity is typed, so the reader sees what a sale would touch first.
  const queue = hasLotDetail && selectedColumn && !quote ? reliefOrder(selectedColumn, method) : [];

  let caption = "Select a position and quantity to preview the sale.";
  if (quote) {
    const sign = (quote.estimatedRealizedPnl || 0) > 0 ? "+" : "";
    const pnlLabel = quote.estimatedRealizedPnl === null ? "unknown" : `${sign}${formatUSD(quote.estimatedRealizedPnl)}`;
    const size = `${formatQuantity(quote.quantity)} ${quote.symbol}`;
    caption =
      execution?.phase === "recorded"
        ? `${execution.simulated ? "Simulated sale of" : "Sold"} ${size} for ${formatUSD(quote.expectedProceeds)} with ${pnlLabel} realized under ${quoteMethod.toUpperCase()}.`
        : execution?.phase === "pending"
          ? `Sale of ${size} sent to the network. Waiting for confirmation.`
          : execution?.phase === "failed"
            ? `The sale of ${size} failed on chain. Nothing was recorded.`
            : `Selling ${size} returns ${formatUSD(quote.expectedProceeds)} with ${pnlLabel} realized under ${quoteMethod.toUpperCase()}.`;
  } else if (selectedPosition && previewQuantity > 0) {
    caption = `A sale of ${formatQuantity(previewQuantity)} ${selectedPosition.symbol} would relieve the lifted lots under ${method.toUpperCase()}.`;
  } else if (selectedPosition) {
    caption = `Enter a quantity of ${selectedPosition.symbol} to preview which lots a sale relieves.`;
  }

  useStage({
    focusMint: selectedMint || null,
    // The stage only lifts real lots. Without lot detail there is nothing honest to preview.
    preview: hasLotDetail && selectedMint && previewQuantity > 0 ? { mint: selectedMint, quantity: previewQuantity } : null,
    caption
  });

  const handleGetQuote = async () => {
    if (!selectedMint || !canQuote || locked) return;
    setExecutionState(null);
    const key = quoteKey;
    try {
      const result = await quoteQuery.mutateAsync({
        address,
        data: { mint: selectedMint, quantity: numQuantity, method }
      });
      setQuoteState({ key, method, quote: result });
    } catch (e) {
      // Handled by query state
    }
  };

  const errorMessage = (e: unknown, fallback: string) => {
    const err = e as { data?: { message?: string }; message?: string };
    return err.data?.message || err.message || fallback;
  };

  // Reads the network result for a transaction that was already sent. Never sends anything.
  const settleOnChain = async (quoteId: string, signature: string) => {
    try {
      const result = await confirmMutation.mutateAsync({ address, data: { quoteId, signature } });
      if (result.status === "confirmed") {
        setExecutionState({ phase: "recorded", quoteId, simulated: false, message: result.message, explorerUrl: result.explorerUrl });
      } else if (result.status === "failed") {
        setExecutionState({ phase: "failed", quoteId, message: result.message, explorerUrl: result.explorerUrl });
      } else {
        setExecutionState({ phase: "pending", quoteId, signature, message: result.message, explorerUrl: result.explorerUrl });
      }
    } catch (e) {
      setExecutionState({
        phase: "pending",
        quoteId,
        signature,
        message: `${errorMessage(e, "The transaction status could not be read.")} The transaction was sent. Check again in a moment.`,
        explorerUrl: null,
      });
    }
  };

  const executeTrade = async () => {
    if (!quote || isExecuting) return;
    const quoteId = quote.quoteId;
    setIsExecuting(true);
    try {
      if (execution?.phase === "pending") {
        await settleOnChain(execution.quoteId, execution.signature);
      } else if (quoteExpired || quoteConsumed) {
        return;
      } else if (onChain && wallet.publicKey) {
        setExecutionState(null);
        let txData;
        try {
          txData = await prepareMutation.mutateAsync({ address, data: { quoteId, userPublicKey: wallet.publicKey } });
        } catch (e) {
          setExecutionState({ phase: "error", quoteId, message: errorMessage(e, "The transaction could not be prepared. Nothing was sent.") });
          return;
        }
        let signature: string;
        try {
          signature = await wallet.signAndSendTransaction(txData.swapTransaction);
        } catch (e) {
          setExecutionState({ phase: "error", quoteId, message: `${errorMessage(e, "Signing was cancelled.")} Nothing was sent and the quote is still usable.` });
          return;
        }
        // From here the quote is consumed whatever the network says, so the button can never send twice.
        setExecutionState({ phase: "pending", quoteId, signature, message: "Transaction sent. Waiting for confirmation.", explorerUrl: null });
        await settleOnChain(quoteId, signature);
      } else {
        setExecutionState(null);
        try {
          const result = await simulateMutation.mutateAsync({ address, data: { quoteId } });
          setExecutionState({ phase: "recorded", quoteId, simulated: true, message: result.message, explorerUrl: null });
        } catch (e) {
          setExecutionState({ phase: "error", quoteId, message: errorMessage(e, "The simulated sale could not be recorded.") });
          return;
        }
      }
      await invalidateWalletQueries(queryClient, address);
    } finally {
      setIsExecuting(false);
    }
  };

  const onChain = !!quote?.canExecuteOnChain && wallet.connected && wallet.publicKey === address;
  const simulationNote = quote
    ? quote.blockedReason ??
      (onChain ? null : wallet.connected
        ? "The connected wallet does not own this ledger. The sale is recorded as a simulation."
        : "No wallet is connected. The sale is recorded as a simulation and never leaves Clearbook.")
    : null;

  const isLoading = isPortfolioLoading || isLotsLoading;

  return (
    <>
      <PageHeader
        title="Trade"
        description="Sell a position through Jupiter and see the lots the sale relieves, the cost they carry and the realized result, before anything is signed."
      />
      {!isLoading && !selectedPosition && execution?.phase === "recorded" && (
        <Reveal>
          <Panel className="mb-10 flex flex-col gap-5 border-success/30 bg-success/[0.03] p-6 md:flex-row md:items-center md:justify-between md:p-8">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
              <div className="flex flex-col gap-1">
                <span className="text-[15px] text-foreground">{execution.simulated ? "Simulated sale recorded" : "Sale recorded"}</span>
                <span className="text-[13px] leading-relaxed text-muted-foreground">{execution.message} The position was sold in full.</span>
                <Link href={`/w/${address}/activity`} className="mt-1 w-fit text-[13px] text-primary underline-offset-4 transition-colors hover:text-foreground hover:underline">
                  See it in activity
                </Link>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                resetExecution();
                setQuantity("");
                setSelectedMint("");
              }}
              className="shrink-0 rounded-full border hairline bg-white/[0.03] px-4 py-2 text-[13px] text-foreground transition-colors hover:border-white/20 hover:bg-white/[0.06]"
            >
              Continue
            </button>
          </Panel>
        </Reveal>
      )}
      {isLoading ? (
        <div className="flex flex-col gap-10">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <Skeleton className="xl:col-span-5 h-[400px] rounded-2xl" />
            <Skeleton className="xl:col-span-7 h-[400px] rounded-2xl" />
          </div>
        </div>
      ) : portfolioError ? (
        <ErrorState title="Unable to load positions" message={portfolioError.data?.message ?? portfolioError.message} />
      ) : portfolio && portfolio.positions.length === 0 ? (
        <EmptyState
          title="Nothing to sell"
          description="This ledger holds no tokenized stock balances. Positions appear here once tokens are indexed."
        />
      ) : portfolio ? (
        <div className="flex flex-col gap-10 md:gap-14">
          {lotsError && (
            <ErrorState title="Unable to load open lots" message={`${lotsError.data?.message ?? lotsError.message} Quotes still work, but the relief preview is unavailable until lots load.`} />
          )}

          <section className="flex flex-col gap-4">
            <span className="label text-muted-foreground">Position to sell</span>
            <div className="flex flex-wrap gap-2.5">
              {portfolio.positions.map(p => (
                <button
                  key={p.mint}
                  type="button"
                  aria-pressed={selectedMint === p.mint}
                  disabled={locked}
                  onClick={() => { if (locked) return; setSelectedMint(p.mint); resetExecution(); }}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg border hairline px-3.5 py-2 transition-colors",
                    selectedMint === p.mint
                      ? "border-primary/40 bg-primary/[0.08] text-primary"
                      : "bg-white/[0.02] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
                    locked && selectedMint !== p.mint && "opacity-50"
                  )}
                >
                  <span className="num text-[13px]">{p.symbol}</span>
                  <span className="num text-[11px] opacity-60">{formatQuantity(p.quantity)} sh</span>
                </button>
              ))}
            </div>
          </section>

          {selectedPosition && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-7 border-t hairline pt-6 md:grid-cols-4 lg:grid-cols-4">
              <Figure label="Holding" value={`${formatQuantity(selectedPosition.quantity)} sh`} size="md" sub={`${selectedPosition.openLots} open ${selectedPosition.openLots === 1 ? "lot" : "lots"}`} />
              <Figure label="Mark" value={selectedPosition.mark.price} size="md" sub={selectedPosition.mark.sourceLabel} />
              <Figure label="Market value" value={selectedPosition.marketValue} size="md" sub={`${formatUSD(selectedPosition.costBasis)} cost`} />
              <Figure label="Unrealized" value={selectedPosition.unrealizedPnl} tone size="md" sub={formatPercent(selectedPosition.unrealizedPnlPct)} subTone={selectedPosition.unrealizedPnl} />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[400px_minmax(0,1fr)] xl:grid-cols-[420px_minmax(0,1fr)] gap-8 lg:gap-12">
            <div className="flex flex-col gap-10">
              <AnimatePresence mode="wait">
                {selectedPosition && (
                  <motion.div
                    key="ticket"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 12 }}
                    transition={{ duration: 0.5, ease: EASE_OUT }}
                  >
                    <Panel className="p-6 md:p-8 flex flex-col gap-6 h-full border hairline bg-white/[0.02]">
                      <div className="flex items-center justify-between">
                        <span className="label text-muted-foreground">Quantity</span>
                        <button 
                          type="button" 
                          disabled={locked}
                          onClick={() => { if (locked) return; setQuantity(String(maxQuantity)); resetExecution(); }}
                          className="num text-[11px] uppercase tracking-[0.12em] text-primary hover:text-foreground transition-colors"
                        >
                          Sell all {formatQuantity(selectedPosition.quantity)}
                        </button>
                      </div>
                      <div className="relative">
                        <input 
                          id="qty"
                          type="number"
                          min="0"
                          max={maxQuantity}
                          step="any"
                          inputMode="decimal"
                          aria-label={`Quantity of ${selectedPosition.symbol} to sell`}
                          aria-invalid={quantityProblem !== null}
                          value={quantity}
                          disabled={locked}
                          onChange={e => { if (locked) return; setQuantity(e.target.value); resetExecution(); }}
                          onKeyDown={e => { if (e.key === "Enter" && canQuote) void handleGetQuote(); }}
                          placeholder="0.00"
                          className={cn(
                            "glass-strong h-16 w-full rounded-2xl pl-5 pr-20 text-[24px] num text-foreground outline-none transition-shadow focus:ring-1",
                            quantityProblem ? "ring-1 ring-destructive/50 focus:ring-destructive/60" : "focus:ring-primary/50",
                          )}
                        />
                        <span className="absolute right-5 top-1/2 -translate-y-1/2 num text-[14px] text-muted-foreground">
                          sh
                        </span>
                      </div>

                      <div className="flex flex-col gap-1.5 text-[12px] text-muted-foreground">
                        {quantityProblem ? (
                          <span className="flex items-center gap-1.5 text-destructive">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            {quantityProblem}
                          </span>
                        ) : previewQuantity > 0 ? (
                          <span className="num">
                            About {formatUSD(previewQuantity * (selectedPosition.mark.price ?? 0))} at the current mark, before route pricing and fees.
                          </span>
                        ) : (
                          <span>Shares of exposure, not raw tokens. Partial quantities are allowed.</span>
                        )}
                      </div>

                      <div className="mt-auto pt-6 flex flex-col gap-3">
                        <button 
                          type="button"
                          onClick={handleGetQuote}
                          disabled={!canQuote}
                          className={cn(
                            "group flex h-14 w-full items-center justify-center gap-2 rounded-xl text-[13px] tracking-[0.08em] uppercase transition-all",
                            !canQuote
                              ? "bg-white/[0.03] text-muted-foreground cursor-not-allowed"
                              : "bg-white/[0.08] text-foreground hover:bg-white/[0.12] border hairline hover:border-white/20"
                          )}
                        >
                          {quoteQuery.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Review quote"}
                        </button>
                        {quoteQuery.isError && (
                          <div className="text-[13px] text-destructive flex items-start gap-2 mt-2">
                            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                            <span className="leading-relaxed">{quoteQuery.error?.data?.message ?? quoteQuery.error?.message ?? "The quote could not be produced."}</span>
                          </div>
                        )}
                      </div>
                    </Panel>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex flex-col gap-10 md:gap-14">
              <AnimatePresence mode="wait">
                {selectedPosition ? (
                  <motion.div
                    key="quote-panel"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 12 }}
                    transition={{ duration: 0.5, ease: EASE_OUT }}
                  >
                    <Panel className="p-6 md:p-8 flex flex-col gap-6 h-full border hairline bg-white/[0.02]">
                      <div className="flex items-center justify-between">
                        <span className="label text-muted-foreground">Quote</span>
                        {quote && !quoteConsumed && (
                          <span className={cn("num text-[11px] uppercase tracking-[0.12em]", quoteExpired ? "text-destructive" : "text-muted-foreground")}>
                            {quoteExpired ? "Expired" : `Valid until ${formatTime(quote.expiresAt)}`}
                          </span>
                        )}
                      </div>
                      {quote ? (
                        <Reveal className="flex flex-col flex-1 gap-8">
                          <div className="grid grid-cols-2 gap-8">
                            <Figure
                              label="Expected proceeds"
                              value={quote.expectedProceeds}
                              size="lg"
                              sub={`At least ${formatUSD(quote.minimumProceeds)} in ${quote.outputSymbol} after slippage`}
                            />
                            <Figure label="Realized" value={quote.estimatedRealizedPnl} tone size="lg" sub={`Estimated against open lots under ${quoteMethod.toUpperCase()}`} />
                          </div>
                          
                          <div className="grid grid-cols-2 gap-6 border-t hairline pt-6 md:grid-cols-4">
                            <div className="flex flex-col gap-1.5">
                              <span className="label text-muted-foreground">Execution price</span>
                              <span className="num text-[16px] text-foreground">{formatUSD(quote.pricePerShare)}</span>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <span className="label text-muted-foreground">Reference price</span>
                              <span className="num text-[16px] text-foreground">{formatUSD(quote.referencePrice)}</span>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <span className="label text-muted-foreground">Price impact</span>
                              <span className="num text-[16px] text-foreground">{quote.priceImpactPct === null ? "Unknown" : `${quote.priceImpactPct.toFixed(2)}%`}</span>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <span className="label text-muted-foreground">Slippage</span>
                              <span className="num text-[16px] text-foreground">{(quote.slippageBps / 100).toFixed(2)}%</span>
                            </div>
                          </div>
                          
                          <div className="flex flex-col gap-4 border-t hairline pt-6">
                            <div className="flex items-start justify-between gap-6">
                              <span className="label text-muted-foreground">Route</span>
                              <span className="flex flex-wrap items-center justify-end gap-2 text-right text-[14px] text-foreground">
                                {quote.route.length === 0 ? (
                                  <span className="text-muted-foreground">No route, priced at the mark</span>
                                ) : (
                                  quote.route.map((node, i) => (
                                    <span key={i} className="flex items-center gap-2">
                                      {i > 0 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
                                      {node}
                                    </span>
                                  ))
                                )}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="label text-muted-foreground">Execution</span>
                              <span className="text-[14px] text-foreground flex items-center gap-2">
                                {quote.modeLabel} <Pill tone={quote.canExecuteOnChain ? "gain" : "amber"}>{quote.mode}</Pill>
                              </span>
                            </div>
                          </div>
                          
                          {quote.warnings?.length > 0 && (
                            <div className="flex flex-col gap-2 border-t hairline pt-6">
                              {quote.warnings.map((w, i) => (
                                <div key={i} className="flex items-start gap-2 text-[13px] text-primary">
                                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                  <span className="leading-relaxed">{w}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {simulationNote && (
                            <div className="flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/[0.06] px-5 py-4 text-[13px]">
                              <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                              <div className="flex flex-col gap-1">
                                <span className="text-foreground font-medium">Execution simulated</span>
                                <span className="text-muted-foreground leading-relaxed">{simulationNote}</span>
                              </div>
                            </div>
                          )}

                          <div className="mt-auto pt-6 border-t hairline">
                            <button 
                              type="button"
                              onClick={quoteExpired || execution?.phase === "failed" ? handleGetQuote : executeTrade}
                              disabled={isExecuting || execution?.phase === "recorded" || quoteQuery.isPending}
                              className={cn(
                                "group w-full inline-flex h-14 items-center justify-center gap-2 rounded-xl text-[13px] tracking-[0.12em] uppercase transition-all",
                                execution?.phase === "recorded"
                                  ? "bg-success/10 text-success border border-success/30"
                                  : quoteExpired || execution?.phase === "failed"
                                    ? "bg-white/[0.03] border hairline text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
                                    : onChain || execution?.phase === "pending"
                                      ? "bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 hover:border-primary/50" 
                                      : "bg-white/[0.08] border hairline text-foreground hover:bg-white/[0.12]"
                              )}
                            >
                              {isExecuting || quoteQuery.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : execution?.phase === "recorded" ? <CheckCircle2 className="h-5 w-5" /> : null}
                              {execution?.phase === "recorded"
                                ? "Recorded"
                                : execution?.phase === "pending"
                                  ? isExecuting ? "Waiting for confirmation" : "Check status"
                                  : execution?.phase === "failed"
                                    ? "Request a new quote"
                                    : quoteExpired
                                      ? "Quote expired, request again"
                                      : onChain
                                        ? "Sign and execute"
                                        : "Record simulated sale"}
                            </button>
                            
                            {execution && (
                              <div
                                className={cn(
                                  "mt-4 flex items-start gap-2 text-[13px]",
                                  execution.phase === "recorded" ? "text-success" : execution.phase === "pending" ? "text-primary" : "text-destructive",
                                )}
                              >
                                {execution.phase === "recorded" ? (
                                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                                ) : execution.phase === "pending" ? (
                                  <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                                ) : (
                                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                )}
                                <span className="flex flex-col gap-1 leading-relaxed">
                                  <span>{execution.message}</span>
                                  {"explorerUrl" in execution && execution.explorerUrl && (
                                    <a href={execution.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 text-foreground underline-offset-4 hover:underline">
                                      View on explorer <ExternalLink className="h-3 w-3" />
                                    </a>
                                  )}
                                </span>
                              </div>
                            )}
                          </div>
                        </Reveal>
                      ) : (
                        <div className="flex flex-1 flex-col gap-6">
                          <p className="max-w-[56ch] text-[13px] leading-relaxed text-muted-foreground">
                            {previewQuantity > 0
                              ? `Review the quote to see the route, proceeds, price impact and the realized result of selling ${formatQuantity(previewQuantity)} ${selectedPosition.symbol}.`
                              : `Enter a quantity of ${selectedPosition.symbol} to request a quote. The relief queue below shows which lots a sale would take first under ${method.toUpperCase()}.`}
                          </p>
                          <ol className="grid grid-cols-2 gap-x-6 gap-y-5 border-t hairline pt-5 md:grid-cols-4">
                            {SALE_STEPS.map((step, i) => (
                              <li key={step.title} className="flex flex-col gap-1.5">
                                <span className="flex items-center gap-2">
                                  <span className={cn("num text-[11px]", i === 0 ? "text-primary" : "text-muted-foreground/60")}>{i + 1}</span>
                                  <span className={cn("text-[13px]", i === 0 ? "text-foreground" : "text-muted-foreground")}>{step.title}</span>
                                </span>
                                <span className="text-[11px] leading-relaxed text-muted-foreground/70">{step.detail}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                    </Panel>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {(quote?.reliefs.length || queue.length > 0) ? (
                <Reveal delay={0.1}>
                  <section>
                    <SectionTitle
                      aside={
                        quote ? null : previewMap ? (
                          <Pill tone="amber">Preview</Pill>
                        ) : (
                          <span>
                            {method.toUpperCase()} order, {queue.length} {queue.length === 1 ? "lot" : "lots"}
                          </span>
                        )
                      }
                    >
                      {quote ? "Relieved lots" : previewMap ? "Estimated relief" : "Relief queue"}
                    </SectionTitle>
                    <DataTable>
                      <TableHeader>
                        <TableHead>Lot</TableHead>
                        <TableHead>Acquired</TableHead>
                        <TableHead className="hidden lg:table-cell">Holding</TableHead>
                        <TableHead align="right">Quantity relieved</TableHead>
                        <TableHead align="right">Cost relieved</TableHead>
                        <TableHead align="right" className="hidden lg:table-cell">Cost per share</TableHead>
                        {quote && <TableHead align="right" className="hidden lg:table-cell">Proceeds</TableHead>}
                        {quote ? <TableHead align="right">Realized</TableHead> : <TableHead align="right">Unrealized</TableHead>}
                      </TableHeader>
                      <TableBody>
                        {quote ? (
                          quote.reliefs.map((r, i) => {
                            const lot = lots?.find(l => l.id === r.lotId);
                            const openedLabel = lot?.openedAt ? formatDate(lot.openedAt) : "Opening balance";
                            
                            return (
                              <TableRow key={r.lotId} index={i}>
                                <TableCell>
                                  <div className="flex items-center gap-2.5">
                                    <span className="num w-5 text-[11px] text-muted-foreground">{i + 1}</span>
                                    <span className="text-foreground">{eventKindLabel(lot?.openKind)}</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex flex-col gap-1">
                                    <span className="num text-[14px] text-foreground">{openedLabel}</span>
                                    {r.term && <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground lg:hidden">{r.term}</span>}
                                  </div>
                                </TableCell>
                                <TableCell className="hidden lg:table-cell">
                                  {r.term && (
                                    <span className="uppercase tracking-[0.1em] text-[12px] text-muted-foreground">{r.term}</span>
                                  )}
                                </TableCell>
                                <TableCell align="right" className="num text-[14px] text-foreground">{formatQuantity(r.quantity, 4)} sh</TableCell>
                                <TableCell align="right">
                                  <div className="flex flex-col items-end gap-1">
                                    <span className="num text-[14px] text-foreground">{formatUSD(r.costBasis)}</span>
                                    {lot?.costPerShare !== null && lot?.costPerShare !== undefined && <span className="num text-[11px] text-muted-foreground lg:hidden">{formatUSD(lot.costPerShare)} per sh</span>}
                                  </div>
                                </TableCell>
                                <TableCell align="right" className="hidden lg:table-cell">
                                  {lot?.costPerShare !== null && lot?.costPerShare !== undefined && (
                                    <span className="num text-[14px] text-foreground">{formatUSD(lot.costPerShare)}</span>
                                  )}
                                </TableCell>
                                {quote && (
                                  <TableCell align="right" className="hidden lg:table-cell num text-[14px] text-foreground">{formatUSD(r.proceeds)}</TableCell>
                                )}
                                {quote && (
                                  <TableCell align="right">
                                    <div className="flex flex-col items-end gap-1">
                                      <span className={cn("num text-[14px]", (r.realizedPnl ?? 0) > 0 ? "text-success" : (r.realizedPnl ?? 0) < 0 ? "text-destructive" : "text-muted-foreground")}>
                                        {r.realizedPnl === null ? "Unknown" : `${(r.realizedPnl ?? 0) > 0 ? "+" : ""}${formatUSD(r.realizedPnl)}`}
                                      </span>
                                      <span className="num text-[11px] text-muted-foreground lg:hidden">{formatUSD(r.proceeds)} proceeds</span>
                                    </div>
                                  </TableCell>
                                )}
                              </TableRow>
                            );
                          })
                        ) : (
                          queue.map((layer, i) => {
                            const fraction = previewMap ? (previewMap.get(layer.id) ?? 0) : 1;
                            const take = layer.quantity * fraction;
                            const untouched = !!previewMap && fraction <= 0;
                            const pnl = layer.unrealizedPnl;
                            const lot = lots?.find(l => l.id === layer.id);
                            
                            return (
                              <TableRow key={layer.id} index={i} className={cn("transition-opacity duration-500", untouched && "opacity-40")}>
                                <TableCell>
                                  <div className="flex items-center gap-2.5">
                                    <span className="num w-5 text-[11px] text-muted-foreground">{i + 1}</span>
                                    <span className="text-[14px] text-foreground">{eventKindLabel(lot?.openKind)}</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex flex-col gap-1">
                                    <span className="num text-[14px] text-foreground">{layer.openedAt ? formatDate(layer.openedAt) : "Opening balance"}</span>
                                    {layer.term && <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground lg:hidden">{layer.term}</span>}
                                  </div>
                                </TableCell>
                                <TableCell className="hidden lg:table-cell">
                                  {layer.term && <span className="text-[12px] uppercase tracking-[0.1em] text-muted-foreground">{layer.term}</span>}
                                </TableCell>
                                <TableCell align="right">
                                  <div className="flex flex-col items-end gap-1">
                                    <span className="num text-[14px] text-foreground">{formatQuantity(take, 4)} sh</span>
                                    {previewMap && fraction > 0 && fraction < 1 && (
                                      <span className="num text-[11px] text-muted-foreground">{formatPercent(fraction * 100).replace("+", "")} of {formatQuantity(layer.quantity, 4)}</span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell align="right">
                                  {layer.basisUnknown || layer.costBasis === null ? (
                                    <Pill tone="loss">Unknown</Pill>
                                  ) : (
                                    <div className="flex flex-col items-end gap-1">
                                      <span className="num text-[14px] text-foreground">{formatUSD(layer.costBasis * fraction)}</span>
                                      {layer.costPerShare !== null && <span className="num text-[11px] text-muted-foreground lg:hidden">{formatUSD(layer.costPerShare)} per sh</span>}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell align="right" className="hidden lg:table-cell">
                                  {layer.costPerShare !== null && !layer.basisUnknown && (
                                    <span className="num text-[14px] text-foreground">{formatUSD(layer.costPerShare)}</span>
                                  )}
                                </TableCell>
                                <TableCell align="right">
                                  {pnl === null ? (
                                    <span className="text-[14px] text-muted-foreground">Unknown</span>
                                  ) : (
                                    <span className={cn("num text-[14px]", pnl > 0 ? "text-success" : pnl < 0 ? "text-destructive" : "text-muted-foreground")}>
                                      {pnl > 0 ? "+" : ""}
                                      {formatUSD(pnl * fraction)}
                                    </span>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </DataTable>
                  </section>
                </Reveal>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
