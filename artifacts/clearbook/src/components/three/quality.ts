/**
 * Render quality tiers. A tier is picked once from the device and the GPU that opened the context,
 * then only ever steps down when the frame rate stays low. A strong GPU keeps the full look.
 */
export type Quality = "full" | "balanced" | "lite";

export interface QualityProfile {
  /** Cap on the device pixel ratio the canvas renders at. */
  dpr: number;
  /** Samples for the post processing buffers. Zero disables multisampling. */
  msaa: number;
  /** Bloom, vignette and filmic tone mapping as a post pass. */
  post: boolean;
  /** Planar reflections on the ground. The scene is rendered a second time for them. */
  reflector: boolean;
  /** Clearcoat physical materials on the lots, otherwise a standard material with a smaller shader. */
  physical: boolean;
  /** Drifting dust particles. */
  dust: number;
  /** Frames are drawn continuously, or only while something moves. */
  loop: "always" | "demand";
}

export const PROFILES: Record<Quality, QualityProfile> = {
  full: { dpr: 1.75, msaa: 4, post: true, reflector: true, physical: true, dust: 260, loop: "always" },
  balanced: { dpr: 1.5, msaa: 2, post: true, reflector: false, physical: true, dust: 180, loop: "demand" },
  lite: { dpr: 1.25, msaa: 0, post: false, reflector: false, physical: false, dust: 110, loop: "demand" },
};

/** The next tier down, or null when already at the lowest. */
export function stepDown(quality: Quality): Quality | null {
  return quality === "full" ? "balanced" : quality === "balanced" ? "lite" : null;
}

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|mesa offscreen|basic render|microsoft basic|virtualbox|vmware|parallels/i;
const MOBILE_GPU = /\bmali\b|adreno|powervr|videocore|vivante|tegra|immortalis|xclipse|apple a\d/i;
const INTEGRATED = /\bintel\b|\biris\b|uhd graphics|hd graphics|radeon\(tm\) (r\d |)graphics|radeon (r\d|vega \d|graphics)|amd.*apu|ryzen/i;
const DISCRETE = /geforce|nvidia|\brtx\b|\bgtx\b|quadro|radeon rx|radeon pro|radeon 5\d{2}|radeon 6\d{2}|radeon 7\d{2}|\barc\b|apple m\d|apple gpu/i;

/**
 * Classifies the GPU from the unmasked renderer string. Unknown renderers get the tier their core
 * count suggests, so a masked but capable desktop still opens at full quality and the governor
 * steps it down only if the frame rate proves it should.
 */
export function classifyRenderer(renderer: string | null, cores: number): Quality {
  const name = renderer ?? "";
  if (SOFTWARE.test(name)) return "lite";
  if (MOBILE_GPU.test(name)) return "lite";
  if (DISCRETE.test(name)) return "full";
  if (INTEGRATED.test(name)) return "balanced";
  if (cores <= 4) return "lite";
  return cores <= 8 ? "balanced" : "full";
}

/** Reads the unmasked renderer name from a live context. Null when the browser hides it. */
export function rendererName(gl: WebGLRenderingContext | WebGL2RenderingContext): string | null {
  try {
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = info ? (gl.getParameter(info.UNMASKED_RENDERER_WEBGL) as string) : (gl.getParameter(gl.RENDERER) as string);
    return typeof name === "string" && name.length > 0 ? name : null;
  } catch {
    return null;
  }
}

/**
 * Seconds on a clock that keeps running across frameloop changes. The canvas clock restarts from
 * zero whenever the frameloop switches, for example when the scene leaves and re-enters the
 * viewport, so anything that stores a timestamp between frames must use this one instead.
 */
export function sceneTime(): number {
  return performance.now() / 1000;
}

/** Frames still drawn after a wake, so a wake issued inside a slow frame reaches the next one. */
const WAKE_FRAMES = 2;

/**
 * Keeps a scene awake while something is moving. The canvas renders on demand when idle, so the
 * loop asks the director every frame whether another frame is wanted, and anything that starts
 * motion (pointer, data change, camera still settling) calls `wake`.
 */
export interface FrameDirector {
  /** Requests frames for at least `ms` more milliseconds, and never fewer than two frames. */
  wake: (ms?: number) => void;
  /** Whether frames are still wanted right now. */
  awake: () => boolean;
  /** Called by the loop once per drawn frame, before anything else runs in it. */
  tick: () => void;
  /** Set by the canvas once it exists so wake can schedule a frame. */
  bind: (invalidate: (() => void) | null) => void;
  /** Marks setup work the first frame must wait for. Returns the release function. */
  hold: () => () => void;
  /** Runs `fn` once nothing is held, immediately when nothing is. */
  whenReady: (fn: () => void) => void;
}

export function createDirector(): FrameDirector {
  let until = 0;
  // A deadline alone is not enough: on a device drawing 300 ms frames, a 120 ms wake issued during
  // one frame has expired before the next begins, and the loop would read that as idle.
  let frames = 0;
  let invalidate: (() => void) | null = null;
  let holds = 0;
  const waiting: (() => void)[] = [];
  return {
    wake(ms = 800) {
      const t = performance.now() + ms;
      if (t > until) until = t;
      if (frames < WAKE_FRAMES) frames = WAKE_FRAMES;
      invalidate?.();
    },
    awake: () => frames > 0 || performance.now() < until,
    tick() {
      if (frames > 0) frames--;
    },
    bind(fn) {
      invalidate = fn;
    },
    hold() {
      holds++;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        holds--;
        if (holds === 0) for (const fn of waiting.splice(0)) fn();
      };
    },
    whenReady(fn) {
      if (holds === 0) fn();
      else waiting.push(fn);
    },
  };
}
