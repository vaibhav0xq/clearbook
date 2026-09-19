import { useMemo, useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { useGetPortfolio, useListLots } from "@workspace/api-client-react";
import { Shell } from "@/components/layout/shell";
import { useCostMethod } from "@/hooks/use-cost-method";
import { formatUSD, formatQuantity, formatPercent, formatAge, issuerLabel } from "@/lib/format";
import { Figure } from "@/components/figure";
import { DataTable, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/data-table";
import { Panel, Pill, Skeleton, EmptyState, ErrorState, SectionTitle, MethodologyLink } from "@/components/surface";
import { Strata } from "@/components/three/strata";
import { buildStrata } from "@/components/three/strata-data";
import { Reveal, EASE_OUT } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

const METHOD_HINT: Record<string, string> = {
  fifo: "FIFO relieves the oldest layer first, so a sale takes from the bottom of a column.",
  lifo: "LIFO relieves the newest layer first, so a sale takes from the top of a column.",
  hifo: "HIFO relieves the highest cost per share first, wherever that layer sits.",
};

export default function Portfolio() {
  const [, params] = useRoute("/w/:address");
  const address = params?.address || "";
  const { method } = useCostMethod();
  const [, setLocation] = useLocation();
  const [hoverMint, setHoverMint] = useState<string | null>(null);

  const { data: portfolio, isLoading, error } = useGetPortfolio(address, { method });
  const { data: lots } = useListLots(address, { method, status: "open" });

  const columns = useMemo(() => (portfolio ? buildStrata(portfolio.positions, lots) : []), [portfolio, lots]);

  return (
    <Shell address={address}>
      {isLoading ? (
        <div className="flex flex-col gap-10">
          <div className="grid grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_1fr] gap-8">
            <Skeleton className="h-24 col-span-2 lg:col-span-1" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
          <Skeleton className="h-[420px] rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : error ? (
        <ErrorState title="Unable to load this portfolio" message={error.data?.message ?? error.message} />
      ) : portfolio ? (
        <div className="flex flex-col gap-12 md:gap-16">
          {/* Totals */}
          <section className="grid grid-cols-2 lg:grid-cols-[1.7fr_1fr_1fr_1fr_1fr] gap-x-8 gap-y-10 items-end">
            <div className="col-span-2 lg:col-span-1 flex flex-col gap-3">
              <span className="label">Net value, {portfolio.currency}</span>
              <Figure value={portfolio.totals.netValue} size="xl" />
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <Pill tone="amber">{portfolio.method}</Pill>
                <Pill>{portfolio.totals.positionsCount} {portfolio.totals.positionsCount === 1 ? "position" : "positions"}</Pill>
                <Pill tone={portfolio.pricing.mode === "live" ? "gain" : "neutral"}>{portfolio.pricing.providerLabel}</Pill>
                {portfolio.totals.unpricedValueCount > 0 && <Pill tone="loss">{portfolio.totals.unpricedValueCount} unpriced</Pill>}
              </div>
            </div>
            <Figure label="Cost basis" value={portfolio.totals.costBasis} size="lg" />
            <Figure
              label="Unrealized"
              value={portfolio.totals.unrealizedPnl}
              tone
              sub={formatPercent(portfolio.totals.unrealizedPnlPct)}
              subTone={portfolio.totals.unrealizedPnl}
              size="lg"
            />
            <Figure label="Realized" value={portfolio.totals.realizedPnl} tone sub={`${formatUSD(portfolio.totals.realizedPnlYtd)} this year`} size="lg" />
            <Figure label="Income estimate" value={portfolio.totals.incomeEstimate} sub="From multiplier increases" size="lg" />
          </section>

          {portfolio.totals.unknownBasisCount > 0 && (
            <Reveal>
              <div className="flex items-start gap-3 rounded-2xl border border-primary/25 bg-primary/[0.06] px-5 py-4 text-[13px]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="flex flex-col gap-1">
                  <span className="text-foreground">Incomplete cost basis</span>
                  <span className="text-muted-foreground leading-relaxed">
                    {portfolio.totals.unknownBasisCount === 1 ? "1 position holds" : `${portfolio.totals.unknownBasisCount} positions hold`} lots without
                    a readable purchase price, usually because the tokens arrived by transfer. Unknown cost is excluded from the totals and each position
                    carries a note. <MethodologyLink>Read how basis is reconstructed</MethodologyLink>
                  </span>
                </div>
              </div>
            </Reveal>
          )}

          {/* Strata */}
          {columns.length > 0 && (
            <section>
              <SectionTitle
                aside={
                  <span className="hidden md:inline-flex items-center gap-4">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-5 rounded-sm" style={{ background: "linear-gradient(90deg,#ff6a5b,#5f6f92,#35d39c)" }} />
                      loss to gain
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2.5 rounded-sm bg-[#3a4152]" /> unknown cost
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2.5 rounded-sm bg-primary" /> hovered
                    </span>
                  </span>
                }
              >
                Position strata
              </SectionTitle>
              <Panel className="relative overflow-hidden">
                <Strata
                  className="h-[380px] md:h-[460px] w-full"
                  columns={columns}
                  method={method}
                  mode="portfolio"
                  highlightMint={hoverMint}
                  onHoverColumn={setHoverMint}
                  onSelectColumn={(mint) => setLocation(`/w/${address}/lots?mint=${mint}`)}
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col md:flex-row md:items-end md:justify-between gap-2 px-5 pb-4 text-[12px] text-muted-foreground">
                  <motion.span key={method} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE_OUT }}>
                    {METHOD_HINT[method]}
                  </motion.span>
                  <span className="hidden md:inline">Layer height is market value. Click a column to open its lots.</span>
                </div>
              </Panel>
            </section>
          )}

          {/* Positions */}
          <section>
            <SectionTitle aside={<span>Marked {new Date(portfolio.asOf).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}>
              Positions
            </SectionTitle>
            {portfolio.positions.length === 0 ? (
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
                  <TableHead align="right">Cost basis</TableHead>
                  <TableHead align="right">Unrealized</TableHead>
                  <TableHead align="right" className="w-10">
                    <span className="sr-only">Open lots</span>
                  </TableHead>
                </TableHeader>
                <TableBody>
                  {portfolio.positions.map((pos, i) => (
                    <TableRow
                      key={pos.mint}
                      index={i}
                      active={hoverMint === pos.mint}
                      onMouseEnter={() => setHoverMint(pos.mint)}
                      onMouseLeave={() => setHoverMint(null)}
                      onClick={() => setLocation(`/w/${address}/lots?mint=${pos.mint}`)}
                    >
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="num text-[15px] tracking-[0.08em] text-foreground">{pos.symbol}</span>
                          <span className="text-[12px] text-muted-foreground">
                            {pos.name} <span className="opacity-60">{issuerLabel(pos.issuer)}</span>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell align="right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="num text-foreground">{formatQuantity(pos.quantity)}</span>
                          {pos.multiplier.current !== 1 && (
                            <span className="num text-[11px] text-muted-foreground">Raw {formatQuantity(pos.rawQuantity)}</span>
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
                              {pos.mark.ageSeconds ? `, ${formatAge(pos.mark.ageSeconds)}` : ""}
                            </span>
                          </span>
                          {pos.premiumDiscount.differencePct !== null && (
                            <span title={pos.premiumDiscount.referenceLabel} className="num text-[11px] text-muted-foreground cursor-help">
                              {formatPercent(pos.premiumDiscount.differencePct)} to reference, {pos.session.label.charAt(0).toLowerCase() + pos.session.label.slice(1)}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell align="right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="num text-foreground">{formatUSD(pos.marketValue)}</span>
                          <span className="num text-[11px] text-muted-foreground">{formatPercent(pos.weightPct)} of value</span>
                        </div>
                      </TableCell>
                      <TableCell align="right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="num text-foreground">{formatUSD(pos.costBasis)}</span>
                          {pos.basisStatus !== "complete" ? (
                            <span title={pos.basisNote ?? undefined} className="cursor-help">
                              <Pill tone="loss">{pos.basisStatus === "unknown" ? "Unknown" : "Partial"}</Pill>
                            </span>
                          ) : (
                            <span className="num text-[11px] text-muted-foreground">{formatUSD(pos.averageCost)} avg</span>
                          )}
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
                      <TableCell align="right">
                        <ArrowUpRight className={cn("h-4 w-4 transition-colors", hoverMint === pos.mint ? "text-primary" : "text-muted-foreground/40")} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </DataTable>
            )}
          </section>

          {/* Allocation and assumptions */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <Reveal className="lg:col-span-5">
              <Panel className="p-6 md:p-7 h-full">
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
                    <li key={a.issuer} className="flex items-center justify-between py-2.5 text-[13px]">
                      <span className="flex items-center gap-2.5">
                        <span className={cn("h-2 w-2 rounded-sm", i % 3 === 0 ? "bg-primary" : i % 3 === 1 ? "bg-foreground/70" : "bg-foreground/35")} />
                        <span className="text-foreground">{a.label}</span>
                        <span className="text-muted-foreground">{a.positions} {a.positions === 1 ? "position" : "positions"}</span>
                      </span>
                      <span className="flex items-center gap-4">
                        <span className="num text-muted-foreground">{formatPercent(a.weightPct).replace("+", "")}</span>
                        <span className="num text-foreground">{formatUSD(a.marketValue)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </Reveal>
            <Reveal className="lg:col-span-7" delay={0.08}>
              <Panel className="p-6 md:p-7 h-full flex flex-col gap-5">
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
                <Link href={`/w/${address}/trade`} className="group mt-auto inline-flex items-center gap-2 self-start text-[13px] text-primary hover:text-foreground transition-colors">
                  Preview a sale against these lots
                  <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-500 ease-out-expo group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Link>
              </Panel>
            </Reveal>
          </section>
        </div>
      ) : null}
    </Shell>
  );
}
