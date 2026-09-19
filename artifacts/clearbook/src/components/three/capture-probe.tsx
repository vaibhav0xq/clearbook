import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type * as THREE from "three";
import { WIDE_STORY_QUERY } from "./story-data";

/**
 * Development only diagnostics. The browser posts what it actually rendered, plus the facts that
 * decide the render path, to the dev server, which writes them under /tmp/captures. Used to check
 * the landing scene on a real GPU from inside the workspace. Removed from production builds.
 */
export const CAPTURE = import.meta.env.DEV;

type Meta = Record<string, unknown>;

/**
 * One rendering configuration for the automatic bisection. The scene walks through DIAG_STEPS,
 * holding each for DIAG_STEP_MS, and CaptureFrame posts the frame just before every switch, so a
 * single page load shows which part of the scene fails on a given GPU.
 */
export interface DiagConfig {
  name: string;
  /** Post processing chain on. */
  fx: boolean;
  /** Reflective floor on (off means the matte low power slab). */
  reflect: boolean;
  /** Stacked camera composition (view offset) allowed. Off forces the wide camera. */
  offset: boolean;
  torch: boolean;
  horizon: boolean;
  dust: boolean;
  floorType: boolean;
}

const FULL: DiagConfig = { name: "full", fx: true, reflect: true, offset: true, torch: true, horizon: true, dust: true, floorType: true };
export const DIAG_STEPS: DiagConfig[] = [
  FULL,
  { ...FULL, name: "full-2" },
  { ...FULL, name: "full-3" },
  { ...FULL, name: "no-horizon", horizon: false },
  { ...FULL, name: "full-4" },
  { ...FULL, name: "full-5" },
];
export const DIAG_START_MS = 3000;
export const DIAG_STEP_MS = 3000;

/** Current bisection step. Outside development this is always the full configuration. */
export function useDiagnosticStep(): DiagConfig {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!CAPTURE) return;
    const timers = DIAG_STEPS.map((_, i) => window.setTimeout(() => setIndex(i), DIAG_START_MS + DIAG_STEP_MS * i));
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);
  return DIAG_STEPS[index];
}

async function post(name: string, meta: Meta, image?: string) {
  console.info(`[capture] ${name}`, meta);
  try {
    await fetch(`${import.meta.env.BASE_URL}__capture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, meta, image }),
    });
  } catch {
    // Diagnostics must never affect the page.
  }
}

/** Frames rendered by the story canvas so far, so a black capture can be told from a paused loop. */
const counters = { frames: 0, lastFrameAt: 0, step: "none", rootAt: 0, raf: 0, frameloop: "none", live: {} as Meta, io: [] as string[] };

/** Fraction of the drawn pixels that are lit and the mean alpha, so black can be told from transparent. */
function pixelStats(canvas: HTMLCanvasElement): Meta {
  try {
    const w = 96;
    const h = Math.max(1, Math.round((canvas.height / canvas.width) * w));
    const small = document.createElement("canvas");
    small.width = w;
    small.height = h;
    const ctx = small.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { pixels: "no-2d" };
    ctx.drawImage(canvas, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    let lit = 0;
    let opaque = 0;
    let maxLum = 0;
    let alphaSum = 0;
    let nonFinite = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = Math.max(data[i], data[i + 1], data[i + 2]);
      if (lum > 12) lit += 1;
      if (data[i + 3] > 0) opaque += 1;
      if (lum > maxLum) maxLum = lum;
      alphaSum += data[i + 3];
      if (!Number.isFinite(lum)) nonFinite += 1;
    }
    const n = data.length / 4;
    return { pixels: { lit: lit / n, opaque: opaque / n, maxLum, meanAlpha: alphaSum / n / 255, nonFinite } };
  } catch (e) {
    return { pixels: String(e) };
  }
}

function pageMeta(extra: Meta): Meta {
  const canvas = document.querySelector("canvas");
  const rect = canvas?.getBoundingClientRect();
  const style = canvas ? getComputedStyle(canvas) : null;
  const story = canvas?.closest("[data-story]")?.getBoundingClientRect();
  return {
    time: new Date().toISOString(),
    sinceLoad: Math.round(performance.now()),
    visibility: document.visibilityState,
    focus: document.hasFocus(),
    frames: counters.frames,
    raf: counters.raf,
    frameloop: counters.frameloop,
    live: counters.live,
    io: counters.io.slice(-6),
    lastFrameAgo: counters.lastFrameAt ? Math.round(performance.now() - counters.lastFrameAt) : null,
    rootAt: counters.rootAt,
    step: counters.step,
    ...(canvas && canvas.width > 300 ? pixelStats(canvas) : {}),
    storyRect: story ? [story.x, story.y, story.width, story.height] : null,
    url: location.href,
    ua: navigator.userAgent,
    cores: navigator.hardwareConcurrency,
    dpr: devicePixelRatio,
    inner: [innerWidth, innerHeight],
    client: [document.documentElement.clientWidth, document.documentElement.clientHeight],
    scrollY: window.scrollY,
    wide: matchMedia(WIDE_STORY_QUERY).matches,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    finePointer: matchMedia("(pointer: fine)").matches,
    coarsePointer: matchMedia("(pointer: coarse)").matches,
    canvasRect: rect ? [rect.x, rect.y, rect.width, rect.height] : null,
    canvasBuffer: canvas ? [canvas.width, canvas.height] : null,
    canvasStyle: style ? { display: style.display, opacity: style.opacity, visibility: style.visibility } : null,
    ...extra,
  };
}

/** Records an intersection observer result with its time, for the heartbeat. */
export function noteIntersection(entry: IntersectionObserverEntry) {
  counters.io.push(`${Math.round(performance.now())}:${entry.isIntersecting ? "in" : "out"}:${entry.intersectionRatio.toFixed(2)}`);
}

/** Outside the Canvas: reports the page state even when WebGL never starts. */
export function CaptureMeta(props: Meta) {
  counters.live = props;
  useEffect(() => {
    if (!CAPTURE) return;
    let rafId = 0;
    const tick = () => {
      counters.raf += 1;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    const errors: string[] = [];
    const onError = (e: ErrorEvent) => errors.push(String(e.message));
    const onReject = (e: PromiseRejectionEvent) => errors.push(String(e.reason));
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onReject);
    // A short heartbeat, so the page state is visible even when the scene never starts.
    let n = 0;
    const t = window.setInterval(() => {
      n += 1;
      void post(`page-${String(n).padStart(2, "0")}`, pageMeta({ ...props, errors }));
      if (n >= 12) clearInterval(t);
    }, 5000);
    return () => {
      clearInterval(t);
      cancelAnimationFrame(rafId);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onReject);
    };
    // Report the values from mount; later changes are not what we are diagnosing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/** Inside the Canvas: reports the rendered frame. The renderer must keep its drawing buffer. */
export function CaptureFrame({ diag, ...props }: Meta & { diag: DiagConfig }) {
  const gl = useThree((s) => s.gl);
  const get = useThree((s) => s.get);
  const frameloop = useThree((s) => s.frameloop);
  const current = useRef(diag);
  current.current = diag;
  counters.step = diag.name;
  counters.frameloop = frameloop;
  const shooter = useRef<(name: string) => void>(() => undefined);
  useFrame(() => {
    counters.frames += 1;
    counters.lastFrameAt = performance.now();
  });
  useEffect(() => {
    if (!CAPTURE) return;
    counters.rootAt = Math.round(performance.now());
    const ctx = gl.getContext();
    const ext = ctx.getExtension("WEBGL_debug_renderer_info");
    const renderer = ext ? String(ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "unavailable";
    let lost = false;
    const onLost = () => {
      lost = true;
    };
    gl.domElement.addEventListener("webglcontextlost", onLost);
    const shoot = (name: string) => {
      const { size, camera } = get();
      const persp = camera as THREE.PerspectiveCamera;
      const meta = pageMeta({
        ...props,
        step: current.current.name,
        renderer,
        webgl2: ctx instanceof WebGL2RenderingContext,
        contextLost: lost || ctx.isContextLost(),
        size: [size.width, size.height],
        pixelRatio: gl.getPixelRatio(),
        fov: persp.fov,
        aspect: persp.aspect,
        view: persp.view,
        position: camera.position.toArray(),
      });
      let image: string | undefined;
      try {
        image = gl.domElement.toDataURL("image/jpeg", 0.8);
      } catch (e) {
        meta.captureError = String(e);
      }
      void post(name, meta, image);
    };
    shooter.current = shoot;
    return () => {
      gl.domElement.removeEventListener("webglcontextlost", onLost);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);
  // Each step is captured once it has been on screen for most of its slot.
  useEffect(() => {
    if (!CAPTURE) return;
    const index = DIAG_STEPS.indexOf(diag);
    const t = window.setTimeout(() => shooter.current(`${String(index).padStart(2, "0")}-${diag.name}`), DIAG_STEP_MS - 500);
    return () => clearTimeout(t);
  }, [diag]);
  return null;
}
