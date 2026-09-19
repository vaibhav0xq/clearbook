import { useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { Shell } from "@/components/layout/shell";
import { useListStatements, useCreateStatement, CostMethod } from "@workspace/api-client-react";
import { useCostMethod } from "@/hooks/use-cost-method";
import { formatUSD } from "@/lib/format";
import { AlertCircle, ShieldCheck, Clock, Loader2, Plus } from "lucide-react";
import { format, subMonths, startOfMonth, endOfMonth, startOfYear, startOfQuarter } from "date-fns";
import { DataTable, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/data-table";

export default function Statements() {
  const [, params] = useRoute("/w/:address/statements");
  const address = params?.address || "";
  const { method } = useCostMethod();
  const [, setLocation] = useLocation();

  const { data: statements, isLoading, error } = useListStatements(address);
  const createStatement = useCreateStatement();

  const [showForm, setShowForm] = useState(false);
  const [newStart, setNewStart] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [newEnd, setNewEnd] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [newTitle, setNewTitle] = useState("Monthly statement");

  const applyPreset = (preset: "thisMonth" | "lastMonth" | "ytd" | "qtd") => {
    const now = new Date();
    if (preset === "thisMonth") {
      setNewStart(format(startOfMonth(now), "yyyy-MM-dd"));
      setNewEnd(format(endOfMonth(now), "yyyy-MM-dd"));
      setNewTitle("Monthly statement");
    } else if (preset === "lastMonth") {
      const lastMonth = subMonths(now, 1);
      setNewStart(format(startOfMonth(lastMonth), "yyyy-MM-dd"));
      setNewEnd(format(endOfMonth(lastMonth), "yyyy-MM-dd"));
      setNewTitle("Previous month statement");
    } else if (preset === "ytd") {
      setNewStart(format(startOfYear(now), "yyyy-MM-dd"));
      setNewEnd(format(now, "yyyy-MM-dd"));
      setNewTitle("Year to Date statement");
    } else if (preset === "qtd") {
      setNewStart(format(startOfQuarter(now), "yyyy-MM-dd"));
      setNewEnd(format(now, "yyyy-MM-dd"));
      setNewTitle("Quarter to Date statement");
    }
  };

  const handleCreate = async () => {
    try {
      const res = await createStatement.mutateAsync({
        address,
        data: {
          periodStart: new Date(newStart).toISOString(),
          periodEnd: new Date(newEnd).toISOString(),
          method: method as CostMethod,
          title: newTitle
        }
      });
      setShowForm(false);
      setLocation(`/w/${address}/statements/${res.id}`);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <Shell address={address}>
      <div className="flex flex-col animate-in fade-in duration-700 pb-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div className="flex flex-col gap-1">
            <h1 className="font-serif text-4xl tracking-tight text-foreground">Statements</h1>
            <p className="text-muted-foreground text-sm font-sans mt-2">
              Statements for any period, each with a document hash that can be written to Solana.
            </p>
          </div>
          {!showForm && (
            <button 
              onClick={() => setShowForm(true)}
              className="text-[11px] font-sans uppercase tracking-[0.08em] text-foreground hover:text-primary border border-border px-5 py-2.5 hover:border-primary transition-colors flex items-center gap-2 w-fit"
            >
              <Plus className="w-3.5 h-3.5" />
              Generate statement
            </button>
          )}
        </div>

        {showForm && (
          <div className="border border-border bg-card p-6 md:p-8 mb-10 shadow-sm relative overflow-hidden animate-in fade-in duration-300">
            <div className="absolute top-0 left-0 w-full h-1 bg-primary"></div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-serif text-2xl text-foreground">New statement</h2>
              <button onClick={() => setShowForm(false)} className="text-[11px] font-sans uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground border-b border-transparent hover:border-foreground pb-0.5 transition-colors">Close</button>
            </div>
            
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap gap-2">
                {["thisMonth", "lastMonth", "qtd", "ytd"].map(preset => (
                  <button 
                    key={preset} 
                    type="button" 
                    onClick={() => applyPreset(preset as "thisMonth" | "lastMonth" | "qtd" | "ytd")} 
                    className="text-[11px] font-sans uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground border border-border px-4 py-2 hover:border-foreground transition-colors"
                  >
                    {preset === "thisMonth" ? "This month" : preset === "lastMonth" ? "Last month" : preset === "qtd" ? "QTD" : "YTD"}
                  </button>
                ))}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label htmlFor="stmt-start" className="text-[11px] font-sans uppercase tracking-[0.08em] text-muted-foreground">Start date</label>
                  <input id="stmt-start" type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="bg-transparent border border-border p-2.5 text-sm font-sans text-foreground focus:outline-none focus:border-primary focus:ring-0 rounded-none transition-colors" />
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="stmt-end" className="text-[11px] font-sans uppercase tracking-[0.08em] text-muted-foreground">End date</label>
                  <input id="stmt-end" type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className="bg-transparent border border-border p-2.5 text-sm font-sans text-foreground focus:outline-none focus:border-primary focus:ring-0 rounded-none transition-colors" />
                </div>
              </div>
              
              <div className="flex flex-col gap-2">
                <label htmlFor="stmt-title" className="text-[11px] font-sans uppercase tracking-[0.08em] text-muted-foreground">Title (optional)</label>
                <input id="stmt-title" type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="For example Q3 tax statement" className="bg-transparent border border-border p-2.5 text-sm font-sans text-foreground focus:outline-none focus:border-primary focus:ring-0 rounded-none transition-colors" />
              </div>
              
              <div className="flex justify-end mt-2">
                <button 
                  onClick={handleCreate} 
                  disabled={createStatement.isPending} 
                  className="text-[11px] font-sans uppercase tracking-[0.08em] text-primary-foreground bg-foreground hover:bg-foreground/90 px-8 py-3 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 min-w-[160px]"
                >
                  {createStatement.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Generate
                </button>
              </div>
              {createStatement.isError && (
                <div className="text-sm font-sans text-destructive mt-2">{createStatement.error?.message || "Failed to generate statement."}</div>
              )}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-12 opacity-50">
            <div className="flex flex-col gap-4 border-y border-border py-10">
              <div className="h-10 w-full bg-muted animate-pulse rounded-none"></div>
              <div className="h-10 w-full bg-muted animate-pulse rounded-none"></div>
              <div className="h-10 w-full bg-muted animate-pulse rounded-none"></div>
            </div>
          </div>
        ) : error ? (
          <div className="p-12 border border-border bg-card flex flex-col items-center justify-center text-center">
            <AlertCircle className="h-8 w-8 mb-4 text-destructive" />
            <h3 className="font-serif text-2xl mb-2 text-foreground">Unable to load statements</h3>
            <p className="text-muted-foreground font-sans">{error.message || "An unknown error occurred"}</p>
          </div>
        ) : statements ? (
          <>
            {statements.length === 0 ? (
              <div className="p-16 text-center border border-border bg-card shadow-sm">
                <h3 className="font-serif text-2xl mb-3 text-foreground">No statements found</h3>
                <p className="text-muted-foreground text-sm font-sans max-w-md mx-auto leading-relaxed">
                  Generate your first statement to verify holdings and compute realized gains for a specific period.
                </p>
              </div>
            ) : (
              <DataTable>
                <TableHeader>
                  <TableHead>Statement</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Document hash</TableHead>
                  <TableHead>Proof status</TableHead>
                  <TableHead align="right">Ending value</TableHead>
                </TableHeader>
                <TableBody>
                  {statements.map((stmt) => (
                    <tr key={stmt.id} className="hover:bg-muted/20 transition-colors cursor-pointer group" onClick={() => setLocation(`/w/${address}/statements/${stmt.id}`)}>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <Link href={`/w/${address}/statements/${stmt.id}`} onClick={(e) => e.stopPropagation()} className="font-serif text-lg text-foreground group-hover:text-primary transition-colors focus:outline-none focus-visible:underline">{stmt.title}</Link>
                          <span className="text-xs text-muted-foreground font-sans">
                            {format(new Date(stmt.periodStart), "MMM d, yyyy")} to {format(new Date(stmt.periodEnd), "MMM d, yyyy")}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-[14px] text-foreground font-sans">{stmt.method.toUpperCase()}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-[12px] text-muted-foreground font-mono bg-muted/30 px-1.5 py-0.5 border border-border">{stmt.hash.substring(0, 16)}...</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 font-sans">
                          {stmt.proofStatus === 'confirmed' ? <ShieldCheck className="h-4 w-4 text-success" /> : 
                           stmt.proofStatus === 'simulated' ? <ShieldCheck className="h-4 w-4 text-primary" /> : 
                           <Clock className="h-4 w-4 text-muted-foreground" />}
                          <span className={`text-[13px] font-medium ${
                            stmt.proofStatus === 'confirmed' ? 'text-success' : 
                            stmt.proofStatus === 'simulated' ? 'text-primary' : 
                            'text-muted-foreground capitalize'
                          }`}>
                            {stmt.proofStatus === 'confirmed' ? 'Confirmed' : 
                             stmt.proofStatus === 'simulated' ? 'Simulated' : 
                             stmt.proofStatus === 'pending' ? 'Pending' : 
                             stmt.proofStatus === 'failed' ? 'Failed' : 
                             'Not notarized'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell align="right">
                        <span className="text-[15px] font-medium tabular-nums text-foreground font-sans">{formatUSD(stmt.closingValue)}</span>
                      </TableCell>
                    </tr>
                  ))}
                </TableBody>
              </DataTable>
            )}
          </>
        ) : null}
      </div>
    </Shell>
  );
}
