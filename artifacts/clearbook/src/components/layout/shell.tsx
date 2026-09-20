import { ReactNode, useId } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateWalletQueries } from "@/lib/wallet-queries";
import { RefreshCw, AlertTriangle, AlertCircle, ArrowLeft } from "lucide-react";
import { useGetWalletStatus, useIndexWallet, useResetWallet, getGetWalletStatusQueryKey, type CostMethod } from "@workspace/api-client-react";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { useCostMethod } from "@/hooks/use-cost-method";
import { truncateAddress, formatTime } from "@/lib/format";
import { PageTransition } from "@/components/motion/page-transition";
import { EASE_OUT } from "@/components/motion/reveal";
import { StageProvider, StageView } from "@/components/layout/stage";
import { Brand } from "@/components/layout/brand";
import { cn } from "@/lib/utils";

interface ShellProps {
  address: string;
  children: ReactNode;
}

const METHODS: { value: CostMethod; label: string; hint: string }[] = [
  { value: "fifo", label: "FIFO", hint: "Oldest lots first" },
  { value: "lifo", label: "LIFO", hint: "Newest lots first" },
  { value: "hifo", label: "HIFO", hint: "Highest cost first" },
];

export function CostMethodControl({ compact = false }: { compact?: boolean }) {
  const { method, setMethod } = useCostMethod();
  const id = useId();
  return (
    <div
      role="radiogroup"
      aria-label="Cost method"
      className={cn("relative flex items-center rounded-full border hairline bg-white/[0.03] p-0.5", compact ? "h-8" : "h-9")}
    >
      {METHODS.map((m) => {
        const active = m.value === method;
        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={m.hint}
            onClick={() => setMethod(m.value)}
            className={cn(
              "relative z-10 rounded-full px-3 num text-[11px] tracking-[0.12em] transition-colors duration-300",
              compact ? "h-7" : "h-8",
              active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={`cost-method-pill-${id}`}
                className="absolute inset-0 -z-10 rounded-full bg-primary shadow-[0_0_24px_-4px_hsl(var(--primary)/0.7)]"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

function SectionTabs({ address, className, layoutId }: { address: string; className?: string; layoutId: string }) {
  const [location] = useLocation();
  const items = [
    { label: "Portfolio", path: `/w/${address}` },
    { label: "Tax lots", path: `/w/${address}/lots` },
    { label: "Trade", path: `/w/${address}/trade` },
    { label: "Statements", path: `/w/${address}/statements` },
    { label: "Activity", path: `/w/${address}/activity` },
    { label: "Corporate actions", path: `/w/${address}/events` },
  ];
  const isActive = (path: string) => location === path || (path !== `/w/${address}` && location.startsWith(path));
  return (
    <nav className={cn("flex items-center gap-1", className)} aria-label="Ledger sections">
      {items.map((item) => {
        const active = isActive(item.path);
        return (
          <Link
            key={item.path}
            href={item.path}
            className={cn(
              "relative shrink-0 px-3 py-3 text-[13px] transition-colors duration-300",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-x-3 -bottom-px h-px bg-primary"
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function Shell({ address, children }: ShellProps) {
  const [location] = useLocation();
  const queryClient = useQueryClient();

  const { data: status, error: statusError, refetch } = useGetWalletStatus(address, {
    query: {
      queryKey: getGetWalletStatusQueryKey(address),
      refetchInterval: (query) => (query.state.data?.state === "indexing" ? 2000 : false),
    },
  });

  const indexWallet = useIndexWallet();
  const resetWallet = useResetWallet();

  const handleRefresh = async () => {
    await indexWallet.mutateAsync({ address });
    await invalidateWalletQueries(queryClient, address);
    refetch();
  };

  // Simulated sales are recorded events, so clearing them is a ledger change and goes through the API.
  const handleClearSimulated = async () => {
    await resetWallet.mutateAsync({ address });
    await invalidateWalletQueries(queryClient, address);
    refetch();
  };

  const stateTone =
    status?.state === "ready"
      ? "bg-success"
      : status?.state === "indexing"
        ? "bg-primary"
        : status?.state === "partial"
          ? "bg-primary"
          : status?.state === "empty" || status?.state === "not_indexed"
            ? "bg-muted-foreground"
            : status
              ? "bg-destructive"
              : "bg-muted-foreground";

  const busy = indexWallet.isPending || resetWallet.isPending || status?.state === "indexing";

  const identity = status && !statusError && (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
        <span className="relative flex h-2 w-2">
          {status.state === "indexing" && (
            <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-60 animate-pulse-dot", stateTone)} />
          )}
          <span className={cn("relative inline-flex h-2 w-2 rounded-full", stateTone)} />
        </span>
        <span className="font-medium text-foreground">{status.displayAddress}</span>
        <span className="num text-[12px] text-muted-foreground">{status.isDemo ? "Demo ledger" : truncateAddress(address, 6)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
        <span>
          {status.state === "indexing"
            ? `Indexing. ${status.eventsIndexed} events from ${status.signaturesScanned} signatures`
            : status.lastIndexedAt
              ? `Indexed ${formatTime(status.lastIndexedAt)}`
              : "Not indexed yet"}
        </span>
        {status.simulatedTrades > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="num">{status.simulatedTrades}</span> simulated {status.simulatedTrades === 1 ? "sale" : "sales"}
            <button
              type="button"
              onClick={handleClearSimulated}
              disabled={busy}
              className="pointer-events-auto text-[12px] text-primary underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
            >
              Clear
            </button>
          </span>
        )}
        <button
          type="button"
          onClick={handleRefresh}
          disabled={busy}
          className="group pointer-events-auto inline-flex items-center gap-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3 w-3 transition-transform duration-700 ease-out-expo group-hover:rotate-180", busy && "animate-spin")} />
          {status.state === "not_indexed" ? "Index wallet" : "Refresh"}
        </button>
      </div>
    </div>
  );

  // The demo description reads once, on the portfolio page. Warnings follow the reader to every page.
  const demoNote = status?.isDemo && status.message && location === `/w/${address}` ? status.message.replace(/^Demo ledger loaded\.\s*/, "") : null;
  const notices =
    status && !statusError && (status.warnings?.length > 0 || status.state === "error" || status.state === "partial" || demoNote) ? (
      <div className="flex flex-col gap-2 text-[13px] text-muted-foreground">
        {demoNote && (
          <span className="flex items-start gap-2.5 leading-relaxed">
            <span className="label mt-[3px] shrink-0 text-primary">Demo</span>
            <span>{demoNote}</span>
          </span>
        )}
        {(status.state === "error" || status.state === "partial") && !status.isDemo && <span className="text-destructive">{status.message}</span>}
        {status.warnings?.map((w, i) => (
          <span key={i} className="flex items-center gap-1.5 text-destructive">
            <AlertTriangle className="h-3 w-3" /> {w}
          </span>
        ))}
      </div>
    ) : null;

  return (
    <StageProvider address={address}>
      <div aria-hidden className="grain-overlay" />
      {/* The stage takes a larger share on wide monitors so the reading panel keeps a sensible measure. */}
      <div className="relative min-h-screen lg:grid lg:grid-cols-[minmax(0,1fr)_clamp(360px,40vw,720px)] desk:grid-cols-[minmax(0,1fr)_clamp(720px,44vw,1160px)]">

        {/* Stage. First in the DOM so it sits at the top on small screens and on the right on large ones. */}
        <aside className="sticky top-0 z-0 h-[46vh] min-h-[320px] lg:order-2 lg:h-screen lg:min-h-0 lg:self-start lg:border-l lg:hairline">
          <StageView address={address} />
          {/* Small screens: brand and wallet float over the scene. Large screens: the ledger identity does. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-4 px-5 pt-4 md:px-8 md:pt-5 desk:px-10 desk:pt-6">
            <div className="pointer-events-auto lg:hidden">
              <Brand />
            </div>
            <div className="pointer-events-auto hidden lg:block">{identity}</div>
            <div className="pointer-events-auto flex shrink-0 items-center gap-3">
              <div className="hidden lg:block">
                <CostMethodControl />
              </div>
              <WalletConnectButton />
            </div>
          </div>
        </aside>

        {/* Reading panel */}
        <div className="relative z-10 flex min-h-screen flex-col bg-background lg:order-1 lg:min-h-screen">
          <header className="sticky top-0 z-40 border-b hairline bg-background/80 backdrop-blur-xl">
            <div className="hidden items-center gap-8 px-6 md:px-10 lg:flex desk:px-14">
              <Brand />
              <SectionTabs address={address} layoutId="nav-active" className="min-w-0 overflow-x-auto scrollbar-none" />
            </div>
            <div className="flex items-center justify-between gap-3 px-3 lg:hidden">
              <SectionTabs address={address} layoutId="nav-active-small" className="min-w-0 overflow-x-auto scrollbar-none" />
              <div className="shrink-0 py-1.5 pr-1">
                <CostMethodControl compact />
              </div>
            </div>
          </header>

          <AnimatePresence initial={false}>
            {(identity || notices) && (
              <motion.div
                key="ledger-strip"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.15 }}
                className={cn("flex flex-col gap-3 px-6 pt-6 md:px-10 desk:px-14", !notices && "lg:hidden")}
              >
                <div className="lg:hidden">{identity}</div>
                {notices}
              </motion.div>
            )}
          </AnimatePresence>

          <main className="flex flex-1 flex-col px-6 py-8 md:px-10 md:py-10 desk:px-14 desk:py-12">
            {statusError ? (
              <PageTransition className="mx-auto my-16 w-full max-w-xl">
                <div className="flex flex-col items-center gap-4 rounded-2xl border hairline p-10 text-center">
                  <AlertCircle className="h-7 w-7 text-destructive" />
                  <h3 className="display text-3xl text-foreground">
                    {statusError.status === 400 ? "That is not a Solana address" : "Unable to load this ledger"}
                  </h3>
                  <p className="max-w-md break-all text-sm leading-relaxed text-muted-foreground">{statusError.data?.message ?? statusError.message}</p>
                  <Link href="/" className="mt-2 inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.12em] text-primary transition-colors hover:text-foreground">
                    <ArrowLeft className="h-3.5 w-3.5" /> Back to lookup
                  </Link>
                </div>
              </PageTransition>
            ) : (
              <PageTransition key={location} className="flex flex-1 flex-col">
                {children}
              </PageTransition>
            )}
          </main>

          <footer className="flex flex-col justify-between gap-3 px-6 pb-8 pt-4 text-[12px] text-muted-foreground md:flex-row md:items-center md:px-10 desk:px-14">
            <span>Figures are rebuilt from public Solana history. Estimates are labeled. Nothing here is tax advice.</span>
            <Link href="/methodology" className="transition-colors hover:text-foreground">
              Methodology
            </Link>
          </footer>
        </div>
      </div>
    </StageProvider>
  );
}
