import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import type { StorySceneProps } from "./story-scene";
import { SceneBoundary, StrataFallback, hasWebGL, useLowPower } from "./strata";

const StoryScene = lazy(() => import("./story-scene"));

/** The pinned landing scene. Same guards as Strata: WebGL probe, error boundary, pause off screen. */
export function Story({ className, ...props }: Omit<StorySceneProps, "lowPower" | "reduced" | "frameloop"> & { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [supported] = useState(() => typeof document !== "undefined" && hasWebGL());
  const reduced = !!useReducedMotion();
  const lowPower = useLowPower(reduced);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting);
      },
      { rootMargin: "100px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (!supported) return <StrataFallback className={className} />;

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <SceneBoundary fallback={<StrataFallback className="absolute inset-0" />}>
        <Suspense fallback={<StrataFallback className="absolute inset-0" />}>
          <StoryScene {...props} lowPower={lowPower} reduced={reduced} frameloop={visible ? "always" : "never"} />
        </Suspense>
      </SceneBoundary>
    </div>
  );
}
