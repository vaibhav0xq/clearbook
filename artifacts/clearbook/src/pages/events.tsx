import { useRoute } from "wouter";
import { Shell } from "@/components/layout/shell";
import { useListCorporateActions } from "@workspace/api-client-react";
import { formatUSD, formatQuantity } from "@/lib/format";
import { AlertCircle, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { DataTable, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/data-table";

export default function Events() {
  const [, params] = useRoute("/w/:address/events");
  const address = params?.address || "";

  const { data: events, isLoading, error } = useListCorporateActions(address);

  return (
    <Shell address={address}>
      <div className="flex flex-col animate-in fade-in duration-700 pb-12">
        
        {/* Page Header */}
        <div className="flex flex-col gap-1 mb-8">
          <h1 className="font-serif text-4xl tracking-tight text-foreground">Corporate actions</h1>
          <p className="text-muted-foreground text-sm font-sans mt-2">
            Dividend reinvestments, splits and unclassified multiplier changes read from the token itself.
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
            <h3 className="font-serif text-2xl mb-2 text-foreground">Unable to load events</h3>
            <p className="text-muted-foreground font-sans">{error.message || "An unknown error occurred"}</p>
          </div>
        ) : events ? (
          <div className="flex flex-col gap-5">
            {events.length === 0 ? (
              <div className="p-16 text-center border border-border bg-card shadow-sm">
                <h3 className="font-serif text-2xl mb-3 text-foreground">No corporate actions</h3>
                <p className="text-muted-foreground text-sm font-sans max-w-md mx-auto leading-relaxed">
                  No corporate actions found for this portfolio.
                </p>
              </div>
            ) : (
              <DataTable>
                <TableHeader>
                  <TableHead>Event kind</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>Effective date</TableHead>
                  <TableHead align="right">Multiplier change</TableHead>
                  <TableHead align="right">Quantity effect</TableHead>
                  <TableHead align="right">Value effect</TableHead>
                  <TableHead align="right">Confidence</TableHead>
                </TableHeader>
                <TableBody>
                  {events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[15px] font-medium text-foreground">{event.kindLabel}</span>
                          <span className="text-[11px] text-muted-foreground font-sans max-w-[280px] leading-snug">
                            {event.note}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-serif text-lg text-foreground">{event.symbol}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-[15px] tabular-nums text-foreground">{format(new Date(event.effectiveAt), "MMM d, yyyy")}</span>
                      </TableCell>
                      <TableCell align="right">
                        {event.previousMultiplier !== event.newMultiplier ? (
                          <div className="flex items-center justify-end gap-1.5 text-[15px] tabular-nums">
                            <span className="text-muted-foreground">{event.previousMultiplier.toFixed(6)}</span>
                            <span className="text-muted-foreground/50 font-sans">→</span>
                            <span className="text-foreground">{event.newMultiplier.toFixed(6)}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {event.quantityBefore !== null && event.quantityAfter !== null ? (
                          <div className="flex items-center justify-end gap-1.5 text-[15px] tabular-nums">
                            <span className="text-muted-foreground">{formatQuantity(event.quantityBefore)}</span>
                            <span className="text-muted-foreground/50 font-sans">→</span>
                            <span className="text-success">{formatQuantity(event.quantityAfter)}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {event.valueEffect !== null ? (
                          <span className={`text-[15px] tabular-nums ${event.valueEffect > 0 ? "text-success" : event.valueEffect < 0 ? "text-destructive" : "text-foreground"}`}>
                            {event.valueEffect > 0 ? "+" : ""}{formatUSD(event.valueEffect)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <div className="flex items-center justify-end gap-2">
                          <span className={`text-[11px] font-sans uppercase tracking-[0.08em] ${
                            event.confidence === 'confirmed' ? 'text-success' :
                            event.confidence === 'inferred' ? 'text-primary' :
                            'text-muted-foreground'
                          }`}>
                            {event.confidence}
                          </span>
                          {event.explorerUrl && (
                            <a href={event.explorerUrl} target="_blank" rel="noopener noreferrer" aria-label="Open transaction in explorer" className="inline-flex text-muted-foreground hover:text-foreground transition-colors">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </DataTable>
            )}
          </div>
        ) : null}
      </div>
    </Shell>
  );
}
