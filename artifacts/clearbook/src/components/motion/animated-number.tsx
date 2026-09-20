import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { formatUSD } from "@/lib/format";
import { EASE_OUT } from "./reveal";

interface AnimatedNumberProps {
  value: number | null | undefined;
  format?: (value: number | null | undefined) => string;
  className?: string;
  duration?: number;
  /** Starting value for the first animation. Defaults to 0. */
  from?: number;
  /** Adds a positive or negative tone class based on the sign. */
  tone?: boolean;
}

/**
 * Tweens between numeric values and renders them through a formatter.
 * Null values render the formatter's placeholder without animating.
 */
export function AnimatedNumber({
  value,
  format = formatUSD,
  className,
  duration = 1.1,
  from = 0,
  tone = false,
}: AnimatedNumberProps) {
  const reduce = useReducedMotion();
  const current = useRef<number>(from);
  const node = useRef<HTMLSpanElement>(null);
  const [text, setText] = useState(() => format(value === null || value === undefined ? value : reduce ? value : from));

  useLayoutEffect(() => {
    if (node.current) node.current.textContent = format(value === null || value === undefined || reduce ? value : current.current);
  }, [value, reduce, format]);

  useEffect(() => {
    if (value === null || value === undefined) {
      setText(format(value));
      return;
    }
    if (reduce) {
      current.current = value;
      setText(format(value));
      return;
    }
    const controls = animate(current.current, value, {
      duration,
      ease: EASE_OUT,
      onUpdate: (v) => {
        current.current = v;
        if (node.current) node.current.textContent = format(v);
      },
      onComplete: () => {
        current.current = value;
        setText(format(value));
      },
    });
    return () => controls.stop();
  }, [value, duration, reduce, format]);

  const toneClass =
    tone && typeof value === "number"
      ? value > 0
        ? "text-success"
        : value < 0
          ? "text-destructive"
          : "text-foreground"
      : undefined;

  return <span ref={node} className={cn("num", toneClass, className)}>{text}</span>;
}
