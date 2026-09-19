import { useRoute, useSearch, useLocation } from "wouter";
import { Shell } from "@/components/layout/shell";
import { useListActivity } from "@workspace/api-client-react";
import { useCostMethod } from "@/hooks/use-cost-method";
import { formatUSD, formatQuantity } from "@/lib/format";
import { AlertCircle, ExternalLink, ArrowLeft, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { DataTable, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/data-table";

export default function Activity() {
  const [, params] = useRoute("/w/:address/activity");
  const address = params?.address || "";
  const { method } = useCostMethod();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const urlParams = new URLSearchParams(search);
  const cursor = urlParams.get("cursor") || undefined;

  const { data: activityPage, isLoading, error } = useListActivity(address, { method, cursor, limit: 20 });

  const handleNextPage = () => {
    if (activityPage?.nextCursor) {
      const newParams = new URLSearchParams(search);
      newParams.set("cursor", activityPage.nextCursor);
      setLocation("?" + newParams.toString());
    }
  };

  const handleReset = () => {
    const newParams = new URLSearchParams(search);
    newParams.delete("cursor");
    setLocation("?" + newParams.toString());
  };

  return (
    <Shell address={address}>
      <div className="flex flex-col animate-in fade-in duration-700 pb-12">
        
        {/* Page Header */}
        <div className="flex flex-col gap-1 mb-8">
          <h1 className="font-serif text-4xl tracking-tight text-foreground">Ledger activity</h1>
          <p className="text-muted-foreground text-sm font-sans mt-2">
            All on-chain events and resolved transfers.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-12 opacity-50">
            <div className="flex gap-16 border-y border-border py-10">
              <div className="h-16 w-full bg-muted animate-pulse rounded"></div>
            </div>
          </div>
        ) : error ? (
          <div className="p-12 border border-border bg-card flex flex-col items-center justify-center text-center shadow-sm">
            <AlertCircle className="h-8 w-8 mb-4 text-destructive" />
            <h3 className="font-serif text-2xl mb-2 text-foreground">Unable to load activity</h3>
            <p className="text-muted-foreground font-sans">{error.message || "An unknown error occurred"}</p>
          </div>
        ) : activityPage ? (
          <div className="flex flex-col gap-5">
            {activityPage.items.length === 0 ? (
              <div className="p-16 text-center border border-border bg-card shadow-sm">
                <h3 className="font-serif text-2xl mb-3 text-foreground">No ledger activity</h3>
                <p className="text-muted-foreground text-sm font-sans max-w-md mx-auto leading-relaxed">
                  {cursor ? "This page is empty." : "No activity found for this ledger."}
                </p>
                {cursor && (
                  <button type="button" onClick={handleReset} className="mt-6 text-[11px] font-sans uppercase tracking-[0.08em] text-foreground border-b border-foreground pb-0.5 hover:text-primary hover:border-primary transition-colors">
                    Back to first page
                  </button>
                )}
              </div>
            ) : (
              <>
                <DataTable>
                  <TableHeader>
                    <TableHead>Event</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Asset</TableHead>
                    <TableHead align="right">Quantity</TableHead>
                    <TableHead align="right">Price</TableHead>
                    <TableHead align="right">Amount</TableHead>
                    <TableHead align="right">Link</TableHead>
                  </TableHeader>
                  <TableBody>
                    {activityPage.items.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[15px] font-medium text-foreground">{event.kindLabel}</span>
                            <div className="flex items-center gap-2 text-[11px] font-sans uppercase tracking-[0.08em]">
                              {event.source !== 'live' && (
                                <span className="text-muted-foreground">{event.source === "demo" ? "Scripted" : event.source}</span>
                              )}
                              {event.realizedPnl !== null && (
                                <span className={event.realizedPnl > 0 ? 'text-success' : event.realizedPnl < 0 ? 'text-destructive' : 'text-muted-foreground'}>
                                  {event.realizedPnl > 0 ? '+' : ''}{formatUSD(event.realizedPnl)} P/L
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[15px] tabular-nums text-foreground">{format(new Date(event.blockTime), "MMM d, yyyy")}</span>
                            <span className="text-[11px] tabular-nums text-muted-foreground font-sans mt-0.5">
                              {format(new Date(event.blockTime), "HH:mm")}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-serif text-lg text-foreground">{event.symbol}</span>
                        </TableCell>
                        <TableCell align="right">
                          <span className={`text-[15px] tabular-nums ${event.quantity > 0 ? "text-success" : event.quantity < 0 ? "text-destructive" : "text-foreground"}`}>
                            {event.quantity > 0 ? "+" : ""}{formatQuantity(event.quantity)}
                          </span>
                        </TableCell>
                        <TableCell align="right">
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="text-[15px] tabular-nums text-foreground">{formatUSD(event.pricePerShare)}</span>
                            {event.fee !== null && event.fee > 0 && (
                              <span className="text-[11px] text-muted-foreground font-sans">Fee: {formatUSD(event.fee)}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell align="right">
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="text-[15px] tabular-nums font-medium text-foreground">{formatUSD(event.grossAmount)}</span>
                            {event.counterAsset && event.counterAmount !== null && (
                              <span className="text-[11px] tabular-nums text-muted-foreground font-sans">
                                {formatQuantity(event.counterAmount)} {event.counterAsset}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell align="right">
                          {event.explorerUrl ? (
                            <a href={event.explorerUrl} target="_blank" rel="noopener noreferrer" aria-label="Open transaction in explorer" className="inline-flex text-muted-foreground hover:text-foreground transition-colors">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </DataTable>
                
                <div className="flex items-center justify-between border-t border-border pt-4">
                  <span className="text-[11px] text-muted-foreground font-sans uppercase tracking-[0.08em]">
                    Total entries: <span className="tabular-nums">{activityPage.total}</span>
                  </span>
                  <div className="flex gap-4">
                    <button 
                      onClick={handleReset} 
                      disabled={!cursor}
                      className="text-[11px] font-sans uppercase tracking-[0.08em] flex items-center gap-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="h-3 w-3" /> First page
                    </button>
                    <button 
                      onClick={handleNextPage} 
                      disabled={!activityPage.nextCursor}
                      className="text-[11px] font-sans uppercase tracking-[0.08em] flex items-center gap-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors cursor-pointer"
                    >
                      Next <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </Shell>
  );
}
