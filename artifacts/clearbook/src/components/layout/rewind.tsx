import { useCallback, useId, useMemo } from "react";
import { format } from "date-fns";
import { useStageContext } from "@/components/layout/stage";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;

/** Midnight at the start of the first dated lot's day, in local time. */
function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** Whole days from the span start to now. Stop `days` is now, stops below it are the end of that day. */
function dayCount(span: { start: Date; end: Date }): number {
  return Math.floor((span.end.getTime() - startOfDay(span.start).getTime()) / DAY) + 1;
}

/**
 * A time scrubber under the stage. Dragging it rebuilds the ledger as it stood at the end of any
 * past day, from the wallet's full lot history. Lot history is only requested once the visitor
 * reaches for the control. The rightmost stop is now, which returns the stage to live values.
 */
export function Rewind({ className }: { className?: string }) {
  const { asOf, setAsOf, span, history, loadHistory } = useStageContext();
  const noteId = useId();

  // One stop per calendar day plus one for now, so every keyboard step lands on a distinct date.
  const days = span ? dayCount(span) : 0;
  const origin = span ? startOfDay(span.start).getTime() : 0;

  const ticks = useMemo(() => {
    if (!span || days < 2) return [];
    const out: { at: number; label: string }[] = [];
    for (let y = span.start.getFullYear() + 1; y <= span.end.getFullYear(); y++) {
      const at = (new Date(y, 0, 1).getTime() - origin) / DAY / days;
      if (at > 0.04 && at < 0.96) out.push({ at, label: String(y) });
    }
    return out;
  }, [span, days, origin]);

  const value = !span || !asOf ? days : Math.min(days - 1, Math.max(0, Math.floor((asOf.getTime() - origin) / DAY)));

  const onChange = useCallback(
    (raw: number) => {
      if (!span) return;
      if (raw >= days) {
        setAsOf(null);
        return;
      }
      // The end of the chosen day, so every lot opened on it is included.
      setAsOf(new Date(origin + (raw + 1) * DAY - 1));
    },
    [span, days, origin, setAsOf],
  );

  // A history that fits in one day has nothing to rewind to.
  const ready = history === "ready" && span !== null && days >= 2;
  const note =
    history === "loading"
      ? "Loading lot history"
      : history === "error"
        ? "Lot history unavailable"
        : history === "ready" && !ready
          ? "Nothing to rewind yet"
          : null;

  return (
    <div className={cn("pointer-events-auto w-full", className)}>
      <div className="flex items-end justify-between text-[11px]">
        <span className="flex items-baseline gap-2">
          <span className="eyebrow !text-[10px] text-foreground/45">Rewind</span>
          {span && <span className="num text-[10px] text-foreground/30">from {format(span.start, "MMM yyyy")}</span>}
        </span>
        <span id={noteId} className={cn("num transition-colors duration-300", asOf ? "text-primary" : "text-foreground/45")}>
          {note ?? (asOf ? format(asOf, "MMM d, yyyy") : "Now")}
        </span>
      </div>
      <div className="relative mt-2 h-5">
        {/* Year marks under the rail. */}
        {ticks.map((t) => (
          <span
            key={t.label}
            aria-hidden
            className="num pointer-events-none absolute top-[14px] -translate-x-1/2 text-[9px] text-foreground/30"
            style={{ left: `${t.at * 100}%` }}
          >
            <span className="absolute -top-[9px] left-1/2 h-1 w-px bg-foreground/25" />
            {t.label}
          </span>
        ))}
        <input
          type="range"
          min={0}
          max={Math.max(1, days)}
          step={1}
          value={ready ? value : Math.max(1, days)}
          aria-label="Rewind the ledger to a past date"
          aria-valuetext={asOf ? format(asOf, "MMMM d, yyyy") : "Now"}
          aria-describedby={note ? noteId : undefined}
          aria-disabled={!ready}
          aria-busy={history === "loading"}
          onPointerEnter={loadHistory}
          onFocus={loadHistory}
          onChange={(e) => {
            if (ready) onChange(Number(e.target.value));
          }}
          onDoubleClick={() => setAsOf(null)}
          className={cn("rewind-range absolute inset-x-0 top-0 h-5 w-full transition-opacity duration-300", !ready && "opacity-50")}
          style={{ ["--fill" as string]: `${ready ? (value / days) * 100 : 100}%` }}
        />
      </div>
    </div>
  );
}
