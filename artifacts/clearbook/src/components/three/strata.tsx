import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import type { StrataSceneProps } from "./strata-scene";
import type { Quality } from "./quality";

const StrataScene = lazy(() => import("./strata-scene"));

/**
 * Whether the browser has WebGL at all. A real probe context costs a few hundred milliseconds on
 * weak machines, so this only checks the API and leaves failures to the scene boundary.
 */
export function hasWebGL(): boolean {
  return typeof window !== "undefined" && typeof WebGLRenderingContext !== "undefined";
}

/**
 * What the device tells us before a context exists. Touch devices, small screens and reduced
 * motion always open at the lite tier. Anything else is classified from the GPU once the canvas
 * has opened its context.
 */
export function useDeviceHint(reduce: boolean): Quality | null {
  return useMemo(() => {
    if (typeof window === "undefined") return "lite";
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const small = window.innerWidth < 768;
    return reduce || coarse || small ? "lite" : null;
  }, [reduce]);
}

/** A WebGL context that fails to open must not take the page down. */
export class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("Strata scene failed to render", error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function StrataFallback({ className }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden ${className ?? ""}`} aria-hidden>
      <div className="absolute inset-0 grid-lines opacity-60" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
}

/** Tracks whether an element is near the viewport so an off screen scene can stop drawing. */
export function useNearViewport(ref: React.RefObject<HTMLElement | null>, margin: string): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin]);
  return visible;
}

/**
 * Lazy loaded wrapper around the WebGL scene. Renders a quiet fallback when
 * WebGL is unavailable and pauses the render loop while off screen.
 */
export function Strata({ className, ...props }: Omit<StrataSceneProps, "hint" | "reduced" | "visible"> & { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useNearViewport(ref, "200px");
  const [supported] = useState(() => hasWebGL());
  const reduced = !!useReducedMotion();
  const hint = useDeviceHint(reduced);

  if (!supported) return <StrataFallback className={className} />;

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <SceneBoundary fallback={<StrataFallback className="absolute inset-0" />}>
        <Suspense fallback={<StrataFallback className="absolute inset-0" />}>
          <StrataScene {...props} hint={hint} reduced={reduced} visible={visible} />
        </Suspense>
      </SceneBoundary>
    </div>
  );
}
