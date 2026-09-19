import { useRoute, useSearch, useLocation } from "wouter";
import { Shell } from "@/components/layout/shell";
import { useListLots, LotStatusFilter } from "@workspace/api-client-react";
import { useCostMethod } from "@/hooks/use-cost-method";
import { formatUSD, formatQuantity } from "@/lib/format";
import { AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { DataTable, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/data-table";

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
      <div className="flex flex-col animate-in fade-in duration-700 pb-12">
        
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div className="flex flex-col gap-1">
            <h1 className="font-serif text-4xl tracking-tight text-foreground">Tax lots</h1>
            <p className="text-muted-foreground text-sm font-sans mt-2">
              Acquisition history and cost basis tracking.
            </p>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <label htmlFor="lot-status" className="text-[11px] text-muted-foreground font-sans uppercase tracking-[0.08em]">Status</label>
            <select 
              id="lot-status"
              value={statusFilter} 
              onChange={(e) => setStatus(e.target.value)}
              className="bg-transparent text-sm font-sans text-foreground pb-0.5 focus:outline-none cursor-pointer"
            >
              <option value="all">All lots</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-12 opacity-50">
            <div className="flex gap-16 border-y border-border py-10">
              <div className="h-16 w-full bg-muted animate-pulse rounded"></div>
            </div>
          </div>
        ) : error ? (
          <div className="p-12 border border-border bg-card flex flex-col items-center justify-center text-center shadow-sm">
            <AlertCircle className="h-8 w-8 mb-4 text-destructive" />
            <h3 className="font-serif text-2xl mb-2 text-foreground">Unable to load lots</h3>
            <p className="text-muted-foreground font-sans">{error.message || "An unknown error occurred"}</p>
          </div>
        ) : lots ? (
          <div className="flex flex-col gap-5">
            {lots.length === 0 ? (
              <div className="p-16 text-center border border-border bg-card shadow-sm">
                <h3 className="font-serif text-2xl mb-3 text-foreground">No lots found</h3>
                <p className="text-muted-foreground text-sm font-sans max-w-md mx-auto leading-relaxed">
                  No tax lots match the selected criteria.
                </p>
              </div>
            ) : (
              <DataTable>
                <TableHeader>
                  <TableHead>Asset</TableHead>
                  <TableHead>Acquired</TableHead>
                  <TableHead align="right">Quantity</TableHead>
                  <TableHead align="right">Cost per share</TableHead>
                  <TableHead align="right">Basis</TableHead>
                  <TableHead align="right">Value & P/L</TableHead>
                  <TableHead align="right">Status</TableHead>
                </TableHeader>
                <TableBody>
                  {lots.map((lot) => (
                    <TableRow key={lot.id}>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-serif text-lg text-foreground">{lot.symbol}</span>
                          <span className="text-[11px] text-muted-foreground font-sans uppercase tracking-[0.08em]">
                            {lot.openKind.replace('_', ' ')}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[15px] tabular-nums text-foreground">{format(new Date(lot.openedAt), "MMM d, yyyy")}</span>
                          <span className="text-[11px] tabular-nums text-muted-foreground font-sans">
                            {lot.holdingDays} days
                            {lot.closedAt ? ` · Closed ${format(new Date(lot.closedAt), "MMM d")}` : ""}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell align="right">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-[15px] tabular-nums text-foreground">{formatQuantity(lot.remainingQuantity)}</span>
                          {lot.remainingQuantity !== lot.quantity && (
                            <span className="text-[11px] tabular-nums text-muted-foreground font-sans">
                              of {formatQuantity(lot.quantity)}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell align="right">
                        <span className="text-[15px] tabular-nums text-foreground">{formatUSD(lot.costPerShare)}</span>
                      </TableCell>
                      <TableCell align="right">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-[15px] font-medium tabular-nums text-foreground">{formatUSD(lot.remainingCostBasis)}</span>
                          {lot.basisStatus !== "complete" && (
                            <span className="text-[10px] text-destructive uppercase tracking-[0.08em] font-sans mt-0.5 border border-destructive/20 bg-destructive/5 px-1 py-px rounded-[2px]">
                              {lot.basisStatus}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell align="right">
                        <div className="flex flex-col items-end gap-0.5">
                          {lot.status === "closed" ? (
                            <>
                              <span className="text-[15px] font-medium tabular-nums text-foreground">Realized</span>
                              <span className={`text-[11px] tabular-nums font-sans ${lot.realizedPnl > 0 ? "text-success" : lot.realizedPnl < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                                {lot.realizedPnl > 0 ? "+" : ""}{formatUSD(lot.realizedPnl)}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="text-[15px] font-medium tabular-nums text-foreground">{formatUSD(lot.marketValue)}</span>
                              {lot.unrealizedPnl !== null && (
                                <span className={`text-[11px] tabular-nums font-sans ${lot.unrealizedPnl > 0 ? "text-success" : lot.unrealizedPnl < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                                  {lot.unrealizedPnl > 0 ? "+" : ""}{formatUSD(lot.unrealizedPnl)} unrl.
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell align="right">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-[11px] font-sans uppercase tracking-[0.08em] text-foreground">
                            {lot.status}
                          </span>
                          <span className={`text-[11px] font-sans uppercase tracking-[0.08em] ${lot.term === "long" ? "text-success" : "text-muted-foreground"}`}>
                            {lot.term}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </DataTable>
            )}
          </div>
        ) : null}
      </div>
    </Shell>
  );
}
