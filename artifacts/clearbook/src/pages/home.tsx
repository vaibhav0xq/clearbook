import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Lenis from "lenis";
import { Link, useLocation } from "wouter";
import {
  motion,
  useMotionTemplate,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { ArrowRight, ArrowUpRight } from "lucide-react";
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
import { formatUSD, formatQuantity } from "@/lib/format";
import { Brand } from "@/components/layout/brand";
import { Story } from "@/components/three/story";
import { buildStrata } from "@/components/three/strata-data";
import {
  CHAPTERS,
  CHAPTER_COUNT,
  METHOD_COPY,
  RELIEF_METHODS,
  chapterAnchor,
  chapterAt,
  colorize,
  copyVisibility,
  dividendWave,
  reliefStory,
  revealDigest,
  scan,
  seg,
  storySaleQuantity,
} from "@/components/three/story-data";
import { Magnetic } from "@/components/motion/magnetic";
import { Cursor, setCursorLabel } from "@/components/motion/cursor";
import { EASE_OUT } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

const DEMO = "demo-holder";

/** A column under the pointer turns the custom cursor into a label. Stable so the scene effect does not rerun. */
const onStoryHover = (mint: string | null) => setCursorLabel(mint ? "Open lots" : null);

/** Copy for one chapter. Fades and drifts with scroll, never with time. */
type ChapterSide = "left" | "right" | "bottom" | "center";

/** Copy placement per chapter. The gutter variable keeps the copy on the same line as the header. */
const SIDE_CLASS: Record<ChapterSide, string> = {
  left: "wide:left-[var(--shell-gutter)] wide:top-1/2 wide:-translate-y-1/2 wide:w-[min(48vw,700px)] wide:desk:w-[min(42vw,900px)]",
  right:
    "wide:left-auto wide:right-[var(--shell-gutter)] wide:top-1/2 wide:-translate-y-1/2 wide:w-[min(48vw,700px)] wide:desk:w-[min(42vw,900px)]",
  bottom: "wide:left-[var(--shell-gutter)] wide:right-[var(--shell-gutter)] wide:bottom-[7.5rem] wide:top-auto",
  center: "wide:left-1/2 wide:top-1/2 wide:w-[min(80vw,760px)] wide:-translate-x-1/2 wide:-translate-y-1/2 wide:text-center",
};

/** Whether the chapter that owns the copy is the one in view. Drives the masked headline reveals. */
const ChapterActive = createContext(true);

function Chapter({
  progress,
  index,
  children,
  className,
  side = "left",
  interactive = false,
}: {
  progress: MotionValue<number>;
  index: number;
  children: ReactNode;
  className?: string;
  side?: ChapterSide;
  interactive?: boolean;
}) {
  const opacity = useTransform(progress, (p) => copyVisibility(p, index));
  const y = useTransform(progress, (p) => {
    const l = p * CHAPTER_COUNT - index;
    if (index > 0 && l < 0.24) return (1 - seg(l, 0.04, 0.24)) * 36;
    if (index < CHAPTER_COUNT - 1 && l > 0.7) return -seg(l, 0.7, 0.9) * 36;
    return 0;
  });
  const blurPx = useTransform(opacity, (o) => (1 - o) * 6);
  const filter = useMotionTemplate`blur(${blurPx}px)`;
  const [shown, setShown] = useState(index === 0);
  const [active, setActive] = useState(index === 0);
  useMotionValueEvent(opacity, "change", (o) => {
    setShown(o > 0.01);
    setActive(o > 0.5);
  });

  return (
    <motion.div
      style={{ opacity, y, filter }}
      aria-hidden={!active}
      inert={!active}
      className={cn(
        "absolute inset-x-[var(--shell-gutter)] bottom-[max(6.5rem,14svh)] wide:inset-x-auto wide:bottom-auto",
        SIDE_CLASS[side],
        active && interactive ? "pointer-events-auto" : "pointer-events-none",
        shown ? "" : "invisible",
        className,
      )}
    >
      <ChapterActive.Provider value={active}>{children}</ChapterActive.Provider>
    </motion.div>
  );
}

/** A headline that rises out of a line mask when its chapter comes into view. */
function Masked({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const active = useContext(ChapterActive);
  const reduce = useReducedMotion();
  return (
    <span className={cn("block overflow-hidden pb-[0.12em] -mb-[0.12em]", className)}>
      <motion.span
        className="block"
        initial={false}
        animate={reduce ? { y: 0 } : { y: active ? "0%" : "110%" }}
        transition={{ duration: 0.9, ease: EASE_OUT, delay: active ? delay : 0 }}
      >
        {children}
      </motion.span>
    </span>
  );
}

function Eyebrow({ index, children }: { index?: number; children: ReactNode }) {
  return (
    <div className="eyebrow flex items-center gap-3 text-primary">
      {index !== undefined && <span className="text-foreground/50">{String(index).padStart(2, "0")}</span>}
      <span>{children}</span>
    </div>
  );
}

function Headline({ lines, className }: { lines: string[]; className?: string }) {
  return (
    <h2
      className={cn(
        "display-wide chapter-title mt-5 text-foreground",
        className,
      )}
    >
      {lines.map((line, i) => (
        <Masked key={line} delay={0.08 * i}>
          {line}
        </Masked>
      ))}
    </h2>
  );
}

function Lede({ children }: { children: ReactNode }) {
  return <p className="mt-5 max-w-[440px] text-[15px] leading-relaxed text-foreground/70 md:text-[17px] desk:max-w-[520px] desk:text-[19px]">{children}</p>;
}

function Figure({ label, children, className, caps = true }: { label: string; children: ReactNode; className?: string; caps?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span className={cn("label", !caps && "normal-case tracking-[0.02em] text-[12px]")}>{label}</span>
      <span className="num text-[30px] font-light leading-none tracking-[-0.03em] text-foreground md:text-[40px] desk:text-[48px]">{children}</span>
    </div>
  );
}

export default function Home() {
  const { data: config, isLoading } = useGetAppConfig({ query: { queryKey: getGetAppConfigQueryKey() } });
  const { method } = useCostMethod();
  const { data: demoPortfolio, error: demoError } = useGetPortfolio(DEMO, { method });
  const { data: demoLots, error: lotsError } = useListLots(DEMO, { method, status: "open" });
  const { data: demoStatements } = useListStatements(DEMO);
  const { data: demoEvents } = useListCorporateActions(DEMO);

  const [addressInput, setAddressInput] = useState("");
  const [addressError, setAddressError] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const wallet = useWalletSession();
  const reduce = useReducedMotion();

  const storyRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: progress } = useScroll({ target: storyRef, offset: ["start start", "end end"] });
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [chapter, setChapter] = useState(0);
  const [methodIndex, setMethodIndex] = useState(0);
  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 24));
  useMotionValueEvent(progress, "change", (p) => {
    const c = chapterAt(p);
    if (c !== chapter) setChapter(c);
  });

  // The wallet pages are a separate chunk. Fetch it once the landing is idle so opening a ledger
  // does not wait on the network.
  useEffect(() => {
    const prefetch = () => void import("@/pages/wallet-section");
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(prefetch, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(prefetch, 2500);
    return () => window.clearTimeout(id);
  }, []);

  const columns = useMemo(() => (demoPortfolio ? buildStrata(demoPortfolio.positions, demoLots) : []), [demoPortfolio, demoLots]);
  // Without lot data buildStrata shows one aggregate layer per position, which is the balance view, not a lot view.
  const lotsReady = !!demoLots;
  const featured = useMemo(
    () =>
      lotsReady
        ? columns.reduce<(typeof columns)[number] | null>((best, c) => (c.layers.length > (best?.layers.length ?? 0) ? c : best), null)
        : null,
    [columns, lotsReady],
  );
  const incomeEvent = useMemo(() => {
    const dividends = demoEvents?.filter((e) => e.kind === "dividend_reinvested" && columns.some((c) => c.mint === e.mint)) ?? [];
    return dividends[0] ?? demoEvents?.find((e) => columns.some((c) => c.mint === e.mint)) ?? null;
  }, [demoEvents, columns]);
  const incomeColumn = columns.find((c) => c.mint === incomeEvent?.mint) ?? null;
  const latestStatement = demoStatements?.[0] ?? null;
  const openLots = columns.reduce((s, c) => s + c.layers.length, 0);
  const saleQuantity = storySaleQuantity(featured ?? undefined);

  useMotionValueEvent(progress, "change", (p) => {
    const r = reliefStory(p, featured ?? undefined);
    const idx = r?.methodIndex ?? 0;
    if (idx !== methodIndex) setMethodIndex(idx);
  });

  // Scroll driven figures. Each is a string MotionValue so the DOM updates without re-rendering.
  const realizedText = useTransform(progress, (p) => {
    const r = reliefStory(p, featured ?? undefined);
    if (!r) return formatUSD(0);
    return r.realized === null ? "Unknown" : formatUSD(r.realized);
  });
  const sweepWidth = useTransform(progress, (p) => `${((reliefStory(p, featured ?? undefined)?.sweep ?? 0) * 100).toFixed(1)}%`);
  const multiplierText = useTransform(progress, (p) => {
    if (!incomeEvent) return "";
    const w = dividendWave(p);
    return (incomeEvent.previousMultiplier + (incomeEvent.newMultiplier - incomeEvent.previousMultiplier) * w).toFixed(6);
  });
  const effectOpacity = useTransform(progress, (p) => seg(dividendWave(p), 0.85, 1));
  const netText = useTransform(progress, (p) => formatUSD((demoPortfolio?.totals.netValue ?? 0) * colorize(p)));
  const unrealizedText = useTransform(progress, (p) => formatUSD((demoPortfolio?.totals.unrealizedPnl ?? 0) * colorize(p)));
  const digestText = useTransform(progress, (p) =>
    latestStatement ? revealDigest(latestStatement.hash, scan(p), Math.floor(p * 4000)) : "",
  );
  const cueOpacity = useTransform(progress, [0, 0.06], [1, 0]);

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

  // Smooth scrolling ties the scene to the wheel. Reduced motion keeps native scrolling.
  const lenisRef = useRef<Lenis | null>(null);
  useEffect(() => {
    if (reduce || window.matchMedia("(pointer: coarse)").matches) return;
    const lenis = new Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.9 });
    lenisRef.current = lenis;
    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [reduce]);

  const scrollToChapter = useCallback(
    (i: number) => {
      const el = storyRef.current;
      if (!el) return;
      const top = el.offsetTop + chapterAnchor(i) * (el.offsetHeight - window.innerHeight);
      if (lenisRef.current) lenisRef.current.scrollTo(top, { duration: 1.4 });
      else window.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
    },
    [reduce],
  );

  const activeMethod = RELIEF_METHODS[methodIndex];

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-clip">
      <Cursor />

      {/* Header */}
      <motion.header
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: EASE_OUT }}
        className="fixed inset-x-0 top-0 z-[80]"
      >
        <div
          className={cn(
            "shell flex items-center justify-between py-4 transition-all duration-500",
            scrolled && "py-3",
          )}
        >
          <Brand />
          <nav className="flex items-center gap-2 md:gap-4">
            <Link href="/methodology" className="hidden text-[13px] text-foreground/60 transition-colors hover:text-foreground sm:inline">
              Methodology
            </Link>
            <Link
              href={`/w/${DEMO}`}
              data-cursor="Open"
              className="group inline-flex h-9 items-center gap-2 rounded-full bg-primary pl-4 pr-3 text-[12px] font-medium text-primary-foreground transition-transform duration-500 ease-out-expo hover:scale-[1.03]"
            >
              Open demo ledger
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-500 ease-out-expo group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
            <div className="hidden sm:block">
              <WalletConnectButton />
            </div>
          </nav>
        </div>
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 -z-10 border-b border-white/[0.06] bg-background/70 backdrop-blur-xl transition-opacity duration-500",
            scrolled ? "opacity-100" : "opacity-0",
          )}
        />
      </motion.header>

      {/* Chapter rail */}
      <nav
        aria-label="Chapters"
        className="fixed right-6 top-1/2 z-[70] hidden -translate-y-1/2 flex-col gap-4 wide:lg:flex"
      >
        {CHAPTERS.map((c, i) => {
          const active = i === chapter;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => scrollToChapter(i)}
              aria-current={active ? "step" : undefined}
              data-cursor={active ? undefined : "Go"}
              className="group flex items-center justify-end gap-3 py-0.5"
            >
              <span
                className={cn(
                  "eyebrow !text-[10px] transition-all duration-500",
                  active ? "text-foreground opacity-100" : "text-foreground/40 opacity-0 group-hover:opacity-100",
                )}
              >
                {c.label}
              </span>
              <span
                className={cn(
                  "block h-px transition-all duration-500 ease-out-expo",
                  active ? "w-8 bg-primary" : "w-4 bg-foreground/25 group-hover:bg-foreground/60",
                )}
              />
            </button>
          );
        })}
      </nav>

      {/* Pinned story */}
      <div ref={storyRef} data-story className="relative" style={{ height: `${CHAPTER_COUNT * 108}vh` }}>
        <div className="sticky top-0 h-[100svh] overflow-hidden">
          <div className="absolute inset-0 isolate z-0">
            <Story
              className="absolute inset-0 h-full w-full"
              columns={columns}
              progress={progress}
              featuredMint={featured?.mint ?? null}
              incomeMint={incomeColumn?.mint ?? null}
              onSelectColumn={() => setLocation(`/w/${DEMO}`)}
              onHoverColumn={onStoryHover}
            />
            <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-[60] h-[52svh] bg-gradient-to-t from-background via-background/85 to-transparent wide:h-48 wide:via-background/40" />
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-[60] h-28 bg-gradient-to-b from-background/90 to-transparent" />
          </div>

          <div className="pointer-events-none absolute inset-0 z-10">
            {/* 00 Balance */}
            <Chapter progress={progress} index={0} className="wide:w-[min(56vw,880px)] wide:desk:w-[min(38vw,980px)]">
              <Eyebrow>Brokerage statements for tokenized stocks on Solana</Eyebrow>
              <h1 className="display-wide hero-title mt-6 text-foreground">
                {["A", "balance", "is", "not", "a", "statement."].map((word, i) => (
                  <motion.span
                    key={word + i}
                    className="mr-[0.24em] inline-block"
                    initial={reduce ? false : { opacity: 0, y: 30, filter: "blur(10px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    transition={{ duration: 1, ease: EASE_OUT, delay: 0.25 + i * 0.07 }}
                  >
                    {word}
                  </motion.span>
                ))}
              </h1>
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.9 }}
                className="mt-7 max-w-[420px] text-[16px] leading-relaxed text-foreground/70 md:text-[18px] desk:max-w-[520px] desk:text-[20px]"
              >
                Wallets count tokens. Clearbook keeps the books.
              </motion.p>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1, delay: 1.4 }}
                className="mt-8 flex items-center gap-3 text-[12px] text-foreground/55"
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", demoError ? "bg-destructive" : "bg-primary animate-pulse-dot")} />
                {demoError ? "Demo ledger unavailable. The API did not respond." : "Live from the demo ledger. Hover a column to read it."}
              </motion.div>
            </Chapter>

            {/* 01 Lots */}
            <Chapter progress={progress} index={1} side="right">
              <Eyebrow index={1}>Lots</Eyebrow>
              <Headline lines={["Every buy", "becomes a lot."]} />
              <Lede>Rebuilt from public Solana history. Oldest at the bottom.</Lede>
              {lotsError ? (
                <p className="mt-8 text-[13px] text-destructive/90">Open lots could not be loaded. {lotsError.message}</p>
              ) : (
                <Figure label="Open lots on the demo ledger" className="mt-8">
                  {lotsReady ? openLots : "..."} <span className="text-[16px] text-foreground/50">in {columns.length} positions</span>
                </Figure>
              )}
            </Chapter>

            {/* 02 Relief */}
            <Chapter progress={progress} index={2} side="left">
              <Eyebrow index={2}>Relief</Eyebrow>
              <Headline lines={["The same sale", "books a", "different gain."]} />
              <div className="mt-8 flex items-end gap-6 md:gap-8">
                {RELIEF_METHODS.map((m, i) => {
                  const active = i === methodIndex;
                  return (
                    <div key={m} className="relative flex flex-col gap-2.5">
                      <span
                        className={cn(
                          "display text-[30px] transition-colors duration-500 md:text-[38px]",
                          active ? "text-foreground" : "text-foreground/25",
                        )}
                      >
                        {METHOD_COPY[m].word}
                      </span>
                      <span className="relative block h-px w-full bg-foreground/15">
                        {active && <motion.span className="absolute inset-y-0 left-0 bg-primary" style={{ width: sweepWidth }} />}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-[14px] text-foreground/60">{METHOD_COPY[activeMethod].rule}</p>
              {featured ? (
                <div className="mt-8 flex flex-wrap items-end gap-x-10 gap-y-5">
                  <Figure caps={false} label={`Selling ${formatQuantity(saleQuantity, 2)} ${featured.symbol} realizes`}>
                    <motion.span className={cn(activeMethod && "text-success")}>{realizedText}</motion.span>
                  </Figure>
                  <span className="pb-1 text-[12px] text-foreground/45">Estimated at the current mark</span>
                </div>
              ) : (
                <p className="mt-8 text-[13px] text-foreground/45">
                  {lotsError ? "Lot data is unavailable, so the sale cannot be walked through." : "Loading lots."}
                </p>
              )}
            </Chapter>

            {/* 03 Income */}
            <Chapter progress={progress} index={3} side="right">
              <Eyebrow index={3}>Income</Eyebrow>
              <Headline lines={["Dividends arrive", "as multiplier", "changes."]} />
              <Lede>Read from the mint itself and booked as reinvested income.</Lede>
              {incomeEvent && (
                <div className="mt-8 flex flex-wrap items-end gap-x-10 gap-y-5">
                  <Figure caps={false} label={`${incomeEvent.symbol} multiplier, ${format(new Date(incomeEvent.effectiveAt), "MMM d, yyyy")}`}>
                    <motion.span>{multiplierText}</motion.span>
                  </Figure>
                  <motion.div style={{ opacity: effectOpacity }} className="flex flex-col gap-2 pb-0.5">
                    <span className="label">Value effect</span>
                    <span className="num text-[22px] leading-none text-success md:text-[26px]">
                      {incomeEvent.valueEffect === null ? "Unknown" : `+${formatUSD(incomeEvent.valueEffect)}`}
                    </span>
                  </motion.div>
                </div>
              )}
            </Chapter>

            {/* 04 Marks */}
            <Chapter progress={progress} index={4} side="bottom">
              <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between md:gap-12">
                <div className="md:max-w-[560px]">
                  <Eyebrow index={4}>Marks</Eyebrow>
                  <Headline lines={["Marked", "to market."]} />
                  <Lede>Pyth, Jupiter or the issuer, with the source and age beside every price.</Lede>
                </div>
                <div className="flex flex-wrap items-end gap-x-12 gap-y-6 md:justify-end md:border-l md:hairline md:pl-12">
                  <Figure label="Net value">
                    <motion.span>{netText}</motion.span>
                  </Figure>
                  <Figure label={`Unrealized, ${method.toUpperCase()}`}>
                    <motion.span className="text-success">{unrealizedText}</motion.span>
                  </Figure>
                </div>
              </div>
            </Chapter>

            {/* 05 Proof */}
            <Chapter progress={progress} index={5} side="left">
              <Eyebrow index={5}>Proof</Eyebrow>
              <Headline lines={["One hash", "per statement."]} />
              <Lede>Written to Solana in a memo so anyone can check it.</Lede>
              <div className="mt-8 flex flex-col gap-2">
                <span className="label">{latestStatement ? `SHA-256 of ${latestStatement.title}` : "SHA-256"}</span>
                {latestStatement ? (
                  <motion.span className="num break-all text-[15px] leading-relaxed text-foreground md:text-[17px]">{digestText}</motion.span>
                ) : (
                  <span className="text-[13px] text-foreground/55">
                    {demoError ? "Statements unavailable." : "No statement on the demo ledger yet. Generate one to see its hash here."}
                  </span>
                )}
              </div>
            </Chapter>

            {/* 06 Open */}
            <Chapter progress={progress} index={6} side="center" interactive>
              <div aria-hidden className="pointer-events-none absolute -inset-x-[30%] -inset-y-[45%] -z-10 bg-[radial-gradient(ellipse_at_center,rgba(10,10,11,0.82)_0%,rgba(10,10,11,0.45)_45%,transparent_72%)]" />
              <div className="wide:flex wide:justify-center">
                <Eyebrow index={6}>Open</Eyebrow>
              </div>
              <Headline lines={["Open a ledger."]} />
              <form onSubmit={handleAddressSubmit} className="mt-10 max-w-[640px] wide:mx-auto">
                <div
                  className={cn(
                    "glass-strong flex h-14 items-center rounded-full pl-5 pr-1.5 transition-shadow duration-500 focus-within:ring-glow md:h-[68px] md:pl-7 md:pr-2",
                    addressError && "ring-1 ring-destructive/60",
                  )}
                >
                  <input
                    id="lookup-address"
                    type="text"
                    aria-label="Solana address"
                    placeholder="Paste a Solana address"
                    value={addressInput}
                    onChange={(e) => {
                      setAddressInput(e.target.value);
                      if (addressError) setAddressError(null);
                    }}
                    className="num min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-foreground/40 md:text-[16px]"
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <Magnetic strength={0.2}>
                    <button
                      type="submit"
                      aria-label="Open ledger"
                      data-cursor="Open"
                      className="group flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform duration-500 ease-out-expo hover:scale-105 md:h-[52px] md:w-[52px]"
                    >
                      <ArrowRight className="h-4.5 w-4.5 transition-transform duration-500 ease-out-expo group-hover:translate-x-0.5" />
                    </button>
                  </Magnetic>
                </div>
                {addressError && <p className="mt-2 text-[12px] text-destructive wide:text-center">{addressError}</p>}
                <div className="mt-5 flex flex-wrap items-center gap-2 wide:justify-center">
                  <span className="mr-1 text-[12px] text-foreground/55">Or start with a demo ledger</span>
                  {isLoading && !config && (
                    <>
                      <span className="h-8 w-28 rounded-full shimmer" />
                      <span className="h-8 w-24 rounded-full shimmer" />
                    </>
                  )}
                  {config?.demoWallets?.map((demo) => (
                    <button
                      key={demo.id}
                      type="button"
                      onClick={() => setLocation(`/w/${demo.id}`)}
                      title={demo.description}
                      data-cursor="Open"
                      className="group inline-flex h-8 items-center gap-2 rounded-full border hairline bg-white/[0.03] px-3.5 text-[12px] text-foreground transition-all duration-300 hover:border-primary/50 hover:bg-primary/10"
                    >
                      {demo.label}
                      <ArrowUpRight className="h-3.5 w-3.5 text-foreground/50 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                    </button>
                  ))}
                </div>
                {!wallet.available && <p className="mt-4 text-[12px] text-foreground/45">No Solana wallet detected in this browser.</p>}
              </form>
            </Chapter>
          </div>

          {/* Scroll cue */}
          <motion.div
            style={{ opacity: cueOpacity }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 1.8 }}
            className="pointer-events-none absolute bottom-7 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-3 md:flex"
          >
            <span className="eyebrow !text-[10px] text-foreground/45">Scroll</span>
            <span className="relative block h-12 w-px overflow-hidden bg-foreground/15">
              <span className={cn("absolute left-0 top-0 h-4 w-px bg-primary", !reduce && "animate-cue")} />
            </span>
          </motion.div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t hairline bg-background">
        <div className="shell flex flex-col gap-8 py-10 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-3">
            <Brand />
            <p className="max-w-sm text-[13px] leading-relaxed text-foreground/55">
              Figures are rebuilt from public Solana history. Estimates are labeled. Nothing here is tax advice.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[13px]">
            {config?.sources?.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-2 text-foreground/70">
                <span className={cn("h-1.5 w-1.5 rounded-full", s.mode === "live" ? "bg-success" : s.mode === "demo" ? "bg-primary" : "bg-destructive")} />
                {s.label}
              </span>
            ))}
            <Link href="/methodology" className="text-foreground transition-colors hover:text-primary">
              Methodology
            </Link>
            {config?.cluster && <span className="num text-[11px] text-foreground/45">{config.cluster}</span>}
          </div>
        </div>
      </footer>
    </div>
  );
}
