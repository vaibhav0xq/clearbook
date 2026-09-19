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
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ArrowDown, Loader2, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useWalletSession } from "@/lib/wallet";
import { useQueryClient } from "@tanstack/react-query";

export default function Trade() {
  const [, params] = useRoute("/w/:address/trade");
  const address = params?.address || "";
  const { method } = useCostMethod();
  const wallet = useWalletSession();
  const queryClient = useQueryClient();

  const [selectedMint, setSelectedMint] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");

  const { data: portfolio, isLoading: isPortfolioLoading } = useGetPortfolio(address, { method });
  
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
        // 1. Prepare
        const txData = await prepareMutation.mutateAsync({
          address,
          data: { quoteId: quote.quoteId, userPublicKey: wallet.publicKey }
        });
        
        // 2. Sign & Send
        const signature = await wallet.signAndSendTransaction(txData.swapTransaction);
        
        // 3. Confirm
        const result = await confirmMutation.mutateAsync({
          address,
          data: { quoteId: quote.quoteId, signature }
        });
        
        // "pending" means the chain has not confirmed yet. "failed" means it reverted.
        setExecutionResult({ success: result.status === "confirmed", message: result.message });
      } else {
        // Simulated execution
        const result = await simulateMutation.mutateAsync({
          address,
          data: { quoteId: quote.quoteId }
        });
        
        setExecutionResult({ success: true, message: result.message });
      }
      
      // Every wallet scoped query is stale after a sale.
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
  // On chain execution needs a route and the wallet that owns the ledger. Everything else is a simulated sale.
  const onChain = !!quote?.canExecuteOnChain && wallet.connected && wallet.publicKey === address;
  const simulationNote = quote
    ? quote.blockedReason ??
      (onChain ? null : wallet.connected
        ? "The connected wallet does not own this ledger. The sale is recorded as a simulation."
        : "No wallet is connected. The sale is recorded as a simulation and never leaves Clearbook.")
    : null;

  return (
    <Shell address={address}>
      <div className="flex flex-col gap-8 pb-12">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-3xl">Trade</h1>
          <p className="text-muted-foreground text-sm">
            Sell tokenized stocks. Relieves lots based on your selected cost method.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Order Entry */}
          <div className="flex flex-col gap-4 bg-card border border-card-border p-6 rounded-lg">
            <h2 className="font-serif text-xl border-b border-card-border pb-4 mb-2">Sell position</h2>
            
            {isPortfolioLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : portfolio?.positions.length === 0 ? (
              <div className="text-sm text-muted-foreground p-4 bg-muted/20 rounded">No positions available to sell.</div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Asset</label>
                  <Select value={selectedMint} onValueChange={(v) => { setSelectedMint(v); setQuote(null); setExecutionResult(null); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an asset" />
                    </SelectTrigger>
                    <SelectContent>
                      {portfolio?.positions.map(p => (
                        <SelectItem key={p.mint} value={p.mint}>
                          {p.symbol} - {formatQuantity(p.quantity)} shares
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedPosition && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-end">
                      <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Quantity to Sell</label>
                      <span className="text-[10px] text-muted-foreground cursor-pointer hover:text-primary" onClick={() => setQuantity(selectedPosition.quantity.toString())}>
                        Max: {formatQuantity(selectedPosition.quantity)}
                      </span>
                    </div>
                    <Input 
                      type="number" 
                      min="0" 
                      step="any"
                      value={quantity} 
                      onChange={(e) => { setQuantity(e.target.value); setQuote(null); }} 
                      placeholder="0.00"
                      className="font-mono text-lg"
                    />
                  </div>
                )}

                <Button 
                  className="w-full mt-4" 
                  onClick={handleGetQuote} 
                  disabled={!selectedMint || !quantity || Number(quantity) <= 0 || quoteQuery.isPending}
                >
                  {quoteQuery.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Review quote
                </Button>
                
                {quoteQuery.isError && (
                  <div className="text-xs text-destructive mt-2 p-2 bg-destructive/10 rounded">
                    {quoteQuery.error?.message || "Failed to get quote."}
                  </div>
                )}
                
                {executionResult && (
                  <div className={`text-sm mt-4 p-3 rounded flex items-start gap-2 ${executionResult.success ? 'bg-success/10 text-success border border-success/20' : 'bg-destructive/10 text-destructive border border-destructive/20'}`}>
                    {executionResult.success ? <Info className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                    <span>{executionResult.message}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quote Review */}
          <div className="flex flex-col gap-4">
            {quote ? (
              <div className="bg-card border border-card-border p-6 rounded-lg animate-in slide-in-from-right-4 duration-500">
                <h2 className="font-serif text-xl border-b border-card-border pb-4 mb-4">Quote summary</h2>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b border-card-border/50">
                    <span className="text-sm text-muted-foreground">Sell</span>
                    <span className="font-mono font-medium">{formatQuantity(quote.quantity)} {quote.symbol}</span>
                  </div>
                  
                  <div className="flex justify-center -my-2 relative z-10">
                    <div className="bg-card border border-card-border rounded-full p-1">
                      <ArrowDown className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center py-2 border-b border-card-border/50">
                    <span className="text-sm text-muted-foreground">Expected proceeds</span>
                    <span className="font-mono font-medium text-success">{formatUSD(quote.expectedProceeds)}</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 py-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase font-mono text-muted-foreground">Price / Share</span>
                      <span className="font-mono text-sm">{formatUSD(quote.pricePerShare)}</span>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      <span className="text-[10px] uppercase font-mono text-muted-foreground">Price impact</span>
                      <span className="font-mono text-sm">{formatPercent(quote.priceImpactPct)}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase font-mono text-muted-foreground">Est. Realized P/L</span>
                      <span className={`font-mono text-sm ${quote.estimatedRealizedPnl && quote.estimatedRealizedPnl > 0 ? "text-success" : "text-destructive"}`}>
                        {formatUSD(quote.estimatedRealizedPnl)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      <span className="text-[10px] uppercase font-mono text-muted-foreground">Execution</span>
                      <Badge variant="outline" className={`text-[10px] font-mono ${quote.canExecuteOnChain ? 'border-success text-success' : 'border-primary text-primary'}`}>
                        {quote.modeLabel}
                      </Badge>
                    </div>
                  </div>

                  {quote.warnings.length > 0 && (
                    <div className="mt-4 p-3 bg-warning/10 border border-warning/20 rounded text-warning text-xs space-y-1">
                      {quote.warnings.map((w, i) => <div key={i} className="flex gap-2"><AlertCircle className="h-3 w-3 shrink-0" />{w}</div>)}
                    </div>
                  )}

                  {simulationNote && (
                    <div className="mt-4 p-3 bg-muted/40 border border-card-border rounded text-muted-foreground text-xs flex gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {simulationNote}
                    </div>
                  )}

                  <Button 
                    className="w-full mt-6" 
                    size="lg"
                    onClick={executeTrade}
                    disabled={isExecuting}
                  >
                    {isExecuting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    {onChain ? "Sell on Jupiter" : "Record simulated sale"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="h-full min-h-[300px] border border-dashed border-card-border rounded-lg bg-card/30 flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
                <ArrowDown className="h-8 w-8 mb-4 opacity-50" />
                <p className="text-sm max-w-[200px]">Select an asset and enter a quantity to review execution details.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
