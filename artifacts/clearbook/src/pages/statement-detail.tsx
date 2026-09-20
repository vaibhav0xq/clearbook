import { useState } from "react";
import { Link, useRoute } from "wouter";
import { ExternalLink, ShieldCheck, Download, Clock, AlertTriangle, Copy, Check, ArrowUpRight } from "lucide-react";

import { useGetStatement, usePrepareNotarization, useSubmitNotarization, getGetStatementQueryKey, getPrepareNotarizationQueryKey } from "@workspace/api-client-react";
import { formatUSD, formatQuantity, formatDateTime, formatMultiplier, issuerLabel, formatDay } from "@/lib/format";
import { useStageContext, useStage } from "@/components/layout/stage";
import { NotarizeButton } from "@/components/notarize-button";
import { useWalletSession } from "@/lib/wallet";
import { Figure } from "@/components/figure";
import { DataTable, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/data-table";
import { Panel, Skeleton, ErrorState, Pill, SectionTitle } from "@/components/surface";
import { Reveal } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

const PROOF_TITLE: Record<string, string> = {
  none: "Not notarized",
  pending: "Proof pending",
  confirmed: "Proof confirmed on Solana",
  simulated: "Simulated proof recorded",
  failed: "Proof failed",
};

function CopyHash({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be denied inside an iframe. The hash stays selectable as text.
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border hairline bg-white/[0.03] px-3 text-[12px] text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground"
      aria-label="Copy document hash"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function SummaryRow({ label, value, tone = false, muted = false }: { label: string; value: string; tone?: number | false; muted?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("num", muted ? "text-muted-foreground" : tone === false ? "text-foreground" : tone > 0 ? "text-success" : tone < 0 ? "text-destructive" : "text-foreground")}>
        {value}
      </span>
    </li>
  );
}

export default function StatementDetail() {
  const [, params] = useRoute("/w/:address/statements/:statementId");
  const address = params?.address || "";
  const statementId = params?.statementId || "";

  const { data: statement, isLoading, error, refetch: refetchStatement } = useGetStatement(statementId, {
    query: { queryKey: getGetStatementQueryKey(statementId), enabled: !!statementId },
  });

  const { hoverMint, setHoverMint } = useStageContext();
  useStage({
    focusMint: hoverMint,
    caption: statement ? `Statement for ${formatDay(statement.periodStart)} to ${formatDay(statement.periodEnd)}.` : null,
  });

  const wallet = useWalletSession();
  const payer = wallet.publicKey && wallet.publicKey === address ? wallet.publicKey : undefined;
  const notarizationParams = payer ? { payer } : {};

  const canNotarize = statement?.proof.status === "none" || statement?.proof.status === "failed";
  const {
    data: notarizationPayload,
    error: notarizationError,
    isLoading: isPayloadLoading,
    refetch: refetchPayload,
  } = usePrepareNotarization(statementId, notarizationParams, {
    query: { queryKey: getPrepareNotarizationQueryKey(statementId, notarizationParams), enabled: !!statementId && !!canNotarize },
  });

  const submitNotarization = useSubmitNotarization();

  const handleNotarizeSubmit = async (params: { statementId: string; data: { signature?: string | null; simulate: boolean } }) => {
    await submitNotarization.mutateAsync(params);
    await refetchStatement();
    await refetchPayload();
  };

  // Transfers without a price at receipt or exit carry no value, so a plain zero would overstate what is known.
  const unpricedIn = statement?.activity.filter((e) => e.kind === "transfer_in" && e.grossAmount === null).length ?? 0;
  const unpricedOut = statement?.activity.filter((e) => e.kind === "transfer_out" && e.grossAmount === null).length ?? 0;
  const transferValue = (total: number | null | undefined, unpriced: number) => {
    if (unpriced === 0) return formatUSD(total);
    const label = `${unpriced} unpriced`;
    return total && total > 0 ? `${formatUSD(total)}, ${label}` : label;
  };

  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const csvUrl = `${apiBase}/statements/${statementId}/export.csv`;
  const pdfUrl = `${apiBase}/statements/${statementId}/export.pdf`;

  return (
    <div className="flex flex-col gap-12 pb-16 md:gap-16">
      {isLoading ? (
        <div className="flex flex-col gap-10">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      ) : error ? (
        <ErrorState title="Unable to load statement" message={error.data?.message ?? error.message} />
      ) : statement ? (
        <>
          <Reveal>
            <div className="flex flex-col gap-8 md:gap-12">
              <div className="flex flex-col justify-between gap-8 md:flex-row md:items-start">
                <div className="flex flex-col gap-3">
                  <Link href={`/w/${address}/statements`} className="label text-primary transition-colors hover:text-foreground">
                    Statements
                  </Link>
                  <h1 className="display text-[26px] leading-tight text-foreground md:text-[30px]">{statement.title}</h1>
                  <div className="mt-1 flex flex-col gap-1 text-[14px] text-muted-foreground">
                    <span className="num">
                      {formatDay(statement.periodStart)} to {formatDay(statement.periodEnd)}
                    </span>
                    <span>
                      {statement.isDemo ? "Demo ledger" : "Account"} <span className={cn(!statement.isDemo && "num")}>{statement.displayAddress}</span>
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-5 md:items-end">
                  <div className="flex items-center gap-3">
                    <Pill tone="amber">{statement.method}</Pill>
                    <Pill>
                      Generated <span className="num">{formatDateTime(statement.generatedAt)}</span>
                    </Pill>
                  </div>
                  <div className="flex items-center gap-3">
                    <a
                      href={csvUrl}
                      download
                      className="group flex items-center gap-2 rounded-full border hairline bg-white/[0.03] px-4 py-1.5 text-[12px] text-foreground transition-colors hover:border-white/20 hover:bg-white/[0.06]"
                    >
                      <Download className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-foreground" />
                      CSV
                    </a>
                    <a
                      href={pdfUrl}
                      download
                      className="group flex items-center gap-2 rounded-full border hairline bg-white/[0.03] px-4 py-1.5 text-[12px] text-foreground transition-colors hover:border-white/20 hover:bg-white/[0.06]"
                    >
                      <Download className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-foreground" />
                      PDF
                    </a>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Panel className="relative flex flex-col gap-4 overflow-hidden p-6 md:justify-between md:p-8">
                  <div className="absolute left-0 top-0 h-full w-1 bg-primary" />
                  <div className="flex min-w-0 flex-col gap-2">
                    <span className="label">Document hash, SHA-256</span>
                    <span className="num break-all text-[13px] tracking-[0.04em] text-foreground md:text-[14px]">{statement.hash}</span>
                    <span className="text-[12px] text-muted-foreground">Computed over the statement body. The CSV and PDF exports are built from the same rows.</span>
                  </div>
                  <div className="mt-2 flex self-start">
                    <CopyHash value={statement.hash} />
                  </div>
                </Panel>

                {/* Proof */}
                <Panel
                  className={cn(
                    "flex flex-col justify-between gap-8 border p-6 md:p-8",
                    statement.proof.status === "confirmed"
                      ? "border-success/30 bg-success/[0.03]"
                      : statement.proof.status === "simulated"
                        ? "border-primary/30 bg-primary/[0.03]"
                        : statement.proof.status === "failed"
                          ? "border-destructive/30 bg-destructive/[0.03]"
                          : "hairline",
                  )}
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2.5">
                      {statement.proof.status === "confirmed" ? (
                        <ShieldCheck className="h-5 w-5 text-success" />
                      ) : statement.proof.status === "simulated" ? (
                        <ShieldCheck className="h-5 w-5 text-primary" />
                      ) : statement.proof.status === "failed" ? (
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                      ) : (
                        <Clock className="h-5 w-5 text-muted-foreground" />
                      )}
                      <h3 className="display text-[20px] text-foreground">{PROOF_TITLE[statement.proof.status] ?? "Proof"}</h3>
                    </div>
                    <p className="text-[13px] leading-relaxed text-muted-foreground">
                      {statement.proof.status === "none"
                        ? statement.isDemo
                          ? "Post the document hash in a memo transaction from the account's wallet. Anyone can then compare the statement against the memo without trusting this site. A demo ledger has no wallet, so it records a simulated proof."
                          : "Post the document hash in a memo transaction from this account's wallet. Anyone can then compare the statement against the memo without trusting this site."
                        : statement.proof.message}
                    </p>
                    <div className="flex flex-col gap-1.5 text-[12px] text-muted-foreground">
                      <span>
                        Memo <span className="num break-all text-foreground/80">{statement.proof.memo}</span>
                      </span>
                      {statement.proof.signer && (
                        <span>
                          Signer <span className="num text-foreground/80">{statement.proof.signer}</span>
                        </span>
                      )}
                      {statement.proof.confirmedAt && (
                        <span>
                          Confirmed <span className="num text-foreground/80">{formatDateTime(statement.proof.confirmedAt)}</span>
                        </span>
                      )}
                    </div>
                    {statement.proof.explorerUrl && (
                      <a
                        href={statement.proof.explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex w-fit items-center gap-1.5 text-[12px] text-primary underline-offset-4 transition-colors hover:text-foreground hover:underline"
                      >
                        View on explorer <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col gap-2">
                    {canNotarize && notarizationPayload && (statement.isDemo || payer) && <NotarizeButton payload={notarizationPayload} onSubmit={handleNotarizeSubmit} />}
                    {canNotarize && notarizationPayload && !statement.isDemo && !payer && (
                      <span className="text-[12px] leading-relaxed text-muted-foreground">
                        {wallet.connected ? "The connected wallet does not own this ledger." : "Connect the wallet that owns this ledger to sign the memo."}
                      </span>
                    )}
                    {canNotarize && !notarizationPayload && isPayloadLoading && (
                      <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
                        <Clock className="h-3.5 w-3.5 animate-spin" /> Preparing the memo transaction
                      </span>
                    )}
                    {canNotarize && !notarizationPayload && notarizationError && (
                      <div className="flex flex-col gap-1.5">
                        <span className="break-words text-[12px] text-destructive">{notarizationError.data?.message ?? notarizationError.message}</span>
                        <button type="button" onClick={() => refetchPayload()} className="self-start text-[12px] text-foreground underline underline-offset-4 transition-colors hover:text-primary">
                          Try again
                        </button>
                      </div>
                    )}
                  </div>
                </Panel>
              </div>
            </div>
          </Reveal>

          {/* Summary */}
          <section className="flex flex-col gap-10">
            <Reveal>
              <div className="grid grid-cols-2 gap-x-8 gap-y-8 border-t hairline pt-6 md:grid-cols-4">
                <Figure label="Opening value" value={statement.totals.openingValue} size="md" sub={`${formatDay(statement.periodStart)} holdings at current marks`} />
                <Figure label="Closing value" value={statement.totals.closingValue} size="md" sub={`${formatDay(statement.periodEnd)} holdings at current marks`} />
                <Figure
                  label="Realized"
                  value={statement.totals.realizedPnl}
                  tone
                  size="md"
                  sub={`${formatUSD(statement.totals.realizedShortTerm)} short term, ${formatUSD(statement.totals.realizedLongTerm)} long term`}
                />
                <Figure label="Income estimate" value={statement.totals.incomeEstimate} size="md" sub="From multiplier increases" />
              </div>
            </Reveal>

            <Reveal delay={0.05}>
              <div className="grid grid-cols-1 gap-x-16 gap-y-0 text-[13px] md:grid-cols-2">
                <ul className="flex flex-col divide-y divide-white/[0.06] border-t hairline">
                  <SummaryRow label="Purchases" value={formatUSD(statement.totals.purchases)} />
                  <SummaryRow label="Proceeds from sales" value={formatUSD(statement.totals.proceeds)} />
                  <SummaryRow label="Transfers in, valued at receipt" value={transferValue(statement.totals.transfersInValue, unpricedIn)} muted={unpricedIn > 0} />
                  <SummaryRow label="Transfers out, valued at exit" value={transferValue(statement.totals.transfersOutValue, unpricedOut)} muted={unpricedOut > 0} />
                  <SummaryRow label="Fees" value={formatUSD(statement.totals.fees)} />
                </ul>
                <ul className="flex flex-col divide-y divide-white/[0.06] border-t hairline">
                  <SummaryRow label="Net contributions" value={formatUSD(statement.totals.netContributions)} />
                  <SummaryRow label="Unrealized at close" value={formatUSD(statement.totals.unrealizedPnl)} tone={statement.totals.unrealizedPnl ?? 0} />
                  <SummaryRow label="Trades" value={String(statement.totals.tradesCount)} />
                  <SummaryRow label="Corporate actions" value={String(statement.totals.corporateActionsCount)} />
                  <SummaryRow label="Positions at close" value={String(statement.positions.length)} />
                </ul>
              </div>
            </Reveal>
          </section>

          {/* Positions */}
          <section>
            <SectionTitle aside={<span>Marked with {statement.pricing.providerLabel}</span>}>Positions at period end</SectionTitle>
            {statement.positions.length === 0 ? (
              <Panel className="p-10 text-center text-[14px] text-muted-foreground">No positions were held at the end of this period.</Panel>
            ) : (
              <DataTable>
                <TableHeader>
                  <TableHead>Asset</TableHead>
                  <TableHead align="right" className="hidden lg:table-cell">Opening</TableHead>
                  <TableHead align="right">Quantity</TableHead>
                  <TableHead align="right">Close mark</TableHead>
                  <TableHead align="right" className="hidden md:table-cell">Cost basis</TableHead>
                  <TableHead align="right">Value</TableHead>
                  <TableHead align="right">Unrealized</TableHead>
                  <TableHead align="right" className="hidden lg:table-cell">Realized</TableHead>
                </TableHeader>
                <TableBody>
                  {statement.positions.map((pos, i) => (
                    <TableRow key={pos.mint} index={i} active={hoverMint === pos.mint} onMouseEnter={() => setHoverMint(pos.mint)} onMouseLeave={() => setHoverMint(null)}>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="flex items-center gap-2">
                            <span className="num text-[14px] tracking-[0.06em] text-foreground">{pos.symbol}</span>
                            {pos.basisStatus !== "complete" && <Pill tone="loss">{pos.basisStatus === "unknown" ? "Unknown cost" : "Partial cost"}</Pill>}
                          </span>
                          <span className="text-[12px] text-muted-foreground">
                            {pos.name} <span className="opacity-60">{issuerLabel(pos.issuer)}</span>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell align="right" className="hidden lg:table-cell">
                        <div className="flex flex-col items-end gap-1">
                          <span className="num text-foreground">{formatQuantity(pos.openingQuantity)}</span>
                          {pos.multiplier !== 1 && (
                            <span className="num text-[11px] text-muted-foreground">{formatMultiplier(pos.multiplier)}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell align="right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="num text-foreground">{formatQuantity(pos.closingQuantity)}</span>
                          <span className="num text-[11px] text-muted-foreground lg:hidden">
                            {Math.abs(pos.openingQuantity - pos.closingQuantity) < 1e-9 ? "Unchanged" : `From ${formatQuantity(pos.openingQuantity)}`}
                            {pos.multiplier !== 1 ? `, ${formatMultiplier(pos.multiplier)}` : ""}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell align="right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="num text-foreground">{formatUSD(pos.closingPrice)}</span>
                          <span className="text-[11px] text-muted-foreground">{pos.priceSource}</span>
                        </div>
                      </TableCell>
                      <TableCell align="right" className="hidden md:table-cell">
                        <div className="flex flex-col items-end gap-1">
                          <span className={cn("num", pos.costBasis === null ? "text-muted-foreground" : "text-foreground")}>
                            {pos.costBasis === null ? "Unknown" : formatUSD(pos.costBasis)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell align="right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="num text-foreground">{formatUSD(pos.closingValue)}</span>
                          <span className="num text-[11px] text-muted-foreground md:hidden">
                            {pos.costBasis === null ? "Unknown cost" : `${formatUSD(pos.costBasis)} cost`}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell align="right">
                        <div className="flex flex-col items-end gap-1">
                          <span className={cn("num", (pos.unrealizedPnl ?? 0) > 0 ? "text-success" : (pos.unrealizedPnl ?? 0) < 0 ? "text-destructive" : "text-foreground")}>
                            {formatUSD(pos.unrealizedPnl)}
                          </span>
                          {pos.realizedPnlInPeriod !== 0 && (
                            <span className={cn("num text-[11px] lg:hidden", pos.realizedPnlInPeriod > 0 ? "text-success" : "text-destructive")}>
                              {formatUSD(pos.realizedPnlInPeriod)} realized
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell align="right" className="hidden lg:table-cell">
                        <div className="flex flex-col items-end gap-1">
                          {pos.realizedPnlInPeriod !== 0 ? (
                            <span className={cn("num text-[14px]", pos.realizedPnlInPeriod > 0 ? "text-success" : "text-destructive")}>
                              {formatUSD(pos.realizedPnlInPeriod)}
                            </span>
                          ) : (
                            <span className="num text-muted-foreground">-</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </DataTable>
            )}
          </section>

          {/* Activity in period */}
          <section>
            <SectionTitle
              aside={
                <span>
                  {statement.activity.length} {statement.activity.length === 1 ? "event" : "events"}, {statement.corporateActions.length}{" "}
                  {statement.corporateActions.length === 1 ? "corporate action" : "corporate actions"}
                </span>
              }
            >
              Activity in period
            </SectionTitle>
            {statement.activity.length === 0 ? (
              <Panel className="p-10 text-center text-[14px] text-muted-foreground">No trades or transfers were recorded in this period.</Panel>
            ) : (
              <DataTable>
                <TableHeader>
                  <TableHead>Event</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead align="right">Quantity</TableHead>
                  <TableHead align="right">Price</TableHead>
                  <TableHead align="right" className="hidden md:table-cell">Fee</TableHead>
                  <TableHead align="right">Value</TableHead>
                  <TableHead align="right" className="hidden lg:table-cell">Realized</TableHead>
                </TableHeader>
                <TableBody>
                  {[...statement.activity].reverse().map((event, i) => (
                    <TableRow key={event.id} index={i} active={hoverMint === event.mint} onMouseEnter={() => setHoverMint(event.mint)} onMouseLeave={() => setHoverMint(null)}>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="text-[14px] text-foreground">{event.kindLabel}</span>
                          <span className="num text-[11px] text-muted-foreground">{formatDateTime(event.blockTime)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="num text-[14px] tracking-[0.08em] text-foreground">{event.symbol}</span>
                          <span className="text-[11px] text-muted-foreground">{event.venue ?? issuerLabel(event.issuer)}</span>
                        </div>
                      </TableCell>
                      <TableCell align="right">
                        <span className={cn("num text-[14px]", event.quantity > 0 ? "text-success" : event.quantity < 0 ? "text-destructive" : "text-foreground")}>
                          {event.quantity > 0 ? "+" : ""}
                          {formatQuantity(event.quantity)} sh
                        </span>
                      </TableCell>
                      <TableCell align="right">
                        <div className="flex flex-col items-end gap-1">
                          <span className={cn("num text-[14px]", event.pricePerShare !== null ? "text-foreground" : "text-muted-foreground")}>{formatUSD(event.pricePerShare)}</span>
                          {event.fee !== null && event.fee > 0 && <span className="num text-[11px] text-muted-foreground md:hidden">Fee {formatUSD(event.fee)}</span>}
                        </div>
                      </TableCell>
                      <TableCell align="right" className="hidden md:table-cell">
                        <div className="flex flex-col items-end gap-1">
                          {event.fee !== null && event.fee > 0 ? (
                            <span className="num text-[14px] text-foreground">{formatUSD(event.fee)}</span>
                          ) : (
                            <span className="num text-muted-foreground">-</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell align="right">
                        <div className="flex flex-col items-end gap-1">
                          <span className={cn("num text-[14px]", event.grossAmount !== null ? "text-foreground" : "text-muted-foreground")}>{formatUSD(event.grossAmount)}</span>
                          {event.realizedPnl !== null && (
                            <span className={cn("num text-[11px] lg:hidden", event.realizedPnl > 0 ? "text-success" : event.realizedPnl < 0 ? "text-destructive" : "text-muted-foreground")}>
                              {event.realizedPnl > 0 ? "+" : ""}
                              {formatUSD(event.realizedPnl)} realized
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell align="right" className="hidden lg:table-cell">
                        <div className="flex flex-col items-end gap-1">
                          {event.realizedPnl !== null ? (
                            <span className={cn("num text-[14px]", event.realizedPnl > 0 ? "text-success" : event.realizedPnl < 0 ? "text-destructive" : "text-muted-foreground")}>
                              {event.realizedPnl > 0 ? "+" : ""}
                              {formatUSD(event.realizedPnl)}
                            </span>
                          ) : (
                            <span className="num text-muted-foreground">-</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </DataTable>
            )}
            {statement.corporateActions.length > 0 && (
              <p className="mt-5 text-[12px] leading-relaxed text-muted-foreground">
                {statement.corporateActions.length === 1 ? "One corporate action" : `${statement.corporateActions.length} corporate actions`} changed share counts in this
                period.{" "}
                <Link href={`/w/${address}/events`} className="group inline-flex items-center gap-1 text-primary transition-colors hover:text-foreground">
                  See each event
                  <ArrowUpRight className="h-3 w-3 transition-transform duration-500 ease-out-expo group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
              </p>
            )}
          </section>

          {/* Assumptions and sources */}
          <section className="grid grid-cols-1 gap-10 border-t hairline pt-8 lg:grid-cols-2 lg:gap-16">
            <Reveal>
              <div className="flex flex-col gap-5">
                <span className="label">Disclosures and assumptions</span>
                <ul className="flex flex-col gap-3">
                  {statement.assumptions.map((line, i) => (
                    <li key={i} className="flex gap-3 text-[13px] leading-relaxed text-muted-foreground">
                      <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <div className="flex flex-col gap-5">
                <span className="label">Data sources</span>
                <div className="flex flex-col gap-4">
                  {statement.dataSources.map((ds) => (
                    <div key={ds.id} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[14px] text-foreground">{ds.label}</span>
                        <Pill tone={ds.mode === "live" ? "gain" : ds.mode === "demo" ? "amber" : "neutral"}>{ds.mode}</Pill>
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
  );
}
