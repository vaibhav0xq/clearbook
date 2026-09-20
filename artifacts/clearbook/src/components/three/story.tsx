import { lazy, Suspense, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import type { StorySceneProps } from "./story-scene";
import { SceneBoundary, StrataFallback, hasWebGL, useDeviceHint, useNearViewport } from "./strata";

const StoryScene = lazy(() => import("./story-scene"));

/** The pinned landing scene. Same guards as Strata: WebGL check, error boundary, pause off screen. */
export function Story({ className, ...props }: Omit<StorySceneProps, "hint" | "reduced" | "visible"> & { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useNearViewport(ref, "100px");
  const [supported] = useState(() => hasWebGL());
  const reduced = !!useReducedMotion();
  const hint = useDeviceHint(reduced);

  if (!supported) return <StrataFallback className={className} />;

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <SceneBoundary fallback={<StrataFallback className="absolute inset-0" />}>
        <Suspense fallback={<StrataFallback className="absolute inset-0" />}>
          <StoryScene {...props} hint={hint} reduced={reduced} visible={visible} />
        </Suspense>
      </SceneBoundary>
    </div>
  );
}
