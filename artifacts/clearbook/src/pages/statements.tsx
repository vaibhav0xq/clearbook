import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Shell } from "@/components/layout/shell";
import { useListStatements, useCreateStatement, CostMethod } from "@workspace/api-client-react";
import { useCostMethod } from "@/hooks/use-cost-method";
import { formatUSD } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, FileText, CheckCircle2, ChevronRight, Plus, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format, subMonths, startOfMonth, endOfMonth, startOfYear, startOfQuarter } from "date-fns";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export default function Statements() {
  const [, params] = useRoute("/w/:address/statements");
  const address = params?.address || "";
  const { method } = useCostMethod();
  const [, setLocation] = useLocation();

  const { data: statements, isLoading, error, refetch } = useListStatements(address);
  const createStatement = useCreateStatement();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
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
      setNewTitle("Year to Date Statement");
    } else if (preset === "qtd") {
      setNewStart(format(startOfQuarter(now), "yyyy-MM-dd"));
      setNewEnd(format(now, "yyyy-MM-dd"));
      setNewTitle("Quarter to Date Statement");
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
      setIsDialogOpen(false);
      setLocation(`/w/${address}/statements/${res.id}`);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <Shell address={address}>
      <div className="flex flex-col gap-8 pb-12">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="font-serif text-3xl">Statements</h1>
            <p className="text-muted-foreground text-sm">
              Generate and verify historical brokerage statements.
            </p>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" /> Generate Statement
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle className="font-serif">Generate statement</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4 py-4">
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => applyPreset("thisMonth")} className="text-xs">This month</Button>
                  <Button variant="outline" size="sm" onClick={() => applyPreset("lastMonth")} className="text-xs">Last month</Button>
                  <Button variant="outline" size="sm" onClick={() => applyPreset("qtd")} className="text-xs">QTD</Button>
                  <Button variant="outline" size="sm" onClick={() => applyPreset("ytd")} className="text-xs">YTD</Button>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Start date</label>
                    <Input type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">End date</label>
                    <Input type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Title (Optional)</label>
                  <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="For example Q3 tax statement" />
                </div>
                
                <Button onClick={handleCreate} disabled={createStatement.isPending} className="mt-4">
                  {createStatement.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
                  Generate
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 w-full" />)}
          </div>
        ) : error ? (
          <div className="p-8 border border-destructive/20 bg-destructive/10 text-destructive rounded-lg flex flex-col items-center justify-center text-center">
            <AlertCircle className="h-8 w-8 mb-2" />
            <h3 className="font-semibold">Unable to load statements</h3>
            <p className="text-sm opacity-80 mt-1">{error.message}</p>
          </div>
        ) : statements ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {statements.length === 0 ? (
              <div className="col-span-full p-12 text-center border border-dashed rounded-lg bg-card/50">
                <FileText className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                <h3 className="font-serif text-xl mb-2">No statements yet</h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto">
                  Generate your first statement to verify holdings and compute realized gains for a specific period.
                </p>
              </div>
            ) : (
              statements.map((statement) => (
                <button
                  key={statement.id}
                  onClick={() => setLocation(`/w/${address}/statements/${statement.id}`)}
                  className="flex flex-col text-left p-5 rounded-lg bg-card border border-card-border hover:border-primary/50 transition-all group"
                >
                  <div className="flex items-start justify-between w-full mb-4">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      <span className="font-serif text-lg">{statement.title}</span>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  
                  <div className="flex flex-col gap-1 mb-6">
                    <span className="text-xs text-muted-foreground font-mono">
                      {format(new Date(statement.periodStart), "MMM d, yyyy")} to {format(new Date(statement.periodEnd), "MMM d, yyyy")}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 font-mono">
                      Generated {format(new Date(statement.generatedAt), "MMM d, HH:mm")}
                    </span>
                  </div>
                  
                  <div className="flex items-end justify-between w-full mt-auto">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Ending value</span>
                      <span className="font-mono text-lg">{formatUSD(statement.closingValue)}</span>
                    </div>
                    <Badge variant="outline" className={`text-[10px] font-mono uppercase ${
                      statement.proofStatus === 'confirmed' ? 'border-success text-success' :
                      statement.proofStatus === 'simulated' ? 'border-primary text-primary' :
                      statement.proofStatus === 'pending' ? 'border-warning text-warning' :
                      'border-muted-foreground text-muted-foreground'
                    }`}>
                      {statement.proofStatus === 'confirmed' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                      {statement.proofStatus}
                    </Badge>
                  </div>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>
    </Shell>
  );
}
