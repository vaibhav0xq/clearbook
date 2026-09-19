import { useRoute } from "wouter";
import { format } from "date-fns";
import { ExternalLink, ArrowRight } from "lucide-react";

import { useListCorporateActions } from "@workspace/api-client-react";
import { useStageContext, useStage } from "@/components/layout/stage";
import { formatUSD, formatQuantity } from "@/lib/format";
import { DataTable, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/data-table";
import { Pill, Skeleton, EmptyState, ErrorState, PageHeader } from "@/components/surface";
import { Reveal } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

export default function Events() {
  const [, params] = useRoute("/w/:address/events");
  const address = params?.address || "";

  const { data: events, isLoading, error } = useListCorporateActions(address);

  const { hoverMint, setHoverMint } = useStageContext();
  useStage({
    focusMint: hoverMint,
    caption: "Corporate actions change the multiplier that turns raw token units into shares of exposure."
  });

  return (
    <>
      <PageHeader
        title="Corporate actions"
        description="Dividend reinvestments, splits and multiplier events read from the token."
      />

      {isLoading ? (
        <div className="flex flex-col gap-10">
          <Skeleton className="h-[400px] w-full rounded-2xl" />
        </div>
      ) : error ? (
        <ErrorState title="Unable to load events" message={error.data?.message ?? error.message} />
      ) : events?.length === 0 ? (
        <EmptyState
          title="No corporate actions"
          description="No corporate actions found for this portfolio."
        />
      ) : (
        <Reveal>
          <DataTable>
            <TableHeader>
              <TableHead>Event</TableHead>
              <TableHead>Asset</TableHead>
              <TableHead align="right">Multiplier</TableHead>
              <TableHead align="right">Effect</TableHead>
              <TableHead align="right" className="w-12"><span className="sr-only">Link</span></TableHead>
            </TableHeader>
            <TableBody>
              {events!.map((event, i) => (
                <TableRow 
                  key={event.id} 
                  index={i}
                  active={hoverMint === event.mint}
                  onMouseEnter={() => event.mint && setHoverMint(event.mint)}
                  onMouseLeave={() => event.mint && setHoverMint(null)}
                >
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] text-foreground">{event.kindLabel}</span>
                        <Pill tone={event.confidence === "confirmed" ? "gain" : event.confidence === "inferred" ? "amber" : "neutral"} className="text-[9px] px-1.5 py-[1px]">
                          {event.confidence}
                        </Pill>
                      </div>
                      <span className="num text-[11px] text-muted-foreground">{format(new Date(event.effectiveAt), "MMM d, yyyy")}</span>
                      {event.note && (
                        <span className="text-[12px] text-muted-foreground/80 max-w-[280px] whitespace-normal leading-relaxed mt-1">
                          {event.note}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="num text-[14px] tracking-[0.08em] text-foreground">{event.symbol}</span>
                  </TableCell>
                  <TableCell align="right">
                    {event.previousMultiplier !== event.newMultiplier ? (
                      <div className="flex flex-col items-end gap-1 num text-[14px]">
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground">{event.previousMultiplier.toFixed(4)}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
                          <span className="text-foreground">{event.newMultiplier.toFixed(4)}</span>
                        </div>
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell align="right">
                    <div className="flex flex-col items-end gap-1">
                      {event.quantityBefore !== null && event.quantityAfter !== null ? (
                        <div className="flex items-center justify-end gap-1.5 num text-[14px]">
                          <span className="text-muted-foreground">{formatQuantity(event.quantityBefore)}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
                          <span className="text-success">{formatQuantity(event.quantityAfter)}</span>
                        </div>
                      ) : null}
                      {event.valueEffect !== null ? (
                        <span className={cn("num text-[11px]", event.valueEffect > 0 ? "text-success" : event.valueEffect < 0 ? "text-destructive" : "text-muted-foreground")}>
                          {event.valueEffect > 0 ? "+" : ""}{formatUSD(event.valueEffect)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">Unknown value effect</span>
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
        </Reveal>
      )}
    </>
  );
}
