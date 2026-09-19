import { useRoute } from "wouter";
import { Shell } from "@/components/layout/shell";
import { useListCorporateActions } from "@workspace/api-client-react";
import { formatUSD, formatQuantity } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ExternalLink, Calendar, GitMerge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function Events() {
  const [, params] = useRoute("/w/:address/events");
  const address = params?.address || "";

  const { data: events, isLoading, error } = useListCorporateActions(address);

  return (
    <Shell address={address}>
      <div className="flex flex-col gap-8 pb-12">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-3xl">Corporate actions</h1>
          <p className="text-muted-foreground text-sm">
            Dividend reinvestments, stock splits, and pending multiplier changes.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : error ? (
          <div className="p-8 border border-destructive/20 bg-destructive/10 text-destructive rounded-lg flex flex-col items-center justify-center text-center">
            <AlertCircle className="h-8 w-8 mb-2" />
            <h3 className="font-semibold">Unable to load events</h3>
            <p className="text-sm opacity-80 mt-1">{error.message}</p>
          </div>
        ) : events ? (
          <div className="border border-card-border rounded-lg overflow-hidden bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground font-mono uppercase tracking-wider bg-muted/50 border-b border-card-border">
                  <tr>
                    <th className="px-4 py-3 font-medium">Event kind</th>
                    <th className="px-4 py-3 font-medium">Asset</th>
                    <th className="px-4 py-3 font-medium">Effective date</th>
                    <th className="px-4 py-3 font-medium text-right">Multiplier change</th>
                    <th className="px-4 py-3 font-medium text-right">Quantity effect</th>
                    <th className="px-4 py-3 font-medium text-right">Value effect</th>
                    <th className="px-4 py-3 font-medium text-right">Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-card-border">
                  {events.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                        No corporate actions found for this portfolio.
                      </td>
                    </tr>
                  ) : (
                    events.map((event) => (
                      <tr key={event.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-4">
                          <div className="flex flex-col gap-1">
                            <span className="font-medium flex items-center gap-2">
                              {event.kind === "multiplier_change" || event.kind === "pending_multiplier" ? (
                                <GitMerge className="h-4 w-4 text-primary" />
                              ) : (
                                <Calendar className="h-4 w-4 text-secondary-foreground" />
                              )}
                              {event.kindLabel}
                            </span>
                            <span className="text-xs text-muted-foreground line-clamp-1">{event.note}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 font-medium">
                          {event.symbol}
                        </td>
                        <td className="px-4 py-4 font-mono text-xs">
                          {format(new Date(event.effectiveAt), "MMM d, yyyy")}
                        </td>
                        <td className="px-4 py-4 text-right font-mono text-xs">
                          {event.previousMultiplier !== event.newMultiplier ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="text-muted-foreground">{event.previousMultiplier.toFixed(6)}</span>
                              <span>→</span>
                              <span className="text-foreground">{event.newMultiplier.toFixed(6)}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right font-mono text-xs">
                          {event.quantityBefore !== null && event.quantityAfter !== null ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="text-muted-foreground">{formatQuantity(event.quantityBefore)}</span>
                              <span>→</span>
                              <span className="text-success">{formatQuantity(event.quantityAfter)}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right font-mono text-xs">
                          {event.valueEffect !== null ? (
                            <span className={event.valueEffect > 0 ? "text-success" : event.valueEffect < 0 ? "text-destructive" : ""}>
                              {event.valueEffect > 0 ? "+" : ""}{formatUSD(event.valueEffect)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <Badge variant="outline" className={`text-[10px] font-mono uppercase ${
                            event.confidence === 'confirmed' ? 'border-success text-success' :
                            event.confidence === 'inferred' ? 'border-warning text-warning' :
                            'border-muted-foreground text-muted-foreground'
                          }`}>
                            {event.confidence}
                          </Badge>
                          {event.explorerUrl && (
                            <a href={event.explorerUrl} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex text-muted-foreground hover:text-foreground">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </Shell>
  );
}
