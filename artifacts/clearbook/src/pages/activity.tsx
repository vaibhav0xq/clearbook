import { useRoute, useSearch, useLocation } from "wouter";
import { format } from "date-fns";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";

import { useListActivity } from "@workspace/api-client-react";
import { useCostMethod } from "@/hooks/use-cost-method";
import { useStageContext, useStage } from "@/components/layout/stage";
import { formatUSD, formatQuantity, issuerLabel } from "@/lib/format";
import { DataTable, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/data-table";
import { Pill, Skeleton, EmptyState, ErrorState, PageHeader } from "@/components/surface";
import { Reveal } from "@/components/motion/reveal";
import { ScrambleText } from "@/components/motion/scramble-text";
import { cn } from "@/lib/utils";

export default function Activity() {
  const [, params] = useRoute("/w/:address/activity");
  const address = params?.address || "";
  const { method } = useCostMethod();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const urlParams = new URLSearchParams(search);
  const cursor = urlParams.get("cursor") || undefined;

  const { data: activityPage, isLoading, error } = useListActivity(address, { method, cursor, limit: 50 });

  const { hoverMint, setHoverMint } = useStageContext();
  // The caption describes the page in view, so its count and its date range come from the same items.
  const shown = activityPage?.items.length ?? 0;
  const first = activityPage?.items[activityPage.items.length - 1]?.blockTime;
  const last = activityPage?.items[0]?.blockTime;
  useStage({
    focusMint: hoverMint,
    caption:
      activityPage && shown > 0 && first && last
        ? `${shown} of ${activityPage.total} ${activityPage.total === 1 ? "event" : "events"}, ${format(new Date(first), "MMM d, yyyy")} to ${format(new Date(last), "MMM d, yyyy")}.`
        : null,
  });

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
    <>
      <PageHeader
        title="Ledger activity"
        description="All on-chain events and resolved transfers."
      />

      {isLoading ? (
        <div className="flex flex-col gap-10">
          <Skeleton className="h-[600px] w-full rounded-2xl" />
        </div>
      ) : error ? (
        <ErrorState title="Unable to load activity" message={error.data?.message ?? error.message} />
      ) : activityPage?.items.length === 0 ? (
        <EmptyState
          title="No ledger activity"
          description={cursor ? "This page is empty." : "No activity found for this ledger."}
          action={
            cursor && (
              <button
                type="button"
                onClick={handleReset}
                className="mt-6 inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.12em] text-primary hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to first page
              </button>
            )
          }
        />
      ) : (
        <Reveal>
          <DataTable>
            <TableHeader>
              <TableHead>Event</TableHead>
              <TableHead>Asset</TableHead>
              <TableHead align="right">Quantity</TableHead>
              <TableHead align="right">Price</TableHead>
              <TableHead align="right">Value</TableHead>
              <TableHead align="right" className="w-12"><span className="sr-only">Link</span></TableHead>
            </TableHeader>
            <TableBody>
              {activityPage!.items.map((event, i) => (
                <TableRow 
                  key={event.id} 
                  index={i}
                  active={hoverMint === event.mint}
                  onMouseEnter={() => event.mint && setHoverMint(event.mint)}
                  onMouseLeave={() => event.mint && setHoverMint(null)}
                >
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="text-[14px] text-foreground">{event.kindLabel}</span>
                      <div className="flex items-center gap-2">
                        <span className="num text-[11px] text-muted-foreground">{format(new Date(event.blockTime), "MMM d, yyyy HH:mm")}</span>
                        {event.signature && (
                          <>
                            <span className="text-muted-foreground/30">/</span>
                            <span className="num text-[11px] text-muted-foreground/60">
                              <ScrambleText text={event.signature.slice(0, 8)} />
                            </span>
                          </>
                        )}
                        {event.source !== "live" && event.source !== "demo" && (
                          <Pill className="text-[9px] px-1.5 py-[1px] ml-1">{event.source}</Pill>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                       <span className="num text-[14px] tracking-[0.08em] text-foreground">{event.symbol}</span>
                       <span className="text-[11px] text-muted-foreground">{issuerLabel(event.issuer)}</span>
                    </div>
                  </TableCell>
                  <TableCell align="right">
                    <div className="flex flex-col items-end gap-1">
                      <span className={cn("num text-[14px]", event.quantity > 0 ? "text-success" : event.quantity < 0 ? "text-destructive" : "text-foreground")}>
                        {event.quantity > 0 ? "+" : ""}{formatQuantity(event.quantity)}
                      </span>
                      {event.rawQuantity !== event.quantity && (
                         <span className="num text-[11px] text-muted-foreground">Raw {formatQuantity(event.rawQuantity)}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell align="right">
                    <div className="flex flex-col items-end gap-1">
                       <span className="num text-[14px] text-foreground">{formatUSD(event.pricePerShare)}</span>
                       {event.fee !== null && event.fee > 0 && (
                         <span className="num text-[11px] text-muted-foreground">Fee {formatUSD(event.fee)}</span>
                       )}
                    </div>
                  </TableCell>
                  <TableCell align="right">
                    <div className="flex flex-col items-end gap-1">
                      <span className="num text-[14px] font-medium text-foreground">{formatUSD(event.grossAmount)}</span>
                      {event.realizedPnl !== null && (
                         <span className={cn("num text-[11px]", event.realizedPnl > 0 ? "text-success" : event.realizedPnl < 0 ? "text-destructive" : "text-muted-foreground")}>
                           {event.realizedPnl > 0 ? "+" : ""}{formatUSD(event.realizedPnl)} P/L
                         </span>
                      )}
                      {event.counterAsset && event.counterAmount !== null && event.realizedPnl === null && (
                         <span className="num text-[11px] text-muted-foreground">
                           {formatQuantity(event.counterAmount)} {event.counterAsset}
                         </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell align="right">
                    {event.explorerUrl ? (
                      <a href={event.explorerUrl} target="_blank" rel="noopener noreferrer" aria-label="Open transaction in explorer" className="group inline-flex h-8 w-8 items-center justify-center rounded-full border hairline bg-white/[0.03] text-muted-foreground transition-colors hover:text-primary hover:border-primary/30">
                        <ExternalLink className="h-3.5 w-3.5 transition-transform duration-500 ease-out-expo group-hover:scale-110 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                      </a>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </DataTable>

          <div className="mt-6 flex items-center justify-between border-t hairline pt-6">
            <span className="label flex items-center gap-1.5">
              Total entries: <span className="num text-[12px]">{activityPage!.total}</span>
            </span>
            <div className="flex items-center gap-4">
              <button 
                type="button"
                onClick={handleReset} 
                disabled={!cursor}
                className="label group flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"
              >
                <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-500 ease-out-expo group-hover:-translate-x-1" /> First page
              </button>
              <button 
                type="button"
                onClick={handleNextPage} 
                disabled={!activityPage!.nextCursor}
                className="label group flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"
              >
                Next <ArrowRight className="h-3.5 w-3.5 transition-transform duration-500 ease-out-expo group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        </Reveal>
      )}
    </>
  );
}
