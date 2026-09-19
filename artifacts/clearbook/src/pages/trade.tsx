import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Loader2, Info, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

import { invalidateWalletQueries } from "@/lib/wallet-queries";
import { 
  useGetPortfolio, 
  useListLots,
  useQuoteTrade, 
  usePrepareTrade, 
  useConfirmTrade, 
  useSimulateTrade,
  type TradeQuote
} from "@workspace/api-client-react";
import { useCostMethod } from "@/hooks/use-cost-method";
import { useWalletSession } from "@/lib/wallet";
import { formatUSD, formatQuantity, formatPercent } from "@/lib/format";
import { useStage, useStageContext } from "@/components/layout/stage";

import { Panel, PageHeader, SectionTitle, Pill, Skeleton, ErrorState, EmptyState } from "@/components/surface";
import { Figure } from "@/components/figure";
import { Reveal, EASE_OUT } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";
import { DataTable, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/data-table";
import { reliefPreview } from "@/components/three/strata-data";

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
  // The largest position is preselected so the page and the stage never start empty.
  useEffect(() => {
    if (!selectedMint && portfolio?.positions.length) setSelectedMint(portfolio.positions[0].mint);
  }, [portfolio, selectedMint]);
  
  const quoteQuery = useQuoteTrade();
  const prepareMutation = usePrepareTrade();
  const confirmMutation = useConfirmTrade();
  const simulateMutation = useSimulateTrade();

  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<{ success: boolean; message: string } | null>(null);

  const numQuantity = Number(quantity);
  
  const { columns } = useStageContext();
  
  const selectedColumn = columns.find(c => c.mint === selectedMint);
  const selectedPosition = portfolio?.positions.find(p => p.mint === selectedMint);

  const hasLotDetail = !!lots && !lotsError;
  const previewMap = hasLotDetail && selectedColumn && numQuantity > 0 && !quote
    ? reliefPreview(selectedColumn, method, numQuantity)
    : null;

  let caption = "Select a position and quantity to preview the sale.";
  if (quote) {
    const sign = (quote.estimatedRealizedPnl || 0) > 0 ? "+" : "";
    const pnlLabel = quote.estimatedRealizedPnl === null ? "Unknown" : `${sign}${formatUSD(quote.estimatedRealizedPnl)}`;
    caption = `Preview: ${formatQuantity(numQuantity)} ${quote.route[0]} relieved for ${formatUSD(quote.expectedProceeds)} proceeds (${pnlLabel} realized P/L).`;
  } else if (selectedMint && numQuantity > 0) {
    const symbol = selectedPosition?.symbol || "tokens";
    caption = `Relieving ${formatQuantity(numQuantity)} shares of ${symbol}...`;
  } else if (selectedMint) {
    const symbol = selectedPosition?.symbol || "tokens";
    caption = `Enter a quantity to sell ${symbol}.`;
  }

  useStage({
    focusMint: selectedMint || null,
    // The stage only lifts real lots. Without lot detail there is nothing honest to preview.
    preview: hasLotDetail && selectedMint && numQuantity > 0 ? { mint: selectedMint, quantity: numQuantity } : null,
    caption
  });

  const handleGetQuote = async () => {
    if (!selectedMint || !quantity || isNaN(numQuantity) || numQuantity <= 0) return;
    setExecutionResult(null);
    try {
      const result = await quoteQuery.mutateAsync({
        address,
        data: { mint: selectedMint, quantity: numQuantity, method }
      });
      setQuote(result);
    } catch (e) {
      // Handled by query state
    }
  };

  const executeTrade = async () => {
    if (!quote) return;
    setIsExecuting(true);
    setExecutionResult(null);
    
    try {
      if (onChain && wallet.publicKey) {
        const txData = await prepareMutation.mutateAsync({
          address,
          data: { quoteId: quote.quoteId, userPublicKey: wallet.publicKey }
        });
        
        const signature = await wallet.signAndSendTransaction(txData.swapTransaction);
        
        const result = await confirmMutation.mutateAsync({
          address,
          data: { quoteId: quote.quoteId, signature }
        });
        
        setExecutionResult({ success: result.status === "confirmed", message: result.message });
      } else {
        const result = await simulateMutation.mutateAsync({
          address,
          data: { quoteId: quote.quoteId }
        });
        
        setExecutionResult({ success: true, message: result.message });
      }
      
      await invalidateWalletQueries(queryClient, address);
    } catch (e: any) {
      setExecutionResult({ success: false, message: e.message || "Execution failed" });
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
      {isLoading ? (
        <div className="flex flex-col gap-10">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <Skeleton className="xl:col-span-5 h-[400px] rounded-2xl" />
            <Skeleton className="xl:col-span-7 h-[400px] rounded-2xl" />
          </div>
        </div>
      ) : portfolioError ? (
        <ErrorState title="Unable to load positions" message={portfolioError.message} />
      ) : portfolio && portfolio.positions.length === 0 ? (
        <EmptyState
          title="No positions available"
          description="This ledger has no tokenized stock balances to sell."
        />
      ) : portfolio ? (
        <div className="flex flex-col gap-10 md:gap-14">
          <PageHeader 
            title="Trade" 
            description="Sell a position through Jupiter. Lots are relieved in the order set by the current cost method." 
          />

          {lotsError && (
            <ErrorState title="Unable to load open lots" message={`${lotsError.message} Quotes still work, but the relief preview is unavailable until lots load.`} />
          )}

          <section className="flex flex-col gap-5">
            <span className="label text-muted-foreground">Select asset</span>
            <div className="flex flex-wrap gap-3">
              {portfolio.positions.map(p => (
                <button
                  key={p.mint}
                  type="button"
                  aria-pressed={selectedMint === p.mint}
                  onClick={() => { setSelectedMint(p.mint); setQuote(null); setExecutionResult(null); }}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 rounded-xl border hairline transition-all",
                    selectedMint === p.mint 
                      ? "bg-primary/[0.08] border-primary/40 text-primary ring-1 ring-primary/20" 
                      : "bg-white/[0.02] hover:bg-white/[0.06] hover:text-foreground text-muted-foreground"
                  )}
                >
                  <span className="num font-medium text-[15px]">{p.symbol}</span>
                  <span className="text-[12px] opacity-60 font-sans tracking-wide">{formatQuantity(p.quantity)} sh</span>
                </button>
              ))}
            </div>
          </section>

          <AnimatePresence mode="wait">
            {selectedPosition && (
              <motion.section 
                key="trade-panels"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.5, ease: EASE_OUT }}
                className="grid grid-cols-1 xl:grid-cols-12 gap-6"
              >
                <div className="xl:col-span-5 flex flex-col gap-6">
                  <Panel className="p-6 md:p-8 flex flex-col gap-6 h-full border hairline bg-white/[0.02]">
                    <div className="flex items-center justify-between">
                      <span className="label text-muted-foreground">Quantity</span>
                      <button 
                        type="button" 
                        onClick={() => { setQuantity(selectedPosition.quantity.toString()); setQuote(null); }}
                        className="text-[10px] uppercase tracking-[0.12em] text-primary hover:text-foreground transition-colors"
                      >
                        Max: {formatQuantity(selectedPosition.quantity)}
                      </button>
                    </div>
                    <div className="relative">
                      <input 
                        id="qty"
                        type="number"
                        min="0"
                        step="any"
                        value={quantity}
                        onChange={e => { setQuantity(e.target.value); setQuote(null); }}
                        placeholder="0.00"
                        className="glass-strong h-16 w-full rounded-2xl pl-5 pr-20 text-[24px] num text-foreground outline-none transition-shadow focus:ring-1 focus:ring-primary/50"
                      />
                      <span className="absolute right-5 top-1/2 -translate-y-1/2 num text-[14px] text-muted-foreground">
                        sh
                      </span>
                    </div>

                    <div className="mt-auto pt-6 flex flex-col gap-3">
                      <button 
                        onClick={handleGetQuote}
                        disabled={!quantity || numQuantity <= 0 || quoteQuery.isPending}
                        className={cn(
                          "group flex h-14 w-full items-center justify-center gap-2 rounded-xl text-[13px] tracking-[0.08em] uppercase transition-all",
                          (!quantity || numQuantity <= 0 || quoteQuery.isPending)
                            ? "bg-white/[0.03] text-muted-foreground cursor-not-allowed"
                            : "bg-white/[0.08] text-foreground hover:bg-white/[0.12] border hairline hover:border-white/20"
                        )}
                      >
                        {quoteQuery.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Review quote"}
                      </button>
                      {quoteQuery.isError && (
                        <div className="text-[13px] text-destructive flex items-center gap-2 mt-2">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          {(quoteQuery.error as any)?.data?.message ?? quoteQuery.error?.message ?? "Failed to get quote."}
                        </div>
                      )}
                    </div>
                  </Panel>
                </div>

                <div className="xl:col-span-7 flex flex-col gap-6">
                  <Panel className="p-6 md:p-8 flex flex-col gap-6 h-full border hairline bg-white/[0.02]">
                    <div className="flex items-center justify-between">
                      <span className="label text-muted-foreground">Quote summary</span>
                      {quote && <Pill tone="gain">Active</Pill>}
                    </div>
                    {quote ? (
                      <Reveal className="flex flex-col flex-1 gap-8">
                        <div className="grid grid-cols-2 gap-8">
                          <Figure label="Expected proceeds" value={quote.expectedProceeds} size="xl" />
                          <Figure label="Realized P/L" value={quote.estimatedRealizedPnl} tone size="xl" sub="Estimated based on remaining lots" />
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 border-t hairline pt-6">
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
                            <span className="num text-[16px] text-foreground">{formatPercent(quote.priceImpactPct)}</span>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <span className="label text-muted-foreground">Slippage</span>
                            <span className="num text-[16px] text-foreground">{formatPercent(quote.slippageBps / 100)}</span>
                          </div>
                        </div>
                        
                        <div className="flex flex-col gap-4 border-t hairline pt-6">
                          <div className="flex items-center justify-between">
                            <span className="label text-muted-foreground">Route</span>
                            <span className="text-[14px] text-foreground flex items-center gap-2">
                              {quote.route.map((node, i) => (
                                <span key={i} className="flex items-center gap-2">
                                  {i > 0 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
                                  {node}
                                </span>
                              ))}
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
                              <div key={i} className="text-[13px] text-destructive flex items-start gap-2">
                                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
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
                            onClick={executeTrade}
                            disabled={isExecuting || executionResult?.success}
                            className={cn(
                              "group w-full inline-flex h-14 items-center justify-center gap-2 rounded-xl text-[13px] tracking-[0.12em] uppercase transition-all",
                              executionResult?.success 
                                ? "bg-success/10 text-success border border-success/30"
                                : onChain 
                                  ? "bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 hover:border-primary/50" 
                                  : "bg-white/[0.08] border hairline text-foreground hover:bg-white/[0.12]"
                            )}
                          >
                            {isExecuting ? <Loader2 className="h-4 w-4 animate-spin" /> : executionResult?.success ? <CheckCircle2 className="h-5 w-5" /> : null}
                            {executionResult?.success ? "Complete" : onChain ? "Sign and execute" : "Record simulated sale"}
                          </button>
                          
                          {executionResult && !executionResult.success && (
                            <div className="mt-4 text-[13px] flex items-start gap-2 text-destructive">
                              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                              <span className="leading-relaxed">{executionResult.message}</span>
                            </div>
                          )}
                          {executionResult && executionResult.success && (
                            <div className="mt-4 text-[13px] flex items-start gap-2 text-success">
                              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                              <span className="leading-relaxed">{executionResult.message}</span>
                            </div>
                          )}
                        </div>
                      </Reveal>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                        <span className="flex h-16 w-16 items-center justify-center rounded-full border hairline bg-white/[0.02] mb-5">
                          <ArrowRight className="h-6 w-6 text-muted-foreground/50" />
                        </span>
                        <p className="text-[15px] text-muted-foreground max-w-[260px] leading-relaxed">
                          {numQuantity > 0
                            ? "Review the quote to see proceeds, price impact and realized P/L."
                            : "Enter a quantity to request a quote for this position."}
                        </p>
                      </div>
                    )}
                  </Panel>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {(quote?.reliefs.length || (previewMap && previewMap.size > 0)) ? (
            <Reveal delay={0.1}>
              <section>
                <SectionTitle aside={!quote && <Pill tone="amber">Preview</Pill>}>
                  {quote ? "Relieved lots" : "Estimated relief preview"}
                </SectionTitle>
                <DataTable>
                  <TableHeader>
                    <TableHead>Lot</TableHead>
                    <TableHead align="right">Quantity relieved</TableHead>
                    <TableHead align="right">Cost basis</TableHead>
                    {quote && <TableHead align="right">Proceeds</TableHead>}
                    {quote && <TableHead align="right">Realized P/L</TableHead>}
                  </TableHeader>
                  <TableBody>
                    {quote ? (
                      quote.reliefs.map((r, i) => {
                        const lot = lots?.find(l => l.id === r.lotId);
                        const openedLabel = lot?.openedAt 
                          ? format(new Date(lot.openedAt), "MMM d, yyyy") 
                          : (r.lotId.includes("position") || !lot ? "Opening balance" : r.lotId);
                        
                        return (
                          <TableRow key={r.lotId} index={i}>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <span className="text-[14px] text-foreground">{openedLabel}</span>
                                {r.term && <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{r.term}</span>}
                              </div>
                            </TableCell>
                            <TableCell align="right" className="num text-foreground">{formatQuantity(r.quantity, 4)} sh</TableCell>
                            <TableCell align="right" className="num text-muted-foreground">{formatUSD(r.costBasis)}</TableCell>
                            {quote && <TableCell align="right" className="num text-foreground">{formatUSD(r.proceeds)}</TableCell>}
                            {quote && (
                              <TableCell align="right">
                                <span className={cn("num", (r.realizedPnl ?? 0) > 0 ? "text-success" : (r.realizedPnl ?? 0) < 0 ? "text-destructive" : "text-muted-foreground")}>
                                  {r.realizedPnl === null ? "Unknown" : `${(r.realizedPnl ?? 0) > 0 ? "+" : ""}${formatUSD(r.realizedPnl)}`}
                                </span>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })
                    ) : (
                      Array.from(previewMap!.entries())
                        .filter(([, fraction]) => fraction > 0)
                        .map(([lotId, fraction], i) => {
                          const lot = selectedColumn?.layers.find(l => l.id === lotId);
                          if (!lot) return null;
                          const take = lot.quantity * fraction;
                          
                          return (
                            <TableRow key={lot.id} index={i}>
                              <TableCell>
                                <div className="flex flex-col gap-1">
                                  <span className="text-[14px] text-foreground">{lot.openedAt ? format(new Date(lot.openedAt), "MMM d, yyyy") : "Opening balance"}</span>
                                  {lot.term && <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{lot.term}</span>}
                                </div>
                              </TableCell>
                              <TableCell align="right">
                                <div className="flex flex-col items-end gap-1">
                                  <span className="num text-foreground">{formatQuantity(take, 4)} sh</span>
                                  {fraction < 1 && <span className="num text-[11px] text-muted-foreground">{formatPercent(fraction * 100)} of lot</span>}
                                </div>
                              </TableCell>
                              <TableCell align="right">
                                {lot.basisUnknown || lot.costBasis === null ? (
                                  <Pill tone="loss">Unknown</Pill>
                                ) : (
                                  <div className="flex flex-col items-end gap-1">
                                    <span className="num text-foreground">{formatUSD(lot.costBasis * fraction)}</span>
                                    {lot.costPerShare !== null && <span className="num text-[11px] text-muted-foreground">{formatUSD(lot.costPerShare)} / sh</span>}
                                  </div>
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
      ) : null}
    </>
  );
}
