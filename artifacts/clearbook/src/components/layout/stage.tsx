import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { getListLotsQueryKey, useGetPortfolio, useListLots } from "@workspace/api-client-react";
import { useCostMethod } from "@/hooks/use-cost-method";
import { Strata } from "@/components/three/strata";
import { buildStrata, buildStrataAsOf, ledgerSpan, type StrataColumn } from "@/components/three/strata-data";
import { Rewind } from "@/components/layout/rewind";
import { format } from "date-fns";
import { formatUSD, formatQuantity } from "@/lib/format";
import { EASE_OUT } from "@/components/motion/reveal";
import { useWalletIndexing } from "@/hooks/use-wallet-indexing";
import { cn } from "@/lib/utils";

/**
 * The stage is the one WebGL view of a ledger that stays mounted while the wallet pages change
 * beside it. Pages describe what the stage should show through `useStage`; hover flows both ways.
 */
export /**
 * The band draws at most this many columns. Market making wallets hold hundreds of positions and a
 * row that wide reads as noise and costs frames on a weak GPU, so the band keeps the largest ones
 * and the caption says how many are shown. Tables and totals still cover the whole ledger.
 */
const STAGE_COLUMNS = 12;

interface StageState {
  /** Column the camera closes on. Null keeps the whole ledger in frame. */
  focusMint?: string | "hover" | null;
  /** Lot drawn as if hovered, used when a table row is under the pointer. */
  highlightLayerId?: string | null;
  /** Sale preview: the layers a sale would relieve lift out of their column. */
  preview?: { mint: string; quantity: number } | null;
  /** One short line printed under the scene. A string so the page can pass it inline without re-rendering the stage every frame. */
  caption?: string | null;
}

/** Whether the columns carry real lot layers or one aggregate layer per position while lots load or fail. */
type LotDetail = "loading" | "error" | "ready";

interface StageContextValue extends StageState {
  /** Publishes page state. The owner token lets a page skip its cleanup when a newer page has already published. */
  publish: (owner: string, state: StageState) => void;
  release: (owner: string) => void;
  /** The ledger as it stands now. Pages always work from these. */
  columns: StrataColumn[];
  /** What the stage draws: the rewound ledger when a past date is set, otherwise the live columns. */
  /** Columns drawn on the band: the largest positions, plus the focused one when it sits further down. */
  stageColumns: StrataColumn[];
  /** Every column of the ledger being shown, present or rewound, for the caption totals. */
  ledgerColumns: StrataColumn[];
  lotDetail: LotDetail;
  unpricedCount: number;
  /** End of the past day the stage is rewound to. Null shows the ledger as it stands now. */
  asOf: Date | null;
  setAsOf: (date: Date | null) => void;
  /** Earliest and latest dates the stage can be rewound to. Null until lot history has loaded or when there is none. */
  span: { start: Date; end: Date } | null;
  history: "idle" | "loading" | "error" | "ready";
  /** Starts fetching closed lots. Called when the visitor reaches for the rewind control. */
  loadHistory: () => void;
}

const StageContext = createContext<StageContextValue | null>(null);

interface HoverStore {
  get: () => string | null;
  set: (mint: string | null) => void;
  subscribe: (listener: () => void) => () => void;
}

const HoverContext = createContext<HoverStore | null>(null);

export function StageProvider({ address, children }: { address: string; children: ReactNode }) {
  const { method } = useCostMethod();
  const hoverStoreRef = useRef<HoverStore | null>(null);
  if (!hoverStoreRef.current) {
    let value: string | null = null;
    const listeners = new Set<() => void>();
    hoverStoreRef.current = {
      get: () => value,
      set: (mint) => {
        if (value === mint) return;
        value = mint;
        listeners.forEach((listener) => listener());
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
  }
  const [state, setState] = useState<StageState>({});
  const ownerRef = useRef<string | null>(null);
  const { data: portfolio } = useGetPortfolio(address, { method });
  const { data: lots, error: lotsError } = useListLots(address, { method, status: "open" });
  const [asOf, setAsOfState] = useState<Date | null>(null);
  const [wantHistory, setWantHistory] = useState(false);
  // Closed lots are only fetched once the visitor reaches for the rewind control.
  const historyParams = useMemo(() => ({ method, status: "all" as const }), [method]);
  const { data: allLots, error: allLotsError } = useListLots(address, historyParams, {
    query: { queryKey: getListLotsQueryKey(address, historyParams), enabled: wantHistory },
  });
  const columns = useMemo(() => (portfolio ? buildStrata(portfolio.positions, lots) : []), [portfolio, lots]);
  const past = useMemo(() => (asOf && allLots ? buildStrataAsOf(allLots, asOf) : null), [asOf, allLots]);
  const ledgerColumns = past ?? columns;
  // A focused column further down the ledger takes the last slot, so the cap holds. Hover is not
  // part of this: it is read outside React for speed and only lands on columns already drawn.
  const stageColumns = useMemo(() => {
    if (ledgerColumns.length <= STAGE_COLUMNS) return ledgerColumns;
    const shown = ledgerColumns.slice(0, STAGE_COLUMNS);
    const focus = state.focusMint && state.focusMint !== "hover" ? state.focusMint : null;
    const focused = focus ? ledgerColumns.find((c) => c.mint === focus) : undefined;
    if (focused && !shown.includes(focused)) shown[STAGE_COLUMNS - 1] = focused;
    return shown;
  }, [ledgerColumns, state.focusMint]);
  const span = useMemo(() => ledgerSpan(allLots), [allLots]);
  const history = !wantHistory ? "idle" : allLots ? "ready" : allLotsError ? "error" : "loading";
  const loadHistory = useCallback(() => setWantHistory(true), []);
  const setAsOf = useCallback((date: Date | null) => {
    if (date) setWantHistory(true);
    setAsOfState(date);
  }, []);
  const lotDetail: LotDetail = lots ? "ready" : lotsError ? "error" : "loading";
  const unpricedCount = portfolio?.totals.unpricedValueCount ?? 0;

  // Pages exit with an animation, so the old page unmounts after the new one has published. Only the
  // current owner may clear the stage, otherwise the exiting page would wipe the new page's state.
  const publish = useCallback((owner: string, next: StageState) => {
    ownerRef.current = owner;
    setState(next);
  }, []);
  const release = useCallback((owner: string) => {
    if (ownerRef.current !== owner) return;
    ownerRef.current = null;
    setState({});
  }, []);

  const value = useMemo<StageContextValue>(
    () => ({ ...state, publish, release, columns, stageColumns, ledgerColumns, lotDetail, unpricedCount, asOf, setAsOf, span, history, loadHistory }),
    [state, publish, release, columns, stageColumns, ledgerColumns, lotDetail, unpricedCount, asOf, setAsOf, span, history, loadHistory],
  );
  return (
    <HoverContext.Provider value={hoverStoreRef.current}>
      <StageContext.Provider value={value}>{children}</StageContext.Provider>
    </HoverContext.Provider>
  );
}

export function useStageContext(): StageContextValue {
  const ctx = useContext(StageContext);
  if (!ctx) throw new Error("useStageContext must be used inside a wallet shell");
  return ctx;
}

function useHoverStore(): HoverStore {
  const store = useContext(HoverContext);
  if (!store) throw new Error("Hover hooks must be used inside a wallet shell");
  return store;
}

export function useHoverMint(): string | null {
  const store = useHoverStore();
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export function useSetHoverMint(): (mint: string | null) => void {
  return useHoverStore().set;
}

export function useHoverActive(mint: string | null | undefined): boolean {
  const store = useHoverStore();
  return useSyncExternalStore(store.subscribe, () => store.get() === mint, () => store.get() === mint);
}

/**
 * Declares what the stage shows while the calling page is mounted.
 */
export function useStage(state: StageState) {
  const ctx = useStageContext();
  const { publish, release } = ctx;
  const owner = useId();
  const { focusMint = null, highlightLayerId = null, preview = null, caption = null } = state;
  const previewMint = preview?.mint ?? null;
  const previewQuantity = preview?.quantity ?? 0;
  useEffect(() => {
    publish(owner, { focusMint, highlightLayerId, preview: previewMint ? { mint: previewMint, quantity: previewQuantity } : null, caption });
  }, [publish, owner, focusMint, highlightLayerId, previewMint, previewQuantity, caption]);
  useEffect(() => () => release(owner), [release, owner]);
  return { setHoverMint: useSetHoverMint(), columns: ctx.columns, lotDetail: ctx.lotDetail };
}

/**
 * The scene plus its overlays, laid out as a wide band under the top bar. The shell passes the
 * ledger identity for the top left corner and any controls for the top right.
 */
export function StageView({ address, topLeft, topRight, className }: { address: string; topLeft?: ReactNode; topRight?: ReactNode; className?: string }) {
  const { method } = useCostMethod();
  const ctx = useStageContext();
  const hoverMint = useHoverMint();
  const setHoverMint = useSetHoverMint();
  const [, setLocation] = useLocation();
  const indexing = useWalletIndexing(address);
  const { stageColumns: columns, ledgerColumns, focusMint, highlightLayerId, preview, caption, lotDetail, unpricedCount, asOf } = ctx;
  const focus = focusMint === "hover" ? hoverMint : focusMint;
  const lotsReady = lotDetail === "ready";
  const rewound = asOf !== null;
  const unknownBasis = (cols: StrataColumn[]) => cols.reduce((s, c) => s + c.layers.filter((l) => l.basisUnknown).length, 0);
  const costNote = (cols: StrataColumn[]) => {
    const n = unknownBasis(cols);
    return n > 0 ? ` at cost, ${n} ${n === 1 ? "lot" : "lots"} unknown` : " at cost";
  };
  const lotsNote = lotDetail === "loading" ? "lots loading" : "lots unavailable";
  const unpricedNote = unpricedCount > 0 ? `, ${unpricedCount} unpriced` : "";
  const onHover = useCallback((mint: string | null) => setHoverMint(mint), [setHoverMint]);
  const onSelect = useCallback((mint: string) => setLocation(`/w/${address}/lots?mint=${mint}`), [address, setLocation]);

  const shown = columns.find((c) => c.mint === (hoverMint ?? focus)) ?? null;
  const total = ledgerColumns.reduce((s, c) => s + c.value, 0);
  const shownNote = ledgerColumns.length > columns.length ? `. ${columns.length} largest shown` : "";

  return (
    <div className={cn("relative isolate z-0 h-full w-full overflow-hidden bg-background", className)}>
      <Strata
        className="absolute inset-0 h-full w-full"
        columns={columns}
        method={method}
        mode="stage"
        highlightMint={hoverMint}
        highlightLayerId={highlightLayerId}
        focusMint={focus ?? null}
        preview={rewound ? null : (preview ?? null)}
        onHoverColumn={onHover}
        onSelectColumn={onSelect}
      />
      {/* Edge scrims keep the overlays legible without boxing the scene. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-28 bg-gradient-to-t from-background via-background/60 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b from-background/70 to-transparent" />

      <div className="ledger pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-6 pt-4 md:pt-5">
        <div className="pointer-events-auto min-w-0">{topLeft}</div>
        <div className="pointer-events-auto flex shrink-0 items-center gap-4">
          <span className="hidden text-right text-[11px] leading-relaxed text-foreground/40 xl:block">
            {rewound ? "Height is cost basis at that date." : "Height is market value."}
            <br />
            Click a column to open its lots.
          </span>
          {topRight}
        </div>
      </div>

      <div className="ledger pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-8 pb-4 md:pb-5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={columns.length === 0 && indexing ? "indexing" : (shown?.mint ?? "all")}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.4, ease: EASE_OUT }}
              className="flex flex-col gap-1"
            >
              {columns.length === 0 && indexing ? (
                <>
                  <span className="display text-[20px] leading-none text-foreground md:text-[22px]">Indexing</span>
                  <span className="num text-[12px] text-foreground/60">Reading transaction history from Solana</span>
                </>
              ) : shown ? (
                <>
                  <span className="display text-[20px] leading-none text-foreground md:text-[22px]">{shown.symbol}</span>
                  <span className="num text-[12px] text-foreground/60">
                    {formatQuantity(shown.quantity, 4)} sh, {lotsReady || rewound ? `${shown.layers.length} ${shown.layers.length === 1 ? "lot" : "lots"}` : lotsNote},{" "}
                    {rewound ? `${formatUSD(shown.value)}${costNote([shown])}` : shown.value > 0 ? formatUSD(shown.value) : "unpriced"}
                  </span>
                </>
              ) : (
                <>
                  <span className="display text-[20px] leading-none text-foreground md:text-[22px]">
                    {ledgerColumns.length} {ledgerColumns.length === 1 ? "position" : "positions"}
                  </span>
                  <span className="num text-[12px] text-foreground/60">
                    {lotsReady || rewound ? `${ledgerColumns.reduce((s, c) => s + c.layers.length, 0)} open lots` : lotsNote}, {formatUSD(total)}
                    {rewound ? costNote(ledgerColumns) : unpricedNote}
                    {shownNote}
                  </span>
                </>
              )}
            </motion.div>
          </AnimatePresence>
          {rewound ? (
            <span className="hidden max-w-[60ch] text-[12px] leading-relaxed text-foreground/50 md:inline">
              As of {format(asOf, "MMM d, yyyy")}. Height is cost basis. Approximate: partial sales are undated.
            </span>
          ) : (
            caption && <span className="hidden max-w-[60ch] text-[12px] leading-relaxed text-foreground/50 md:inline">{caption}</span>
          )}
        </div>
        <Rewind className="hidden w-[300px] shrink-0 md:block xl:w-[340px]" />
      </div>
    </div>
  );
}
