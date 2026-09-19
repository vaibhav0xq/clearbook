import { useEffect, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * A pointer for the landing: a small dot that sits exactly under the pointer and a ring that
 * follows it with a little lag. Elements with `data-cursor="Open"` turn the ring into a label, and
 * the scene can set a label through `setCursorLabel` when a column is under the pointer.
 * The native cursor is hidden only while this is mounted and the device has a fine pointer.
 */

const EVENT = "clearbook:cursor";

export function setCursorLabel(label: string | null) {
  window.dispatchEvent(new CustomEvent<string | null>(EVENT, { detail: label }));
}

export function Cursor() {
  const reduce = useReducedMotion();
  const [fine, setFine] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const [sceneLabel, setSceneLabel] = useState<string | null>(null);
  const [down, setDown] = useState(false);
  const [seen, setSeen] = useState(false);
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const rx = useSpring(x, { stiffness: 420, damping: 38, mass: 0.6 });
  const ry = useSpring(y, { stiffness: 420, damping: 38, mass: 0.6 });

  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine)");
    const update = () => setFine(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!fine) return;
    document.documentElement.classList.add("has-cursor");
    const onMove = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      if (!seen) setSeen(true);
      const target = (e.target as Element | null)?.closest<HTMLElement>("[data-cursor]");
      setLabel(target?.dataset.cursor ?? null);
    };
    const onDown = () => setDown(true);
    const onUp = () => setDown(false);
    const onLeave = () => setSeen(false);
    const onScene = (e: Event) => setSceneLabel((e as CustomEvent<string | null>).detail);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener(EVENT, onScene);
    return () => {
      document.documentElement.classList.remove("has-cursor");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener(EVENT, onScene);
    };
  }, [fine, x, y, seen]);

  if (!fine) return null;
  const text = label ?? sceneLabel;
  const shown = seen;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[95]">
      <motion.div
        className="absolute left-0 top-0"
        style={{ x: reduce ? x : rx, y: reduce ? y : ry }}
        animate={{ opacity: shown ? 1 : 0 }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          className={cn(
            "flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border transition-colors duration-300",
            text ? "border-primary/80 bg-primary text-primary-foreground" : "border-foreground/50 bg-transparent",
          )}
          animate={{
            width: text ? "auto" : down ? 22 : 34,
            height: text ? 30 : down ? 22 : 34,
            paddingLeft: text ? 12 : 0,
            paddingRight: text ? 12 : 0,
          }}
          transition={{ type: "spring", stiffness: 380, damping: 30, mass: 0.5 }}
        >
          {text && <span className="eyebrow !text-[10px] whitespace-nowrap">{text}</span>}
        </motion.div>
      </motion.div>
      <motion.div
        className="absolute left-0 top-0 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
        style={{ x, y }}
        animate={{ opacity: shown && !text ? 1 : 0, scale: down ? 0.6 : 1 }}
        transition={{ duration: 0.2 }}
      />
    </div>
  );
}
