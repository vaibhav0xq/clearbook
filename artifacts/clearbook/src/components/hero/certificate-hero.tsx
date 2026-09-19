import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useGetPortfolio, getGetPortfolioQueryKey, type Position } from "@workspace/api-client-react";
import { formatUSD, formatPercent } from "@/lib/format";

/**
 * A folded paper share certificate that opens into a live statement.
 *
 * The fold is done with CSS 3D transforms so it costs nothing to load and
 * degrades to the finished statement when the visitor prefers reduced motion.
 * The rows are the demo holder's real positions with current marks, so the
 * hero shows the product rather than a picture of it.
 */

const DEMO_ADDRESS = "demo-holder";
const PLACEHOLDER: Array<Pick<Position, "symbol" | "name" | "quantity" | "marketValue" | "unrealizedPnlPct">> = [
  { symbol: "AAPLx", name: "Apple xStock", quantity: 46.15, marketValue: null, unrealizedPnlPct: null },
  { symbol: "NVDAx", name: "NVIDIA xStock", quantity: 60.1, marketValue: null, unrealizedPnlPct: null },
  { symbol: "MSFTon", name: "Microsoft (Ondo)", quantity: 14.08, marketValue: null, unrealizedPnlPct: null },
  { symbol: "SPYx", name: "SP500 xStock", quantity: 9.05, marketValue: null, unrealizedPnlPct: null },
];

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export function CertificateHero() {
  const reduced = useReducedMotion();
  const [opened, setOpened] = useState(!!reduced);
  const { data } = useGetPortfolio(DEMO_ADDRESS, undefined, {
    query: { queryKey: getGetPortfolioQueryKey(DEMO_ADDRESS), staleTime: 60_000 },
  });

  useEffect(() => {
    if (reduced) {
      setOpened(true);
      return;
    }
    const t = window.setTimeout(() => setOpened(true), 700);
    return () => window.clearTimeout(t);
  }, [reduced]);

  const rows = (data?.positions.length ? data.positions.slice(0, 4) : PLACEHOLDER) as typeof PLACEHOLDER;
  const totals = data?.totals ?? null;
  const asOf = data ? new Date(data.asOf) : null;

  const fold = (from: number) => (reduced ? { rotateX: 0 } : { rotateX: opened ? 0 : from });
  const foldTransition = (delay: number) => (reduced ? { duration: 0 } : { duration: 1.4, delay, ease: EASE });

  return (
    <div className="w-full max-w-[520px] mx-auto [perspective:1600px]" aria-hidden="true">
      <motion.div
        initial={false}
        animate={reduced ? undefined : { y: [0, -6, 0], rotateY: [0, -3, 0] }}
        transition={reduced ? undefined : { duration: 9, repeat: Infinity, ease: "easeInOut", delay: 3 }}
        className="relative [transform-style:preserve-3d]"
      >
        {/* Top third: certificate header, folds down from the middle. */}
        <motion.div
          initial={false}
          animate={fold(-178)}
          transition={foldTransition(0.15)}
          style={{ transformOrigin: "50% 100%" }}
          className="relative z-20 bg-bone text-ink px-8 pt-8 pb-5 rounded-t-sm shadow-[0_-8px_30px_-16px_rgba(0,0,0,0.6)] [transform-style:preserve-3d] [backface-visibility:hidden]"
        >
          <div className="border border-ink/25 border-b-0 px-6 pt-5 pb-4">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="font-serif text-[11px] uppercase tracking-[0.3em] text-ink/55">Account statement</div>
                <div className="font-serif text-3xl leading-none mt-2 tracking-tight">Clearbook</div>
              </div>
              <div className="text-right font-mono text-[10px] uppercase tracking-widest text-ink/55 leading-relaxed">
                <div>Tokenized equities</div>
                <div>Solana mainnet</div>
                <div>{asOf ? asOf.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Live marks"}</div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-4 border-t border-ink/15 pt-4">
              <Figure label="Net value" value={totals ? formatUSD(totals.netValue) : null} />
              <Figure label="Cost basis" value={totals ? formatUSD(totals.costBasis) : null} />
              <Figure
                label="Unrealized"
                value={totals ? formatUSD(totals.unrealizedPnl) : null}
                tone={totals ? (totals.unrealizedPnl >= 0 ? "up" : "down") : undefined}
              />
            </div>
          </div>
        </motion.div>

        {/* Middle third: the position rows, always visible. */}
        <div className="relative z-10 bg-bone text-ink px-8 py-1 shadow-2xl">
          <div className="border-x border-ink/25 px-6 py-2">
            <div className="grid grid-cols-[1.4fr_0.8fr_1fr_0.7fr] font-mono text-[10px] uppercase tracking-widest text-ink/50 pb-2 border-b border-ink/15">
              <span>Position</span>
              <span className="text-right">Shares</span>
              <span className="text-right">Value</span>
              <span className="text-right">P/L</span>
            </div>
            {rows.map((row, i) => (
              <motion.div
                key={row.symbol}
                initial={false}
                animate={{ opacity: opened ? 1 : 0.35 }}
                transition={{ duration: 0.6, delay: reduced ? 0 : 1.1 + i * 0.12 }}
                className="grid grid-cols-[1.4fr_0.8fr_1fr_0.7fr] items-baseline py-2.5 border-b border-dotted border-ink/15 last:border-0"
              >
                <span className="flex flex-col leading-tight">
                  <span className="font-mono text-sm font-medium">{row.symbol}</span>
                  <span className="font-sans text-[11px] text-ink/55 truncate">{row.name}</span>
                </span>
                <span className="font-mono text-sm text-right tabular-nums">{row.quantity.toFixed(2)}</span>
                <span className="font-mono text-sm text-right tabular-nums">{row.marketValue === null ? <Bar /> : formatUSD(row.marketValue)}</span>
                <span
                  className={`font-mono text-xs text-right tabular-nums ${
                    row.unrealizedPnlPct === null ? "text-ink/40" : row.unrealizedPnlPct >= 0 ? "text-emerald-700" : "text-amber-700"
                  }`}
                >
                  {row.unrealizedPnlPct === null ? <Bar /> : formatPercent(row.unrealizedPnlPct)}
                </span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Bottom third: seal and proof line, folds up from the middle. */}
        <motion.div
          initial={false}
          animate={fold(178)}
          transition={foldTransition(0.45)}
          style={{ transformOrigin: "50% 0%" }}
          className="relative z-20 bg-bone text-ink px-8 pb-8 pt-1 rounded-b-sm shadow-[0_18px_40px_-18px_rgba(0,0,0,0.8)] [transform-style:preserve-3d] [backface-visibility:hidden]"
        >
          <div className="border border-ink/25 border-t-0 px-6 pb-5 pt-3">
            <div className="flex items-end justify-between gap-6">
              <div className="font-mono text-[10px] leading-relaxed text-ink/55 uppercase tracking-widest">
                <div>Method FIFO</div>
                <div>Marks Pyth, Jupiter</div>
                <div>Proof SHA-256 memo</div>
              </div>
              <div className="relative h-16 w-16 shrink-0">
                <motion.div
                  initial={false}
                  animate={{ scale: opened ? 1 : 0.6, opacity: opened ? 1 : 0 }}
                  transition={{ duration: 0.8, delay: reduced ? 0 : 1.9, ease: EASE }}
                  className="absolute inset-0 rounded-full border-[3px] border-primary/70 flex items-center justify-center"
                >
                  <div className="h-10 w-10 rounded-full border border-primary/50 flex items-center justify-center">
                    <span className="font-serif text-[9px] uppercase tracking-[0.2em] text-primary">Notarized</span>
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string | null; tone?: "up" | "down" }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[10px] uppercase tracking-widest text-ink/50">{label}</div>
      <div className={`font-mono text-base tabular-nums mt-1 ${tone === "up" ? "text-emerald-700" : tone === "down" ? "text-amber-700" : ""}`}>
        {value ?? <Bar />}
      </div>
    </div>
  );
}

function Bar() {
  return <span className="inline-block h-3 w-12 bg-ink/10 align-middle rounded-sm" />;
}
