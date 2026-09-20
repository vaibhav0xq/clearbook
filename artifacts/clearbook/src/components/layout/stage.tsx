import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
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
import { cn } from "@/lib/utils";

/**
 * The stage is the one WebGL view of a ledger that stays mounted while the wallet pages change
 * beside it. Pages describe what the stage should show through `useStage`; hover flows both ways.
 */
export interface StageState {
  /** Column the camera closes on. Null keeps the whole ledger in frame. */
  focusMint?: string | null;
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
  hoverMint: string | null;
  setHoverMint: (mint: string | null) => void;
  /** Publishes page state. The owner token lets a page skip its cleanup when a newer page has already published. */
  publish: (owner: string, state: StageState) => void;
  release: (owner: string) => void;
  /** The ledger as it stands now. Pages always work from these. */
  columns: StrataColumn[];
  /** What the stage draws: the rewound ledger when a past date is set, otherwise the live columns. */
  stageColumns: StrataColumn[];
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

export function StageProvider({ address, children }: { address: string; children: ReactNode }) {
  const { method } = useCostMethod();
  const [hoverMint, setHoverMint] = useState<string | null>(null);
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
  const stageColumns = past ?? columns;
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
    () => ({ ...state, hoverMint, setHoverMint, publish, release, columns, stageColumns, lotDetail, unpricedCount, asOf, setAsOf, span, history, loadHistory }),
    [state, hoverMint, publish, release, columns, stageColumns, lotDetail, unpricedCount, asOf, setAsOf, span, history, loadHistory],
  );
  return <StageContext.Provider value={value}>{children}</StageContext.Provider>;
}

export function useStageContext(): StageContextValue {
  const ctx = useContext(StageContext);
  if (!ctx) throw new Error("useStageContext must be used inside a wallet shell");
  return ctx;
}

/**
 * Declares what the stage shows while the calling page is mounted. Returns the shared hover so
 * table rows and columns highlight each other.
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
  return { hoverMint: ctx.hoverMint, setHoverMint: ctx.setHoverMint, columns: ctx.columns, lotDetail: ctx.lotDetail };
}

/**
 * The scene plus its overlays, laid out as a wide band under the top bar. The shell passes the
 * ledger identity for the top left corner and any controls for the top right.
 */
export function StageView({ address, topLeft, topRight, className }: { address: string; topLeft?: ReactNode; topRight?: ReactNode; className?: string }) {
  const { method } = useCostMethod();
  const ctx = useStageContext();
  const [, setLocation] = useLocation();
  const { stageColumns: columns, hoverMint, setHoverMint, focusMint, highlightLayerId, preview, caption, lotDetail, unpricedCount, asOf } = ctx;
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

  const shown = columns.find((c) => c.mint === (hoverMint ?? focusMint)) ?? null;
  const total = columns.reduce((s, c) => s + c.value, 0);

  return (
    <div className={cn("relative isolate z-0 h-full w-full overflow-hidden bg-background", className)}>
      <Strata
        className="absolute inset-0 h-full w-full"
        columns={columns}
        method={method}
        mode="stage"
        highlightMint={hoverMint}
        highlightLayerId={highlightLayerId}
        focusMint={focusMint ?? null}
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
              key={shown?.mint ?? "all"}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.4, ease: EASE_OUT }}
              className="flex flex-col gap-1"
            >
              {shown ? (
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
                    {columns.length} {columns.length === 1 ? "position" : "positions"}
                  </span>
                  <span className="num text-[12px] text-foreground/60">
                    {lotsReady || rewound ? `${columns.reduce((s, c) => s + c.layers.length, 0)} open lots` : lotsNote}, {formatUSD(total)}
                    {rewound ? costNote(columns) : unpricedNote}
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
