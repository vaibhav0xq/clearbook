import { useRoute } from "wouter";
import { Shell } from "@/components/layout/shell";
import { useGetStatement, usePrepareNotarization, useSubmitNotarization, getGetStatementQueryKey, getPrepareNotarizationQueryKey } from "@workspace/api-client-react";
import { formatUSD, formatQuantity } from "@/lib/format";
import { AlertCircle, ExternalLink, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { NotarizeButton } from "@/components/notarize-button";
import { useWalletSession } from "@/lib/wallet";
import { Figure } from "@/components/figure";
import { DataTable, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/data-table";

export default function StatementDetail() {
  const [, params] = useRoute("/w/:address/statements/:statementId");
  const address = params?.address || "";
  const statementId = params?.statementId || "";

  const { data: statement, isLoading, error, refetch: refetchStatement } = useGetStatement(statementId, {
    query: { queryKey: getGetStatementQueryKey(statementId), enabled: !!statementId }
  });
  
  const wallet = useWalletSession();
  const payer = wallet.publicKey && wallet.publicKey === address ? wallet.publicKey : undefined;
  const notarizationParams = payer ? { payer } : {};
  
  const canNotarize = statement?.proof.status === "none" || statement?.proof.status === "failed";
  const { data: notarizationPayload, error: notarizationError, isLoading: isPayloadLoading, refetch: refetchPayload } = usePrepareNotarization(statementId, notarizationParams, {
    query: { queryKey: getPrepareNotarizationQueryKey(statementId, notarizationParams), enabled: !!statementId && !!canNotarize }
  });

  const submitNotarization = useSubmitNotarization();

  const handleNotarizeSubmit = async (params: any) => {
    await submitNotarization.mutateAsync(params);
    refetchStatement();
    refetchPayload();
  };

  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/api`;
  const csvUrl = `${apiBase}/statements/${statementId}/export.csv`;
  const pdfUrl = `${apiBase}/statements/${statementId}/export.pdf`;

  return (
    <Shell address={address}>
      <div className="flex flex-col items-center animate-in fade-in duration-700 pb-16">
        {isLoading ? (
          <div className="w-full max-w-5xl space-y-12 opacity-50 my-8">
            <div className="h-24 w-full bg-muted animate-pulse rounded"></div>
            <div className="h-64 w-full bg-muted animate-pulse rounded"></div>
          </div>
        ) : error ? (
          <div className="p-12 border border-border bg-card flex flex-col items-center justify-center text-center max-w-2xl w-full my-12">
            <AlertCircle className="h-8 w-8 mb-4 text-destructive" />
            <h3 className="font-serif text-2xl mb-2 text-foreground">Unable to load statement</h3>
            <p className="text-muted-foreground font-sans">{error.message}</p>
          </div>
        ) : statement ? (
          <div className="bg-card border border-border w-full max-w-5xl mt-6 p-8 md:p-14 lg:p-20 shadow-sm relative">
            {/* Top decorative line */}
            <div className="absolute top-0 left-0 w-full h-1 bg-primary"></div>
            
            {/* Document Header */}
            <div className="flex flex-col lg:flex-row justify-between items-start gap-12 border-b-2 border-foreground pb-10 mb-10">
              <div className="flex flex-col w-full">
                <div className="text-[11px] font-sans uppercase tracking-[0.08em] text-primary font-semibold mb-2">Statement</div>
                <h1 className="font-serif text-4xl md:text-5xl tracking-tight text-foreground leading-none">{statement.title}</h1>
                
                {/* Definition List for Metadata */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-6 text-sm mt-10 w-full max-w-2xl">
                   <div className="flex flex-col">
                     <span className="text-[11px] font-sans uppercase tracking-[0.08em] text-muted-foreground">Account</span>
                     <span className="font-mono mt-1 text-xs">{statement.displayAddress}</span>
                   </div>
                   <div className="flex flex-col">
                     <span className="text-[11px] font-sans uppercase tracking-[0.08em] text-muted-foreground">Period</span>
                     <span className="font-sans mt-1">
                       {format(new Date(statement.periodStart), "MMM d, yyyy")} to {format(new Date(statement.periodEnd), "MMM d, yyyy")}
                     </span>
                   </div>
                   <div className="flex flex-col">
                     <span className="text-[11px] font-sans uppercase tracking-[0.08em] text-muted-foreground">Cost method</span>
                     <span className="font-sans mt-1">{statement.method.toUpperCase()}</span>
                   </div>
                   <div className="flex flex-col">
                     <span className="text-[11px] font-sans uppercase tracking-[0.08em] text-muted-foreground">Generated</span>
                     <span className="font-sans mt-1">{format(new Date(statement.generatedAt), "MMM d, yyyy")}</span>
                   </div>
                </div>
              </div>
              
              <div className="flex flex-col items-start lg:items-end gap-6 w-full lg:w-auto shrink-0">
                <div className="flex gap-3 w-full lg:w-auto">
                  <a href={csvUrl} download className="flex-1 lg:flex-none text-center text-[11px] font-sans uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground border border-border px-5 py-2 hover:border-foreground transition-colors">
                    Export CSV
                  </a>
                  <a href={pdfUrl} download className="flex-1 lg:flex-none text-center text-[11px] font-sans uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground border border-border px-5 py-2 hover:border-foreground transition-colors">
                    Export PDF
                  </a>
                </div>
                
                <div className="flex flex-col gap-1 items-start lg:items-end">
                   <span className="text-[11px] font-sans uppercase tracking-[0.08em] text-muted-foreground">Document hash</span>
                   <span className="text-[11px] text-muted-foreground font-mono max-w-[220px] break-all text-left lg:text-right bg-muted/30 p-2 border border-border">{statement.hash}</span>
                </div>
              </div>
            </div>

            {/* Proof Block */}
            <div className={`mb-12 border p-5 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm ${
              statement.proof.status === 'confirmed' ? 'bg-success/5 border-success/20' :
              statement.proof.status === 'simulated' ? 'bg-primary/5 border-primary/20' :
              statement.proof.status === 'failed' ? 'bg-destructive/5 border-destructive/20' :
              'bg-muted/10 border-border/60'
            }`}>
              <div className="flex items-start gap-4">
                <ShieldCheck className={`w-6 h-6 mt-0.5 ${
                  statement.proof.status === 'confirmed' ? 'text-success' : 
                  statement.proof.status === 'simulated' ? 'text-primary' :
                  statement.proof.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'
                }`} />
                <div className="flex flex-col gap-1">
                  <span className="font-serif text-lg text-foreground">
                    {statement.proof.status === 'none' ? 'Not notarized' :
                     statement.proof.status === 'confirmed' ? 'On-chain proof confirmed' :
                     statement.proof.status === 'simulated' ? 'Simulated proof recorded' :
                     statement.proof.status === 'failed' ? 'Proof failed' :
                     'Proof pending'}
                  </span>
                  <span className="text-sm font-sans text-muted-foreground leading-relaxed max-w-lg">{statement.proof.message}</span>
                  
                  {statement.proof.explorerUrl && (
                    <a href={statement.proof.explorerUrl} target="_blank" className="text-[11px] font-sans uppercase tracking-[0.08em] text-primary hover:underline flex items-center gap-1 mt-2 w-fit">
                      View on explorer <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-start md:items-end gap-2">
                {canNotarize && notarizationPayload && (
                  <NotarizeButton payload={notarizationPayload} onSubmit={handleNotarizeSubmit} />
                )}
                {canNotarize && !notarizationPayload && isPayloadLoading && (
                  <span className="text-xs font-sans text-muted-foreground">Preparing notarization...</span>
                )}
                {canNotarize && !notarizationPayload && notarizationError && (
                  <div className="flex flex-col items-start md:items-end gap-1">
                    <span className="text-xs font-sans text-destructive">Could not prepare notarization. {notarizationError.message}</span>
                    <button type="button" onClick={() => refetchPayload()} className="text-[11px] font-sans uppercase tracking-[0.08em] text-foreground border-b border-foreground pb-0.5 hover:text-primary hover:border-primary transition-colors">
                      Try again
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Totals Section */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-14">
              <Figure label="Opening value" value={formatUSD(statement.totals.openingValue)} size="lg" />
              <Figure label="Closing value" value={formatUSD(statement.totals.closingValue)} size="lg" />
              <Figure label="Realized P/L" value={formatUSD(statement.totals.realizedPnl)} subTone={statement.totals.realizedPnl} size="lg" />
              <Figure label="Income est." value={formatUSD(statement.totals.incomeEstimate)} subTone={statement.totals.incomeEstimate} size="lg" />
            </div>

            {/* Holdings Section */}
            <div className="mb-20">
              <h2 className="font-serif text-2xl mb-4 pb-2 border-b border-border text-foreground">Holdings</h2>
              {statement.positions.length === 0 ? (
                <div className="text-muted-foreground font-sans italic bg-muted/20 p-8 border border-border text-center text-sm">No holdings in this period.</div>
              ) : (
                <DataTable>
                  <TableHeader>
                    <TableHead>Asset</TableHead>
                    <TableHead align="right">Quantity</TableHead>
                    <TableHead align="right">Close price</TableHead>
                    <TableHead align="right">Value</TableHead>
                    <TableHead align="right">Cost basis</TableHead>
                  </TableHeader>
                  <TableBody>
                    {statement.positions.map((pos) => (
                      <TableRow key={pos.mint}>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-serif text-lg text-foreground">{pos.symbol}</span>
                            <span className="text-xs text-muted-foreground font-sans">{pos.name}</span>
                          </div>
                        </TableCell>
                        <TableCell align="right" className="text-[15px]">
                          {formatQuantity(pos.closingQuantity)}
                        </TableCell>
                        <TableCell align="right" className="text-[15px]">
                          {formatUSD(pos.closingPrice)}
                        </TableCell>
                        <TableCell align="right" className="text-[15px] font-medium">
                          {formatUSD(pos.closingValue)}
                        </TableCell>
                        <TableCell align="right" className="text-[15px]">
                          {formatUSD(pos.costBasis)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </DataTable>
              )}
            </div>

            {/* Disclosures Footer */}
            <div className="border-t border-border pt-10 grid grid-cols-1 md:grid-cols-2 gap-16">
              <div>
                <h3 className="text-[11px] font-sans uppercase tracking-[0.08em] text-foreground mb-4 border-b border-border/50 pb-2">Disclosures</h3>
                <ul className="list-disc list-outside ml-4 text-xs font-sans text-muted-foreground space-y-2.5 leading-relaxed">
                  {statement.assumptions.map((ass, i) => <li key={i}>{ass}</li>)}
                </ul>
              </div>
              <div>
                <h3 className="text-[11px] font-sans uppercase tracking-[0.08em] text-foreground mb-4 border-b border-border/50 pb-2">Data sources</h3>
                <ul className="space-y-2">
                  {statement.dataSources.map(ds => (
                    <li key={ds.id} className="flex justify-between items-baseline text-xs font-sans text-muted-foreground border-b border-border/30 pb-1.5">
                      <span>{ds.label}</span>
                      <span className="font-sans uppercase text-[10px] tracking-[0.08em] bg-muted px-1.5 py-[1px] rounded-[2px]">{ds.mode}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            
          </div>
        ) : null}
      </div>
    </Shell>
  );
}
