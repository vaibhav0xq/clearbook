import { Link, useRoute } from "wouter";
import { Shell } from "@/components/layout/shell";
import { useGetPortfolio } from "@workspace/api-client-react";
import { useCostMethod } from "@/hooks/use-cost-method";
import { formatUSD, formatQuantity, formatPercent } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Clock, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export default function Portfolio() {
  const [, params] = useRoute("/w/:address");
  const address = params?.address || "";
  const { method } = useCostMethod();

  const { data: portfolio, isLoading, error } = useGetPortfolio(address, { method });

  return (
    <Shell address={address}>
      <div className="flex flex-col gap-8 pb-12">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-3xl">Portfolio</h1>
          <p className="text-muted-foreground text-sm">
            Net valuation and open positions, marked to market.
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 w-full" />)}
          </div>
        ) : error ? (
          <div className="p-8 border border-destructive/20 bg-destructive/10 text-destructive rounded-lg flex flex-col items-center justify-center text-center">
            <AlertCircle className="h-8 w-8 mb-2" />
            <h3 className="font-semibold">Unable to load portfolio</h3>
            <p className="text-sm opacity-80 mt-1">{error.message || "An unknown error occurred"}</p>
          </div>
        ) : portfolio ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Net value</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-serif">{formatUSD(portfolio.totals.netValue)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Cost basis</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-serif">{formatUSD(portfolio.totals.costBasis)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Unrealized P/L</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-serif ${portfolio.totals.unrealizedPnl > 0 ? "text-success" : portfolio.totals.unrealizedPnl < 0 ? "text-destructive" : ""}`}>
                    {formatUSD(portfolio.totals.unrealizedPnl)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatPercent(portfolio.totals.unrealizedPnlPct)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Realized P/L</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-serif ${portfolio.totals.realizedPnl > 0 ? "text-success" : portfolio.totals.realizedPnl < 0 ? "text-destructive" : ""}`}>
                    {formatUSD(portfolio.totals.realizedPnl)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 font-mono">
                    YTD: {formatUSD(portfolio.totals.realizedPnlYtd)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Income Est.</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-serif text-success">{formatUSD(portfolio.totals.incomeEstimate)}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Via multiplier growth
                  </div>
                </CardContent>
              </Card>
            </div>

            {portfolio.totals.unknownBasisCount > 0 && (
              <div className="bg-card border border-card-border p-3 text-sm flex items-start gap-2 rounded-lg">
                <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <span className="text-muted-foreground">
                  {portfolio.totals.unknownBasisCount === 1 ? "1 position has" : `${portfolio.totals.unknownBasisCount} positions have`} unknown cost basis because the tokens arrived by transfer. Their basis is excluded from the totals. 
                  <Link href="/methodology" className="ml-1 text-primary hover:underline">Read the methodology</Link>.
                </span>
              </div>
            )}

            <div className="flex flex-col gap-4 mt-4">
              <h2 className="font-serif text-2xl">Positions</h2>
              {portfolio.positions.length === 0 ? (
                <div className="p-12 text-center border border-dashed rounded-lg bg-card/50">
                  <h3 className="font-serif text-xl mb-2">No positions found</h3>
                  <p className="text-muted-foreground text-sm max-w-md mx-auto">
                    This wallet has no tokenized stock balances. If you just sent tokens, wait a few seconds and hit refresh.
                  </p>
                </div>
              ) : (
                <div className="border border-card-border rounded-lg overflow-hidden bg-card">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-muted-foreground font-mono uppercase tracking-wider bg-muted/50 border-b border-card-border">
                        <tr>
                          <th className="px-4 py-3 font-medium">Asset</th>
                          <th className="px-4 py-3 font-medium text-right">Quantity</th>
                          <th className="px-4 py-3 font-medium text-right">Mark</th>
                          <th className="px-4 py-3 font-medium text-right">Value</th>
                          <th className="px-4 py-3 font-medium text-right">Cost basis</th>
                          <th className="px-4 py-3 font-medium text-right">Unrealized P/L</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-card-border">
                        {portfolio.positions.map((pos) => (
                          <tr key={pos.mint} className="hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-4">
                              <div className="flex flex-col">
                                <div className="font-medium flex items-center gap-2">
                                  {pos.symbol}
                                  <Badge variant="outline" className="text-[10px] font-mono px-1 py-0">{pos.issuer}</Badge>
                                </div>
                                <div className="text-xs text-muted-foreground">{pos.name}</div>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-right font-mono">
                              <div className="flex flex-col items-end">
                                <span>{formatQuantity(pos.quantity)}</span>
                                {pos.multiplier.current !== 1 && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="text-[10px] text-muted-foreground cursor-help">
                                        Raw: {formatQuantity(pos.rawQuantity)}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Multiplier: {pos.multiplier.current}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-right font-mono">
                              <div className="flex flex-col items-end">
                                <span>{formatUSD(pos.mark.price)}</span>
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <span className={pos.mark.status === "live" ? "text-success" : "text-destructive"}>
                                    {pos.mark.statusLabel}
                                  </span>
                                  <span>via {pos.mark.source}</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-right font-mono font-medium">
                              {formatUSD(pos.marketValue)}
                              <div className="text-[10px] text-muted-foreground">
                                {formatPercent(pos.weightPct)}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-right font-mono">
                              <div className="flex flex-col items-end">
                                <span>{formatUSD(pos.costBasis)}</span>
                                {pos.basisStatus !== "complete" && (
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Badge variant="outline" className="text-[10px] border-destructive text-destructive px-1 py-0 mt-1">Est.</Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>{pos.basisNote}</TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-right font-mono">
                              <div className={`flex flex-col items-end ${pos.unrealizedPnl && pos.unrealizedPnl > 0 ? "text-success" : pos.unrealizedPnl && pos.unrealizedPnl < 0 ? "text-destructive" : ""}`}>
                                <span>{formatUSD(pos.unrealizedPnl)}</span>
                                <span className="text-[10px]">{formatPercent(pos.unrealizedPnlPct)}</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </Shell>
  );
}
