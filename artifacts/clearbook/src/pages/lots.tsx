import { useMemo } from "react";
import { useRoute, useSearch, useLocation } from "wouter";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { format } from "date-fns";

import { useListLots, useGetPortfolio, type LotStatusFilter, type Lot } from "@workspace/api-client-react";
import { Shell } from "@/components/layout/shell";
import { useCostMethod } from "@/hooks/use-cost-method";
import { formatUSD, formatQuantity } from "@/lib/format";
import { DataTable, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/data-table";
import { Panel, Pill, Skeleton, EmptyState, ErrorState, PageHeader } from "@/components/surface";
import { Reveal, EASE_OUT } from "@/components/motion/reveal";
import { buildStrata, reliefRank, reliefOrder, type StrataLayer } from "@/components/three/strata-data";
import { cn } from "@/lib/utils";

const FILTERS: { value: LotStatusFilter; label: string }[] = [
  { value: "all", label: "All lots" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
];

function Strip({ order, totalValue }: { order: StrataLayer[]; totalValue: number }) {
  if (totalValue <= 0 || order.length === 0) return null;
  return (
    <div className="mt-6 mb-2 flex h-2.5 w-full overflow-hidden rounded-sm bg-white/[0.03] border hairline">
      {order.map((layer, i) => {
        const width = Math.max(0, (layer.value / totalValue) * 100);
        let bgColor = "bg-[#5f6f92]";
        if (layer.basisUnknown) bgColor = "bg-[#3a4152]";
        else if (layer.unrealizedPnl !== null) {
          if (layer.unrealizedPnl > 0) bgColor = "bg-success";
          else if (layer.unrealizedPnl < 0) bgColor = "bg-destructive";
        }
        return (
          <motion.div
            key={layer.id}
            initial={{ width: 0 }}
            animate={{ width: `${width}%` }}
            transition={{ duration: 0.9, ease: EASE_OUT, delay: i * 0.04 }}
            className={cn("h-full border-r border-background/40 last:border-0", bgColor)}
            title={`${layer.symbol} lot: ${formatUSD(layer.value)}`}
          />
        );
      })}
    </div>
  );
}

export default function Lots() {
  const [, params] = useRoute("/w/:address/lots");
  const address = params?.address || "";
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

  return (
    <Shell address={address}>
      <PageHeader
        title="Tax lots"
        description="Acquisition history, cost basis and relief queue."
        actions={
          <div className="flex items-center gap-3">
            {mintFilter && (
              <Pill tone="neutral" className="pr-1 py-1 flex items-center">
                {mintFilter.slice(0, 4)}...{mintFilter.slice(-4)}
                <button
                  type="button"
                  onClick={clearMint}
                  className="ml-1.5 flex h-4 w-4 items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                  aria-label="Clear filter"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Pill>
            )}
            <div className="flex items-center rounded-full border hairline bg-white/[0.03] p-0.5 h-9">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setStatus(f.value)}
                  className={cn(
                    "relative z-10 rounded-full px-3 h-8 text-[11px] uppercase tracking-[0.12em] transition-colors duration-300",
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
      ) : grouped.length === 0 ? (
        <EmptyState title="No lots found" description="No tax lots match the selected filters." />
      ) : (
        <div className="flex flex-col gap-12">
          {grouped.map((group) => (
            <Reveal key={group.mint} as="section">
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-4">
                  <div className="flex items-baseline justify-between">
                    <h3 className="display text-[26px] md:text-[30px] text-foreground flex items-center gap-3">
                      {group.symbol}
                      <span className="font-sans text-[15px] tracking-normal text-muted-foreground">{group.name}</span>
                    </h3>
                    {group.col && (
                      <div className="flex items-center gap-3">
                        <span className="label">Market value</span>
                        <span className="num text-[18px] text-foreground">{formatUSD(group.col.value)}</span>
                      </div>
                    )}
                  </div>

                  {group.col && group.order.length > 0 && (statusFilter === "open" || statusFilter === "all") && (
                    <Strip order={group.order} totalValue={group.col.value} />
                  )}
                </div>

                <DataTable>
                  <TableHeader>
                    <TableHead>Relief order</TableHead>
                    <TableHead>Acquired</TableHead>
                    <TableHead align="right">Quantity</TableHead>
                    <TableHead align="right">Cost per share</TableHead>
                    <TableHead align="right">Cost basis</TableHead>
                    <TableHead align="right">{statusFilter === "closed" ? "Realized" : "Value and P/L"}</TableHead>
                  </TableHeader>
                  <TableBody>
                    {group.lots.map((lot, i) => {
                      return (
                        <TableRow key={lot.id} index={i}>
                          <TableCell>
                            {lot.status !== "closed" && group.ranks.has(lot.id) ? (
                              <div className="flex items-center gap-2">
                                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 border border-primary/20 num text-[11px] text-primary">
                                  {group.ranks.get(lot.id)! + 1}
                                </div>
                                <span className="label text-muted-foreground">in relief order</span>
                              </div>
                            ) : (
                              <span className="label text-muted-foreground">{lot.status}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span className="num text-[14px] text-foreground">{format(new Date(lot.openedAt), "MMM d, yyyy")}</span>
                              <span className="flex items-center gap-1.5 text-[11px]">
                                <span className="num text-muted-foreground">{lot.holdingDays} days</span>
                                <span className="text-muted-foreground/40">/</span>
                                <span className={cn("uppercase tracking-[0.1em]", lot.term === "long" ? "text-success" : "text-muted-foreground")}>{lot.term}</span>
                              </span>
                            </div>
                          </TableCell>
                          <TableCell align="right">
                            <div className="flex flex-col items-end gap-1">
                              <span className="num text-[14px] text-foreground">{formatQuantity(lot.remainingQuantity)}</span>
                              {lot.remainingQuantity < lot.quantity && (
                                <span className="num text-[11px] text-muted-foreground">of {formatQuantity(lot.quantity)}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell align="right">
                            <span className="num text-[14px] text-foreground">{formatUSD(lot.costPerShare)}</span>
                          </TableCell>
                          <TableCell align="right">
                            <div className="flex flex-col items-end gap-1">
                              <span className="num text-[14px] text-foreground">{formatUSD(lot.remainingCostBasis)}</span>
                              {lot.basisStatus !== "complete" && (
                                <span title={lot.basisNote ?? undefined} className="cursor-help mt-0.5">
                                  <Pill tone="loss">{lot.basisStatus}</Pill>
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell align="right">
                            {lot.status === "closed" ? (
                              <div className="flex flex-col items-end gap-1">
                                <span className={cn("num text-[14px]", lot.realizedPnl > 0 ? "text-success" : lot.realizedPnl < 0 ? "text-destructive" : "text-foreground")}>
                                  {lot.realizedPnl > 0 ? "+" : ""}{formatUSD(lot.realizedPnl)}
                                </span>
                                <span className="num text-[11px] text-muted-foreground">realized</span>
                                {lot.closedAt && (
                                  <span className="num text-[11px] text-muted-foreground mt-0.5">Closed {format(new Date(lot.closedAt), "MMM d, yyyy")}</span>
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col items-end gap-1">
                                <span className="num text-[14px] text-foreground">{formatUSD(lot.marketValue)}</span>
                                <span className={cn("num text-[11px]", (lot.unrealizedPnl ?? 0) > 0 ? "text-success" : (lot.unrealizedPnl ?? 0) < 0 ? "text-destructive" : "text-muted-foreground")}>
                                  {lot.unrealizedPnl === null ? "Unknown" : `${lot.unrealizedPnl > 0 ? "+" : ""}${formatUSD(lot.unrealizedPnl)} unrealized`}
                                </span>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </DataTable>
              </div>
            </Reveal>
          ))}
        </div>
      )}
    </Shell>
  );
}
