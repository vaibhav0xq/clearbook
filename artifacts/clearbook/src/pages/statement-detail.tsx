import { useRoute } from "wouter";
import { useGetStatement, usePrepareNotarization, useSubmitNotarization, getGetStatementQueryKey, getPrepareNotarizationQueryKey } from "@workspace/api-client-react";
import { formatUSD, formatQuantity } from "@/lib/format";
import { ExternalLink, ShieldCheck, Download, Clock, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { useStageContext, useStage } from "@/components/layout/stage";
import { NotarizeButton } from "@/components/notarize-button";
import { useWalletSession } from "@/lib/wallet";
import { Figure } from "@/components/figure";
import { DataTable, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/data-table";
import { Panel, Skeleton, ErrorState, Pill, SectionTitle } from "@/components/surface";
import { Reveal, EASE_OUT } from "@/components/motion/reveal";
import { ScrambleText } from "@/components/motion/scramble-text";
import { cn } from "@/lib/utils";

export default function StatementDetail() {
  const [, params] = useRoute("/w/:address/statements/:statementId");
  const address = params?.address || "";
  const statementId = params?.statementId || "";

  const { data: statement, isLoading, error, refetch: refetchStatement } = useGetStatement(statementId, {
    query: { queryKey: getGetStatementQueryKey(statementId), enabled: !!statementId }
  });

  const { hoverMint, setHoverMint } = useStageContext();
  useStage({
    focusMint: hoverMint,
    caption: statement ? `Statement for ${format(new Date(statement.periodStart), "MMM d, yyyy")} to ${format(new Date(statement.periodEnd), "MMM d, yyyy")}` : null
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

  const formatDateString = (dateString: string) => {
    return format(new Date(dateString), "MMM d, yyyy");
  };

  return (
    <>
      <div className="flex flex-col gap-12 md:gap-16 pb-16">
        {isLoading ? (
          <div className="flex flex-col gap-10">
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
            <Skeleton className="h-96 w-full rounded-2xl" />
          </div>
        ) : error ? (
          <ErrorState title="Unable to load statement" message={error.message} />
        ) : statement ? (
          <>
            <Reveal>
              <div className="flex flex-col gap-8 md:gap-12">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-8">
                  <div className="flex flex-col gap-3">
                    <span className="label text-primary">Statement</span>
                    <h1 className="display text-[40px] md:text-[56px] text-foreground leading-none">{statement.title}</h1>
                    <div className="flex flex-col gap-1.5 mt-2 text-[15px] text-muted-foreground">
                      <span>{formatDateString(statement.periodStart)} to {formatDateString(statement.periodEnd)}</span>
                      <span>Account <span className="num">{statement.displayAddress}</span></span>
                    </div>
                  </div>
                  
                  <div className="flex flex-col md:items-end gap-5">
                    <div className="flex items-center gap-3">
                      <Pill tone="amber">{statement.method}</Pill>
                      <Pill>Generated {formatDateString(statement.generatedAt)}</Pill>
                    </div>
                    <div className="flex items-center gap-3">
                      <a href={csvUrl} download className="group flex items-center gap-2 rounded-full border hairline bg-white/[0.03] px-4 py-1.5 text-[12px] text-foreground transition-colors hover:bg-white/[0.06] hover:border-white/20">
                        <Download className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                        CSV
                      </a>
                      <a href={pdfUrl} download className="group flex items-center gap-2 rounded-full border hairline bg-white/[0.03] px-4 py-1.5 text-[12px] text-foreground transition-colors hover:bg-white/[0.06] hover:border-white/20">
                        <Download className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                        PDF
                      </a>
                    </div>
                  </div>
                </div>

                {/* Hero Hash */}
                <Panel className="p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 overflow-hidden relative">
                  <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                  <div className="flex flex-col gap-2 w-full">
                    <span className="label">Document hash (SHA-256)</span>
                    <ScrambleText text={statement.hash} className="text-[16px] md:text-[20px] text-foreground tracking-[0.1em] break-all" />
                  </div>
                </Panel>
              </div>
            </Reveal>

            {/* Proof Status */}
            <Reveal delay={0.1}>
              <Panel className={cn(
                "p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-8 border",
                statement.proof.status === 'confirmed' ? 'border-success/30 bg-success/[0.03]' :
                statement.proof.status === 'simulated' ? 'border-primary/30 bg-primary/[0.03]' :
                statement.proof.status === 'failed' ? 'border-destructive/30 bg-destructive/[0.03]' :
                'hairline'
              )}>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2.5">
                    {statement.proof.status === 'confirmed' ? <ShieldCheck className="h-5 w-5 text-success" /> :
                     statement.proof.status === 'simulated' ? <ShieldCheck className="h-5 w-5 text-primary" /> :
                     statement.proof.status === 'failed' ? <AlertTriangle className="h-5 w-5 text-destructive" /> :
                     <Clock className="h-5 w-5 text-muted-foreground" />}
                    <h3 className="display text-[22px] md:text-[26px] text-foreground">
                      {statement.proof.status === 'none' ? 'Not notarized' :
                       statement.proof.status === 'confirmed' ? 'On-chain proof confirmed' :
                       statement.proof.status === 'simulated' ? 'Simulated proof recorded' :
                       statement.proof.status === 'failed' ? 'Proof failed' :
                       'Proof pending'}
                    </h3>
                  </div>
                  <p className="text-[14px] text-muted-foreground max-w-xl leading-relaxed">
                    {statement.proof.message}
                  </p>
                  {statement.proof.explorerUrl && (
                    <a href={statement.proof.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[12px] text-primary hover:text-foreground transition-colors w-fit underline-offset-4 hover:underline">
                      View on explorer <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>

                <div className="flex flex-col md:items-end gap-2 shrink-0">
                  {canNotarize && notarizationPayload && (
                    <NotarizeButton payload={notarizationPayload} onSubmit={handleNotarizeSubmit} />
                  )}
                  {canNotarize && !notarizationPayload && isPayloadLoading && (
                    <span className="text-[12px] text-muted-foreground flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 animate-spin" /> Preparing payload...
                    </span>
                  )}
                  {canNotarize && !notarizationPayload && notarizationError && (
                    <div className="flex flex-col md:items-end gap-1.5">
                      <span className="text-[12px] text-destructive max-w-[240px] text-right break-words">{notarizationError.message}</span>
                      <button onClick={() => refetchPayload()} className="text-[12px] text-foreground hover:text-primary transition-colors underline underline-offset-4">
                        Try again
                      </button>
                    </div>
                  )}
                </div>
              </Panel>
            </Reveal>

            {/* Totals */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-8">
              <Reveal delay={0.15}><Figure label="Opening value" value={statement.totals.openingValue} size="md" /></Reveal>
              <Reveal delay={0.2}><Figure label="Closing value" value={statement.totals.closingValue} size="md" /></Reveal>
              <Reveal delay={0.25}><Figure label="Realized P/L" value={statement.totals.realizedPnl} tone size="md" /></Reveal>
              <Reveal delay={0.3}><Figure label="Income estimate" value={statement.totals.incomeEstimate} tone size="md" /></Reveal>
            </section>

            {/* Positions */}
            <section>
              <SectionTitle>Positions at period end</SectionTitle>
              {statement.positions.length === 0 ? (
                <Panel className="p-10 text-center text-[14px] text-muted-foreground">
                  No positions held at the end of this period.
                </Panel>
              ) : (
                <DataTable>
                  <TableHeader>
                    <TableHead>Asset</TableHead>
                    <TableHead align="right">Quantity</TableHead>
                    <TableHead align="right">Close mark</TableHead>
                    <TableHead align="right">Value</TableHead>
                    <TableHead align="right">Cost basis</TableHead>
                    <TableHead align="right">Unrealized P/L</TableHead>
                  </TableHeader>
                  <TableBody>
                    {statement.positions.map((pos, i) => (
                      <TableRow 
                        key={pos.mint} 
                        index={i}
                        active={hoverMint === pos.mint}
                        onMouseEnter={() => setHoverMint(pos.mint)}
                        onMouseLeave={() => setHoverMint(null)}
                      >
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="num text-[15px] tracking-[0.08em] text-foreground">{pos.symbol}</span>
                            <span className="text-[12px] text-muted-foreground">{pos.name}</span>
                          </div>
                        </TableCell>
                        <TableCell align="right">
                          <span className="num text-foreground">{formatQuantity(pos.closingQuantity)}</span>
                        </TableCell>
                        <TableCell align="right">
                          <div className="flex flex-col items-end gap-1">
                            <span className="num text-foreground">{formatUSD(pos.closingPrice)}</span>
                            <span className="text-[11px] text-muted-foreground">{pos.priceSource}</span>
                          </div>
                        </TableCell>
                        <TableCell align="right">
                          <span className="num text-foreground">{formatUSD(pos.closingValue)}</span>
                        </TableCell>
                        <TableCell align="right">
                          <div className="flex flex-col items-end gap-1">
                            <span className="num text-foreground">{formatUSD(pos.costBasis)}</span>
                            {pos.basisStatus !== 'complete' && (
                              <Pill tone="loss">{pos.basisStatus === 'unknown' ? 'Unknown' : 'Partial'}</Pill>
                            )}
                          </div>
                        </TableCell>
                        <TableCell align="right">
                          <span className={cn(
                            "num",
                            (pos.unrealizedPnl ?? 0) > 0 ? "text-success" : (pos.unrealizedPnl ?? 0) < 0 ? "text-destructive" : "text-foreground"
                          )}>
                            {formatUSD(pos.unrealizedPnl)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </DataTable>
              )}
            </section>

            {/* Assumptions and sources */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 pt-8 border-t hairline">
              <Reveal>
                <div className="flex flex-col gap-5">
                  <span className="label">Disclosures and assumptions</span>
                  <ul className="flex flex-col gap-3">
                    {statement.assumptions.map((ass, i) => (
                      <li key={i} className="flex gap-3 text-[13px] leading-relaxed text-muted-foreground">
                        <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                        {ass}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
              
              <Reveal delay={0.1}>
                <div className="flex flex-col gap-5">
                  <span className="label">Data sources</span>
                  <div className="flex flex-col gap-4">
                    {statement.dataSources.map(ds => (
                      <div key={ds.id} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[14px] text-foreground">{ds.label}</span>
                          <Pill tone={ds.mode === 'live' ? 'gain' : ds.mode === 'demo' ? 'amber' : 'neutral'}>{ds.mode}</Pill>
                        </div>
                        <span className="text-[13px] text-muted-foreground">{ds.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>
            </section>
          </>
        ) : null}
      </div>
    </>
  );
}