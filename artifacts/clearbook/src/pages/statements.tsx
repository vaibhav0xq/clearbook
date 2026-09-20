import { useMemo, useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { ShieldCheck, Clock, Loader2, AlertTriangle } from "lucide-react";

import { useListStatements, useCreateStatement, type CostMethod } from "@workspace/api-client-react";
import { useCostMethod } from "@/hooks/use-cost-method";
import { useStage } from "@/components/layout/stage";
import { formatUSD, formatDate, truncateHash, formatDay } from "@/lib/format";
import { DataTable, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/data-table";
import { PageHeader, Panel, Skeleton, EmptyState, ErrorState, Pill, MethodologyLink, SectionTitle } from "@/components/surface";
import { Reveal } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

/** YYYY-MM-DD of a moment's UTC day, optionally with the day of month replaced. */
function utcDay(d: Date, overrides: { day?: number } = {}): string {
  const day = overrides.day ?? d.getUTCDate();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const MONTH_YEAR = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const DAY_SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Mirrors the title the API assigns when none is given, so the placeholder matches the stored title. */
function suggestedTitle(start: string, end: string): string {
  if (!DAY_PATTERN.test(start) || !DAY_PATTERN.test(end)) return "Statement";
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "Statement";
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
  const sameMonth = sameYear && s.getUTCMonth() === e.getUTCMonth();
  const lastDay = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() + 1, 0)).getUTCDate();
  if (sameMonth && s.getUTCDate() === 1 && e.getUTCDate() === lastDay) return `Statement for ${MONTH_YEAR.format(s)}`;
  return `Statement ${sameYear ? DAY_SHORT.format(s) : formatDay(s)} to ${formatDay(e)}`;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type Preset = "thisMonth" | "lastMonth" | "qtd" | "ytd";
const PRESETS: { value: Preset; label: string }[] = [
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "qtd", label: "Quarter to date" },
  { value: "ytd", label: "Year to date" },
];

const PROOF: Record<string, { label: string; className: string; Icon: typeof ShieldCheck }> = {
  confirmed: { label: "Confirmed", className: "text-success", Icon: ShieldCheck },
  simulated: { label: "Simulated", className: "text-primary", Icon: ShieldCheck },
  pending: { label: "Pending", className: "text-muted-foreground", Icon: Clock },
  failed: { label: "Failed", className: "text-destructive", Icon: AlertTriangle },
  none: { label: "Not notarized", className: "text-muted-foreground", Icon: Clock },
};

const INPUT =
  "h-10 w-full rounded-lg border hairline bg-white/[0.03] px-3 text-[14px] text-foreground transition-colors focus:border-primary/50 focus:bg-white/[0.05] focus:outline-none";

export default function Statements() {
  const [, params] = useRoute("/w/:address/statements");
  const address = params?.address || "";
  const { method } = useCostMethod();
  const [, setLocation] = useLocation();

  const { data: statements, isLoading, error } = useListStatements(address);
  const createStatement = useCreateStatement();

  const count = statements?.length ?? 0;
  useStage({
    caption:
      count > 0
        ? `${count} ${count === 1 ? "statement" : "statements"} generated for this ledger.`
        : "A statement records holdings, trades and realized gains for a chosen period.",
  });

  // Statement periods are UTC calendar days on the server, so the form works in UTC days as well.
  const today = utcDay(new Date());
  const [newStart, setNewStart] = useState(utcDay(new Date(), { day: 1 }));
  const [newEnd, setNewEnd] = useState(today);
  const [newTitle, setNewTitle] = useState("");

  const applyPreset = (preset: Preset) => {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    if (preset === "thisMonth") {
      setNewStart(utcDay(now, { day: 1 }));
      setNewEnd(today);
    } else if (preset === "lastMonth") {
      setNewStart(utcDay(new Date(Date.UTC(y, m - 1, 1))));
      setNewEnd(utcDay(new Date(Date.UTC(y, m, 0))));
    } else if (preset === "qtd") {
      setNewStart(utcDay(new Date(Date.UTC(y, m - (m % 3), 1))));
      setNewEnd(today);
    } else {
      setNewStart(utcDay(new Date(Date.UTC(y, 0, 1))));
      setNewEnd(today);
    }
  };

  // Validation happens on the client first so the message is immediate. The API repeats the same checks.
  const problem = useMemo(() => {
    if (!DAY_PATTERN.test(newStart) || !DAY_PATTERN.test(newEnd)) return "Enter both dates as YYYY-MM-DD.";
    if (newEnd < newStart) return "The end date must be on or after the start date.";
    if (newStart > today) return "The period cannot start in the future.";
    return null;
  }, [newStart, newEnd, today]);
  const endsInFuture = !problem && newEnd > today;

  const handleCreate = async () => {
    if (problem) return;
    try {
      const res = await createStatement.mutateAsync({
        address,
        data: {
          periodStart: newStart,
          periodEnd: newEnd,
          method: method as CostMethod,
          ...(newTitle.trim() ? { title: newTitle.trim() } : {}),
        },
      });
      setLocation(`/w/${address}/statements/${res.id}`);
    } catch {
      // The mutation state carries the error into the form.
    }
  };

  const defaultTitle = suggestedTitle(newStart, newEnd > today ? today : newEnd);

  return (
    <>
      <PageHeader
        title="Statements"
        description="A statement fixes holdings, trades and realized gains for a period. Its hash can be notarized on Solana and checked by anyone."
      />

      <div className="grid grid-cols-1 gap-10 pb-16 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12 xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* List */}
        <section className="flex min-w-0 flex-col gap-4">
          <SectionTitle aside={statements && statements.length > 0 ? <span className="num">{statements.length} {statements.length === 1 ? "statement" : "statements"}</span> : null}>
            Generated statements
          </SectionTitle>
          {isLoading ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : error ? (
            <ErrorState title="Unable to load statements" message={error.data?.message ?? error.message} />
          ) : statements ? (
            statements.length === 0 ? (
              <Reveal>
                <EmptyState
                  title="No statements yet"
                  description="Choose a period to generate the first statement for this ledger."
                />
              </Reveal>
            ) : (
              <div className="flex flex-col gap-6">
                <DataTable>
                  <TableHeader>
                    <TableHead>Statement</TableHead>
                    <TableHead className="hidden xl:table-cell">Method</TableHead>
                    <TableHead className="hidden md:table-cell">Generated</TableHead>
                    <TableHead className="hidden xl:table-cell">Document hash</TableHead>
                    <TableHead className="hidden md:table-cell">Proof</TableHead>
                    <TableHead align="right">Closing value</TableHead>
                  </TableHeader>
                  <TableBody>
                    {statements.map((stmt, i) => {
                      const proof = PROOF[stmt.proofStatus] ?? PROOF.none;
                      return (
                        <TableRow key={stmt.id} index={i} onClick={() => setLocation(`/w/${address}/statements/${stmt.id}`)}>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Link
                                href={`/w/${address}/statements/${stmt.id}`}
                                className="text-[14px] text-foreground transition-colors hover:text-primary focus:outline-none focus-visible:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {stmt.title}
                              </Link>
                              <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                <span className="num">
                                  {formatDay(stmt.periodStart)} to {formatDay(stmt.periodEnd)}
                                </span>
                                <Pill className="px-1.5 py-[2px] text-[9px] xl:hidden">{stmt.method}</Pill>
                              </span>
                              <span className={cn("flex items-center gap-1.5 text-[11px] md:hidden", proof.className)}>
                                <proof.Icon className="h-3.5 w-3.5" />
                                {proof.label}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden xl:table-cell">
                            <Pill tone="amber">{stmt.method}</Pill>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <div className="flex flex-col gap-1">
                              <span className="num text-[13px] text-muted-foreground">{formatDate(stmt.generatedAt)}</span>
                              <span className="num text-[11px] text-muted-foreground/70 xl:hidden" title={stmt.hash}>
                                {truncateHash(stmt.hash, 4)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden xl:table-cell">
                            <span className="num text-[13px] text-muted-foreground" title={stmt.hash}>
                              {truncateHash(stmt.hash, 6)}
                            </span>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <span className={cn("flex items-center gap-1.5 text-[13px]", proof.className)}>
                              <proof.Icon className="h-4 w-4" />
                              {proof.label}
                            </span>
                          </TableCell>
                          <TableCell align="right">
                            <span className="num text-[14px] text-foreground">{formatUSD(stmt.closingValue)}</span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </DataTable>
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  The document hash is the SHA-256 of the statement body. Notarizing posts it in a memo transaction from your wallet and the proof column tracks
                  that transaction. <MethodologyLink>Read how statements are built</MethodologyLink>
                </p>
              </div>
            )
          ) : null}
        </section>
        {/* Generate */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Reveal>
            <Panel className="flex flex-col gap-6 p-6">
              <span className="label">Generate statement</span>
              <form
                className="flex flex-col gap-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleCreate();
                }}
              >
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => applyPreset(preset.value)}
                      className="rounded-full border hairline bg-white/[0.03] px-3.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <div className="flex flex-col gap-2.5">
                    <label htmlFor="stmt-start" className="label">
                      Start date
                    </label>
                    <input id="stmt-start" type="date" max={today} value={newStart} onChange={(e) => setNewStart(e.target.value)} className={cn(INPUT, "num")} />
                  </div>
                  <div className="flex flex-col gap-2.5">
                    <label htmlFor="stmt-end" className="label">
                      End date
                    </label>
                    <input id="stmt-end" type="date" min={newStart} value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className={cn(INPUT, "num")} />
                  </div>
                </div>

                <div className="flex flex-col gap-2.5">
                  <label htmlFor="stmt-title" className="label">
                    Title, optional
                  </label>
                  <input id="stmt-title" type="text" value={newTitle} maxLength={120} onChange={(e) => setNewTitle(e.target.value)} placeholder={defaultTitle} className={INPUT} />
                </div>

                <div className="mt-2 flex flex-col gap-4 border-t hairline pt-6">
                  <div className="text-[13px] text-muted-foreground">
                    {createStatement.isError ? (
                      <span className="flex items-center gap-1.5 text-destructive">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        {createStatement.error?.data?.message || createStatement.error?.message || "The statement could not be generated."}
                      </span>
                    ) : problem ? (
                      <span className="flex items-center gap-1.5 text-primary">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        {problem}
                      </span>
                    ) : endsInFuture ? (
                      <span>
                        Costed under {method.toUpperCase()}. The period ends today, since later days have no activity yet.
                      </span>
                    ) : (
                      <span>Costed under {method.toUpperCase()}, the method selected above.</span>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={createStatement.isPending || problem !== null}
                    className="group flex items-center justify-center gap-2 rounded-full bg-foreground px-6 py-2 text-[13px] font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
                  >
                    {createStatement.isPending && <Loader2 className="h-4 w-4 animate-spin text-background" />}
                    {createStatement.isPending ? "Generating" : "Generate"}
                  </button>
                </div>
              </form>
            </Panel>
          </Reveal>
        </aside>

      </div>
    </>
  );
}
