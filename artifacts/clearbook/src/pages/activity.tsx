import { useRoute, useSearch, useLocation } from "wouter";
import { Shell } from "@/components/layout/shell";
import { useListActivity } from "@workspace/api-client-react";
import { useCostMethod } from "@/hooks/use-cost-method";
import { formatUSD, formatQuantity } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";

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
      <div className="flex flex-col gap-8 pb-12">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-3xl">Ledger activity</h1>
          <p className="text-muted-foreground text-sm">
            All on-chain events and resolved transfers.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : error ? (
          <div className="p-8 border border-destructive/20 bg-destructive/10 text-destructive rounded-lg flex flex-col items-center justify-center text-center">
            <AlertCircle className="h-8 w-8 mb-2" />
            <h3 className="font-semibold">Unable to load activity</h3>
            <p className="text-sm opacity-80 mt-1">{error.message}</p>
          </div>
        ) : activityPage ? (
          <div className="flex flex-col gap-4">
            <div className="border border-card-border rounded-lg overflow-hidden bg-card">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground font-mono uppercase tracking-wider bg-muted/50 border-b border-card-border">
                    <tr>
                      <th className="px-4 py-3 font-medium">Event</th>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Asset</th>
                      <th className="px-4 py-3 font-medium text-right">Quantity</th>
                      <th className="px-4 py-3 font-medium text-right">Price</th>
                      <th className="px-4 py-3 font-medium text-right">Amount</th>
                      <th className="px-4 py-3 font-medium text-right">Link</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-card-border">
                    {activityPage.items.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                          No ledger activity found.
                        </td>
                      </tr>
                    ) : (
                      activityPage.items.map((event) => (
                        <tr key={event.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-4">
                            <div className="flex flex-col gap-1">
                              <span className="font-medium">{event.kindLabel}</span>
                              <div className="flex gap-2">
                                {event.source !== 'live' && (
                                  <Badge variant="outline" className="text-[9px] font-mono px-1 py-0 uppercase border-primary text-primary">
                                    {event.source}
                                  </Badge>
                                )}
                                {event.realizedPnl !== null && (
                                  <Badge variant="outline" className={`text-[9px] font-mono px-1 py-0 uppercase ${event.realizedPnl > 0 ? 'border-success text-success' : event.realizedPnl < 0 ? 'border-destructive text-destructive' : 'border-muted-foreground text-muted-foreground'}`}>
                                    {event.realizedPnl > 0 ? '+' : ''}{formatUSD(event.realizedPnl)} P/L
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 font-mono text-xs">
                            {format(new Date(event.blockTime), "MMM d, yyyy HH:mm")}
                          </td>
                          <td className="px-4 py-4">
                            <div className="font-medium flex items-center gap-2">
                              {event.symbol}
                            </div>
                          </td>
                          <td className={`px-4 py-4 text-right font-mono ${event.quantity > 0 ? "text-success" : event.quantity < 0 ? "text-destructive" : ""}`}>
                            {event.quantity > 0 ? "+" : ""}{formatQuantity(event.quantity)}
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-xs text-muted-foreground">
                            {formatUSD(event.pricePerShare)}
                          </td>
                          <td className="px-4 py-4 text-right font-mono font-medium">
                            {formatUSD(event.grossAmount)}
                          </td>
                          <td className="px-4 py-4 text-right">
                            {event.explorerUrl ? (
                              <a href={event.explorerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex text-muted-foreground hover:text-foreground">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-mono">
                Total: {activityPage.total}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleReset} disabled={!cursor}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> First Page
                </Button>
                <Button variant="outline" size="sm" onClick={handleNextPage} disabled={!activityPage.nextCursor}>
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Shell>
  );
}
