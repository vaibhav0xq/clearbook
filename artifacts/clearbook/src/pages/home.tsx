import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ArrowUpRight, Layers3, Radar, ShieldCheck } from "lucide-react";
import {
  useGetAppConfig,
  useGetPortfolio,
  useListLots,
  useListStatements,
  useListCorporateActions,
  getGetAppConfigQueryKey,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { useWalletSession } from "@/lib/wallet";
import { useCostMethod } from "@/hooks/use-cost-method";
import { formatUSD, formatQuantity, formatPercent } from "@/lib/format";
import { Brand, CostMethodControl } from "@/components/layout/shell";
import { Strata } from "@/components/three/strata";
import { buildStrata, reliefOrder } from "@/components/three/strata-data";
import { Reveal, Stagger, StaggerItem, EASE_OUT } from "@/components/motion/reveal";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { ScrambleText } from "@/components/motion/scramble-text";
import { Magnetic } from "@/components/motion/magnetic";
import { TiltCard } from "@/components/motion/tilt-card";
import { Panel, Pill } from "@/components/surface";
import { cn } from "@/lib/utils";

const DEMO = "demo-holder";

export default function Home() {
  const { data: config, isLoading } = useGetAppConfig({ query: { queryKey: getGetAppConfigQueryKey() } });
  const { method } = useCostMethod();
  const { data: demoPortfolio, error: demoError } = useGetPortfolio(DEMO, { method });
  const { data: demoLots } = useListLots(DEMO, { method, status: "open" });
  const { data: demoStatements } = useListStatements(DEMO);
  const { data: demoEvents } = useListCorporateActions(DEMO);

  const [addressInput, setAddressInput] = useState("");
  const [addressError, setAddressError] = useState<string | null>(null);
  const [hoverMint, setHoverMint] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const wallet = useWalletSession();
  const reduce = useReducedMotion();

  const columns = useMemo(() => (demoPortfolio ? buildStrata(demoPortfolio.positions, demoLots) : []), [demoPortfolio, demoLots]);
  const hovered = columns.find((c) => c.mint === hoverMint) ?? null;

  const handleAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = addressInput.trim();
    if (!value) return;
    const isDemo = config?.demoWallets?.some((demo) => demo.id === value);
    if (!isDemo && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) {
      setAddressError("Not a recognized format. Expected 32 to 44 base58 characters.");
      return;
    }
    setAddressError(null);
    setLocation(`/w/${value}`);
  };

  useEffect(() => {
    if (wallet.connected && wallet.publicKey) setLocation(`/w/${wallet.publicKey}`);
  }, [wallet.connected, wallet.publicKey, setLocation]);

  const latestStatement = demoStatements?.[0];
  const latestEvent = demoEvents?.find((e) => e.kind === "dividend_reinvested") ?? demoEvents?.[0];
  const featured = columns.find((c) => c.layers.length > 1) ?? columns[0];
  const featuredOrder = featured ? reliefOrder(featured, method).slice(0, 4) : [];

  return (
    <div className="relative min-h-screen flex flex-col overflow-x-clip">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 grain" />

      {/* Hero */}
      <section className="relative min-h-[100svh] flex flex-col">
        <div className="absolute inset-0 z-0 isolate">
          <Strata
            className="absolute inset-0 h-full w-full"
            columns={columns}
            method={method}
            mode="hero"
            onHoverColumn={setHoverMint}
            onSelectColumn={() => setLocation(`/w/${DEMO}`)}
          />
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-[60] w-full lg:w-[62%] bg-gradient-to-r from-background via-background/85 to-transparent" />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-[60] h-56 bg-gradient-to-t from-background to-transparent" />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-[60] h-32 bg-gradient-to-b from-background/80 to-transparent" />
        </div>

        <header className="relative z-10 px-5 md:px-10 pt-5">
          <motion.div
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, ease: EASE_OUT }}
            className="mx-auto flex max-w-[1400px] items-center justify-between"
          >
            <Brand />
            <nav className="flex items-center gap-2 md:gap-5">
              <Link href="/methodology" className="hidden sm:inline text-[13px] text-muted-foreground hover:text-foreground transition-colors">
                Methodology
              </Link>
              <Link href={`/w/${DEMO}`} className="hidden sm:inline text-[13px] text-muted-foreground hover:text-foreground transition-colors">
                Demo ledger
              </Link>
              <WalletConnectButton />
            </nav>
          </motion.div>
        </header>

        <div className="relative z-10 mx-auto flex w-full max-w-[1400px] flex-1 flex-col justify-center px-5 md:px-10 py-16 md:py-20 pointer-events-none">
          <div className="max-w-[640px] pointer-events-auto">
            <motion.span
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.1 }}
              className="label text-primary"
            >
              Post-trade accounting for tokenized stocks on Solana
            </motion.span>
            <h1 className="display mt-5 text-[52px] sm:text-[68px] md:text-[88px] text-foreground text-balance">
              {["The", "brokerage", "statement", "your", "wallet", "never", "gave", "you."].map((word, i) => (
                <motion.span
                  key={word + i}
                  className={cn("inline-block mr-[0.22em]", (word === "never" || word === "gave" || word === "you.") && "italic text-primary amber-glow")}
                  initial={reduce ? false : { opacity: 0, y: 28, filter: "blur(10px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.2 + i * 0.06 }}
                >
                  {word}
                </motion.span>
              ))}
            </h1>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: EASE_OUT, delay: 0.75 }}
              className="mt-7 max-w-[520px] text-[16px] md:text-[17px] leading-relaxed text-muted-foreground"
            >
              Clearbook rebuilds tax lots from public Solana history, reads dividends from the token itself, marks every
              position to market and produces a statement whose hash can be written on chain.
            </motion.p>

            <motion.form
              onSubmit={handleAddressSubmit}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: EASE_OUT, delay: 0.9 }}
              className="mt-10 max-w-[560px]"
            >
              <label htmlFor="lookup-address" className="label">
                Open any ledger
              </label>
              <div
                className={cn(
                  "glass-strong mt-3 flex h-14 items-center rounded-full pl-5 pr-1.5 transition-shadow duration-500 focus-within:ring-glow",
                  addressError && "ring-1 ring-destructive/60",
                )}
              >
                <input
                  id="lookup-address"
                  type="text"
                  placeholder="Paste a Solana address"
                  value={addressInput}
                  onChange={(e) => {
                    setAddressInput(e.target.value);
                    if (addressError) setAddressError(null);
                  }}
                  className="num flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground/60"
                  spellCheck={false}
                  autoComplete="off"
                />
                <Magnetic strength={0.2}>
                  <button
                    type="submit"
                    aria-label="Open ledger"
                    className="group flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform duration-500 ease-out-expo hover:scale-105"
                  >
                    <ArrowRight className="h-4.5 w-4.5 transition-transform duration-500 ease-out-expo group-hover:translate-x-0.5" />
                  </button>
                </Magnetic>
              </div>
              {addressError && <p className="mt-2 text-[12px] text-destructive">{addressError}</p>}

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-muted-foreground mr-1">Or start with a demo ledger</span>
                {isLoading && !config && (
                  <>
                    <span className="h-8 w-28 rounded-full shimmer" />
                    <span className="h-8 w-24 rounded-full shimmer" />
                  </>
                )}
                {config?.demoWallets?.map((demo, i) => (
                  <motion.button
                    key={demo.id}
                    type="button"
                    onClick={() => setLocation(`/w/${demo.id}`)}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: EASE_OUT, delay: 1.05 + i * 0.07 }}
                    title={demo.description}
                    className="group inline-flex h-8 items-center gap-2 rounded-full border hairline bg-white/[0.03] px-3.5 text-[12px] text-foreground transition-all duration-300 hover:border-primary/50 hover:bg-primary/10"
                  >
                    {demo.label}
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition-all duration-300 group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </motion.button>
                ))}
                {!wallet.available && (
                  <span className="text-[12px] text-muted-foreground/70 ml-1">No Solana wallet detected in this browser.</span>
                )}
              </div>
            </motion.form>
          </div>
        </div>

        {/* Scene caption */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.4 }}
          className="relative z-10 mx-auto w-full max-w-[1400px] px-5 md:px-10 pb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4 pointer-events-none"
        >
          <div className="pointer-events-auto flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot" />
              {demoError ? "Demo ledger unavailable. The API did not respond." : "Live from the demo-holder ledger"}
            </span>
            <span className="hidden md:inline">Each column is a position. Each layer is an open tax lot. Hover a layer to read it.</span>
          </div>
          <div className="pointer-events-auto flex items-center gap-3 md:justify-end">
            <span className="label">Relief method</span>
            <CostMethodControl compact />
          </div>
        </motion.div>

        {hovered && (
          <div className="pointer-events-none absolute right-6 md:right-10 top-[42%] z-10 hidden lg:block">
            <div className="text-right">
              <div className="num text-[12px] tracking-[0.14em] text-primary">{hovered.symbol}</div>
              <div className="display mt-1 text-[40px] text-foreground">{formatUSD(hovered.value)}</div>
              <div className="num mt-1 text-[12px] text-muted-foreground">
                {formatQuantity(hovered.quantity, 4)} shares in {hovered.layers.length} {hovered.layers.length === 1 ? "lot" : "lots"}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Ticker */}
      {demoPortfolio && demoPortfolio.positions.length > 0 && (
        <div className="relative border-y hairline bg-background/60 backdrop-blur-sm overflow-hidden">
          <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent z-10" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent z-10" />
          <div className={cn("flex w-max items-center gap-10 py-3", !reduce && "ticker")}>
            {[0, 1].map((copy) => (
              <div key={copy} className="flex items-center gap-10 pr-10" aria-hidden={copy === 1}>
                {demoPortfolio.positions.map((p) => (
                  <span key={`${copy}-${p.mint}`} className="flex items-center gap-3 text-[12px]">
                    <span className="num tracking-[0.12em] text-foreground">{p.symbol}</span>
                    <span className="num text-muted-foreground">{formatUSD(p.mark.price)}</span>
                    <span
                      className={cn(
                        "num",
                        (p.unrealizedPnlPct ?? 0) > 0 ? "text-success" : (p.unrealizedPnlPct ?? 0) < 0 ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {formatPercent(p.unrealizedPnlPct)}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">{p.mark.sourceLabel}</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Totals band */}
      <section className="mx-auto w-full max-w-[1400px] px-5 md:px-10 py-20 md:py-28">
        <Reveal>
          <div className="flex flex-col gap-3 max-w-2xl">
            <span className="label text-primary">What a wallet becomes</span>
            <h2 className="display text-[40px] md:text-[60px] text-foreground text-balance">
              Three numbers a token balance cannot tell you.
            </h2>
          </div>
        </Reveal>
        <Stagger className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              label: "Net value, marked to market",
              value: demoPortfolio?.totals.netValue,
              note: "Every position priced from Pyth, Jupiter or the issuer, with the source and age shown next to the mark.",
            },
            {
              label: "Unrealized under " + method.toUpperCase(),
              value: demoPortfolio?.totals.unrealizedPnl,
              tone: true,
              note: "Lots are matched to sales by the method you choose. Switch it and every figure recomputes.",
            },
            {
              label: "Income from multiplier growth",
              value: demoPortfolio?.totals.incomeEstimate,
              note: "Token-2022 multiplier increases are read from the mint and treated as reinvested dividends. Estimated values are labelled.",
            },
          ].map((item) => (
            <StaggerItem key={item.label}>
              <TiltCard className="h-full" max={4}>
                <Panel className="h-full p-7 md:p-8 flex flex-col gap-6 grain overflow-hidden">
                  <span className="label">{item.label}</span>
                  <span className="text-[40px] md:text-[46px] font-light leading-none tracking-[-0.03em] text-foreground">
                    <AnimatedNumber value={item.value} tone={item.tone} duration={1.4} />
                  </span>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">{item.note}</p>
                </Panel>
              </TiltCard>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* Three acts */}
      <section className="mx-auto w-full max-w-[1400px] px-5 md:px-10 pb-24 md:pb-32 flex flex-col gap-24 md:gap-32">
        {/* Act one: lots */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center">
          <Reveal className="lg:col-span-5 flex flex-col gap-5">
            <span className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border hairline bg-white/[0.03]">
                <Layers3 className="h-4 w-4 text-primary" />
              </span>
              <span className="label">01. Lots</span>
            </span>
            <h3 className="display text-[36px] md:text-[48px] text-foreground">Every purchase becomes a lot. Every sale relieves one.</h3>
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              Clearbook replays the wallet's history through a deterministic ledger. Swaps, transfers and wrapper
              conversions open and close lots in order, and the relief method decides which lot a sale takes first.
              Transfers in without a readable price stay marked unknown instead of being guessed.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <span className="text-[12px] text-muted-foreground">Try it</span>
              <CostMethodControl compact />
            </div>
          </Reveal>
          <Reveal className="lg:col-span-7" delay={0.1}>
            <Panel strong className="p-6 md:p-8">
              <div className="flex items-baseline justify-between gap-4">
                <div className="flex flex-col gap-1.5">
                  <span className="label">Relief order for {featured?.symbol ?? "a position"}</span>
                  <span className="text-[13px] text-muted-foreground">
                    {method === "fifo" ? "Oldest lots leave first." : method === "lifo" ? "Newest lots leave first." : "Highest cost per share leaves first."}
                  </span>
                </div>
                <Pill tone="amber">{method}</Pill>
              </div>
              <div className="mt-6 flex flex-col divide-y divide-white/[0.06]">
                {featuredOrder.length === 0 && (
                  <div className="py-6 text-[13px] text-muted-foreground">{demoError ? "Lots unavailable." : "Loading lots"}</div>
                )}
                {featuredOrder.map((lot, i) => (
                  <motion.div
                    key={lot.id}
                    layout
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="grid grid-cols-[32px_1fr_auto] md:grid-cols-[32px_1.2fr_1fr_1fr_auto] items-center gap-4 py-3.5"
                  >
                    <span className="num text-[12px] text-primary">#{i + 1}</span>
                    <span className="text-[13px] text-foreground">
                      {lot.openedAt ? format(new Date(lot.openedAt), "MMM d, yyyy") : "Opening balance"}
                    </span>
                    <span className="hidden md:inline num text-[13px] text-muted-foreground">{formatQuantity(lot.quantity, 4)} sh</span>
                    <span className="hidden md:inline num text-[13px] text-muted-foreground">
                      {lot.basisUnknown ? "Unknown cost" : `${formatUSD(lot.costPerShare)} / sh`}
                    </span>
                    <span
                      className={cn(
                        "num text-[13px] text-right",
                        (lot.unrealizedPnl ?? 0) > 0 ? "text-success" : (lot.unrealizedPnl ?? 0) < 0 ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {lot.unrealizedPnl === null ? "Unknown" : formatUSD(lot.unrealizedPnl)}
                    </span>
                  </motion.div>
                ))}
              </div>
            </Panel>
          </Reveal>
        </div>

        {/* Act two: events */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center">
          <Reveal className="lg:col-span-7 order-2 lg:order-1" delay={0.1}>
            <Panel strong className="p-6 md:p-8 relative overflow-hidden">
              <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
              {latestEvent ? (
                <div className="relative flex flex-col gap-6">
                  <div className="flex items-center justify-between gap-4">
                    <span className="label">Latest issuer event on the demo ledger</span>
                    <Pill tone={latestEvent.confidence === "confirmed" ? "gain" : "amber"}>{latestEvent.confidence}</Pill>
                  </div>
                  <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
                    <div>
                      <div className="num text-[12px] tracking-[0.14em] text-primary">{latestEvent.symbol}</div>
                      <div className="display mt-2 text-[34px] md:text-[42px] text-foreground">{latestEvent.kindLabel}</div>
                      <div className="mt-2 text-[13px] text-muted-foreground">{format(new Date(latestEvent.effectiveAt), "MMM d, yyyy")}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-6">
                      <div className="flex flex-col gap-1.5">
                        <span className="label">Before</span>
                        <span className="num text-[18px] text-foreground">{latestEvent.previousMultiplier.toFixed(6)}</span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <span className="label">After</span>
                        <span className="num text-[18px] text-foreground">{latestEvent.newMultiplier.toFixed(6)}</span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <span className="label">Value effect</span>
                        <span className={cn("num text-[18px]", (latestEvent.valueEffect ?? 0) >= 0 ? "text-success" : "text-destructive")}>
                          {latestEvent.valueEffect === null ? "Unknown" : formatUSD(latestEvent.valueEffect)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="text-[13px] leading-relaxed text-muted-foreground border-t hairline pt-5">{latestEvent.note}</p>
                </div>
              ) : (
                <div className="text-[13px] text-muted-foreground py-8">{demoError ? "Events unavailable." : "Loading issuer events"}</div>
              )}
            </Panel>
          </Reveal>
          <Reveal className="lg:col-span-5 order-1 lg:order-2 flex flex-col gap-5">
            <span className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border hairline bg-white/[0.03]">
                <Radar className="h-4 w-4 text-primary" />
              </span>
              <span className="label">02. Marks and events</span>
            </span>
            <h3 className="display text-[36px] md:text-[48px] text-foreground">Dividends are read from the token, not from a press release.</h3>
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              Issuers that pay through a Token-2022 interest bearing or scaled multiplier change the number without
              moving a coin. Clearbook watches the mint, classifies each change as a reinvested dividend or a split by
              its ratio and prices the effect at the mark of the day.
            </p>
          </Reveal>
        </div>

        {/* Act three: proof */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center">
          <Reveal className="lg:col-span-5 flex flex-col gap-5">
            <span className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border hairline bg-white/[0.03]">
                <ShieldCheck className="h-4 w-4 text-primary" />
              </span>
              <span className="label">03. Proof</span>
            </span>
            <h3 className="display text-[36px] md:text-[48px] text-foreground">A statement you can hand to anyone, with a hash anyone can check.</h3>
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              Each statement is a fixed period, a fixed method and a fixed set of figures. Its SHA-256 hash can be
              written to Solana in a memo. The verification checks that the memo contains the hash, nothing more and
              nothing less.
            </p>
            <Link href={`/w/${DEMO}/statements`} className="group inline-flex items-center gap-2 text-[13px] text-primary hover:text-foreground transition-colors">
              Open the demo statements
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-500 ease-out-expo group-hover:translate-x-1" />
            </Link>
          </Reveal>
          <Reveal className="lg:col-span-7" delay={0.1}>
            <TiltCard max={3}>
              <Panel strong className="p-6 md:p-8">
                {latestStatement ? (
                  <div className="flex flex-col gap-6">
                    <div className="flex items-center justify-between gap-4">
                      <span className="label">Latest statement</span>
                      <Pill tone={latestStatement.proofStatus === "none" ? "neutral" : "gain"}>
                        {latestStatement.proofStatus === "none" ? "Not notarized" : latestStatement.proofStatus.replace("_", " ")}
                      </Pill>
                    </div>
                    <div>
                      <div className="display text-[30px] md:text-[36px] text-foreground">{latestStatement.title}</div>
                      <div className="mt-2 text-[13px] text-muted-foreground">
                        {format(new Date(latestStatement.periodStart), "MMM d, yyyy")} to {format(new Date(latestStatement.periodEnd), "MMM d, yyyy")}. {latestStatement.method.toUpperCase()}.
                      </div>
                    </div>
                    <div className="rounded-xl border hairline bg-black/30 p-4">
                      <span className="label">SHA-256</span>
                      <div className="mt-2 break-all text-[12px] leading-relaxed text-foreground/90">
                        <ScrambleText text={latestStatement.hash} duration={1800} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="flex flex-col gap-1.5">
                        <span className="label">Closing value</span>
                        <span className="num text-[18px] text-foreground">{formatUSD(latestStatement.closingValue)}</span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <span className="label">Realized in period</span>
                        <span className={cn("num text-[18px]", latestStatement.realizedPnl > 0 ? "text-success" : latestStatement.realizedPnl < 0 ? "text-destructive" : "text-foreground")}>
                          {formatUSD(latestStatement.realizedPnl)}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 py-6">
                    <span className="label">Latest statement</span>
                    <p className="text-[13px] text-muted-foreground">
                      {demoError ? "Statements unavailable." : "No statement has been generated for the demo ledger yet. Open it and generate one to see its hash here."}
                    </p>
                  </div>
                )}
              </Panel>
            </TiltCard>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t hairline">
        <div className="mx-auto w-full max-w-[1400px] px-5 md:px-10 py-12 grid grid-cols-1 md:grid-cols-12 gap-10">
          <div className="md:col-span-5 flex flex-col gap-4">
            <Brand />
            <p className="text-[13px] leading-relaxed text-muted-foreground max-w-sm">
              Figures are rebuilt from public Solana history. Estimates are labelled as estimates. Nothing here is
              tax advice.
            </p>
          </div>
          <div className="md:col-span-4 flex flex-col gap-3">
            <span className="label">Data sources</span>
            {!isLoading && config?.sources ? (
              <ul className="flex flex-col gap-2">
                {config.sources.map((s) => (
                  <li key={s.id} className="flex items-center gap-2.5 text-[13px]">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        s.mode === "live" ? "bg-success" : s.mode === "demo" ? "bg-primary" : "bg-destructive",
                      )}
                    />
                    <span className="text-foreground">{s.label}</span>
                    <span className="num text-[11px] text-muted-foreground">{s.mode}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-[13px] text-muted-foreground">Loading</span>
            )}
          </div>
          <div className="md:col-span-3 flex flex-col gap-3">
            <span className="label">Read</span>
            <Link href="/methodology" className="text-[13px] text-foreground hover:text-primary transition-colors">
              Methodology
            </Link>
            <Link href={`/w/${DEMO}`} className="text-[13px] text-foreground hover:text-primary transition-colors">
              Demo ledger
            </Link>
            {config?.cluster && <span className="num text-[11px] text-muted-foreground mt-2">Cluster {config.cluster}</span>}
          </div>
        </div>
      </footer>
    </div>
  );
}
