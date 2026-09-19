import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

const HEX = "0123456789abcdef";

/**
 * Resolves a string out of noise, left to right. Built for hashes and signatures.
 */
export function ScrambleText({
  text,
  className,
  duration = 1400,
  delay = 0,
  charset = HEX,
}: {
  text: string;
  className?: string;
  duration?: number;
  delay?: number;
  charset?: string;
}) {
  const reduce = useReducedMotion();
  const [output, setOutput] = useState(() => (reduce ? text : ""));
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (reduce) {
      setOutput(text);
      return;
    }
    let start: number | null = null;
    const len = text.length;
    const tick = (now: number) => {
      if (start === null) start = now + delay;
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      const resolved = Math.floor(t * len);
      let out = text.slice(0, resolved);
      for (let i = resolved; i < len; i++) {
        const ch = text[i];
        out += ch === " " || ch === "." ? ch : charset[Math.floor(Math.random() * charset.length)];
      }
      setOutput(out);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [text, duration, delay, charset, reduce]);

  return (
    <span className={cn("num", className)} aria-label={text}>
      {output}
    </span>
  );
}
