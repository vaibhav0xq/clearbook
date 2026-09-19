import { useMemo, useState } from "react";
import { useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Loader2, Info } from "lucide-react";
import { format } from "date-fns";

import { Shell } from "@/components/layout/shell";
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

import { Panel, PageHeader, SectionTitle, Pill, Skeleton, ErrorState, EmptyState } from "@/components/surface";
import { Figure } from "@/components/figure";
import { Strata } from "@/components/three/strata";
import { buildStrata, reliefPreview } from "@/components/three/strata-data";
import { Reveal, EASE_OUT } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";
import { DataTable, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/data-table";

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

  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<{ success: boolean; message: string } | null>(null);

  const numQuantity = Number(quantity);
  const columns = useMemo(() => (portfolio ? buildStrata(portfolio.positions, lots) : []), [portfolio, lots]);
  const selectedColumn = columns.find(c => c.mint === selectedMint);
  const selectedPosition = portfolio?.positions.find(p => p.mint === selectedMint);

  // Lot level previews need real lot data. Without it the columns fall back to one layer per
  // position, which must not be presented as a relief order.
  const hasLotDetail = !!lots && !lotsError;
  const previewMap = hasLotDetail && selectedColumn && numQuantity > 0 && !quote
    ? reliefPreview(selectedColumn, method, numQuantity)
    : null;

  const handleGetQuote = async () => {
    if (!selectedMint || !quantity || isNaN(numQuantity) || numQuantity <= 0) return;
    setExecutionResult(null);
    try {
      const result = await quoteQuery.mutateAsync({
        address,
        data: {
          mint: selectedMint,
          quantity: numQuantity,
          method
        }
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
      setQuote(null);
      setQuantity("");
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
    <Shell address={address}>
      {isLoading ? (
        <div className="flex flex-col gap-10">
          <Skeleton className="h-[420px] rounded-2xl" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <Skeleton className="lg:col-span-5 h-[300px] rounded-2xl" />
            <Skeleton className="lg:col-span-7 h-[300px] rounded-2xl" />
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
        <div className="flex flex-col gap-12 md:gap-16">
          <PageHeader 
            title="Trade" 
            description="Sell one position through Jupiter. Lots are relieved in the order set by the cost method." 
          />

          {lotsError && (
            <ErrorState title="Unable to load open lots" message={`${lotsError.message} Quotes still work, but the relief preview is unavailable until lots load.`} />
          )}

          {columns.length > 0 && (
            <section>
              <SectionTitle
                aside={
                  <span className="hidden md:inline-flex items-center gap-4">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-5 rounded-sm" style={{ background: "linear-gradient(90deg,#ff6a5b,#5f6f92,#35d39c)" }} />
                      loss to gain
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2.5 rounded-sm bg-[#3a4152]" /> unknown cost
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2.5 rounded-sm bg-primary" /> active
                    </span>
                  </span>
                }
              >
                Position strata
              </SectionTitle>
              <Panel className="relative overflow-hidden">
                <Strata
                  className="h-[380px] md:h-[460px] w-full"
                  columns={columns}
                  method={method}
                  mode="trade"
                  highlightMint={selectedMint || null}
                  preview={hasLotDetail && selectedMint && numQuantity > 0 ? { mint: selectedMint, quantity: numQuantity } : undefined}
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col md:flex-row md:items-end md:justify-between gap-2 px-5 pb-4 text-[12px] text-muted-foreground">
                  <span>Layers a sale would relieve lift out of the column.</span>
                </div>
              </Panel>
            </section>
          )}

          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <Reveal className="lg:col-span-5">
              <Panel className="p-6 md:p-8 flex flex-col gap-6 h-full">
                <span className="label">Configure sale</span>
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-2">
                    <label htmlFor="mint" className="label text-muted-foreground">Asset</label>
                    <select 
                      id="mint"
                      value={selectedMint}
                      onChange={e => { setSelectedMint(e.target.value); setQuote(null); setExecutionResult(null); }}
                      className="glass-strong h-12 w-full rounded-xl px-4 text-[14px] text-foreground outline-none transition-shadow focus:ring-glow cursor-pointer appearance-none"
                    >
                      <option value="" disabled>Select an asset</option>
                      {portfolio.positions.map(p => (
                         <option key={p.mint} value={p.mint}>{p.symbol} ({formatQuantity(p.quantity)} sh)</option>
                      ))}
                    </select>
                  </div>
                  
                  {selectedPosition && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <label htmlFor="qty" className="label text-muted-foreground">Quantity</label>
                        <button 
                          type="button" 
                          onClick={() => { setQuantity(selectedPosition.quantity.toString()); setQuote(null); }}
                          className="text-[10px] uppercase tracking-[0.12em] text-primary hover:text-foreground transition-colors"
                        >
                          Max: {formatQuantity(selectedPosition.quantity)}
                        </button>
                      </div>
                      <input 
                        id="qty"
                        type="number"
                        min="0"
                        step="any"
                        value={quantity}
                        onChange={e => { setQuantity(e.target.value); setQuote(null); }}
                        placeholder="0.00"
                        className="glass-strong h-12 w-full rounded-xl px-4 text-[16px] num text-foreground outline-none transition-shadow focus:ring-glow"
                      />
                    </div>
                  )}
                </div>
                
                <div className="mt-auto pt-6 flex flex-col gap-3">
                  <button 
                    onClick={handleGetQuote}
                    disabled={!selectedMint || !quantity || numQuantity <= 0 || quoteQuery.isPending}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white/[0.05] border hairline text-[13px] tracking-[0.08em] uppercase text-foreground transition-all hover:bg-white/[0.1] disabled:opacity-50"
                  >
                    {quoteQuery.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Review quote
                  </button>
                  {quoteQuery.isError && (
                    <div className="text-[13px] text-destructive flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      {(quoteQuery.error as any)?.data?.message ?? quoteQuery.error?.message ?? "Failed to get quote."}
                    </div>
                  )}
                  {executionResult && (
                    <div className={cn("text-[13px] flex items-center gap-2", executionResult.success ? "text-success" : "text-destructive")}>
                      {executionResult.success ? <Info className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
                      {executionResult.message}
                    </div>
                  )}
                </div>
              </Panel>
            </Reveal>

            <Reveal className="lg:col-span-7" delay={0.08}>
              <Panel className="p-6 md:p-8 flex flex-col gap-6 h-full">
                <span className="label">Quote summary</span>
                {quote ? (
                  <div className="flex flex-col flex-1 gap-6">
                    <div className="grid grid-cols-2 gap-6">
                      <Figure label="Expected proceeds" value={quote.expectedProceeds} size="lg" />
                      <Figure label="Estimated realized P/L" value={quote.estimatedRealizedPnl} tone size="lg" />
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-5 border-t hairline pt-5">
                      <div className="flex flex-col gap-1.5">
                        <span className="label">Price / Share</span>
                        <span className="num text-[15px]">{formatUSD(quote.pricePerShare)}</span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <span className="label">Reference price</span>
                        <span className="num text-[15px]">{formatUSD(quote.referencePrice)}</span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <span className="label">Price impact</span>
                        <span className="num text-[15px]">{formatPercent(quote.priceImpactPct)}</span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <span className="label">Slippage</span>
                        <span className="num text-[15px]">{formatPercent(quote.slippageBps / 100)}</span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-5 border-t hairline pt-5">
                      <div className="flex flex-col gap-1.5">
                        <span className="label">Route</span>
                        <span className="text-[14px] text-muted-foreground">{quote.route.join(" → ")}</span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <span className="label">Execution</span>
                        <span className="text-[14px] flex items-center gap-2">
                          {quote.modeLabel} <Pill tone={quote.canExecuteOnChain ? "gain" : "amber"}>{quote.mode}</Pill>
                        </span>
                      </div>
                    </div>
                    
                    {quote.warnings?.length > 0 && (
                      <div className="flex flex-col gap-2 border-t hairline pt-5">
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
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <div className="flex flex-col gap-1">
                          <span className="text-foreground font-medium">Execution simulated</span>
                          <span className="text-muted-foreground leading-relaxed">{simulationNote}</span>
                        </div>
                      </div>
                    )}

                    <div className="mt-auto pt-6 border-t hairline">
                      <button 
                        onClick={executeTrade}
                        disabled={isExecuting}
                        className={cn(
                          "group w-full inline-flex h-12 items-center justify-center gap-2 rounded-xl text-[13px] tracking-[0.12em] uppercase transition-all disabled:opacity-50",
                          onChain 
                            ? "bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 hover:border-primary/50" 
                            : "bg-white/[0.05] border hairline text-foreground hover:bg-white/[0.1]"
                        )}
                      >
                        {isExecuting && <Loader2 className="h-4 w-4 animate-spin" />}
                        {onChain ? "Sign and execute" : "Record simulated sale"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full border hairline bg-white/[0.03] mb-4">
                      <ArrowRight className="h-5 w-5 text-muted-foreground" />
                    </span>
                    <p className="text-[14px] text-muted-foreground max-w-[240px] leading-relaxed">
                      {selectedMint && numQuantity > 0
                        ? "Review the quote to see proceeds, price impact and the realized P/L of this sale."
                        : "Select a position and enter a quantity to request a quote."}
                    </p>
                  </div>
                )}
              </Panel>
            </Reveal>
          </section>

          {(quote?.reliefs.length || (previewMap && previewMap.size > 0)) ? (
            <Reveal delay={0.16}>
              <section>
                <SectionTitle aside={!quote && <Pill tone="amber">Preview</Pill>}>
                  {quote ? "Relieved lots" : "Estimated relief preview"}
                </SectionTitle>
                <DataTable>
                  <TableHeader>
                    <TableHead>Opened</TableHead>
                    <TableHead>Term</TableHead>
                    <TableHead align="right">Quantity</TableHead>
                    <TableHead align="right">Cost basis</TableHead>
                    {quote && <TableHead align="right">Proceeds</TableHead>}
                    {quote && <TableHead align="right">Realized P/L</TableHead>}
                  </TableHeader>
                  <TableBody>
                    {quote ? (
                      quote.reliefs.map((r, i) => {
                        const lot = selectedColumn?.layers.find(l => l.id === r.lotId);
                        const openedLabel = lot?.openedAt 
                          ? format(new Date(lot.openedAt), "MMM d, yyyy") 
                          : (r.lotId.includes("position") || !lot ? "Opening balance" : r.lotId);
                        
                        return (
                          <TableRow key={r.lotId} index={i}>
                            <TableCell className="text-[13px]">{openedLabel}</TableCell>
                            <TableCell className="text-[13px] capitalize">{r.term}</TableCell>
                            <TableCell align="right" className="num text-foreground">{formatQuantity(r.quantity, 4)} sh</TableCell>
                            <TableCell align="right" className="num text-muted-foreground">{formatUSD(r.costBasis)}</TableCell>
                            <TableCell align="right" className="num text-muted-foreground">{formatUSD(r.proceeds)}</TableCell>
                            <TableCell align="right">
                              <span className={cn("num", (r.realizedPnl ?? 0) > 0 ? "text-success" : (r.realizedPnl ?? 0) < 0 ? "text-destructive" : "text-muted-foreground")}>
                                {r.realizedPnl === null ? "Unknown" : formatUSD(r.realizedPnl)}
                              </span>
                            </TableCell>
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
                              <TableCell className="text-[13px]">
                                {lot.openedAt ? format(new Date(lot.openedAt), "MMM d, yyyy") : "Opening balance"}
                              </TableCell>
                              <TableCell className="text-[13px] capitalize">{lot.term}</TableCell>
                              <TableCell align="right" className="num text-foreground">{formatQuantity(take, 4)} sh</TableCell>
                              <TableCell align="right" className="num text-muted-foreground">
                                {lot.basisUnknown || lot.costBasis === null ? (
                                  <Pill tone="loss">Unknown</Pill>
                                ) : (
                                  formatUSD(lot.costBasis * fraction)
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
    </Shell>
  );
}
