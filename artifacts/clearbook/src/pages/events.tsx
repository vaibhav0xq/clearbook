import { useMemo } from "react";
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

const CONFIDENCE: Record<string, { tone: "gain" | "amber" | "neutral"; hint: string }> = {
  confirmed: { tone: "gain", hint: "Read from the token's on chain state" },
  inferred: { tone: "amber", hint: "Derived from a multiplier change between two observations" },
  scripted: { tone: "neutral", hint: "Part of the demo ledger's scripted history" },
};

export default function Events() {
  const [, params] = useRoute("/w/:address/events");
  const address = params?.address || "";

  const { data: events, isLoading, error } = useListCorporateActions(address);

  const summary = useMemo(() => {
    if (!events || events.length === 0) return null;
    const kinds = new Map<string, number>();
    const confidences = new Map<string, number>();
    let income = 0;
    let incomeKnown = false;
    let unknownValue = 0;
    for (const e of events) {
      kinds.set(e.kindLabel, (kinds.get(e.kindLabel) ?? 0) + 1);
      confidences.set(e.confidence, (confidences.get(e.confidence) ?? 0) + 1);
      if (e.valueEffect !== null) {
        income += e.valueEffect;
        incomeKnown = true;
      } else {
        unknownValue += 1;
      }
    }
    const sources = Array.from(new Set(events.map((e) => e.source)));
    return {
      kinds: Array.from(kinds.entries()),
      confidences: Array.from(confidences.entries()),
      income: incomeKnown ? income : null,
      unknownValue,
      sources,
    };
  }, [events]);

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
        <div className="flex flex-col gap-8">
          {summary && (
            <Reveal>
              <div className="flex flex-col gap-4 border-t hairline pt-6 md:flex-row md:items-end md:justify-between">
                <div className="flex flex-wrap gap-x-10 gap-y-4">
                  {summary.kinds.map(([label, count]) => (
                    <span key={label} className="flex flex-col gap-2">
                      <span className="label">{label}</span>
                      <span className="num text-[22px] leading-none text-foreground desk:text-[26px]">{count}</span>
                    </span>
                  ))}
                  {summary.income !== null && (
                    <span className="flex flex-col gap-2">
                      <span className="label">{summary.unknownValue > 0 ? "Known value effect" : "Value effect"}</span>
                      <span className={cn("num text-[22px] leading-none desk:text-[26px]", summary.income > 0 ? "text-success" : summary.income < 0 ? "text-destructive" : "text-foreground")}>
                        {summary.income > 0 ? "+" : ""}
                        {formatUSD(summary.income)}
                      </span>
                      {summary.unknownValue > 0 && (
                        <span className="text-[11px] text-muted-foreground">
                          {summary.unknownValue} {summary.unknownValue === 1 ? "event" : "events"} with unknown value excluded
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-2 text-[12px] text-muted-foreground md:items-end">
                  {summary.confidences.map(([confidence, count]) => (
                    <span key={confidence} className="flex items-center gap-2">
                      <Pill tone={CONFIDENCE[confidence]?.tone ?? "neutral"} className="text-[9px] px-1.5 py-[1px]">
                        {confidence}
                      </Pill>
                      <span>
                        {CONFIDENCE[confidence]?.hint ?? confidence}, {count} {count === 1 ? "event" : "events"}
                      </span>
                    </span>
                  ))}
                  <span>Source: {summary.sources.join(", ")}</span>
                </div>
              </div>
            </Reveal>
          )}
        <Reveal delay={0.05}>
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
                    <div className="flex flex-col gap-1" title={event.note || undefined}>
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] text-foreground">{event.kindLabel}</span>
                        <span title={CONFIDENCE[event.confidence]?.hint} className="cursor-help">
                          <Pill tone={CONFIDENCE[event.confidence]?.tone ?? "neutral"} className="text-[9px] px-1.5 py-[1px]">
                            {event.confidence}
                          </Pill>
                        </span>
                      </div>
                      <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="num">{format(new Date(event.effectiveAt), "MMM d, yyyy")}</span>
                        {/* The note is printed on wide monitors. Below that it stays in the accessibility tree and the tooltip. */}
                        {event.note && (
                          <span className="sr-only desk:not-sr-only desk:flex desk:items-center desk:gap-2">
                            <span aria-hidden className="hidden text-muted-foreground/30 desk:inline">/</span>
                            <span className="desk:max-w-[360px] desk:truncate desk:text-muted-foreground/80">{event.note}</span>
                          </span>
                        )}
                      </span>
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
        </div>
      )}
    </>
  );
}
