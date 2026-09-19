import { useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { useListStatements, useCreateStatement, CostMethod } from "@workspace/api-client-react";
import { useCostMethod } from "@/hooks/use-cost-method";
import { useStage } from "@/components/layout/stage";
import { formatUSD } from "@/lib/format";
import { Plus, ShieldCheck, Clock, Loader2, AlertTriangle } from "lucide-react";
import { format, subMonths, startOfMonth, endOfMonth, startOfYear, startOfQuarter } from "date-fns";
import { DataTable, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/data-table";
import { PageHeader, Panel, Skeleton, EmptyState, ErrorState, Pill } from "@/components/surface";
import { Reveal, EASE_OUT } from "@/components/motion/reveal";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export default function Statements() {
  const [, params] = useRoute("/w/:address/statements");
  const address = params?.address || "";
  const { method } = useCostMethod();
  const [, setLocation] = useLocation();

  const { data: statements, isLoading, error } = useListStatements(address);
  const createStatement = useCreateStatement();

  const count = statements?.length ?? 0;
  useStage({
    caption: statements 
      ? (count > 0 ? `${count} ${count === 1 ? "statement" : "statements"} generated for this ledger.` : "Statements record holdings and realized gains for a chosen period.")
      : "Statements record holdings and realized gains for a chosen period."
  });

  // The list reads first. The form opens on request, or by itself when there is nothing to list yet.
  const [formOpen, setFormOpen] = useState<boolean | null>(null);
  const showForm = formOpen ?? (statements !== undefined && statements.length === 0);
  const setShowForm = setFormOpen;
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
      setNewTitle("Year to date statement");
    } else if (preset === "qtd") {
      setNewStart(format(startOfQuarter(now), "yyyy-MM-dd"));
      setNewEnd(format(now, "yyyy-MM-dd"));
      setNewTitle("Quarter to date statement");
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
      // Error handled by mutation state
    }
  };

  const formatDateString = (dateString: string) => {
    return format(new Date(dateString), "MMM d, yyyy");
  };

  return (
    <>
      <PageHeader 
        title="Statements"
        description="Statements for any period, each with a document hash that can be notarized on Solana."
        actions={
          !showForm && (
            <Reveal>
              <button
                onClick={() => setShowForm(true)}
                className="group flex items-center gap-2 whitespace-nowrap rounded-full border hairline bg-white/[0.03] px-4 py-2 text-[13px] text-foreground transition-colors hover:bg-white/[0.06] hover:border-white/20"
              >
                <Plus className="h-4 w-4 text-primary" />
                Generate statement
              </button>
            </Reveal>
          )
        }
      />

      <div className="flex flex-col gap-10 pb-16">
        <AnimatePresence initial={false}>
          {showForm && (
            <motion.div
              initial={{ height: 0, opacity: 0, marginBottom: 0 }}
              animate={{ height: "auto", opacity: 1, marginBottom: 16 }}
              exit={{ height: 0, opacity: 0, marginBottom: 0 }}
              transition={{ duration: 0.6, ease: EASE_OUT }}
              className="overflow-hidden"
            >
              <Panel className="p-6 md:p-8 flex flex-col gap-8 border-primary/20 bg-primary/[0.02]">
                <div className="flex items-center justify-between">
                  <h2 className="display text-[26px] md:text-[30px] text-foreground">New statement</h2>
                  <button 
                    onClick={() => setShowForm(false)} 
                    className="text-[13px] text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
                  >
                    Cancel
                  </button>
                </div>
                
                <div className="flex flex-col gap-6">
                  <div className="flex flex-wrap gap-2">
                    {["thisMonth", "lastMonth", "qtd", "ytd"].map((preset) => (
                      <button 
                        key={preset} 
                        type="button" 
                        onClick={() => applyPreset(preset as any)} 
                        className="rounded-full border hairline bg-white/[0.03] px-3.5 py-1.5 text-[12px] text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
                      >
                        {preset === "thisMonth" ? "This month" : preset === "lastMonth" ? "Last month" : preset === "qtd" ? "Quarter to date" : "Year to date"}
                      </button>
                    ))}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex flex-col gap-2.5">
                      <label htmlFor="stmt-start" className="label">Start date</label>
                      <input 
                        id="stmt-start" 
                        type="date" 
                        value={newStart} 
                        onChange={(e) => setNewStart(e.target.value)} 
                        className="h-10 w-full rounded-lg border hairline bg-white/[0.03] px-3 num text-[14px] text-foreground transition-colors focus:border-primary/50 focus:bg-white/[0.05] focus:outline-none" 
                      />
                    </div>
                    <div className="flex flex-col gap-2.5">
                      <label htmlFor="stmt-end" className="label">End date</label>
                      <input 
                        id="stmt-end" 
                        type="date" 
                        value={newEnd} 
                        onChange={(e) => setNewEnd(e.target.value)} 
                        className="h-10 w-full rounded-lg border hairline bg-white/[0.03] px-3 num text-[14px] text-foreground transition-colors focus:border-primary/50 focus:bg-white/[0.05] focus:outline-none" 
                      />
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2.5">
                    <label htmlFor="stmt-title" className="label">Title (optional)</label>
                    <input 
                      id="stmt-title" 
                      type="text" 
                      value={newTitle} 
                      onChange={(e) => setNewTitle(e.target.value)} 
                      placeholder="For example Q3 tax statement" 
                      className="h-10 w-full rounded-lg border hairline bg-white/[0.03] px-3 text-[14px] text-foreground transition-colors focus:border-primary/50 focus:bg-white/[0.05] focus:outline-none" 
                    />
                  </div>
                  
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-2 pt-6 border-t hairline">
                    <div className="text-[13px] text-muted-foreground">
                      {createStatement.isError ? (
                        <span className="flex items-center gap-1.5 text-destructive">
                          <AlertTriangle className="h-4 w-4" />
                          {createStatement.error?.message || "Failed to generate statement"}
                        </span>
                      ) : (
                        <span>Uses the current {method.toUpperCase()} cost method</span>
                      )}
                    </div>
                    <button 
                      onClick={handleCreate} 
                      disabled={createStatement.isPending} 
                      className="group flex items-center justify-center gap-2 rounded-full bg-foreground px-6 py-2 text-[13px] font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
                    >
                      {createStatement.isPending && <Loader2 className="h-4 w-4 animate-spin text-background" />}
                      Generate
                    </button>
                  </div>
                </div>
              </Panel>
            </motion.div>
          )}
        </AnimatePresence>

        {isLoading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : error ? (
          <ErrorState title="Unable to load statements" message={error.message} />
        ) : statements ? (
          statements.length === 0 ? (
            <Reveal>
              <EmptyState 
                title="No statements found"
                description="Generate a statement to record holdings and realized gains for a chosen period."
                action={
                  !showForm && (
                    <button
                      onClick={() => setShowForm(true)}
                      className="mt-6 flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-[13px] font-medium text-background transition-colors hover:bg-foreground/90"
                    >
                      Generate statement
                    </button>
                  )
                }
              />
            </Reveal>
          ) : (
            <DataTable>
              <TableHeader>
                <TableHead>Statement</TableHead>
                <TableHead>Document hash</TableHead>
                <TableHead>Proof</TableHead>
                <TableHead align="right">Closing value</TableHead>
              </TableHeader>
              <TableBody>
                {statements.map((stmt, i) => (
                  <TableRow 
                    key={stmt.id} 
                    index={i}
                    onClick={() => setLocation(`/w/${address}/statements/${stmt.id}`)}
                  >
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Link href={`/w/${address}/statements/${stmt.id}`} className="text-[15px] text-foreground hover:text-primary transition-colors focus:outline-none focus-visible:underline" onClick={(e) => e.stopPropagation()}>{stmt.title}</Link>
                        <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
                          <span className="num">
                            {formatDateString(stmt.periodStart)} to {formatDateString(stmt.periodEnd)}
                          </span>
                          <Pill className="text-[9px] px-1.5 py-[2px]">{stmt.method}</Pill>
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="num text-[12px] text-muted-foreground" title={stmt.hash}>
                        {stmt.hash.substring(0, 10)}
                        <span className="text-muted-foreground/50">&hellip;</span>
                        {stmt.hash.slice(-4)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {stmt.proofStatus === 'confirmed' ? (
                          <ShieldCheck className="h-4 w-4 text-success" />
                        ) : stmt.proofStatus === 'simulated' ? (
                          <ShieldCheck className="h-4 w-4 text-primary" />
                        ) : stmt.proofStatus === 'failed' ? (
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                        ) : (
                          <Clock className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className={cn(
                          "text-[13px]",
                          stmt.proofStatus === 'confirmed' ? 'text-success' : 
                          stmt.proofStatus === 'simulated' ? 'text-primary' : 
                          stmt.proofStatus === 'failed' ? 'text-destructive' :
                          'text-muted-foreground'
                        )}>
                          {stmt.proofStatus === 'confirmed' ? 'Confirmed' : 
                           stmt.proofStatus === 'simulated' ? 'Simulated' : 
                           stmt.proofStatus === 'pending' ? 'Pending' : 
                           stmt.proofStatus === 'failed' ? 'Failed' : 
                           'Not notarized'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell align="right">
                      <span className="num text-[15px] text-foreground">{formatUSD(stmt.closingValue)}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </DataTable>
          )
        ) : null}

        {statements && statements.length > 0 && (
          <Reveal delay={0.1}>
            <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <Panel key={step.title} className="flex flex-col gap-3 p-6">
                  <span className="num text-[11px] tracking-[0.14em] text-primary">0{i + 1}</span>
                  <span className="text-[15px] text-foreground">{step.title}</span>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">{step.body}</p>
                </Panel>
              ))}
            </section>
          </Reveal>
        )}
      </div>
    </>
  );
}

const STEPS = [
  {
    title: "Pick a period",
    body: "A statement records opening and closing holdings, realized gains and income for the dates you choose, under the cost method active at the time.",
  },
  {
    title: "Hash the document",
    body: "The CSV and PDF exports are built from the same rows. A SHA-256 hash of the statement identifies that exact version.",
  },
  {
    title: "Notarize on Solana",
    body: "Post the hash in a memo transaction from your wallet. Anyone can later check the statement against the memo without trusting this site.",
  },
];