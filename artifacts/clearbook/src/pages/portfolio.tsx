import { useMemo } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { useGetPortfolio } from "@workspace/api-client-react";
import { useCostMethod } from "@/hooks/use-cost-method";
import { useSetHoverMint, useStage } from "@/components/layout/stage";
import { formatUSD, formatQuantity, formatPercent, formatAge, formatMultiplier, formatTime, issuerLabel } from "@/lib/format";
import { Figure } from "@/components/figure";
import { DataTable, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/data-table";
import { Panel, Pill, Skeleton, EmptyState, ErrorState, SectionTitle, MethodologyLink } from "@/components/surface";
import { Reveal, EASE_OUT } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";
import { useWalletIndexing } from "@/hooks/use-wallet-indexing";
import { IndexingState } from "@/components/layout/indexing-state";

const METHOD_HINT: Record<string, string> = {
  fifo: "FIFO relieves the oldest layer first, so a sale takes from the bottom of a column.",
  lifo: "LIFO relieves the newest layer first, so a sale takes from the top of a column.",
  hifo: "HIFO relieves the highest cost per share first, wherever that layer sits.",
};

export default function Portfolio() {
  const [, params] = useRoute("/w/:address");
  const address = params?.address || "";
  const indexing = useWalletIndexing(address);
  const { method } = useCostMethod();
  const [, setLocation] = useLocation();
  useStage({ caption: METHOD_HINT[method] });
  const setHoverMint = useSetHoverMint();

  const { data: portfolio, isLoading, error } = useGetPortfolio(address, { method });

  const concentration = useMemo(() => {
    if (!portfolio || portfolio.positions.length === 0) return null;
    const byWeight = [...portfolio.positions].sort((a, b) => (b.weightPct ?? 0) - (a.weightPct ?? 0));
    if ((byWeight[0].weightPct ?? 0) <= 0) return null;
    return {
      top: byWeight[0],
      topThreePct: byWeight.slice(0, 3).reduce((sum, p) => sum + (p.weightPct ?? 0), 0),
    };
  }, [portfolio]);

  return (
    <>
      {isLoading ? (
        <div className="flex flex-col gap-10">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-12 w-64" />
              <Skeleton className="h-3 w-48" />
            </div>
            <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          </div>
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : error ? (
        <ErrorState title="Unable to load this portfolio" message={error.data?.message ?? error.message} />
      ) : portfolio ? (
        <div className="flex flex-col gap-10 md:gap-12">
          {/* Account summary: the value on the left, its components in one row on the right */}
          <section className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="label">Net value, {portfolio.currency}</span>
                <span className="text-muted-foreground/40">|</span>
                <Pill tone="amber">{portfolio.method}</Pill>
                <Pill>
                  {portfolio.totals.positionsCount} {portfolio.totals.positionsCount === 1 ? "position" : "positions"}
                </Pill>
                <Pill tone={portfolio.pricing.mode === "live" ? "gain" : "neutral"}>{portfolio.pricing.providerLabel}</Pill>
                {portfolio.totals.unpricedValueCount > 0 && <Pill tone="loss">{portfolio.totals.unpricedValueCount} unpriced</Pill>}
              </div>
              <Figure value={portfolio.totals.netValue} size="xxl" />
              <span className="text-[12px] text-muted-foreground">
                Marked <span className="num">{formatTime(portfolio.asOf)}</span> with {portfolio.pricing.providerLabel}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-7 border-t hairline pt-6 md:grid-cols-4 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-1">
              <Figure label="Cost basis" value={portfolio.totals.costBasis} size="md" />
              <Figure
                label="Unrealized"
                value={portfolio.totals.unrealizedPnl}
                tone
                sub={formatPercent(portfolio.totals.unrealizedPnlPct)}
                subTone={portfolio.totals.unrealizedPnl}
                size="md"
              />
              <Figure label="Realized" value={portfolio.totals.realizedPnl} tone sub={`${formatUSD(portfolio.totals.realizedPnlYtd)} this year`} size="md" />
              <Figure label="Income estimate" value={portfolio.totals.incomeEstimate} sub="From multiplier increases" size="md" />
            </div>
          </section>

          {portfolio.totals.unknownBasisCount > 0 && (
            <Reveal>
              <div className="flex items-start gap-3 rounded-2xl border border-primary/25 bg-primary/[0.06] px-5 py-4 text-[13px]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="flex flex-col gap-1">
                  <span className="text-foreground">Incomplete cost basis</span>
                  <span className="leading-relaxed text-muted-foreground">
                    {portfolio.totals.unknownBasisCount === 1 ? "1 position holds" : `${portfolio.totals.unknownBasisCount} positions hold`} lots without a
                    readable purchase price, usually because the tokens arrived by transfer. Unknown cost is excluded from the totals and each position carries
                    a note. <MethodologyLink>Read how basis is reconstructed</MethodologyLink>
                  </span>
                </div>
              </div>
            </Reveal>
          )}

          {/* Positions */}
          <section>
            <SectionTitle aside={<span>Click a position to open its lots</span>}>Positions</SectionTitle>
            {portfolio.positions.length === 0 && indexing ? (
              <IndexingState what="Positions" />
            ) : portfolio.positions.length === 0 ? (
              <EmptyState
                title="No positions found"
                description="This ledger has no tokenized stock balances. If tokens were transferred recently they may still be indexing. Wait a moment and refresh."
              />
            ) : (
              <DataTable>
                <TableHeader>
                  <TableHead>Asset</TableHead>
                  <TableHead align="right">Quantity</TableHead>
                  <TableHead align="right">Mark</TableHead>
                  <TableHead align="right">Value</TableHead>
                  <TableHead align="right" className="hidden md:table-cell">
                    Weight
                  </TableHead>
                  <TableHead align="right" className="hidden lg:table-cell">
                    Cost basis
                  </TableHead>
                  <TableHead align="right">Unrealized</TableHead>
                </TableHeader>
                <TableBody>
                  {portfolio.positions.map((pos, i) => (
                    <TableRow
                      key={pos.mint}
                      index={i}
                      mint={pos.mint}
                      onMouseEnter={() => setHoverMint(pos.mint)}
                      onMouseLeave={() => setHoverMint(null)}
                      onClick={() => setLocation(`/w/${address}/lots?mint=${pos.mint}`)}
                    >
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="flex items-center gap-2">
                            <span className="num text-[15px] tracking-[0.08em] text-foreground">{pos.symbol}</span>
                            {pos.basisStatus !== "complete" && (
                              <span title={pos.basisNote ?? undefined} className="cursor-help">
                                <Pill tone="loss">{pos.basisStatus === "unknown" ? "Unknown cost" : "Partial cost"}</Pill>
                              </span>
                            )}
                            <ArrowUpRight
                              className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition-all duration-300 group-data-[active=true]:translate-x-0 group-data-[active=true]:text-primary group-data-[active=true]:opacity-100"
                            />
                          </span>
                          <span className="text-[12px] text-muted-foreground">
                            {pos.name} <span className="opacity-60">{issuerLabel(pos.issuer)}</span>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell align="right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="num text-foreground">{formatQuantity(pos.quantity)}</span>
                          {pos.multiplier.current !== 1 && (
                            <span className="num text-[11px] text-muted-foreground" title="Token units held and the issuer multiplier that turns them into shares">
                              {formatQuantity(pos.rawQuantity, 4)} tokens, {formatMultiplier(pos.multiplier.current)}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell align="right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="num text-foreground">{formatUSD(pos.mark.price)}</span>
                          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            {pos.mark.status !== "live" && <span className="text-destructive">{pos.mark.statusLabel}</span>}
                            <span>
                              {pos.mark.sourceLabel}
                              {pos.mark.ageSeconds !== null && pos.mark.ageSeconds !== undefined ? `, ${formatAge(pos.mark.ageSeconds)}` : ""}
                            </span>
                          </span>
                          {pos.premiumDiscount.differencePct !== null && (
                            <span title={pos.premiumDiscount.referenceLabel} className="num cursor-help text-[11px] text-muted-foreground">
                              {Math.abs(pos.premiumDiscount.differencePct) < 0.005
                                ? `At ${pos.underlyingSymbol} reference`
                                : `${Math.abs(pos.premiumDiscount.differencePct).toFixed(2)}% ${pos.premiumDiscount.differencePct < 0 ? "below" : "above"} ${pos.underlyingSymbol}`}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell align="right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="num text-foreground">{formatUSD(pos.marketValue)}</span>
                          <span className="num text-[11px] text-muted-foreground md:hidden">{formatPercent(pos.weightPct).replace("+", "")} of value</span>
                          <span className="num text-[11px] text-muted-foreground lg:hidden" title={pos.basisStatus === "complete" ? `${formatUSD(pos.averageCost)} average cost` : undefined}>
                            {formatUSD(pos.costBasis)} cost
                          </span>
                        </div>
                      </TableCell>
                      <TableCell align="right" className="hidden md:table-cell">
                        <div className="flex flex-col items-end gap-1.5">
                          <span className="num text-foreground">{formatPercent(pos.weightPct).replace("+", "")}</span>
                          <span className="h-px w-16 overflow-hidden bg-white/[0.08]" aria-hidden>
                            <span className="block h-full bg-foreground/60" style={{ width: `${Math.min(100, Math.max(0, pos.weightPct ?? 0))}%` }} />
                          </span>
                        </div>
                      </TableCell>
                      <TableCell align="right" className="hidden lg:table-cell">
                        <div className="flex flex-col items-end gap-1">
                          <span className="num text-foreground">{formatUSD(pos.costBasis)}</span>
                          <span className="num text-[11px] text-muted-foreground">
                            {pos.basisStatus === "complete" ? `${formatUSD(pos.averageCost)} average` : pos.basisStatus === "unknown" ? "Unknown" : "Partial"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell align="right">
                        <div className="flex flex-col items-end gap-1">
                          <span
                            className={cn(
                              "num",
                              (pos.unrealizedPnl ?? 0) > 0 ? "text-success" : (pos.unrealizedPnl ?? 0) < 0 ? "text-destructive" : "text-foreground",
                            )}
                          >
                            {formatUSD(pos.unrealizedPnl)}
                          </span>
                          <span className="num text-[11px] text-muted-foreground">{formatPercent(pos.unrealizedPnlPct)}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </DataTable>
            )}
          </section>

          {/* Allocation and assumptions */}
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Reveal>
              <Panel className="h-full p-6 md:p-7">
                <span className="label">By issuer</span>
                <div className="mt-5 flex h-2 w-full overflow-hidden rounded-full bg-white/[0.05]">
                  {portfolio.allocation.map((a, i) => (
                    <motion.div
                      key={a.issuer}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${a.weightPct}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 1.1, ease: EASE_OUT, delay: i * 0.08 }}
                      className={cn("h-full", i % 3 === 0 ? "bg-primary" : i % 3 === 1 ? "bg-foreground/70" : "bg-foreground/35")}
                      title={`${a.label} ${a.weightPct.toFixed(1)}%`}
                    />
                  ))}
                </div>
                <ul className="mt-5 flex flex-col divide-y divide-white/[0.06]">
                  {portfolio.allocation.map((a, i) => (
                    <li key={a.issuer} className="flex items-center justify-between py-3 text-[13px]">
                      <span className="flex items-center gap-2.5">
                        <span className={cn("h-2 w-2 rounded-sm", i % 3 === 0 ? "bg-primary" : i % 3 === 1 ? "bg-foreground/70" : "bg-foreground/35")} />
                        <span className="text-foreground">{a.label}</span>
                        <span className="text-muted-foreground">
                          {a.positions} {a.positions === 1 ? "position" : "positions"}
                        </span>
                      </span>
                      <span className="flex items-center gap-4">
                        <span className="num text-muted-foreground">{formatPercent(a.weightPct).replace("+", "")}</span>
                        <span className="num text-foreground">{formatUSD(a.marketValue)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <ul className="mt-2 flex flex-col divide-y divide-white/[0.06] border-t hairline text-[13px]">
                  {concentration && (
                    <>
                      <li className="flex items-center justify-between py-3">
                        <span className="text-muted-foreground">Largest position</span>
                        <span className="num text-foreground">
                          {concentration.top.symbol} <span className="text-muted-foreground">{formatPercent(concentration.top.weightPct).replace("+", "")}</span>
                        </span>
                      </li>
                      <li className="flex items-center justify-between py-3">
                        <span className="text-muted-foreground">Top three positions</span>
                        <span className="num text-foreground">{formatPercent(concentration.topThreePct).replace("+", "")}</span>
                      </li>
                    </>
                  )}
                  <li className="flex items-center justify-between py-3">
                    <span className="text-muted-foreground">Positions with complete basis</span>
                    <span className="num text-foreground">
                      {portfolio.totals.positionsCount - portfolio.totals.unknownBasisCount} of {portfolio.totals.positionsCount}
                    </span>
                  </li>
                </ul>
                <p className="mt-5 text-[12px] leading-relaxed text-muted-foreground">Weights use marked value. Positions with an unknown cost still count toward value.</p>
              </Panel>
            </Reveal>
            <Reveal delay={0.08}>
              <Panel className="flex h-full flex-col gap-5 p-6 md:p-7">
                <div className="flex items-center justify-between gap-4">
                  <span className="label">Pricing</span>
                  <Pill tone={portfolio.pricing.mode === "live" ? "gain" : portfolio.pricing.mode === "demo" ? "amber" : "loss"}>{portfolio.pricing.mode}</Pill>
                </div>
                <div>
                  <div className="text-[15px] text-foreground">{portfolio.pricing.headline}</div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{portfolio.pricing.detail}</p>
                </div>
                <div className="grid grid-cols-3 gap-4 border-t hairline pt-5">
                  <div className="flex flex-col gap-1.5">
                    <span className="label">Feeds</span>
                    <span className="num text-[16px] text-foreground">
                      {portfolio.pricing.feedsResolved}/{portfolio.pricing.feedsTotal}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="label">US session</span>
                    <span className="text-[14px] text-foreground">{portfolio.pricing.usSession.label}</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="label">Fees paid</span>
                    <span className="num text-[16px] text-foreground">{formatUSD(portfolio.totals.feesPaid)}</span>
                  </div>
                </div>
                {portfolio.assumptions.length > 0 && (
                  <ul className="flex flex-col gap-2 border-t hairline pt-5 text-[12px] leading-relaxed text-muted-foreground">
                    {portfolio.assumptions.map((a, i) => (
                      <li key={i} className="flex gap-2.5">
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-primary/70" />
                        {a}
                      </li>
                    ))}
                  </ul>
                )}
                <Link
                  href={`/w/${address}/trade`}
                  className="group mt-auto inline-flex items-center gap-2 self-start text-[13px] text-primary transition-colors hover:text-foreground"
                >
                  Preview a sale against these lots
                  <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-500 ease-out-expo group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Link>
              </Panel>
            </Reveal>
          </section>
        </div>
      ) : null}
    </>
  );
}
