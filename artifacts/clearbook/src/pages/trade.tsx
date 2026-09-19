import { useState } from "react";
import { useRoute } from "wouter";
import { invalidateWalletQueries } from "@/lib/wallet-queries";
import { Shell } from "@/components/layout/shell";
import { 
  useGetPortfolio, 
  useQuoteTrade, 
  usePrepareTrade, 
  useConfirmTrade, 
  useSimulateTrade,
  TradeQuote
} from "@workspace/api-client-react";
import { useCostMethod } from "@/hooks/use-cost-method";
import { formatUSD, formatQuantity, formatPercent } from "@/lib/format";
import { AlertCircle, Loader2, Info } from "lucide-react";
import { useWalletSession } from "@/lib/wallet";
import { useQueryClient } from "@tanstack/react-query";
import { Figure } from "@/components/figure";

export default function Trade() {
  const [, params] = useRoute("/w/:address/trade");
  const address = params?.address || "";
  const { method } = useCostMethod();
  const wallet = useWalletSession();
  const queryClient = useQueryClient();

  const [selectedMint, setSelectedMint] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");

  const { data: portfolio, isLoading: isPortfolioLoading, error: portfolioError } = useGetPortfolio(address, { method });
  
  const quoteQuery = useQuoteTrade();
  const prepareMutation = usePrepareTrade();
  const confirmMutation = useConfirmTrade();
  const simulateMutation = useSimulateTrade();

  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleGetQuote = async () => {
    if (!selectedMint || !quantity || isNaN(Number(quantity))) return;
    setExecutionResult(null);
    try {
      const result = await quoteQuery.mutateAsync({
        address,
        data: {
          mint: selectedMint,
          quantity: Number(quantity),
          method
        }
      });
      setQuote(result);
    } catch (e) {
      console.error(e);
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
      
      invalidateWalletQueries(queryClient, address);
      setQuote(null);
      setQuantity("");
    } catch (e: any) {
      console.error("Trade failed", e);
      setExecutionResult({ success: false, message: e.message || "Execution failed" });
    } finally {
      setIsExecuting(false);
    }
  };

  const selectedPosition = portfolio?.positions.find(p => p.mint === selectedMint);
  const onChain = !!quote?.canExecuteOnChain && wallet.connected && wallet.publicKey === address;
  const simulationNote = quote
    ? quote.blockedReason ??
      (onChain ? null : wallet.connected
        ? "The connected wallet does not own this ledger. The sale is recorded as a simulation."
        : "No wallet is connected. The sale is recorded as a simulation and never leaves Clearbook.")
    : null;

  return (
    <Shell address={address}>
      <div className="flex flex-col animate-in fade-in duration-700 pb-12">
        <div className="flex flex-col gap-1 mb-8">
          <h1 className="font-serif text-4xl tracking-tight text-foreground">Trade</h1>
          <p className="text-muted-foreground text-sm font-sans mt-2">
            Sell tokenized stocks. Relieves lots based on your selected cost method.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          <div className="lg:col-span-5 flex flex-col gap-8">
            <div className="flex flex-col gap-6 p-6 md:p-8 border border-border bg-card shadow-sm">
              <h2 className="font-serif text-2xl text-foreground pb-4 border-b border-border">Sell position</h2>
              
              {isPortfolioLoading ? (
                <div className="h-12 w-full bg-muted animate-pulse rounded-none"></div>
              ) : portfolioError ? (
                <div className="text-sm font-sans text-destructive p-5 bg-destructive/5 border border-destructive/20">
                  Unable to load positions. {portfolioError.message}
                </div>
              ) : portfolio?.positions.length === 0 ? (
                <div className="text-sm font-sans text-muted-foreground p-5 bg-muted/20 border border-border text-center">
                  No positions available to sell.
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="trade-asset" className="text-[11px] font-sans uppercase tracking-[0.08em] text-muted-foreground">Asset</label>
                    <select 
                      id="trade-asset"
                      value={selectedMint} 
                      onChange={(e) => { setSelectedMint(e.target.value); setQuote(null); setExecutionResult(null); }}
                      className="w-full bg-transparent border border-border p-2.5 text-sm font-sans text-foreground focus:outline-none focus:border-primary transition-colors appearance-none rounded-none cursor-pointer"
                    >
                      <option value="" disabled>Select an asset</option>
                      {portfolio?.positions.map(p => (
                        <option key={p.mint} value={p.mint}>
                          {p.symbol}, {formatQuantity(p.quantity)} shares
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedPosition && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-end">
                        <label htmlFor="trade-quantity" className="text-[11px] font-sans uppercase tracking-[0.08em] text-muted-foreground">Quantity to sell</label>
                        <button 
                          type="button"
                          onClick={() => setQuantity(selectedPosition.quantity.toString())}
                          className="text-[10px] font-sans text-muted-foreground hover:text-primary transition-colors uppercase tracking-[0.08em]"
                        >
                          Max: {formatQuantity(selectedPosition.quantity)}
                        </button>
                      </div>
                      <input 
                        id="trade-quantity"
                        type="number" 
                        min="0" 
                        step="any"
                        value={quantity} 
                        onChange={(e) => { setQuantity(e.target.value); setQuote(null); }} 
                        placeholder="0.00"
                        className="w-full bg-transparent border border-border p-2.5 text-lg font-sans tabular-nums text-foreground focus:outline-none focus:border-primary transition-colors rounded-none"
                      />
                    </div>
                  )}

                  <button 
                    onClick={handleGetQuote}
                    disabled={!selectedMint || !quantity || Number(quantity) <= 0 || quoteQuery.isPending}
                    className="mt-2 w-full text-center text-[11px] font-sans uppercase tracking-[0.08em] text-foreground border border-border bg-secondary hover:bg-secondary/80 px-5 py-3 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {quoteQuery.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Review quote
                  </button>

                  {quoteQuery.isError && (
                    <div className="text-sm text-destructive mt-1 font-sans">{quoteQuery.error?.message || "Failed to get quote."}</div>
                  )}
                  {executionResult && (
                    <div className={`text-sm mt-1 flex items-start gap-2 font-sans ${executionResult.success ? 'text-success' : 'text-destructive'}`}>
                      {executionResult.success ? <Info className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                      <span>{executionResult.message}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-7 flex flex-col">
            {quote ? (
              <div className="p-6 md:p-8 border border-border bg-card relative shadow-sm animate-in slide-in-from-right-8 duration-700">
                <div className="absolute top-0 left-0 w-full h-1 bg-primary"></div>
                <h2 className="font-serif text-3xl text-foreground pb-4 mb-6 border-b-2 border-foreground">Quote summary</h2>
                
                <div className="flex flex-col gap-8">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <Figure label="Sell" value={<>{formatQuantity(quote.quantity)} <span className="text-muted-foreground">{quote.symbol}</span></>} size="lg" className="col-span-2" />
                    <Figure label="Expected proceeds" value={formatUSD(quote.expectedProceeds)} size="lg" className="col-span-2 text-foreground" />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-6 border-t border-border">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-sans uppercase tracking-[0.08em] text-muted-foreground">Price / Share</span>
                      <span className="text-[15px] tabular-nums text-foreground font-sans">{formatUSD(quote.pricePerShare)}</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-sans uppercase tracking-[0.08em] text-muted-foreground">Price impact</span>
                      <span className="text-[15px] tabular-nums text-foreground font-sans">{formatPercent(quote.priceImpactPct)}</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-sans uppercase tracking-[0.08em] text-muted-foreground">Est. Realized P/L</span>
                      <span className={`text-[15px] font-sans tabular-nums ${quote.estimatedRealizedPnl && quote.estimatedRealizedPnl > 0 ? "text-success" : quote.estimatedRealizedPnl && quote.estimatedRealizedPnl < 0 ? "text-destructive" : "text-foreground"}`}>
                        {formatUSD(quote.estimatedRealizedPnl)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-sans uppercase tracking-[0.08em] text-muted-foreground">Execution</span>
                      <span className={`text-[13px] font-sans uppercase tracking-[0.08em] mt-0.5 ${quote.canExecuteOnChain ? 'text-success' : 'text-primary'}`}>
                        {quote.modeLabel}
                      </span>
                    </div>
                  </div>

                  {quote.warnings.length > 0 && (
                    <div className="mt-2 flex flex-col gap-2">
                      {quote.warnings.map((w, i) => (
                        <div key={i} className="text-[13px] text-destructive flex gap-2 font-sans">
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {simulationNote && (
                    <div className="mt-2 p-4 bg-muted/20 border-l-2 border-primary text-sm font-sans text-muted-foreground leading-relaxed">
                      {simulationNote}
                    </div>
                  )}

                  <div className="pt-6 border-t border-border flex justify-end">
                    <button 
                      onClick={executeTrade}
                      disabled={isExecuting}
                      className="text-[11px] font-sans uppercase tracking-[0.08em] text-primary-foreground bg-foreground hover:bg-foreground/90 px-8 py-3 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 min-w-[200px]"
                    >
                      {isExecuting && <Loader2 className="h-4 w-4 animate-spin" />}
                      {onChain ? "Sign & Execute" : "Record simulated sale"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full min-h-[400px] border border-border bg-card/30 flex flex-col items-center justify-center text-center p-12 text-muted-foreground shadow-sm">
                <p className="text-sm font-sans max-w-[250px] leading-relaxed">
                  Select an asset and enter a quantity to request a quote.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
