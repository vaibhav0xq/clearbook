import { useRoute, useSearch } from "wouter";
import { Shell } from "@/components/layout/shell";
import { useListLots, LotStatusFilter } from "@workspace/api-client-react";
import { useCostMethod } from "@/hooks/use-cost-method";
import { formatUSD, formatQuantity, formatPercent } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, FileWarning } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation } from "wouter";

export default function Lots() {
  const [, params] = useRoute("/w/:address/lots");
  const address = params?.address || "";
  const { method } = useCostMethod();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const urlParams = new URLSearchParams(search);
  const statusFilter = (urlParams.get("status") as LotStatusFilter) || "all";

  const { data: lots, isLoading, error } = useListLots(address, { method, status: statusFilter });

  const setStatus = (val: string) => {
    const newParams = new URLSearchParams(search);
    newParams.set("status", val);
    setLocation("?" + newParams.toString(), { replace: true });
  };

  return (
    <Shell address={address}>
      <div className="flex flex-col gap-8 pb-12">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="font-serif text-3xl">Tax lots</h1>
            <p className="text-muted-foreground text-sm">
              Acquisition history and cost basis tracking.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Status</span>
            <Select value={statusFilter} onValueChange={setStatus}>
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All lots</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : error ? (
          <div className="p-8 border border-destructive/20 bg-destructive/10 text-destructive rounded-lg flex flex-col items-center justify-center text-center">
            <AlertCircle className="h-8 w-8 mb-2" />
            <h3 className="font-semibold">Unable to load lots</h3>
            <p className="text-sm opacity-80 mt-1">{error.message}</p>
          </div>
        ) : lots ? (
          <div className="border border-card-border rounded-lg overflow-hidden bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground font-mono uppercase tracking-wider bg-muted/50 border-b border-card-border">
                  <tr>
                    <th className="px-4 py-3 font-medium">Asset</th>
                    <th className="px-4 py-3 font-medium">Acquired</th>
                    <th className="px-4 py-3 font-medium text-right">Quantity</th>
                    <th className="px-4 py-3 font-medium text-right">Cost per share</th>
                    <th className="px-4 py-3 font-medium text-right">Basis</th>
                    <th className="px-4 py-3 font-medium text-right">Term</th>
                    <th className="px-4 py-3 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-card-border">
                  {lots.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                        No lots found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    lots.map((lot) => (
                      <tr key={lot.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-4">
                          <div className="font-medium flex items-center gap-2">
                            {lot.symbol}
                            <Badge variant="outline" className="text-[10px] font-mono px-1 py-0">{lot.openKind}</Badge>
                          </div>
                        </td>
                        <td className="px-4 py-4 font-mono text-xs">
                          {format(new Date(lot.openedAt), "MMM d, yyyy")}
                        </td>
                        <td className="px-4 py-4 text-right font-mono">
                          <div className="flex flex-col items-end">
                            <span>{formatQuantity(lot.remainingQuantity)}</span>
                            {lot.remainingQuantity !== lot.quantity && (
                              <span className="text-[10px] text-muted-foreground line-through">
                                {formatQuantity(lot.quantity)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right font-mono">
                          {formatUSD(lot.costPerShare)}
                        </td>
                        <td className="px-4 py-4 text-right font-mono">
                          <div className="flex flex-col items-end">
                            <span>{formatUSD(lot.remainingCostBasis)}</span>
                            {lot.basisStatus !== "complete" && (
                              <div className="flex items-center gap-1 text-[10px] text-destructive mt-1">
                                <FileWarning className="w-3 h-3" />
                                Estimated
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right font-mono text-xs">
                          <span className={lot.term === "long" ? "text-success" : "text-muted-foreground"}>
                            {lot.term.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <Badge variant={lot.status === "open" ? "default" : lot.status === "partial" ? "secondary" : "outline"} className="text-[10px] font-mono uppercase">
                            {lot.status}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </Shell>
  );
}
