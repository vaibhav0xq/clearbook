import { ReactNode, useCallback, useId, useState } from "react";
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

const STAGE_PREFERENCE_KEY = "clearbook.stage";

/** Whether the visitor wants the ledger band. Remembered in this browser. */
function useStagePreference(): [boolean, (shown: boolean) => void] {
  const [shown, setShownState] = useState(() => {
    try {
      return window.localStorage.getItem(STAGE_PREFERENCE_KEY) !== "hidden";
    } catch {
      return true;
    }
  });
  const setShown = useCallback((next: boolean) => {
    setShownState(next);
    try {
      window.localStorage.setItem(STAGE_PREFERENCE_KEY, next ? "shown" : "hidden");
    } catch {
      // Private mode. The choice lasts for the session.
    }
  }, []);
  return [shown, setShown];
}

function SectionTabs({ address, className, layoutId, height = "h-14" }: { address: string; className?: string; layoutId: string; height?: string }) {
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
              "relative flex shrink-0 items-center px-3 text-[13px] transition-colors duration-300",
              height,
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-x-3 bottom-0 h-px bg-primary"
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

  const base = `/w/${address}`;
  // The ledger band belongs to the pages that read from it: positions, lots and the sale preview.
  // Statements, activity and corporate actions are documents and tables and keep the full height.
  const stagePage = location === base || location.startsWith(`${base}/lots`) || location.startsWith(`${base}/trade`);
  const [stagePreferred, setStagePreferred] = useStagePreference();
  const showStage = stagePage && stagePreferred && !statusError;

  const stageControls = (
    <>
      <button
        type="button"
        onClick={() => setStagePreferred(false)}
        className="rounded-full border hairline bg-background/60 px-3 py-1.5 text-[12px] text-muted-foreground backdrop-blur transition-colors hover:border-white/20 hover:text-foreground"
      >
        Hide chart
      </button>
    </>
  );

  return (
    <StageProvider address={address}>
      <div aria-hidden className="grain-overlay" />
      <div className="relative flex min-h-screen flex-col bg-background">
        {/* Top bar */}
        <header className="sticky top-0 z-40 border-b hairline bg-background/85 backdrop-blur-xl">
          <div className="ledger flex h-14 items-center gap-6 xl:gap-10">
            <Brand />
            <SectionTabs address={address} layoutId="nav-active" className="hidden min-w-0 lg:flex" />
            <div className="ml-auto flex shrink-0 items-center gap-3">
              <div className="hidden md:block">
                <CostMethodControl />
              </div>
              <div className="md:hidden">
                <CostMethodControl compact />
              </div>
              <WalletConnectButton />
            </div>
          </div>
          <div className="ledger border-t hairline lg:hidden">
            <SectionTabs address={address} layoutId="nav-active-small" height="h-11" className="-mx-3 overflow-x-auto scrollbar-none" />
          </div>
        </header>

        {/* Ledger band */}
        <AnimatePresence initial={false}>
          {showStage && (
            <motion.section
              key="stage"
              aria-label="Ledger as columns of lots"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.5, ease: EASE_OUT }}
              className="relative z-0 overflow-hidden border-b hairline"
            >
              <div className="stage-band relative">
                <StageView address={address} topLeft={identity} topRight={stageControls} />
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Identity strip when the band is not shown, and notices on every page */}
        <AnimatePresence initial={false}>
          {((!showStage && identity) || notices) && (
            <motion.div
              key="ledger-strip"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: EASE_OUT }}
              className="ledger flex flex-col gap-3 pt-5"
            >
              {!showStage && identity && (
                <div className="flex items-start justify-between gap-6">
                  {identity}
                  {stagePage && !stagePreferred && (
                    <button
                      type="button"
                      onClick={() => setStagePreferred(true)}
                      className="shrink-0 text-[12px] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                    >
                      Show chart
                    </button>
                  )}
                </div>
              )}
              {notices}
            </motion.div>
          )}
        </AnimatePresence>

        <main className="ledger flex flex-1 flex-col py-8 md:py-10">
          {statusError ? (
            <PageTransition className="mx-auto my-16 w-full max-w-xl">
              <div className="flex flex-col items-center gap-4 rounded-2xl border hairline p-10 text-center">
                <AlertCircle className="h-7 w-7 text-destructive" />
                <h3 className="display text-[24px] text-foreground">
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

        <footer className="ledger flex flex-col justify-between gap-3 border-t hairline py-5 text-[12px] text-muted-foreground md:flex-row md:items-center">
          <span>Figures are rebuilt from public Solana history. Estimates are labeled. Nothing here is tax advice.</span>
          <Link href="/methodology" className="transition-colors hover:text-foreground">
            Methodology
          </Link>
        </footer>
      </div>
    </StageProvider>
  );
}
