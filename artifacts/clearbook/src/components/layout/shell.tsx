import { ReactNode, useId } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateWalletQueries } from "@/lib/wallet-queries";
import { RefreshCw, AlertTriangle, AlertCircle, ArrowLeft } from "lucide-react";
import { useGetWalletStatus, useIndexWallet, getGetWalletStatusQueryKey, type CostMethod } from "@workspace/api-client-react";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { useCostMethod } from "@/hooks/use-cost-method";
import { truncateAddress } from "@/lib/format";
import { PageTransition } from "@/components/motion/page-transition";
import { EASE_OUT } from "@/components/motion/reveal";
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

export function Brand({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("group flex items-center gap-2.5", className)} aria-label="Clearbook home">
      <span className="relative block h-6 w-6">
        <span className="absolute left-0 top-[3px] h-[5px] w-6 rounded-[2px] bg-foreground/90 transition-transform duration-500 ease-out-expo group-hover:translate-x-[3px]" />
        <span className="absolute left-0 top-[10px] h-[5px] w-6 rounded-[2px] bg-primary transition-transform duration-500 ease-out-expo group-hover:-translate-x-[3px]" />
        <span className="absolute left-0 top-[17px] h-[5px] w-6 rounded-[2px] bg-foreground/50 transition-transform duration-500 ease-out-expo group-hover:translate-x-[2px]" />
      </span>
      <span className="font-serif text-[22px] leading-none tracking-tight text-foreground">Clearbook</span>
    </Link>
  );
}

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

  const handleRefresh = async () => {
    await indexWallet.mutateAsync({ address });
    await invalidateWalletQueries(queryClient, address);
    refetch();
  };

  const navItems = [
    { label: "Portfolio", path: `/w/${address}` },
    { label: "Tax lots", path: `/w/${address}/lots` },
    { label: "Activity", path: `/w/${address}/activity` },
    { label: "Events", path: `/w/${address}/events` },
    { label: "Statements", path: `/w/${address}/statements` },
    { label: "Trade", path: `/w/${address}/trade` },
  ];
  const isActive = (path: string) => location === path || (path !== `/w/${address}` && location.startsWith(path));

  const stateTone =
    status?.state === "ready"
      ? "bg-success"
      : status?.state === "indexing"
        ? "bg-primary"
        : status?.state === "partial"
          ? "bg-primary"
          : status
            ? "bg-destructive"
            : "bg-muted-foreground";

  return (
    <div className="relative min-h-screen flex flex-col">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 grain" />
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[520px] grid-lines" />

      <header className="sticky top-0 z-50 px-3 pt-3 md:px-6">
        <motion.div
          initial={{ y: -24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, ease: EASE_OUT }}
          className="glass-strong mx-auto flex h-14 max-w-[1400px] items-center justify-between rounded-2xl px-3 md:px-4"
        >
          <div className="flex items-center gap-6 lg:gap-10">
            <Brand />
            <nav className="hidden lg:flex items-center gap-1" aria-label="Ledger sections">
              {navItems.map((item) => {
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={cn(
                      "relative rounded-full px-3.5 py-1.5 text-[13px] transition-colors duration-300",
                      active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="nav-active"
                        className="absolute inset-0 rounded-full bg-white/[0.06] border hairline"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      />
                    )}
                    <span className="relative z-10">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:block">
              <CostMethodControl />
            </div>
            <WalletConnectButton />
          </div>
        </motion.div>

        <div className="lg:hidden mx-auto max-w-[1400px] mt-2 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1 min-w-max px-1">
            {navItems.map((item) => {
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-[13px] border transition-colors",
                    active ? "glass text-foreground" : "border-transparent text-muted-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
            <div className="md:hidden ml-2">
              <CostMethodControl compact />
            </div>
          </div>
        </div>
      </header>

      <AnimatePresence initial={false}>
        {status && !statusError && (
          <motion.div
            key="ledger-strip"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.15 }}
            className="mx-auto w-full max-w-[1400px] px-6 md:px-10 pt-6"
          >
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
                <span className="relative flex h-2 w-2">
                  {status.state === "indexing" && (
                    <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-60 animate-pulse-dot", stateTone)} />
                  )}
                  <span className={cn("relative inline-flex h-2 w-2 rounded-full", stateTone)} />
                </span>
                <span className="font-medium text-foreground">{status.displayAddress}</span>
                <span className="num text-[12px] text-muted-foreground">{status.isDemo ? "Demo ledger" : truncateAddress(address, 6)}</span>
                <span className="hidden md:inline text-muted-foreground/40">|</span>
                <span className="text-muted-foreground">
                  {status.state === "indexing"
                    ? `Indexing. ${status.eventsIndexed} events from ${status.signaturesScanned} signatures`
                    : status.lastIndexedAt
                      ? `Indexed ${new Date(status.lastIndexedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                      : "Not indexed yet"}
                </span>
                {status.simulatedTrades > 0 && (
                  <span className="text-muted-foreground">
                    {status.simulatedTrades} simulated {status.simulatedTrades === 1 ? "sale" : "sales"}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={indexWallet.isPending || status.state === "indexing"}
                className="group inline-flex items-center gap-2 self-start rounded-full border hairline px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground hover:border-white/20 disabled:opacity-50"
              >
                <RefreshCw
                  className={cn(
                    "h-3.5 w-3.5 transition-transform duration-700 ease-out-expo group-hover:rotate-180",
                    (indexWallet.isPending || status.state === "indexing") && "animate-spin",
                  )}
                />
                {status.state === "not_indexed" ? "Index wallet" : "Refresh"}
              </button>
            </div>
            {(status.warnings?.length > 0 || status.state === "error" || status.state === "partial" || (status.isDemo && status.message)) && (
              <div className="mt-3 flex flex-col gap-1.5 text-[13px] text-muted-foreground">
                {status.isDemo && status.message && <span>{status.message}</span>}
                {(status.state === "error" || status.state === "partial") && !status.isDemo && (
                  <span className="text-destructive">{status.message}</span>
                )}
                {status.warnings?.map((w, i) => (
                  <span key={i} className="flex items-center gap-1.5 text-destructive">
                    <AlertTriangle className="h-3 w-3" /> {w}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-8 md:px-10 md:py-10 flex flex-col">
        {statusError ? (
          <PageTransition className="my-16 mx-auto w-full max-w-xl">
            <div className="glass rounded-2xl p-10 text-center flex flex-col items-center gap-4">
              <AlertCircle className="h-7 w-7 text-destructive" />
              <h3 className="display text-3xl text-foreground">
                {statusError.status === 400 ? "That is not a Solana address" : "Unable to load this ledger"}
              </h3>
              <p className="text-sm text-muted-foreground max-w-md break-all leading-relaxed">
                {statusError.data?.message ?? statusError.message}
              </p>
              <Link href="/" className="mt-2 inline-flex items-center gap-2 text-[12px] tracking-[0.12em] uppercase text-primary hover:text-foreground transition-colors">
                <ArrowLeft className="h-3.5 w-3.5" /> Back to lookup
              </Link>
            </div>
          </PageTransition>
        ) : (
          <PageTransition key={location} className="flex-1 flex flex-col">
            {children}
          </PageTransition>
        )}
      </main>

      <footer className="mx-auto w-full max-w-[1400px] px-6 md:px-10 pb-8 pt-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-[12px] text-muted-foreground">
        <span>Figures are rebuilt from public Solana history. Estimates are labelled. Nothing here is tax advice.</span>
        <Link href="/methodology" className="hover:text-foreground transition-colors">
          Methodology
        </Link>
      </footer>
    </div>
  );
}
