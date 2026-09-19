import { Link, useRoute } from "wouter";
import { Shell } from "@/components/layout/shell";
import { useGetPortfolio } from "@workspace/api-client-react";
import { useCostMethod } from "@/hooks/use-cost-method";
import { formatUSD, formatQuantity, formatPercent, formatAge, issuerLabel } from "@/lib/format";
import { AlertCircle } from "lucide-react";
import { Figure } from "@/components/figure";
import { DataTable, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/data-table";

export default function Portfolio() {
  const [, params] = useRoute("/w/:address");
  const address = params?.address || "";
  const { method } = useCostMethod();

  const { data: portfolio, isLoading, error } = useGetPortfolio(address, { method });

  return (
    <Shell address={address}>
      <div className="flex flex-col animate-in fade-in duration-700">
        
        {/* Page Header */}
        <div className="flex flex-col gap-1 mb-8">
          <h1 className="font-serif text-4xl tracking-tight text-foreground">Portfolio</h1>
          <p className="text-muted-foreground text-sm font-sans mt-2">
            Net valuation and open positions, marked to market.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-12 opacity-50">
            <div className="flex gap-16 border-y border-border py-10">
              <div className="h-16 w-32 bg-muted animate-pulse rounded"></div>
              <div className="h-16 w-32 bg-muted animate-pulse rounded"></div>
              <div className="h-16 w-32 bg-muted animate-pulse rounded"></div>
            </div>
          </div>
        ) : error ? (
          <div className="p-12 border border-border bg-card flex flex-col items-center justify-center text-center">
            <AlertCircle className="h-8 w-8 mb-4 text-destructive" />
            <h3 className="font-serif text-2xl mb-2 text-foreground">Unable to load portfolio</h3>
            <p className="text-muted-foreground font-sans">{error.message || "An unknown error occurred"}</p>
          </div>
        ) : portfolio ? (
          <>
            {/* Top-Level Totals Grid - Single Row on LG+ */}
            <div className="grid grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr] gap-x-8 gap-y-8 border-y border-border py-8 mb-10 items-start">
              <Figure label="Net value" value={formatUSD(portfolio.totals.netValue)} size="xl" className="col-span-2 lg:col-span-1" />
              <Figure label="Cost basis" value={formatUSD(portfolio.totals.costBasis)} size="lg" />
              <Figure 
                label="Unrealized P/L" 
                value={formatUSD(portfolio.totals.unrealizedPnl)} 
                sub={formatPercent(portfolio.totals.unrealizedPnlPct)} 
                subTone={portfolio.totals.unrealizedPnl} 
                size="lg"
              />
              <Figure 
                label="Realized P/L" 
                value={formatUSD(portfolio.totals.realizedPnl)} 
                sub={`YTD ${formatUSD(portfolio.totals.realizedPnlYtd)}`}
                subTone={null} 
                size="lg"
              />
              <Figure 
                label="Income est." 
                value={formatUSD(portfolio.totals.incomeEstimate)} 
                sub="From multiplier increases"
                subTone={null} 
                size="lg"
              />
            </div>

            {portfolio.totals.unknownBasisCount > 0 && (
              <div className="bg-muted/30 border-l-2 border-primary p-4 text-sm font-sans flex flex-col gap-1.5 mb-10">
                <span className="text-foreground font-medium">Incomplete cost basis</span>
                <span className="text-muted-foreground">
                  {portfolio.totals.unknownBasisCount === 1 ? "1 position holds" : `${portfolio.totals.unknownBasisCount} positions hold`} lots without a readable purchase price, usually because the tokens arrived by transfer. Unknown cost is excluded from the totals and each position carries a note.
                  <Link href="/methodology" className="ml-2 text-primary hover:underline uppercase tracking-[0.08em] text-[10px]">Methodology</Link>
                </span>
              </div>
            )}

            {/* Positions Section */}
            <div className="flex flex-col gap-5">
              <h2 className="font-serif text-3xl pb-2 border-b border-border text-foreground">Positions</h2>
              
              {portfolio.positions.length === 0 ? (
                <div className="p-16 text-center border border-border bg-card shadow-sm">
                  <h3 className="font-serif text-2xl mb-3 text-foreground">No positions found</h3>
                  <p className="text-muted-foreground text-sm font-sans max-w-md mx-auto leading-relaxed">
                    This ledger has no tokenized stock balances. If you recently transferred tokens, they may be indexing. Wait a moment and hit refresh.
                  </p>
                </div>
              ) : (
                <DataTable>
                  <TableHeader>
                    <TableHead>Asset</TableHead>
                    <TableHead align="right">Quantity</TableHead>
                    <TableHead align="right">Mark</TableHead>
                    <TableHead align="right">Value</TableHead>
                    <TableHead align="right">Cost basis</TableHead>
                    <TableHead align="right">Unrealized P/L</TableHead>
                  </TableHeader>
                  <TableBody>
                    {portfolio.positions.map((pos) => (
                      <TableRow key={pos.mint}>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-serif text-lg text-foreground">{pos.symbol}</span>
                            <span className="text-xs text-muted-foreground truncate max-w-[200px] font-sans">
                              {pos.name} <span className="opacity-60 font-sans ml-1">{issuerLabel(pos.issuer)}</span>
                            </span>
                          </div>
                        </TableCell>
                        <TableCell align="right">
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="text-[15px] tabular-nums text-foreground">{formatQuantity(pos.quantity)}</span>
                            {pos.multiplier.current !== 1 && (
                              <span className="text-[11px] text-muted-foreground font-mono tabular-nums mt-0.5">
                                Raw: {formatQuantity(pos.rawQuantity)}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell align="right">
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="text-[15px] tabular-nums text-foreground">{formatUSD(pos.mark.price)}</span>
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-sans">
                              {pos.mark.status !== "live" && (
                                <span className="text-destructive">{pos.mark.statusLabel}</span>
                              )}
                              <span>
                                {pos.mark.sourceLabel}
                                {pos.mark.ageSeconds ? `, ${formatAge(pos.mark.ageSeconds)}` : ""}
                              </span>
                            </div>
                            {pos.premiumDiscount.differencePct !== null && (
                              <span title={pos.premiumDiscount.referenceLabel} className="text-[11px] text-muted-foreground font-sans tabular-nums cursor-help">
                                {formatPercent(pos.premiumDiscount.differencePct)} to reference, {pos.session.label.charAt(0).toLowerCase() + pos.session.label.slice(1)}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell align="right">
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="text-[15px] font-medium tabular-nums text-foreground">{formatUSD(pos.marketValue)}</span>
                            <span className="text-[11px] text-muted-foreground tabular-nums font-sans">
                              {formatPercent(pos.weightPct)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell align="right">
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="text-[15px] tabular-nums text-foreground">{formatUSD(pos.costBasis)}</span>
                            {pos.basisStatus !== "complete" && (
                              <span title={pos.basisNote ?? undefined} className="text-[10px] text-destructive uppercase tracking-[0.08em] font-sans mt-0.5 border border-destructive/20 bg-destructive/5 px-1 py-px rounded-[2px] cursor-help">
                                {pos.basisStatus === "unknown" ? "Unknown" : "Partial"}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell align="right">
                          <div className="flex flex-col items-end gap-0.5">
                            <span className={`text-[15px] tabular-nums ${pos.unrealizedPnl && pos.unrealizedPnl > 0 ? "text-success" : pos.unrealizedPnl && pos.unrealizedPnl < 0 ? "text-destructive" : "text-foreground"}`}>
                              {formatUSD(pos.unrealizedPnl)}
                            </span>
                            <span className="text-[11px] text-muted-foreground tabular-nums font-sans">
                              {formatPercent(pos.unrealizedPnlPct)}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </DataTable>
              )}
            </div>
          </>
        ) : null}
      </div>
    </Shell>
  );
}
