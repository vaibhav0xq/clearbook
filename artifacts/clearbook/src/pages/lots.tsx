import { useMemo, useState, type ComponentProps } from "react";
import { useRoute, useSearch, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X } from "lucide-react";

import { useListLots, useGetPortfolio, useGetTaxLots, type CostMethod, type LotStatusFilter, type Lot, type TaxYearSummary } from "@workspace/api-client-react";
import { useCostMethod } from "@/hooks/use-cost-method";
import { formatUSD, formatQuantity, formatDate, eventKindLabel } from "@/lib/format";
import { DataTable, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/data-table";
import { Pill, Skeleton, EmptyState, ErrorState, PageHeader, SectionTitle } from "@/components/surface";
import { Figure } from "@/components/figure";
import { Reveal, EASE_OUT } from "@/components/motion/reveal";
import { buildStrata, reliefRank, reliefOrder, type StrataLayer } from "@/components/three/strata-data";
import { useHoverActive, useHoverMint, useSetHoverMint, useStage } from "@/components/layout/stage";
import { cn } from "@/lib/utils";
import { useWalletIndexing } from "@/hooks/use-wallet-indexing";
import { IndexingState } from "@/components/layout/indexing-state";
import { downloadFile } from "@/lib/download";

const FILTERS: { value: LotStatusFilter; label: string }[] = [
  { value: "all", label: "All lots" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
];

const METHOD_HINT: Record<string, string> = {
  fifo: "FIFO relieves the oldest layer first.",
  lifo: "LIFO relieves the newest layer first.",
  hifo: "HIFO relieves the highest cost per share first.",
};

function Strip({ order, totalValue }: { order: StrataLayer[]; totalValue: number }) {
  if (totalValue <= 0 || order.length === 0) return null;
  return (
    <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-white/[0.03] border hairline">
      {order.map((layer, i) => {
        const width = Math.max(0, (layer.value / totalValue) * 100);
        let bgColor = "bg-foreground/40";
        if (layer.basisUnknown) bgColor = "bg-white/[0.1]";
        else if (layer.unrealizedPnl !== null) {
          if (layer.unrealizedPnl > 0) bgColor = "bg-success";
          else if (layer.unrealizedPnl < 0) bgColor = "bg-destructive";
        }
        return (
          <motion.div
            key={layer.id}
            initial={{ width: 0 }}
            whileInView={{ width: `${width}%` }}
            viewport={{ once: true }}
            transition={{ duration: 0.9, ease: EASE_OUT, delay: i * 0.04 }}
            className={cn("h-full border-r border-background/40 last:border-0", bgColor)}
            title={`${layer.symbol} lot: ${formatUSD(layer.value)}`}
          />
        );
      })}
    </div>
  );
}

interface LotGroup {
  mint: string;
  symbol: string | undefined;
  name: string;
  lots: Lot[];
  col: ReturnType<typeof buildStrata>[number] | undefined;
  ranks: Map<string, number>;
  order: StrataLayer[];
}

function LotsStage({
  groups,
  mintFilter,
  hoverLayerId,
  method,
  statusFilter,
}: {
  groups: LotGroup[];
  mintFilter: string | undefined;
  hoverLayerId: string | null;
  method: string;
  statusFilter: LotStatusFilter;
}) {
  const hoverMint = useHoverMint();
  const activeGroupMint = mintFilter || hoverMint;
  const activeGroup = activeGroupMint ? groups.find((group) => group.mint === activeGroupMint) : null;
  let caption = METHOD_HINT[method] || "";
  if (activeGroup && activeGroup.order.length > 0 && statusFilter !== "closed") {
    const firstLot = activeGroup.order[0];
    const date = firstLot.openedAt ? formatDate(firstLot.openedAt) : "opening";
    if (method === "fifo") caption = `FIFO relieves the oldest layer first, starting with the ${activeGroup.symbol} lot from ${date}.`;
    if (method === "lifo") caption = `LIFO relieves the newest layer first, starting with the ${activeGroup.symbol} lot from ${date}.`;
    if (method === "hifo") caption = `HIFO relieves the highest cost layer first, starting with the ${activeGroup.symbol} lot from ${date}.`;
  }
  useStage({
    focusMint: mintFilter || null,
    highlightLayerId: hoverLayerId,
    caption,
  });
  return null;
}

function LotTableRow({
  groupMint,
  hoverLayerId,
  lotId,
  ...props
}: ComponentProps<typeof TableRow> & { groupMint: string; hoverLayerId: string | null; lotId: string }) {
  const groupActive = useHoverActive(groupMint);
  return <TableRow {...props} active={hoverLayerId === lotId || (groupActive && !hoverLayerId)} />;
}

function signedUsd(value: number): string {
  return `${value > 0 ? "+" : ""}${formatUSD(value)}`;
}

function pnlClass(value: number): string {
  return value > 0 ? "text-success" : value < 0 ? "text-destructive" : "text-foreground";
}

function reviewNotes(y: TaxYearSummary): string[] {
  const notes: string[] = [];
  if (y.washSaleFlags > 0) notes.push(`${y.washSaleFlags} wash sale ${y.washSaleFlags === 1 ? "flag" : "flags"}`);
  if (y.unknownProceedsRows > 0) notes.push(`${y.unknownProceedsRows} unknown proceeds`);
  if (y.unknownBasisRows > 0) notes.push(`${y.unknownBasisRows} unknown basis`);
  if (y.estimatedBasisRows > 0) notes.push(`${y.estimatedBasisRows} estimated basis`);
  if (y.simulatedRows > 0) notes.push(`${y.simulatedRows} simulated`);
  return notes;
}

/** Realized gains by tax year with a Form 1099-B style export per year. */
function TaxYears({ address, method, indexing }: { address: string; method: CostMethod; indexing: boolean }) {
  const { data: report, error: reportError } = useGetTaxLots(address, { method });
  const [busyYear, setBusyYear] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (reportError) {
    return (
      <Reveal as="section" className="flex flex-col gap-5">
        <SectionTitle>Tax years</SectionTitle>
        <ErrorState title="Unable to load tax years" message={reportError.data?.message ?? reportError.message} />
      </Reveal>
    );
  }
  if (!report || report.years.length === 0) return null;

  const download = async (y: TaxYearSummary) => {
    setBusyYear(y.year);
    setError(null);
    try {
      await downloadFile(y.csvUrl, `clearbook-tax-lots-${y.year}.csv`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setBusyYear(null);
    }
  };

  return (
    <Reveal as="section" className="flex flex-col gap-5">
      <SectionTitle aside={<span className="label text-muted-foreground">Form 1099-B layout</span>}>Tax years</SectionTitle>
      <DataTable>
        <TableHeader>
          <TableHead>Year</TableHead>
          <TableHead align="right">Sales</TableHead>
          <TableHead align="right" className="hidden md:table-cell">Proceeds</TableHead>
          <TableHead align="right" className="hidden md:table-cell">Cost basis</TableHead>
          <TableHead align="right" className="hidden lg:table-cell">Short term</TableHead>
          <TableHead align="right" className="hidden lg:table-cell">Long term</TableHead>
          <TableHead align="right">Net</TableHead>
          <TableHead className="hidden lg:table-cell">Review</TableHead>
          <TableHead align="right">Export</TableHead>
        </TableHeader>
        <TableBody>
          {report.years.map((y, i) => {
            const notes = reviewNotes(y);
            return (
              <TableRow key={y.year} index={i}>
                <TableCell>
                  <span className="num text-[14px] text-foreground">{y.year}</span>
                </TableCell>
                <TableCell align="right">
                  <div className="flex flex-col items-end gap-1">
                    <span className="num text-[14px] text-foreground">{y.disposals}</span>
                    <span className="num text-[11px] text-muted-foreground">{y.rows} {y.rows === 1 ? "lot" : "lots"}</span>
                  </div>
                </TableCell>
                <TableCell align="right" className="hidden md:table-cell">
                  <span className="num text-[14px] text-foreground">{formatUSD(y.proceeds)}</span>
                </TableCell>
                <TableCell align="right" className="hidden md:table-cell">
                  <span className="num text-[14px] text-foreground">{formatUSD(y.costBasis)}</span>
                </TableCell>
                <TableCell align="right" className="hidden lg:table-cell">
                  <span className={cn("num text-[14px]", pnlClass(y.shortTermGainLoss))}>{signedUsd(y.shortTermGainLoss)}</span>
                </TableCell>
                <TableCell align="right" className="hidden lg:table-cell">
                  <span className={cn("num text-[14px]", pnlClass(y.longTermGainLoss))}>{signedUsd(y.longTermGainLoss)}</span>
                </TableCell>
                <TableCell align="right">
                  <div className="flex flex-col items-end gap-1">
                    <span className={cn("num text-[14px]", pnlClass(y.gainLoss))}>{signedUsd(y.gainLoss)}</span>
                    {notes.length > 0 && <span className="text-[11px] text-muted-foreground lg:hidden">{notes.join(", ")}</span>}
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {notes.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {notes.map((n) => (
                        <Pill key={n} tone={n.includes("simulated") ? "neutral" : "amber"}>{n}</Pill>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[12px] text-muted-foreground">Nothing to review</span>
                  )}
                </TableCell>
                <TableCell align="right">
                  <button
                    type="button"
                    onClick={() => download(y)}
                    disabled={busyYear !== null || indexing}
                    title={indexing ? "Available once indexing has finished" : `Download ${y.year} as CSV`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border hairline bg-white/[0.03] px-3 text-[11px] uppercase tracking-[0.12em] text-foreground transition-colors hover:bg-white/[0.07] disabled:opacity-50"
                  >
                    <Download className="h-3 w-3" />
                    {busyYear === y.year ? "Preparing" : "CSV"}
                  </button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </DataTable>
      {error && <p className="text-[12px] text-destructive">{error}</p>}
      <p className="max-w-3xl text-[12px] leading-relaxed text-muted-foreground">
        Columns follow Form 1099-B boxes 1a to 1e so the figures carry to Form 8949. Rows with an estimated or unknown basis and rows from simulated sales are labeled. A wash sale flag marks a loss with a buy of the same stock within 30 days on either side. It is a check, not a determination. Clearbook is not a broker and files nothing.
      </p>
    </Reveal>
  );
}

export default function Lots() {
  const [, params] = useRoute("/w/:address/lots");
  const address = params?.address || "";
  const indexing = useWalletIndexing(address);
  const { method } = useCostMethod();
  const search = useSearch();
  const [, setLocation] = useLocation();
  
  const urlParams = new URLSearchParams(search);
  const statusFilter = (urlParams.get("status") as LotStatusFilter) || "all";
  const mintFilter = urlParams.get("mint") || undefined;

  const { data: lots, isLoading: loadingLots, error: lotsError } = useListLots(address, { method, status: statusFilter, mint: mintFilter });
  const { data: portfolio, isLoading: loadingPortfolio, error: portfolioError } = useGetPortfolio(address, { method });

  const setStatus = (val: string) => {
    const newParams = new URLSearchParams(search);
    newParams.set("status", val);
    setLocation("?" + newParams.toString(), { replace: true });
  };

  const clearMint = () => {
    const newParams = new URLSearchParams(search);
    newParams.delete("mint");
    setLocation("?" + newParams.toString(), { replace: true });
  };

  const isLoading = loadingLots || loadingPortfolio;
  const error = lotsError ?? portfolioError;

  const grouped = useMemo(() => {
    if (!lots || !portfolio) return [];
    
    const byMint = new Map<string, Lot[]>();
    for (const lot of lots) {
      if (!byMint.has(lot.mint)) byMint.set(lot.mint, []);
      byMint.get(lot.mint)!.push(lot);
    }

    const columns = buildStrata(portfolio.positions, lots);
    const colMap = new Map(columns.map((c) => [c.mint, c]));

    const mints = Array.from(byMint.keys());
    return mints
      .map((mint) => {
        const positionLots = byMint.get(mint)!;
        const position = portfolio.positions.find((p) => p.mint === mint);
        const col = colMap.get(mint);
        
        const ranks = col ? reliefRank(col, method) : new Map<string, number>();
        const order = col ? reliefOrder(col, method) : [];
        
        const sortedLots = [...positionLots].sort((a, b) => {
          if (a.status === "closed" && b.status === "closed") {
            return new Date(b.closedAt || 0).getTime() - new Date(a.closedAt || 0).getTime();
          }
          if (a.status !== "closed" && b.status !== "closed") {
            const rA = ranks.get(a.id) ?? 9999;
            const rB = ranks.get(b.id) ?? 9999;
            return rA - rB;
          }
          return a.status !== "closed" ? -1 : 1;
        });

        return {
          mint,
          symbol: position?.symbol || positionLots[0]?.symbol,
          name: position?.name || "",
          lots: sortedLots,
          col,
          ranks,
          order,
        };
      })
      .sort((a, b) => (b.col?.value || 0) - (a.col?.value || 0));
  }, [lots, portfolio, method]);

  // Ledger wide totals for the current filter. Realized P/L accrues on partially relieved lots too, so it
  // is summed over every lot. Lots without a readable cost stay out of the cost and unrealized sums.
  const summary = useMemo(() => {
    if (!lots || lots.length === 0) return null;
    let open = 0;
    let closed = 0;
    let closedIncomplete = 0;
    let long = 0;
    let cost = 0;
    let unrealized = 0;
    let realized = 0;
    let unknown = 0;
    let estimated = 0;
    for (const lot of lots) {
      realized += lot.realizedPnl ?? 0;
      if (lot.status === "closed") {
        closed += 1;
        if (lot.basisStatus !== "complete") closedIncomplete += 1;
        continue;
      }
      open += 1;
      if (lot.term === "long") long += 1;
      if (lot.remainingCostBasis === null) {
        unknown += 1;
        continue;
      }
      if (lot.basisStatus === "estimated") estimated += 1;
      cost += lot.remainingCostBasis;
      unrealized += lot.unrealizedPnl ?? 0;
    }
    const costNotes: string[] = [];
    if (unknown > 0) costNotes.push(`${unknown} unknown excluded`);
    if (estimated > 0) costNotes.push(`${estimated} estimated included`);
    return {
      open,
      closed,
      closedIncomplete,
      long,
      short: open - long,
      cost,
      unrealized,
      realized,
      costNote: costNotes.length > 0 ? costNotes.join(", ") : "Complete basis on every lot",
    };
  }, [lots]);

  const setHoverMint = useSetHoverMint();
  const [hoverLayerId, setHoverLayerId] = useState<string | null>(null);

  return (
    <>
      <LotsStage groups={grouped} mintFilter={mintFilter} hoverLayerId={hoverLayerId} method={method} statusFilter={statusFilter} />
      <PageHeader
        title="Tax lots"
        description="Each acquisition as a lot with its cost, holding period and place in the relief queue."
        actions={
          <div className="flex items-center gap-3">
            <AnimatePresence>
              {mintFilter && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                >
                  <Pill tone="amber" className="pr-1 py-1 flex items-center bg-primary/10">
                    {portfolio?.positions.find((p) => p.mint === mintFilter)?.symbol ?? lots?.find((l) => l.mint === mintFilter)?.symbol ?? `${mintFilter.slice(0, 4)}...${mintFilter.slice(-4)}`}
                    <button
                      type="button"
                      onClick={clearMint}
                      className="ml-1.5 flex h-4 w-4 items-center justify-center rounded-full hover:bg-primary/20 transition-colors"
                      aria-label="Clear filter"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Pill>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="flex items-center rounded-full border hairline bg-white/[0.03] p-0.5 h-9">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setStatus(f.value)}
                  className={cn(
                    "relative z-10 rounded-full px-4 h-8 text-[11px] uppercase tracking-[0.12em] transition-colors duration-300",
                    statusFilter === f.value ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {statusFilter === f.value && (
                    <motion.span
                      layoutId="lots-status-pill"
                      className="absolute inset-0 -z-10 rounded-full bg-primary shadow-[0_0_24px_-4px_hsl(var(--primary)/0.7)]"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {isLoading ? (
        <div className="flex flex-col gap-10">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : error ? (
        <ErrorState title="Unable to load lots" message={error.data?.message ?? error.message} />
      ) : grouped.length === 0 && indexing && !mintFilter ? (
        <IndexingState what="Lots" />
      ) : grouped.length === 0 ? (
        <EmptyState
          title={statusFilter === "closed" ? "No closed lots" : statusFilter === "open" ? "No open lots" : "No lots"}
          description={
            mintFilter
              ? "No lots match this asset and filter. Clear the asset filter to see the whole ledger."
              : statusFilter === "closed"
                ? "This wallet has not sold any shares yet. A sale relieves lots and they appear here with their realized result."
                : statusFilter === "open"
                  ? "Every lot in this wallet has been relieved. Closed lots keep their history under the closed filter."
                  : "Acquisitions open a lot with the shares, cost and date. None have been indexed for this wallet."
          }
        />
      ) : (
        <div className="flex flex-col gap-14">
          {summary && (
            <Reveal>
              <div className="grid grid-cols-2 gap-x-6 gap-y-7 border-t hairline pt-6 md:grid-cols-4 lg:grid-cols-5">
                {statusFilter === "closed" ? (
                  <>
                    <Figure
                      label="Closed lots"
                      value={String(summary.closed)}
                      size="md"
                      sub={summary.closedIncomplete > 0 ? `${summary.closedIncomplete} without a complete cost` : "Complete basis on every lot"}
                    />
                    <Figure label="Realized" value={summary.realized} tone size="md" sub="Fully closed lots only. Tax years below count every relief" />
                  </>
                ) : (
                  <>
                    <Figure
                      label="Open lots"
                      value={String(summary.open)}
                      size="md"
                      sub={`${summary.long} long, ${summary.short} short`}
                    />
                    <Figure label="Open cost basis" value={summary.cost} size="md" sub={summary.costNote} />
                    <Figure label="Unrealized" value={summary.unrealized} tone size="md" sub="At the current mark" />
                    {statusFilter === "all" && (summary.closed > 0 || summary.realized !== 0) ? (
                      <Figure
                        label="Realized"
                        value={summary.realized}
                        tone
                        size="md"
                        sub={summary.closed > 0 ? `${summary.closed} closed ${summary.closed === 1 ? "lot" : "lots"}, partial relief included` : "From partially relieved lots"}
                      />
                    ) : (
                      <Figure label="Positions" value={String(grouped.length)} size="md" sub={mintFilter ? "Filtered to one asset" : "With open lots"} />
                    )}
                  </>
                )}
              </div>
            </Reveal>
          )}
          {statusFilter !== "open" && !mintFilter && <TaxYears address={address} method={method} indexing={indexing} />}
          {grouped.map((group) => (
            <Reveal key={group.mint} as="section">
              <div 
                className="flex flex-col gap-5"
                onMouseEnter={() => setHoverMint(group.mint)}
                onMouseLeave={() => setHoverMint(null)}
              >
                <div className="flex flex-col gap-3">
                  <SectionTitle
                    aside={
                      group.col && (
                        <div className="flex flex-col items-end gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                          <span className="label text-muted-foreground">Market value</span>
                          <span className="num text-[16px] text-foreground sm:text-[18px]">{formatUSD(group.col.value)}</span>
                        </div>
                      )
                    }
                  >
                    <span className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                      <span>{group.symbol}</span>
                      <span className="font-sans text-[13px] tracking-normal text-muted-foreground sm:text-[15px]">{group.name}</span>
                    </span>
                  </SectionTitle>

                  {group.col && group.order.length > 0 && (statusFilter === "open" || statusFilter === "all") && (
                    <div className="flex flex-col gap-2">
                      <Strip order={group.order} totalValue={group.col.value} />
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Open lots in relief order. Width is market value, color is unrealized gain or loss.</span>
                        <span className="num">
                          {group.order.length} {group.order.length === 1 ? "lot" : "lots"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <DataTable>
                  <TableHeader>
                    <TableHead>Lot</TableHead>
                    <TableHead>Acquired</TableHead>
                    <TableHead className="hidden md:table-cell">Holding</TableHead>
                    <TableHead align="right">Quantity</TableHead>
                    <TableHead align="right">Cost basis</TableHead>
                    <TableHead align="right" className="hidden lg:table-cell">Cost per share</TableHead>
                    {statusFilter === "closed" ? (
                      <>
                        <TableHead align="right">Closed</TableHead>
                        <TableHead align="right">Realized</TableHead>
                      </>
                    ) : (
                      <>
                        <TableHead align="right">{statusFilter === "all" ? "Value or close" : "Value"}</TableHead>
                        <TableHead align="right">{statusFilter === "all" ? "Result" : "Unrealized"}</TableHead>
                      </>
                    )}
                  </TableHeader>
                  <TableBody>
                    {group.lots.map((lot, i) => (
                      <LotTableRow
                        key={lot.id} 
                        index={i}
                        groupMint={group.mint}
                        hoverLayerId={hoverLayerId}
                        lotId={lot.id}
                        onMouseEnter={() => setHoverLayerId(lot.id)}
                        onMouseLeave={() => setHoverLayerId(null)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            {lot.status !== "closed" && group.ranks.has(lot.id) ? (
                              <span
                                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-primary/20 bg-primary/10 num text-[11px] text-primary"
                                title={`Relieved ${group.ranks.get(lot.id)! + 1 === 1 ? "first" : `in position ${group.ranks.get(lot.id)! + 1}`} under ${method.toUpperCase()}`}
                              >
                                {group.ranks.get(lot.id)! + 1}
                              </span>
                            ) : (
                              <span className="h-5 w-5 shrink-0 rounded-sm border hairline bg-white/[0.02]" aria-hidden />
                            )}
                            <div className="flex flex-col gap-1">
                              <span className="text-[14px] text-foreground">{eventKindLabel(lot.openKind)}</span>
                              <span className="text-[11px] text-muted-foreground">
                                {lot.status === "closed" ? "Closed" : lot.status === "partial" ? "Partly relieved" : "Open"}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="num text-[14px] text-foreground">{lot.openedAt ? formatDate(lot.openedAt) : "Opening"}</span>
                            <span className="flex items-center gap-1.5 text-[11px] md:hidden">
                              <span className="num text-muted-foreground">{lot.holdingDays} days</span>
                              <span className="text-muted-foreground/40">|</span>
                              <span className={cn("uppercase tracking-[0.1em]", lot.term === "long" ? "text-success" : "text-muted-foreground")}>{lot.term}</span>
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center gap-1.5 text-[12px]">
                            <span className="num text-muted-foreground">{lot.holdingDays} days</span>
                            <span className="text-muted-foreground/40">|</span>
                            <span className={cn("uppercase tracking-[0.1em]", lot.term === "long" ? "text-success" : "text-muted-foreground")}>{lot.term}</span>
                          </div>
                        </TableCell>
                        <TableCell align="right">
                          <div className="flex flex-col items-end gap-1">
                            <span className="num text-[14px] text-foreground">{formatQuantity(lot.remainingQuantity)}</span>
                            {lot.remainingQuantity < lot.quantity && (
                              <span className="num text-[11px] text-muted-foreground">of {formatQuantity(lot.quantity)} sh</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell align="right">
                          <div className="flex flex-col items-end gap-1">
                            <span className="num text-[14px] text-foreground">{formatUSD(lot.remainingCostBasis)}</span>
                            {lot.basisStatus !== "complete" ? (
                              <span title={lot.basisNote ?? undefined} className="cursor-help mt-0.5">
                                <Pill tone="loss">{lot.basisStatus}</Pill>
                              </span>
                            ) : (
                              <span className="num text-[11px] text-muted-foreground lg:hidden">{formatUSD(lot.costPerShare)} per sh</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell align="right" className="hidden lg:table-cell">
                          <div className="flex flex-col items-end gap-1">
                            {lot.basisStatus !== "complete" ? (
                              <span className="text-[12px] text-muted-foreground">Unknown</span>
                            ) : (
                              <span className="num text-[14px] text-foreground">{formatUSD(lot.costPerShare)}</span>
                            )}
                          </div>
                        </TableCell>
                        {statusFilter === "closed" ? (
                          <>
                            <TableCell align="right">
                              {lot.closedAt && (
                                <span className="num text-[14px] text-foreground">{formatDate(lot.closedAt)}</span>
                              )}
                            </TableCell>
                            <TableCell align="right">
                              <div className="flex flex-col items-end gap-1">
                                <span className={cn("num text-[14px]", lot.realizedPnl > 0 ? "text-success" : lot.realizedPnl < 0 ? "text-destructive" : "text-foreground")}>
                                  {lot.realizedPnl > 0 ? "+" : ""}{formatUSD(lot.realizedPnl)}
                                </span>
                              </div>
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell align="right">
                              <div className="flex flex-col items-end gap-1">
                                {lot.status === "closed" ? (
                                  lot.closedAt ? <span className="num text-[14px] text-foreground">{formatDate(lot.closedAt)}</span> : <span className="text-muted-foreground">-</span>
                                ) : (
                                  <span className="num text-[14px] text-foreground">{formatUSD(lot.marketValue)}</span>
                                )}
                                {lot.status === "closed" && statusFilter === "all" && (
                                   <span className="text-[11px] text-muted-foreground">Closed</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell align="right">
                              {lot.status === "closed" ? (
                                <div className="flex flex-col items-end gap-1">
                                  <span className={cn("num text-[14px]", lot.realizedPnl > 0 ? "text-success" : lot.realizedPnl < 0 ? "text-destructive" : "text-foreground")}>
                                    {lot.realizedPnl > 0 ? "+" : ""}{formatUSD(lot.realizedPnl)}
                                  </span>
                                  {statusFilter === "all" && <span className="text-[11px] text-muted-foreground">Realized</span>}
                                </div>
                              ) : (
                                <div className="flex flex-col items-end gap-1">
                                  <span className={cn("num text-[14px]", (lot.unrealizedPnl ?? 0) > 0 ? "text-success" : (lot.unrealizedPnl ?? 0) < 0 ? "text-destructive" : "text-foreground")}>
                                    {lot.unrealizedPnl === null ? "Unknown" : `${lot.unrealizedPnl > 0 ? "+" : ""}${formatUSD(lot.unrealizedPnl)}`}
                                  </span>
                                  {statusFilter === "all" && <span className="text-[11px] text-muted-foreground">Unrealized</span>}
                                </div>
                              )}
                            </TableCell>
                          </>
                        )}
                      </LotTableRow>
                    ))}
                  </TableBody>
                </DataTable>
              </div>
            </Reveal>
          ))}
        </div>
      )}
    </>
  );
}
