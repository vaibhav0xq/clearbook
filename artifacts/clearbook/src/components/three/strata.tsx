import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import type { StrataSceneProps } from "./strata-scene";

const StrataScene = lazy(() => import("./strata-scene"));

let webglSupport: boolean | null = null;
function hasWebGL(): boolean {
  if (webglSupport !== null) return webglSupport;
  try {
    const canvas = document.createElement("canvas");
    webglSupport = !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

function useLowPower(reduce: boolean): boolean {
  return useMemo(() => {
    if (typeof window === "undefined") return true;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const small = window.innerWidth < 768;
    const cores = navigator.hardwareConcurrency ?? 8;
    return reduce || coarse || small || cores <= 4;
  }, [reduce]);
}

/** A WebGL context that fails after the capability probe must not take the page down. */
class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
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

/**
 * Lazy loaded wrapper around the WebGL scene. Renders a quiet fallback when
 * WebGL is unavailable and pauses the render loop while off screen.
 */
export function Strata({ className, ...props }: Omit<StrataSceneProps, "lowPower" | "reduced" | "frameloop"> & { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  // Probed synchronously so the Canvas never mounts on a machine without WebGL.
  const [supported] = useState(() => typeof document !== "undefined" && hasWebGL());
  const reduced = !!useReducedMotion();
  const lowPower = useLowPower(reduced);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (!supported) return <StrataFallback className={className} />;

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <SceneBoundary fallback={<StrataFallback className="absolute inset-0" />}>
        <Suspense fallback={<StrataFallback className="absolute inset-0" />}>
          <StrataScene {...props} lowPower={lowPower} reduced={reduced} frameloop={visible ? "always" : "never"} />
        </Suspense>
      </SceneBoundary>
    </div>
  );
}
