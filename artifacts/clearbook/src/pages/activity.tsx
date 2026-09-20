import { useMemo } from "react";
import { useRoute, useSearch, useLocation } from "wouter";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";

import { useListActivity } from "@workspace/api-client-react";
import { useCostMethod } from "@/hooks/use-cost-method";
import { useStageContext, useStage } from "@/components/layout/stage";
import { formatUSD, formatQuantity, formatDate, formatDateTime, truncateHash, issuerLabel } from "@/lib/format";
import { DataTable, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/data-table";
import { Skeleton, EmptyState, ErrorState, PageHeader, Pill } from "@/components/surface";
import { Figure } from "@/components/figure";
import { Reveal } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;
const INFLOWS = new Set(["buy", "wrapper_swap_in"]);
const OUTFLOWS = new Set(["sell", "wrapper_swap_out"]);

export default function Activity() {
  const [, params] = useRoute("/w/:address/activity");
  const address = params?.address || "";
  const { method } = useCostMethod();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const urlParams = new URLSearchParams(search);
  const cursor = urlParams.get("cursor") || undefined;

  const { data: activityPage, isLoading, error } = useListActivity(address, { method, cursor, limit: PAGE_SIZE });

  const items = activityPage?.items ?? [];
  const shown = items.length;
  // Items arrive newest first, so the range runs from the last row to the first.
  const first = items[shown - 1]?.blockTime;
  const last = items[0]?.blockTime;
  const complete = !!activityPage && !cursor && !activityPage.nextCursor;

  // Totals over the rows in view. When the ledger spans more than one page the sub lines say so.
  const summary = useMemo(() => {
    if (items.length === 0) return null;
    let purchases = 0;
    let proceeds = 0;
    let fees = 0;
    let trades = 0;
    let transfers = 0;
    // Trades without a price and trades whose fee was not recorded stay out of the sums and are counted
    // instead, so each total says what it leaves out.
    let unpricedPurchases = 0;
    let unpricedSales = 0;
    let unknownFees = 0;
    for (const e of items) {
      const isTrade = INFLOWS.has(e.kind) || OUTFLOWS.has(e.kind);
      if (INFLOWS.has(e.kind)) {
        if (e.grossAmount === null) unpricedPurchases += 1;
        else purchases += e.grossAmount;
        trades += 1;
      } else if (OUTFLOWS.has(e.kind)) {
        if (e.grossAmount === null) unpricedSales += 1;
        else proceeds += e.grossAmount;
        trades += 1;
      } else if (e.kind === "transfer_in" || e.kind === "transfer_out") {
        transfers += 1;
      }
      if (isTrade) {
        if (e.fee === null) unknownFees += 1;
        else fees += e.fee;
      }
    }
    return { purchases, proceeds, fees, trades, transfers, unpricedPurchases, unpricedSales, unknownFees };
  }, [items]);

  const { hoverMint, setHoverMint } = useStageContext();
  useStage({
    focusMint: hoverMint,
    caption:
      activityPage && shown > 0 && first && last
        ? `${shown} of ${activityPage.total} ${activityPage.total === 1 ? "event" : "events"}, ${formatDate(first)} to ${formatDate(last)}.`
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

  const scope = complete ? (first ? `Since ${formatDate(first)}` : "Whole ledger") : "On this page";

  return (
    <>
      <PageHeader title="Activity" description="Every indexed event in date order with its price, fee and the lots a sale relieved." />

      {isLoading ? (
        <div className="flex flex-col gap-10">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-[520px] w-full rounded-2xl" />
        </div>
      ) : error ? (
        <ErrorState title="Unable to load activity" message={error.data?.message ?? error.message} />
      ) : shown === 0 ? (
        <EmptyState
          title="No activity"
          description={
            cursor
              ? "This page is past the end of the ledger."
              : "No purchases, sales or transfers of tokenized stocks have been indexed for this wallet."
          }
          action={
            cursor && (
              <button
                type="button"
                onClick={handleReset}
                className="mt-6 inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.12em] text-primary transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to first page
              </button>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-10">
          {summary && (
            <Reveal>
              <div className="grid grid-cols-2 gap-x-8 gap-y-8 border-t hairline pt-6 md:grid-cols-4">
                <Figure
                  label="Events"
                  value={String(activityPage!.total)}
                  size="md"
                  sub={`${summary.trades} ${summary.trades === 1 ? "trade" : "trades"}, ${summary.transfers} ${summary.transfers === 1 ? "transfer" : "transfers"}`}
                />
                <Figure
                  label="Purchases"
                  value={summary.purchases}
                  size="md"
                  sub={summary.unpricedPurchases > 0 ? `${scope}, ${summary.unpricedPurchases} unpriced excluded` : scope}
                />
                <Figure
                  label="Proceeds"
                  value={summary.proceeds}
                  size="md"
                  sub={summary.unpricedSales > 0 ? `${scope}, ${summary.unpricedSales} unpriced excluded` : scope}
                />
                <Figure
                  label="Fees"
                  value={summary.fees}
                  size="md"
                  sub={summary.unknownFees > 0 ? `Venue fees at trade time, ${summary.unknownFees} unknown` : "Venue fees at trade time"}
                />
              </div>
            </Reveal>
          )}

          <Reveal delay={0.05}>
            <DataTable>
              <TableHeader>
                <TableHead>Event</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead align="right">Quantity</TableHead>
                <TableHead align="right">Price</TableHead>
                <TableHead align="right">Value</TableHead>
                <TableHead align="right" className="w-12">
                  <span className="sr-only">Transaction</span>
                </TableHead>
              </TableHeader>
              <TableBody>
                {items.map((event, i) => {
                  const relieved = event.reliefs.length;
                  const priced = event.pricePerShare !== null;
                  return (
                    <TableRow
                      key={event.id}
                      index={i}
                      active={hoverMint === event.mint}
                      onMouseEnter={() => event.mint && setHoverMint(event.mint)}
                      onMouseLeave={() => event.mint && setHoverMint(null)}
                    >
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="flex items-center gap-2 text-[14px] text-foreground">
                            {event.kindLabel}
                            {event.source === "simulated" && <Pill tone="amber">Simulated</Pill>}
                          </span>
                          <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span className="num">{formatDateTime(event.blockTime)}</span>
                            {relieved > 0 && (
                              <>
                                <span className="text-muted-foreground/30">/</span>
                                <span>
                                  {relieved} {relieved === 1 ? "lot" : "lots"} relieved
                                </span>
                              </>
                            )}
                          </span>
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
                            {event.quantity > 0 ? "+" : ""}
                            {formatQuantity(event.quantity)} sh
                          </span>
                          {Math.abs(event.rawQuantity - event.quantity) > 1e-9 && (
                            <span className="num text-[11px] text-muted-foreground" title="Token units moved, before the issuer multiplier">
                              {formatQuantity(Math.abs(event.rawQuantity), 4)} tokens
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell align="right">
                        <div className="flex flex-col items-end gap-1">
                          <span className={cn("num text-[14px]", priced ? "text-foreground" : "text-muted-foreground")}>{formatUSD(event.pricePerShare)}</span>
                          {priced && event.fee !== null && event.fee > 0 ? (
                            <span className="num text-[11px] text-muted-foreground">Fee {formatUSD(event.fee)}</span>
                          ) : !priced ? (
                            <span className="text-[11px] text-muted-foreground">No price on chain</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell align="right">
                        <div className="flex flex-col items-end gap-1">
                          <span className={cn("num text-[14px]", event.grossAmount !== null ? "text-foreground" : "text-muted-foreground")}>{formatUSD(event.grossAmount)}</span>
                          {event.realizedPnl !== null ? (
                            <span className={cn("num text-[11px]", event.realizedPnl > 0 ? "text-success" : event.realizedPnl < 0 ? "text-destructive" : "text-muted-foreground")}>
                              {event.realizedPnl > 0 ? "+" : ""}
                              {formatUSD(event.realizedPnl)} realized
                            </span>
                          ) : event.counterAsset && event.counterAmount !== null ? (
                            <span className="num text-[11px] text-muted-foreground">
                              {formatQuantity(event.counterAmount, 2)} {event.counterAsset}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell align="right">
                        {event.explorerUrl ? (
                          <a
                            href={event.explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Open transaction ${truncateHash(event.signature ?? "")} in explorer`}
                            title={event.signature ?? undefined}
                            className="group inline-flex h-8 w-8 items-center justify-center rounded-full border hairline bg-white/[0.03] text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
                          >
                            <ExternalLink className="h-3.5 w-3.5 transition-transform duration-500 ease-out-expo group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:scale-110" />
                          </a>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </DataTable>

            <div className="mt-6 flex items-center justify-between border-t hairline pt-6">
              <span className="text-[12px] text-muted-foreground">
                <span className="num">{shown}</span> of <span className="num">{activityPage!.total}</span> {activityPage!.total === 1 ? "event" : "events"}
                {first && last ? (
                  <>
                    , <span className="num">{formatDate(first)}</span> to <span className="num">{formatDate(last)}</span>
                  </>
                ) : null}
              </span>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={!cursor}
                  className="label group flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                >
                  <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-500 ease-out-expo group-hover:-translate-x-1" /> First page
                </button>
                <button
                  type="button"
                  onClick={handleNextPage}
                  disabled={!activityPage!.nextCursor}
                  className="label group flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                >
                  Older <ArrowRight className="h-3.5 w-3.5 transition-transform duration-500 ease-out-expo group-hover:translate-x-1" />
                </button>
              </div>
            </div>
          </Reveal>
        </div>
      )}
    </>
  );
}
