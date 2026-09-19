import { useRoute } from "wouter";
import { Shell } from "@/components/layout/shell";
import { useGetStatement, usePrepareNotarization, useSubmitNotarization, getGetStatementQueryKey, getPrepareNotarizationQueryKey } from "@workspace/api-client-react";
import { formatUSD, formatQuantity, truncateAddress } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Download, FileText, ExternalLink, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { NotarizeButton } from "@/components/notarize-button";
import { useWalletSession } from "@/lib/wallet";

export default function StatementDetail() {
  const [, params] = useRoute("/w/:address/statements/:statementId");
  const address = params?.address || "";
  const statementId = params?.statementId || "";

  const { data: statement, isLoading, error, refetch: refetchStatement } = useGetStatement(statementId, {
    query: { queryKey: getGetStatementQueryKey(statementId), enabled: !!statementId }
  });
  
  const wallet = useWalletSession();
  // The payer decides whether the API returns a signable memo transaction or a simulated proof.
  const payer = wallet.publicKey && wallet.publicKey === address ? wallet.publicKey : undefined;
  const notarizationParams = payer ? { payer } : {};
  const { data: notarizationPayload, refetch: refetchPayload } = usePrepareNotarization(statementId, notarizationParams, {
    query: { queryKey: getPrepareNotarizationQueryKey(statementId, notarizationParams), enabled: !!statementId && statement?.proof.status === "none" }
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
      <div className="flex flex-col gap-8 pb-12">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : error ? (
          <div className="p-8 border border-destructive/20 bg-destructive/10 text-destructive rounded-lg flex flex-col items-center justify-center text-center">
            <AlertCircle className="h-8 w-8 mb-2" />
            <h3 className="font-semibold">Unable to load statement</h3>
            <p className="text-sm opacity-80 mt-1">{error.message}</p>
          </div>
        ) : statement ? (
          <div className="bg-bone text-ink p-8 rounded-sm shadow-xl max-w-4xl mx-auto w-full font-serif border border-ink/10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-8 border-b-2 border-ink/20 pb-8 mb-8">
              <div className="flex flex-col gap-1">
                <h1 className="text-4xl tracking-tight leading-none mb-2">{statement.title}</h1>
                <div className="font-sans text-sm tracking-wider uppercase text-ink/60">
                  {format(new Date(statement.periodStart), "MMMM d, yyyy")} to {format(new Date(statement.periodEnd), "MMMM d, yyyy")}
                </div>
                <div className="font-mono text-xs text-ink/50 mt-4">
                  Account: {statement.displayAddress}
                </div>
              </div>
              
              <div className="flex flex-col items-end gap-4">
                <div className="flex gap-2">
                  <a href={csvUrl} download>
                    <Button variant="outline" size="sm" className="bg-transparent border-ink/20 text-ink hover:bg-ink/5 gap-2">
                      <Download className="h-4 w-4" /> CSV
                    </Button>
                  </a>
                  <a href={pdfUrl} download>
                    <Button variant="outline" size="sm" className="bg-transparent border-ink/20 text-ink hover:bg-ink/5 gap-2">
                      <FileText className="h-4 w-4" /> PDF
                    </Button>
                  </a>
                </div>
                
                <div className="text-right font-mono text-[10px] text-ink/40 max-w-[200px] break-all">
                  Hash: {statement.hash}
                </div>
              </div>
            </div>

            {/* Proof Panel */}
            <div className={`p-4 border mb-8 rounded-sm ${
              statement.proof.status === 'confirmed' ? 'bg-success/10 border-success/30' :
              statement.proof.status === 'simulated' ? 'bg-primary/5 border-primary/20' :
              'bg-ink/5 border-ink/10'
            }`}>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <ShieldCheck className={`h-6 w-6 ${
                    statement.proof.status === 'confirmed' ? 'text-success' : 
                    statement.proof.status === 'simulated' ? 'text-primary' : 
                    'text-ink/40'
                  }`} />
                  <div>
                    <div className="font-sans font-medium text-sm">
                      {statement.proof.status === 'none' ? 'Statement not notarized' :
                       statement.proof.status === 'confirmed' ? 'On-chain Proof Confirmed' :
                       statement.proof.status === 'simulated' ? 'Simulated Proof' :
                       'Proof Pending'}
                    </div>
                    <div className="font-sans text-xs opacity-70">{statement.proof.message}</div>
                  </div>
                </div>
                
                {statement.proof.status === 'none' && notarizationPayload && (
                  <NotarizeButton payload={notarizationPayload} onSubmit={handleNotarizeSubmit} />
                )}
                
                {statement.proof.explorerUrl && (
                  <a href={statement.proof.explorerUrl} target="_blank" rel="noopener noreferrer" className="font-sans text-xs underline underline-offset-2 flex items-center gap-1">
                    View on Explorer <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>

            {/* Totals Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-6 mb-12">
              <div className="flex flex-col border-l-2 border-ink/20 pl-4">
                <span className="font-sans text-xs uppercase tracking-widest text-ink/60 mb-1">Opening value</span>
                <span className="font-mono text-xl">{formatUSD(statement.totals.openingValue)}</span>
              </div>
              <div className="flex flex-col border-l-2 border-ink/20 pl-4">
                <span className="font-sans text-xs uppercase tracking-widest text-ink/60 mb-1">Closing value</span>
                <span className="font-mono text-xl font-medium">{formatUSD(statement.totals.closingValue)}</span>
              </div>
              <div className="flex flex-col border-l-2 border-ink/20 pl-4">
                <span className="font-sans text-xs uppercase tracking-widest text-ink/60 mb-1">Realized P/L</span>
                <span className="font-mono text-xl">{formatUSD(statement.totals.realizedPnl)}</span>
              </div>
              <div className="flex flex-col border-l-2 border-ink/20 pl-4">
                <span className="font-sans text-xs uppercase tracking-widest text-ink/60 mb-1">Income Est.</span>
                <span className="font-mono text-xl">{formatUSD(statement.totals.incomeEstimate)}</span>
              </div>
            </div>

            {/* Positions */}
            <div className="mb-12">
              <h2 className="text-2xl mb-4 border-b border-ink/10 pb-2">Holdings</h2>
              {statement.positions.length === 0 ? (
                <div className="text-ink/60 italic">No holdings in this period.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-sans text-sm">
                    <thead>
                      <tr className="border-b border-ink/20 text-xs uppercase tracking-widest text-ink/60">
                        <th className="py-2 font-normal">Asset</th>
                        <th className="py-2 font-normal text-right">Quantity</th>
                        <th className="py-2 font-normal text-right">Price</th>
                        <th className="py-2 font-normal text-right">Value</th>
                        <th className="py-2 font-normal text-right">Cost basis</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/10">
                      {statement.positions.map((pos) => (
                        <tr key={pos.mint}>
                          <td className="py-3">
                            <div className="font-medium">{pos.symbol}</div>
                            <div className="text-xs text-ink/60">{pos.name}</div>
                          </td>
                          <td className="py-3 text-right font-mono">{formatQuantity(pos.closingQuantity)}</td>
                          <td className="py-3 text-right font-mono">{formatUSD(pos.closingPrice)}</td>
                          <td className="py-3 text-right font-mono">{formatUSD(pos.closingValue)}</td>
                          <td className="py-3 text-right font-mono">{formatUSD(pos.costBasis)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Disclosures & Assumptions */}
            <div className="mt-16 pt-8 border-t border-ink/20 font-sans text-xs text-ink/60 columns-1 md:columns-2 gap-8">
              <h3 className="font-semibold uppercase tracking-widest mb-2 text-ink">Disclosures</h3>
              <ul className="list-disc pl-4 space-y-2 mb-8">
                {statement.assumptions.map((ass, i) => <li key={i}>{ass}</li>)}
              </ul>
              
              <h3 className="font-semibold uppercase tracking-widest mb-2 text-ink mt-8 md:mt-0">Data sources</h3>
              <ul className="space-y-1">
                {statement.dataSources.map(ds => (
                  <li key={ds.id} className="flex justify-between">
                    <span>{ds.label}</span>
                    <span className="font-mono uppercase text-[10px]">{ds.mode}</span>
                  </li>
                ))}
              </ul>
            </div>
            
          </div>
        ) : null}
      </div>
    </Shell>
  );
}
