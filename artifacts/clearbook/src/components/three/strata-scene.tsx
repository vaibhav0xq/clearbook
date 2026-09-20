import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, RoundedBox, MeshReflectorMaterial, Grid, Text, useCursor } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import type { CostMethod } from "@workspace/api-client-react";
import { format } from "date-fns";
import { formatUSD, formatQuantity, formatPercent } from "@/lib/format";
import { reliefPreview, reliefRank, type StrataColumn, type StrataLayer } from "./strata-data";
import { PROFILES, classifyRenderer, createDirector, rendererName, sceneTime, stepDown, type FrameDirector, type Quality } from "./quality";

export type StrataMode = "hero" | "portfolio" | "trade" | "stage";

export interface StrataSceneProps {
  columns: StrataColumn[];
  method: CostMethod;
  mode: StrataMode;
  /** Column drawn at full strength while the rest recede. Hover wins over this. */
  highlightMint?: string | null;
  /** Single lot drawn as if hovered, used when a table row is under the pointer. */
  highlightLayerId?: string | null;
  /** Stage mode only: the camera closes on this column. */
  focusMint?: string | null;
  preview?: { mint: string; quantity: number } | null;
  onHoverColumn?: (mint: string | null) => void;
  onSelectColumn?: (mint: string) => void;
  /** Quality tier forced by the device, or null to classify the GPU once the context is open. */
  hint?: Quality | null;
  /** Reduced motion: no orbit, dust, entrance or pulse animation. Hover feedback stays. */
  reduced?: boolean;
  /** False while the canvas is off screen, which stops the render loop entirely. */
  visible?: boolean;
}

/** Everything the scene needs to know about its render budget, shared with every part of the scene. */
export interface SceneSettings {
  quality: Quality;
  director: FrameDirector;
  /** Frames are drawn continuously. When false the scene must call `wake` while something moves. */
  continuous: boolean;
}

const SettingsContext = createContext<SceneSettings | null>(null);

export function useSceneSettings(): SceneSettings {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSceneSettings must be used inside a scene");
  return ctx;
}

export const SettingsProvider = SettingsContext.Provider;

export const PITCH = 1.6;
export const WIDTH = 0.92;
export const GAP = 0.06;
const MIN_H = 0.1;
const MAX_STACK = 4.0;

export const COLOR_LOSS = new THREE.Color("#ff6a5b");
export const COLOR_FLAT = new THREE.Color("#6a7080");
export const COLOR_GAIN = new THREE.Color("#35d39c");
export const COLOR_UNKNOWN = new THREE.Color("#3a3e47");
export const COLOR_AMBER = new THREE.Color("#ffa733");
export const COLOR_EDGE = new THREE.Color("#c9ccd4");
export const COLOR_INK = new THREE.Color("#f2f1ec");
export const COLOR_BG = "#0a0a0b";

/** A stage that is much wider than tall: the ledger band under the top bar. */
export function isStageBand(aspect: number): boolean {
  return aspect > 1.6;
}

/** A band on a wide screen, seen almost frontally so the row reads as a skyline across the width. */
export function isWideBand(aspect: number): boolean {
  return aspect > 2.6;
}

export const MONO_FONT = `${import.meta.env.BASE_URL}fonts/GeistMono-Regular.ttf`;

export function layerColor(layer: StrataLayer): THREE.Color {
  if (layer.basisUnknown) return COLOR_UNKNOWN.clone();
  const pct = layer.pnlPct;
  if (pct === null) return COLOR_FLAT.clone();
  const t = Math.min(1, Math.abs(pct) / 35);
  const target = pct >= 0 ? COLOR_GAIN : COLOR_LOSS;
  return COLOR_FLAT.clone().lerp(target, 0.25 + 0.75 * t);
}

export interface LayerPlacement {
  layer: StrataLayer;
  column: StrataColumn;
  columnIndex: number;
  layerIndex: number;
  x: number;
  y: number;
  h: number;
  color: THREE.Color;
}

interface LayerState {
  progress: number;
  /** Height eased toward the layout height, so a rewound or repriced ledger settles instead of snapping. */
  height?: number;
  lift: number;
  glow: number;
  dim: number;
  born: number | null;
}

/** Column placements. `spread` widens the pitch, used by the wide ledger band so the row fills its width. */
export function useLayout(columns: StrataColumn[], spread = 1) {
  return useMemo(() => {
    const n = columns.length;
    const pitch = (n > 9 ? PITCH * (9 / n) : PITCH) * spread;
    const maxValue = Math.max(1, ...columns.map((c) => c.layers.reduce((s, l) => s + l.value, 0)));
    const scale = MAX_STACK / maxValue;
    const placements: LayerPlacement[] = [];
    const heights = new Map<string, number>();
    columns.forEach((column, ci) => {
      const x = (ci - (n - 1) / 2) * pitch;
      let acc = 0;
      column.layers.forEach((layer, li) => {
        const h = Math.max(MIN_H, layer.value * scale);
        // Alternate the tone of neighbouring layers so the strata read as separate beds.
        const color = layerColor(layer).multiplyScalar(li % 2 === 0 ? 1 : 0.78);
        placements.push({ layer, column, columnIndex: ci, layerIndex: li, x, y: acc, h, color });
        acc += h + GAP;
      });
      heights.set(column.mint, acc);
    });
    const totalWidth = Math.max(pitch, (n - 1) * pitch + WIDTH);
    const tallest = Math.max(1, ...heights.values());
    return { placements, heights, totalWidth, tallest, pitch };
  }, [columns, spread]);
}

/** Smoothstep style visibility for the engraved faces: fully legible inside `near`, gone past `far`. */
export function faceVisibility(distance: number, near = 6.5, far = 10.5): number {
  const t = THREE.MathUtils.clamp((far - distance) / (far - near), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Text printed on the front face of a lot. Returns null when the block is too short to carry it. */
export function faceCopy(layer: StrataLayer, h: number): { lines: string[]; size: number } | null {
  if (h < 0.26) return null;
  const date = layer.openedAt ? format(new Date(layer.openedAt), "MMM d, yyyy") : "Opening balance";
  const cost = layer.basisUnknown ? "cost unknown" : `${formatUSD(layer.costPerShare)} / sh`;
  const qty = `${formatQuantity(layer.quantity, 4)} sh`;
  if (h < 0.5) return { lines: [date], size: 0.068 };
  if (h < 0.8) return { lines: [date, qty], size: 0.068 };
  return { lines: [date, qty, cost], size: 0.072 };
}

/** Objects the frame loop drives directly, registered by lot id so the React tree never re-renders per frame. */
export interface LotRegistry {
  meshes: Map<string, THREE.Mesh>;
  materials: Map<string, THREE.MeshStandardMaterial>;
  edges: Map<string, THREE.LineBasicMaterial>;
  faceGroups: Map<string, THREE.Group>;
  faceTexts: Map<string, TextMesh>;
}

export function createLotRegistry(): LotRegistry {
  return { meshes: new Map(), materials: new Map(), edges: new Map(), faceGroups: new Map(), faceTexts: new Map() };
}

function register<T>(map: Map<string, T>, id: string) {
  return (value: T | null) => {
    if (value) map.set(id, value);
    else map.delete(id);
  };
}

/**
 * One lot. The rounded block carries a hairline edge cage and the engraved face copy in a sibling
 * group, because the block itself is scaled while it grows in and text must never stretch.
 * Memoised: the frame loop drives position, scale and colour through the registry, so the block
 * only re-renders when its placement changes.
 */
export const LotBlock = memo(function LotBlock({
  placement,
  registry,
  physical,
  onHover,
  onSelect,
  children,
}: {
  placement: LayerPlacement;
  registry: LotRegistry;
  /** Clearcoat physical material, otherwise a standard material with a much smaller shader. */
  physical: boolean;
  /** Pointer entered (over true) or left (over false) this block. */
  onHover?: (placement: LayerPlacement, over: boolean) => void;
  onSelect?: (mint: string) => void;
  children?: ReactNode;
}) {
  const p = placement;
  const id = p.layer.id;
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(WIDTH + 0.006, p.h + 0.006, WIDTH + 0.006)), [p.h]);
  useEffect(() => () => edges.dispose(), [edges]);
  const onMesh = useMemo(() => register(registry.meshes, id), [registry, id]);
  const onMaterial = useMemo(() => register(registry.materials, id), [registry, id]);
  const onEdges = useMemo(() => register(registry.edges, id), [registry, id]);
  const surface = {
    color: p.color,
    emissive: p.color,
    emissiveIntensity: 0.16,
    roughness: 0.3,
    metalness: 0.14,
    transparent: p.layer.basisUnknown,
    opacity: p.layer.basisUnknown ? 0.42 : 1,
    envMapIntensity: 1.25,
  };
  return (
    <RoundedBox
      ref={onMesh}
      args={[WIDTH, p.h, WIDTH]}
      radius={0.03}
      smoothness={3}
      position={[p.x, p.y + p.h / 2, 0]}
      onPointerOver={
        onHover
          ? (e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation();
              onHover(p, true);
            }
          : undefined
      }
      onPointerOut={onHover ? () => onHover(p, false) : undefined}
      onClick={
        onSelect
          ? (e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              onSelect(p.column.mint);
            }
          : undefined
      }
    >
      {physical ? (
        <meshPhysicalMaterial ref={onMaterial} {...surface} clearcoat={1} clearcoatRoughness={0.14} />
      ) : (
        <meshStandardMaterial ref={onMaterial} {...surface} roughness={0.36} metalness={0.2} />
      )}
      <lineSegments geometry={edges} raycast={() => null}>
        <lineBasicMaterial ref={onEdges} color={COLOR_EDGE} transparent opacity={0.14} depthWrite={false} toneMapped={false} />
      </lineSegments>
      {children}
    </RoundedBox>
  );
});

/** Engraved copy on the front face. The owner positions the group and drives `fillOpacity` per frame. */
export const LotFace = memo(function LotFace({ placement, registry }: { placement: LayerPlacement; registry: LotRegistry }) {
  const id = placement.layer.id;
  const onGroup = useMemo(() => register(registry.faceGroups, id), [registry, id]);
  const onText = useMemo(() => register(registry.faceTexts, id), [registry, id]);
  const copy = faceCopy(placement.layer, placement.h);
  if (!copy) return null;
  return (
    <group ref={onGroup}>
      <Text
        ref={onText}
        font={MONO_FONT}
        fontSize={copy.size}
        lineHeight={1.45}
        letterSpacing={0.02}
        color={COLOR_INK}
        anchorX="left"
        anchorY="middle"
        maxWidth={WIDTH - 0.14}
        position={[-WIDTH / 2 + 0.08, 0, 0]}
        fillOpacity={0}
        material-toneMapped={false}
        material-depthWrite={false}
        raycast={() => null}
      >
        {copy.lines.join("\n")}
      </Text>
    </group>
  );
});

export type TextMesh = THREE.Mesh & { fillOpacity: number };

/** Normalised device box the framed points must land in. The bottom is raised for the stage overlays. */
interface FrameBox {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

/**
 * Finds the closest camera distance along a fixed direction that keeps every point inside `box`,
 * then recentres the look target so the framed points sit in the middle of the box.
 */
function fitFrame(
  points: ArrayLike<number>,
  yaw: number,
  el: number,
  look: THREE.Vector3,
  fov: number,
  aspect: number,
  box: FrameBox,
  scratch: { cam: THREE.PerspectiveCamera; dir: THREE.Vector3; v: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3 },
): number {
  const { cam, dir, v, right, up } = scratch;
  cam.fov = fov;
  cam.aspect = aspect;
  cam.near = 0.1;
  cam.far = 200;
  cam.updateProjectionMatrix();
  dir.set(Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el));
  const n = points.length / 3;
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  const measure = (d: number) => {
    cam.position.copy(look).addScaledVector(dir, d);
    cam.lookAt(look);
    cam.updateMatrixWorld();
    minX = Infinity;
    maxX = -Infinity;
    minY = Infinity;
    maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      v.set(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]).project(cam);
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
    }
    return minX >= box.left && maxX <= box.right && minY >= box.bottom && maxY <= box.top;
  };
  for (let pass = 0; pass < 2; pass++) {
    let lo = 1.5;
    let hi = 80;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (measure(mid)) hi = mid;
      else lo = mid;
    }
    measure(hi);
    // Slide the target so the projected bounds share the centre of the box.
    const ex = (minX + maxX) / 2 - (box.left + box.right) / 2;
    const ey = (minY + maxY) / 2 - (box.bottom + box.top) / 2;
    const halfH = hi * Math.tan(THREE.MathUtils.degToRad(fov / 2));
    right.setFromMatrixColumn(cam.matrixWorld, 0);
    up.setFromMatrixColumn(cam.matrixWorld, 1);
    look.addScaledVector(right, ex * halfH * aspect).addScaledVector(up, ey * halfH);
    if (pass === 1) return hi;
  }
  return 0;
}

function Rig({
  totalWidth,
  tallest,
  mode,
  reduced,
  framePoints,
  focusPoints,
  focusKey,
}: {
  totalWidth: number;
  tallest: number;
  mode: StrataMode;
  reduced: boolean;
  /** Corners of every column, framed when nothing is focused. */
  framePoints: Float32Array;
  /** Corners of the focused column, or null. */
  focusPoints: Float32Array | null;
  focusKey: string;
}) {
  const { camera, size, scene } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  const desired = useMemo(() => new THREE.Vector3(), []);
  const lookAt = useMemo(() => new THREE.Vector3(), []);
  const scratch = useMemo(
    () => ({ cam: new THREE.PerspectiveCamera(), dir: new THREE.Vector3(), v: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3() }),
    [],
  );
  const fitted = useRef<{ key: string; pts: Float32Array | null; distance: number; look: THREE.Vector3 }>({
    key: "",
    pts: null,
    distance: 10,
    look: new THREE.Vector3(),
  });
  const settled = useRef(false);
  const { director, continuous } = useSceneSettings();

  useFrame((state, delta) => {
    const aspect = size.width / Math.max(1, size.height);
    const persp = camera as THREE.PerspectiveCamera;
    const wantedFov = mode === "stage" ? (aspect < 0.9 ? 38 : isWideBand(aspect) ? 26 : 32) : 30;
    if (persp.fov !== wantedFov) {
      persp.fov = wantedFov;
      persp.updateProjectionMatrix();
    }
    const tanH = Math.tan(THREE.MathUtils.degToRad(persp.fov / 2));
    const px = state.pointer.x;
    const py = state.pointer.y;
    const t = sceneTime();
    const parallax = reduced ? 0.3 : 1;

    if (mode === "stage") {
      // A three quarter view down the row. The framing is solved numerically so any stage aspect
      // shows the whole ledger, or the focused column, as large as the overlays allow.
      // Short wide stages (the band above the reading panel on small screens) are viewed more
      // frontally so the row spreads across the width, and keep the bottom clear for the caption
      // and the top clear for the brand and wallet controls.
      // Every stage is a band under the top bar. The identity sits in its top left corner, the
      // summary in the bottom left and the rewind control in the bottom right, so the frame box
      // keeps those corners clear. A wide band is seen almost frontally and lets the columns run
      // tall between the overlays; a phone band is nearly square and keeps the top third clear.
      const band = isStageBand(aspect);
      const skyline = isWideBand(aspect);
      const yaw = skyline ? 0.36 : band ? 0.5 : 0.62;
      const el = skyline ? 0.21 : band ? 0.26 : 0.28;
      const box: FrameBox = skyline
        ? { left: -0.8, right: 0.8, bottom: -0.56, top: 0.84 }
        : band
          ? { left: -0.84, right: 0.84, bottom: -0.45, top: 0.6 }
          : { left: -0.86, right: 0.86, bottom: -0.5, top: 0.52 };
      // The point arrays are rebuilt whenever heights or placements change, so their identity is
      // the geometry revision. The key covers the viewport and which column is focused.
      // The wide band keeps the whole row in frame and lets the highlight carry the focus, so the
      // camera holds still while the reader moves between positions.
      const closeUp = skyline ? null : focusPoints;
      const pts = closeUp ?? framePoints;
      const key = `${size.width}x${size.height}|${closeUp ? focusKey : ""}`;
      if ((fitted.current.key !== key || fitted.current.pts !== pts) && pts.length > 0) {
        const look = fitted.current.look;
        look.set(0, closeUp ? 0 : tallest * 0.35, 0);
        if (closeUp) {
          // Start from the column's own centre so the recentring converges in two passes.
          let sx = 0;
          let sy = 0;
          for (let i = 0; i < closeUp.length; i += 3) {
            sx += closeUp[i];
            sy += closeUp[i + 1];
          }
          look.set(sx / (closeUp.length / 3), sy / (closeUp.length / 3), 0);
        }
        fitted.current.distance = fitFrame(pts, yaw, el, look, persp.fov, aspect, box, scratch);
        fitted.current.key = key;
        fitted.current.pts = pts;
      }
      const { distance: d, look } = fitted.current;
      // The slow orbit only runs while frames are drawn continuously. On demand it would keep the
      // scene awake for nothing.
      const orbit = reduced || !continuous ? 0 : Math.sin(t * 0.09) * 0.05;
      const a = yaw + orbit;
      desired.set(look.x + d * Math.sin(a) * Math.cos(el), look.y + d * Math.sin(el), look.z + d * Math.cos(a) * Math.cos(el));
      desired.x += px * 0.5 * parallax;
      desired.y += py * 0.3 * parallax;
      lookAt.copy(look);
      if (!settled.current) {
        // First frame: start from the solved framing instead of flying in from the default camera.
        camera.position.copy(desired);
        target.copy(lookAt);
        settled.current = true;
      }
      const k = closeUp ? 3 : 2.2;
      camera.position.x = THREE.MathUtils.damp(camera.position.x, desired.x, k, delta);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, desired.y, k, delta);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, desired.z, k, delta);
      target.x = THREE.MathUtils.damp(target.x, lookAt.x, k, delta);
      target.y = THREE.MathUtils.damp(target.y, lookAt.y, k, delta);
      target.z = THREE.MathUtils.damp(target.z, lookAt.z, k, delta);
      camera.lookAt(target);
      if (camera.position.distanceToSquared(desired) > 1e-6 || target.distanceToSquared(lookAt) > 1e-6) director.wake(120);
      const fog = scene.fog as THREE.Fog | null;
      if (fog) {
        const dist = camera.position.distanceTo(target);
        fog.near = dist * 1.4;
        fog.far = dist * 3.8;
      }
      return;
    }

    const wide = aspect > 1.15;
    // In the hero the copy sits on the left, so the scene is framed toward the right.
    const widthShare = mode === "hero" && wide ? 0.58 : 1;
    const fitZ = (totalWidth / 2 + 1.2) / (tanH * aspect * widthShare);
    // Leave room above the tallest column for its label, less in wide panels where height is scarce.
    const headroom = aspect > 2.2 ? 0.9 : 1.5;
    const fitY = (tallest * 0.62 + headroom) / tanH;
    const baseZ = Math.max(7.5, fitZ, fitY);
    const baseY = tallest * 0.5 + 1.6;
    const visibleWidth = 2 * baseZ * tanH * aspect;
    const shift = mode === "hero" && wide ? -visibleWidth * 0.2 : 0;
    const orbit = mode === "hero" && !reduced && continuous ? Math.sin(t * 0.12) * 0.9 : 0;
    const desiredX = shift + px * 1.1 * parallax + orbit;
    const desiredY = baseY + py * 0.55 * parallax;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, desiredX, 2.2, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, desiredY, 2.2, delta);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, baseZ, 2.2, delta);
    target.set(shift, tallest * 0.4, 0);
    camera.lookAt(target);
    if (Math.abs(camera.position.x - desiredX) + Math.abs(camera.position.y - desiredY) + Math.abs(camera.position.z - baseZ) > 1e-3) director.wake(120);
  });
  return null;
}

export function Dust({ spread = 18 }: { spread?: number }) {
  const { quality } = useSceneSettings();
  const count = PROFILES[quality].dust;
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * spread;
      arr[i * 3 + 1] = Math.random() * 7;
      arr[i * 3 + 2] = (Math.random() - 0.5) * spread * 0.6 - 2;
    }
    return arr;
  }, [count, spread]);
  useFrame(() => {
    if (!ref.current) return;
    const t = sceneTime();
    ref.current.rotation.y = t * 0.015;
    ref.current.position.y = Math.sin(t * 0.2) * 0.15;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.035} color="#ffa733" transparent opacity={0.35} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

function Layers({
  columns,
  method,
  mode,
  highlightMint,
  highlightLayerId,
  focusMint,
  preview,
  onHoverColumn,
  onSelectColumn,
  reduced = false,
}: Omit<StrataSceneProps, "hint" | "visible">) {
  const stageSize = useThree((state) => state.size);
  const stageAspect = stageSize.width / Math.max(1, stageSize.height);
  const { placements, heights, totalWidth, tallest } = useLayout(columns, mode === "stage" && isWideBand(stageAspect) ? 1.6 : 1);
  const { quality, director } = useSceneSettings();
  const physical = PROFILES[quality].physical;
  const registry = useMemo(createLotRegistry, []);
  const states = useRef(new Map<string, LayerState>());
  // Reused every frame so the render loop does not allocate.
  const stackHeights = useRef(new Map<string, number>());
  const [hovered, setHovered] = useState<LayerPlacement | null>(null);
  const pulseStart = useRef<number>(-10);
  const lastMethod = useRef(method);
  const camera = useThree((s) => s.camera);
  useCursor(!!hovered);
  const onHover = useCallback((p: LayerPlacement, over: boolean) => setHovered((h) => (over ? p : h?.layer.id === p.layer.id ? null : h)), []);

  useEffect(() => {
    if (lastMethod.current !== method) {
      lastMethod.current = method;
      pulseStart.current = -1;
    }
  }, [method]);

  // Anything that changes what the scene shows asks for frames until the motion has settled.
  useEffect(() => director.wake(2500), [director, columns, method, highlightMint, highlightLayerId, focusMint, preview, hovered]);

  const ranks = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of columns) reliefRank(c, method).forEach((r, id) => m.set(id, r));
    return m;
  }, [columns, method]);

  const previewFractions = useMemo(() => {
    if (!preview) return new Map<string, number>();
    const col = columns.find((c) => c.mint === preview.mint);
    if (!col) return new Map<string, number>();
    return reliefPreview(col, method, preview.quantity);
  }, [columns, method, preview]);

  useEffect(() => {
    onHoverColumn?.(hovered ? hovered.column.mint : null);
  }, [hovered, onHoverColumn]);

  // Corners of each column plus label headroom, used by the stage camera to solve its framing.
  const columnPoints = useCallback(
    (mints: string[]) => {
      const out: number[] = [];
      const half = WIDTH / 2;
      for (const c of columns) {
        if (!mints.includes(c.mint)) continue;
        const p = placements.find((pl) => pl.column.mint === c.mint);
        if (!p) continue;
        const h = heights.get(c.mint) ?? 0;
        for (const dx of [-half, half]) for (const dz of [-half, half]) out.push(p.x + dx, 0, dz, p.x + dx, h, dz);
        out.push(p.x, h + 0.9, 0);
      }
      return new Float32Array(out);
    },
    [columns, placements, heights],
  );
  const framePoints = useMemo(() => columnPoints(columns.map((c) => c.mint)), [columnPoints, columns]);
  const focusPoints = useMemo(() => {
    if (mode !== "stage" || !focusMint || !columns.some((c) => c.mint === focusMint)) return null;
    return columnPoints([focusMint]);
  }, [mode, focusMint, columns, columnPoints]);

  useFrame((_state, delta) => {
    const t = sceneTime();
    if (pulseStart.current === -1) pulseStart.current = t;
    const sincePulse = t - pulseStart.current;
    const activeMint = hovered?.column.mint ?? highlightMint ?? focusMint ?? null;
    const anyActive = activeMint !== null;
    // The pulse and every eased value keep the scene awake until they have settled.
    let moving = !reduced && sincePulse >= 0 && sincePulse < 6.5;

    // Stack heights are recomputed every frame from the animated progress of each layer.
    const acc = stackHeights.current;
    acc.clear();
    for (const p of placements) {
      const mesh = registry.meshes.get(p.layer.id);
      const mat = registry.materials.get(p.layer.id);
      if (!mesh || !mat) continue;
      let st = states.current.get(p.layer.id);
      if (!st) {
        st = { progress: 0, lift: 0, glow: 0, dim: 1, born: null };
        states.current.set(p.layer.id, st);
      }
      // A lot hidden by the shader gate has not appeared yet, so its entrance waits for it.
      if (!mesh.visible) st.born = null;
      else if (st.born === null) st.born = t + p.columnIndex * 0.05 + p.layerIndex * 0.07;
      const age = st.born === null ? 0 : Math.max(0, t - st.born);
      // Snaps to exactly one at the end so a settled lot stops asking for frames.
      const target = reduced || age >= 0.9 ? 1 : age <= 0 ? 0 : 1 - Math.pow(2, (-10 * age) / 0.9);
      st.progress = Math.max(st.progress, target);

      const fraction = previewFractions.get(p.layer.id) ?? 0;
      const isHovered = hovered?.layer.id === p.layer.id || highlightLayerId === p.layer.id;
      const inActiveColumn = activeMint === p.column.mint;
      st.dim = THREE.MathUtils.damp(st.dim, anyActive && !inActiveColumn ? 0.42 : 1, 5, delta);

      const rank = ranks.get(p.layer.id) ?? 0;
      const band = sincePulse - 0.25 - rank * 0.16;
      const pulse = !reduced && sincePulse >= 0 && sincePulse < 6 ? Math.max(0, 1 - Math.abs(band) * 3.4) : 0;

      const targetLift = fraction > 0 ? 1.05 * fraction : isHovered ? 0.18 : 0;
      const targetGlow = fraction > 0 ? 0.7 : isHovered ? 0.85 : pulse * 0.85;
      st.lift = THREE.MathUtils.damp(st.lift, targetLift, 6, delta);
      st.glow = THREE.MathUtils.damp(st.glow, targetGlow, 8, delta);

      st.height = st.height === undefined || reduced ? p.h : THREE.MathUtils.damp(st.height, p.h, 7, delta);
      if (
        st.progress < 1 ||
        Math.abs(st.dim - (anyActive && !inActiveColumn ? 0.42 : 1)) > 2e-3 ||
        Math.abs(st.lift - targetLift) > 1e-3 ||
        Math.abs(st.glow - targetGlow) > 2e-3 ||
        Math.abs(st.height - p.h) > 1e-3
      )
        moving = true;
      const y0 = acc.get(p.column.mint) ?? 0;
      const h = st.height * st.progress;
      const centerY = y0 + h / 2;
      mesh.position.set(p.x, centerY, st.lift);
      // The block geometry is unit height times the layout height, so the eased height is a scale on top of it.
      mesh.scale.set(1, Math.max(0.0001, st.progress * (st.height / Math.max(1e-6, p.h))), 1);
      acc.set(p.column.mint, y0 + h + GAP * st.progress);

      const base = p.color;
      mat.color.copy(base).multiplyScalar(st.dim);
      mat.emissive.copy(base).lerp(COLOR_AMBER, st.glow);
      mat.emissiveIntensity = (0.16 + st.glow * 1.1) * st.dim;

      const edge = registry.edges.get(p.layer.id);
      if (edge) {
        edge.color.copy(COLOR_EDGE).lerp(COLOR_AMBER, st.glow);
        edge.opacity = (0.12 + st.glow * 0.7) * st.dim;
      }

      const faceGroup = registry.faceGroups.get(p.layer.id);
      const face = registry.faceTexts.get(p.layer.id);
      if (faceGroup && face) {
        faceGroup.position.set(p.x, centerY, WIDTH / 2 + 0.004 + st.lift);
        const dist = camera.position.distanceTo(mesh.position);
        const legible = faceVisibility(dist);
        const emphasis = isHovered || fraction > 0 ? 1 : inActiveColumn && anyActive ? 0.95 : 0.78;
        face.fillOpacity = legible * st.progress * emphasis * (0.25 + 0.75 * st.dim);
      }
    }
    if (moving) director.wake(150);
  });

  // Values under the symbols need room. A short stage draws the columns small, so it keeps the symbols only.
  const showValues = mode !== "hero" && stageSize.height >= 300 && stageSize.width >= 1024;
  // On narrow hero viewports the copy sits over the scene, so labels stay out of the way.
  const showLabels = !(mode === "hero" && stageAspect < 1.15);

  return (
    <group>
      <Rig
        totalWidth={totalWidth}
        tallest={tallest}
        mode={mode}
        reduced={reduced}
        framePoints={framePoints}
        focusPoints={focusPoints}
        focusKey={focusPoints ? (focusMint ?? "") : ""}
      />
      {placements.map((p) => (
        <LotBlock key={p.layer.id} placement={p} registry={registry} physical={physical} onHover={onHover} onSelect={onSelectColumn} />
      ))}
      {placements.map((p) => (
        <LotFace key={`face-${p.layer.id}`} placement={p} registry={registry} />
      ))}

      {showLabels &&
        columns.map((c) => {
          const x = placements.find((p) => p.column.mint === c.mint)?.x ?? 0;
          const h = heights.get(c.mint) ?? 0;
          const activeMint = hovered?.column.mint ?? highlightMint ?? focusMint ?? null;
          const active = activeMint === c.mint;
          const dimmed = activeMint !== null && !active;
          return (
            <Html key={c.mint} position={[x, h + 0.42, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
              <div
                className={`flex flex-col items-center gap-0.5 whitespace-nowrap transition-all duration-500 ${
                  active ? "opacity-100 scale-105" : dimmed ? "opacity-30" : "opacity-70"
                }`}
                style={{ transitionTimingFunction: "cubic-bezier(0.16,1,0.3,1)" }}
              >
                <span className="num text-[11px] tracking-[0.12em] text-foreground">{c.symbol}</span>
                {showValues && (
                  <span className="num text-[10px] text-muted-foreground">
                    {c.value > 0 ? formatUSD(c.value) : c.layers.every((l) => l.basisUnknown) ? "Unknown cost" : c.markPrice === null ? "Unpriced" : formatUSD(c.value)}
                  </span>
                )}
              </div>
            </Html>
          );
        })}

      {hovered && <LayerTooltip placement={hovered} method={method} rank={ranks.get(hovered.layer.id) ?? 0} />}
    </group>
  );
}

export function LayerTooltipCard({ layer, method, rank }: { layer: StrataLayer; method: CostMethod; rank: number }) {
  return (
    <div className="glass-strong rounded-lg px-3.5 py-3 min-w-[220px] animate-in fade-in zoom-in-95 duration-300">
      <div className="flex items-baseline justify-between gap-6">
        <span className="num text-[12px] text-foreground tracking-[0.1em]">{layer.symbol}</span>
        <span className="label !text-[9px]">
          {layer.openedAt ? `Lot ${format(new Date(layer.openedAt), "MMM d, yyyy")}` : "Position"}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1.5 text-[11px]">
        <span className="text-muted-foreground">Shares</span>
        <span className="num text-right text-foreground">{formatQuantity(layer.quantity, 4)}</span>
        <span className="text-muted-foreground">Cost / share</span>
        <span className="num text-right text-foreground">{layer.basisUnknown ? "Unknown" : formatUSD(layer.costPerShare)}</span>
        <span className="text-muted-foreground">Value</span>
        <span className="num text-right text-foreground">{formatUSD(layer.value)}</span>
        <span className="text-muted-foreground">Unrealized</span>
        <span
          className={`num text-right ${
            (layer.unrealizedPnl ?? 0) > 0 ? "text-success" : (layer.unrealizedPnl ?? 0) < 0 ? "text-destructive" : "text-foreground"
          }`}
        >
          {layer.unrealizedPnl === null ? "Unknown" : `${formatUSD(layer.unrealizedPnl)} (${formatPercent(layer.pnlPct)})`}
        </span>
      </div>
      <div className="mt-2.5 pt-2 border-t hairline flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">{method.toUpperCase()} relief order</span>
        <span className="num text-primary">#{rank + 1}</span>
      </div>
    </div>
  );
}

export function LayerTooltip({ placement, method, rank, z = 0.9 }: { placement: LayerPlacement; method: CostMethod; rank: number; z?: number }) {
  return (
    <Html
      position={[placement.x, placement.y + placement.h / 2, z]}
      zIndexRange={[40, 0]}
      style={{ pointerEvents: "none", transform: "translate(18px, -50%)" }}
    >
      <LayerTooltipCard layer={placement.layer} method={method} rank={rank} />
    </Html>
  );
}

/** A dark reflective slab ruled like a ledger sheet. */
export function Ground() {
  const { quality } = useSceneSettings();
  return (
    <group>
      {PROFILES[quality].reflector ? (
        <mesh rotation-x={-Math.PI / 2} position-y={-0.001}>
          <planeGeometry args={[80, 80]} />
          <MeshReflectorMaterial
            blur={[420, 110]}
            resolution={1024}
            mixBlur={1}
            mixStrength={11}
            roughness={0.85}
            depthScale={1.15}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.7}
            color="#0c0c0e"
            metalness={0.42}
            mirror={0.55}
          />
        </mesh>
      ) : (
        <mesh rotation-x={-Math.PI / 2} position-y={-0.001}>
          <planeGeometry args={[80, 80]} />
          <meshStandardMaterial color="#0c0c0d" roughness={1} metalness={0} />
        </mesh>
      )}
      <Grid
        position={[0, 0.003, 0]}
        args={[80, 80]}
        cellSize={0.8}
        cellThickness={0.6}
        cellColor="#1b1c21"
        sectionSize={4}
        sectionThickness={1}
        sectionColor="#2b2d34"
        fadeDistance={30}
        fadeStrength={1.6}
        fadeFrom={1}
        infiniteGrid
        followCamera={false}
      />
    </group>
  );
}

/** Four soft panels that light the lots: a warm sky, a white strip overhead, amber and blue sides. */
const LIGHT_PANELS: { color: string; intensity: number; position: [number, number, number]; rotation: [number, number, number]; scale: [number, number] }[] = [
  { color: "#fff2dc", intensity: 2.4, position: [0, 8, -6], rotation: [0, 0, 0], scale: [16, 5] },
  { color: "#ffffff", intensity: 3, position: [0, 5, 8], rotation: [Math.PI / 2.4, 0, 0], scale: [18, 0.5] },
  { color: "#ffa733", intensity: 1.2, position: [-8, 3, 2], rotation: [0, Math.PI / 2, 0], scale: [6, 2] },
  { color: "#9aa6c8", intensity: 1, position: [8, 2, 2], rotation: [0, -Math.PI / 2, 0], scale: [6, 2] },
];

/**
 * The environment map, built before the first frame so the lot shaders are compiled once, with the
 * map in place, instead of again when it arrives a frame later. It runs in its own task so the
 * mount of the scene and the map are two short stalls rather than one long one.
 */
function LedgerEnvironment() {
  const { gl, scene } = useThree();
  const { director } = useSceneSettings();
  useEffect(() => {
    const release = director.hold();
    let target: THREE.WebGLRenderTarget | null = null;
    const timer = window.setTimeout(() => {
      const room = new THREE.Scene();
      const geometry = new THREE.PlaneGeometry(1, 1);
      for (const panel of LIGHT_PANELS) {
        const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
        material.color.set(panel.color).multiplyScalar(panel.intensity);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(...panel.position);
        mesh.rotation.set(...panel.rotation);
        mesh.scale.set(panel.scale[0], panel.scale[1], 1);
        room.add(mesh);
      }
      const pmrem = new THREE.PMREMGenerator(gl);
      target = pmrem.fromScene(room, 0, 0.1, 100);
      scene.environment = target.texture;
      pmrem.dispose();
      geometry.dispose();
      for (const child of room.children) ((child as THREE.Mesh).material as THREE.Material).dispose();
      release();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      release();
      if (target) {
        if (scene.environment === target.texture) scene.environment = null;
        target.dispose();
      }
    };
  }, [gl, scene, director]);
  return null;
}

export function SceneLights() {
  return (
    <>
      <fog attach="fog" args={[COLOR_BG, 14, 34]} />
      <ambientLight intensity={0.22} />
      {/* Directional key and rim. They also rake the floor, and that faint sheen is what makes the
          slab read as a surface on real displays; flagged spot lights left the lower half of the
          landing page black. */}
      <directionalLight position={[6, 12, 7]} intensity={2.1} color="#fff1dc" />
      <directionalLight position={[-9, 7, -9]} intensity={1.7} color="#dfe6ff" />
      <pointLight position={[-7, 3, 4]} intensity={28} distance={22} color="#ffa733" />
      <pointLight position={[9, 2, -4]} intensity={14} distance={24} color="#7f8cb0" />
      <LedgerEnvironment />
    </>
  );
}

/** Shared post chain: soft bloom for the amber pulses, a light vignette and filmic tone mapping last. */
export function SceneEffects() {
  const { quality } = useSceneSettings();
  const profile = PROFILES[quality];
  if (!profile.post) return null;
  return (
    <EffectComposer multisampling={profile.msaa}>
      <Bloom mipmapBlur intensity={0.8} luminanceThreshold={0.7} luminanceSmoothing={0.25} radius={0.66} />
      <Vignette eskil={false} offset={0.16} darkness={0.6} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}

const GOVERNOR_WARMUP_MS = 4000;
const GOVERNOR_WINDOW_MS = 1000;
const GOVERNOR_MIN_FPS = 30;
const GOVERNOR_SLOW_WINDOWS = 3;

/**
 * Watches the frame rate from inside the canvas and calls onSlow after three consecutive seconds
 * under 30 fps. The first seconds are skipped because shader compilation stalls every GPU. A
 * window is discarded rather than counted as slow when the tab was hidden, the frameloop paused or
 * an on demand scene idled between frames, since a pause is not a slow frame. A display that
 * simply runs at its refresh rate never trips it.
 */
export function DprGovernor({ onSlow }: { onSlow: () => void }) {
  const { director, continuous } = useSceneSettings();
  const state = useRef({ start: -1, windowStart: 0, frames: 0, slowWindows: 0, idle: false });
  useFrame(() => {
    const s = state.current;
    const now = performance.now();
    if (s.start < 0) {
      s.start = now;
      s.windowStart = now;
      return;
    }
    if (now - s.start < GOVERNOR_WARMUP_MS) {
      s.windowStart = now;
      s.frames = 0;
      return;
    }
    if (!continuous && (!director.awake() || s.idle)) {
      // The last frame before an on demand scene idles, or the first one after it woke. The gap
      // between them is a pause, not a slow frame, so the window starts over.
      s.idle = !director.awake();
      s.windowStart = now;
      s.frames = 0;
      s.slowWindows = 0;
      return;
    }
    s.frames++;
    const elapsed = now - s.windowStart;
    if (elapsed < GOVERNOR_WINDOW_MS) return;
    const fps = (s.frames * 1000) / elapsed;
    const interrupted = elapsed > GOVERNOR_WINDOW_MS * 2 || document.visibilityState !== "visible";
    s.frames = 0;
    s.windowStart = now;
    if (interrupted) {
      s.slowWindows = 0;
      return;
    }
    if (fps >= GOVERNOR_MIN_FPS) {
      s.slowWindows = 0;
      return;
    }
    if (++s.slowWindows >= GOVERNOR_SLOW_WINDOWS) {
      s.slowWindows = 0;
      onSlow();
    }
  });
  return null;
}

/**
 * Quality tier and pixel ratio cap for a canvas. The tier opens at what the device and GPU
 * suggest and only steps down, one tier at a time and then a quarter of the pixel ratio at a time,
 * when the governor reports a sustained frame rate drop. A strong GPU never sees a change.
 */
export function useRenderBudget(opening: Quality | null) {
  const [steps, setSteps] = useState(0);
  const lower = useCallback(() => setSteps((n) => n + 1), []);
  let quality: Quality = opening ?? "lite";
  let used = 0;
  while (used < steps) {
    const next = stepDown(quality);
    if (!next) break;
    quality = next;
    used++;
  }
  const dprScale = Math.max(0.5, Math.pow(0.75, steps - used));
  const dprCap = Math.max(1, Math.round(PROFILES[quality].dpr * dprScale * 100) / 100);
  return { quality, dprCap, lower };
}

/** The materials the renderer would compile for an object, so the same set it draws with. */
function materialsOf(object: THREE.Object3D): THREE.Material[] {
  const o = object as THREE.Object3D & { isMesh?: boolean; isPoints?: boolean; isLine?: boolean; isSprite?: boolean };
  if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return [];
  const material = (object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
  return !material ? [] : Array.isArray(material) ? material : [material];
}

/** Time one compile task may spend linking programs that turn out to be cached before it yields. */
const GATE_TASK_MS = 4;

interface GateState {
  busy: boolean;
  ready: boolean;
  cancelled: boolean;
  timer: number;
  /** Objects hidden while their program links, with the visibility they had before. */
  hidden: Map<THREE.Object3D, boolean>;
}

/**
 * Compiles shaders before anything draws with them. Without this the first frame compiles every
 * program in one stall of a second or more on integrated and mobile GPUs, and anything mounted
 * later, such as lots arriving with the data, stalls the frame it first appears in. An object whose
 * material has no program yet is hidden until the program is linked. Drivers that compile in
 * parallel do it off the main thread; the others link one program per task so the page keeps
 * responding in between. Lights are never hidden, because the light count is part of every program.
 */
function ShaderGate({ onReady }: { onReady: () => void }) {
  const { gl, scene, camera } = useThree();
  const { director } = useSceneSettings();
  const state = useRef<GateState>({ busy: false, ready: false, cancelled: false, timer: 0, hidden: new Map() });

  const pending = useCallback(() => {
    const out: THREE.Object3D[] = [];
    scene.traverse((object) => {
      const materials = materialsOf(object);
      if (materials.length === 0) return;
      for (const m of materials) {
        if ((gl.properties.get(m) as { currentProgram?: unknown }).currentProgram === undefined) {
          out.push(object);
          return;
        }
      }
    });
    return out;
  }, [gl, scene]);

  const run = useCallback(
    (fresh: THREE.Object3D[]) => {
      const st = state.current;
      st.busy = true;
      for (const object of fresh) {
        st.hidden.set(object, object.visible);
        object.visible = false;
      }
      const finish = () => {
        // Anything the scene showed again on its own keeps that state.
        for (const [object, visible] of st.hidden) if (!object.visible) object.visible = visible;
        st.hidden.clear();
        st.busy = false;
        if (st.cancelled) return;
        if (!st.ready) {
          st.ready = true;
          onReady();
        }
        director.wake(1500);
      };
      if (gl.extensions.has("KHR_parallel_shader_compile")) {
        gl.compileAsync(scene, camera).then(finish, finish);
        return;
      }
      // Every object goes through its own compile, because which materials share a program is the
      // renderer's decision. A program it has already linked costs a lookup, so cached ones pack
      // into one task and a new program gets a task to itself.
      const queue = fresh.slice();
      const step = () => {
        if (st.cancelled) return;
        const start = performance.now();
        while (queue.length > 0 && performance.now() - start < GATE_TASK_MS) {
          const object = queue.shift() as THREE.Object3D;
          // Drivers defer the real work until the link status is read, so read it in this task.
          for (const material of gl.compile(object, camera, scene)) {
            const props = gl.properties.get(material) as { currentProgram?: THREE.WebGLProgram };
            props.currentProgram?.getUniforms();
          }
        }
        if (queue.length > 0) {
          st.timer = window.setTimeout(step, 0);
          return;
        }
        finish();
      };
      st.timer = window.setTimeout(step, 0);
    },
    [gl, scene, camera, director, onReady],
  );

  // The first pass runs before the loop exists, once the environment and other setup are done.
  useEffect(() => {
    const st = state.current;
    st.cancelled = false;
    director.whenReady(() => {
      if (!st.cancelled && !st.busy) run(pending());
    });
    return () => {
      st.cancelled = true;
      window.clearTimeout(st.timer);
    };
  }, [director, run, pending]);

  // Later passes catch what mounted since, before the frame that would draw it.
  useFrame(() => {
    const st = state.current;
    if (st.busy) return;
    const fresh = pending();
    if (fresh.length > 0) run(fresh);
  }, -1000);
  return null;
}

type Frameloop = "always" | "demand" | "never";

/**
 * Lets the director schedule frames and, on demand, keeps them coming while it is awake. The
 * frameloop itself is a canvas prop because the canvas reapplies that prop on every render.
 */
function LoopControl({ frameloop }: { frameloop: Frameloop }) {
  const { director } = useSceneSettings();
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    director.bind(() => invalidate());
    return () => director.bind(null);
  }, [director, invalidate]);
  useEffect(() => {
    if (frameloop === "demand") director.wake(1500);
  }, [frameloop, director]);
  useFrame(() => {
    director.tick();
    if (frameloop === "demand" && director.awake()) invalidate();
  }, -1000);
  return null;
}

/** A tier pinned through the `quality` query parameter, for checking a look on any machine. */
function pinnedQuality(): Quality | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("quality");
  return value === "full" || value === "balanced" || value === "lite" ? value : null;
}

/** Picks the tier from the GPU behind a fresh context, unless the device already decided. */
function openingQuality(hint: Quality | null | undefined, gl: THREE.WebGLRenderer): Quality {
  if (hint) return hint;
  const cores = navigator.hardwareConcurrency ?? 8;
  return classifyRenderer(rendererName(gl.getContext()), cores);
}

/**
 * Canvas shell shared by the scenes. The scene contents mount once the tier is known, compile,
 * then start drawing. `children` receives the settings so a scene can pass them on.
 */
export function SceneCanvas({
  hint,
  visible,
  camera,
  wake,
  children,
}: {
  hint: Quality | null | undefined;
  visible: boolean;
  camera: { position: [number, number, number]; fov: number; near: number; far: number };
  /** Extra wake sources outside the canvas, for example a scroll driven progress value. */
  wake?: (director: FrameDirector) => (() => void) | void;
  children: ReactNode;
}) {
  const director = useMemo(createDirector, []);
  const pinned = useMemo(pinnedQuality, []);
  const [opening, setOpening] = useState<Quality | null>(pinned ?? hint ?? null);
  const budget = useRenderBudget(opening);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const continuous = PROFILES[budget.quality].loop === "always";
  const settings = useMemo<SceneSettings>(() => ({ quality: budget.quality, director, continuous }), [budget.quality, director, continuous]);
  useEffect(() => {
    if (!wake) return;
    const stop = wake(director);
    return () => {
      if (typeof stop === "function") stop();
    };
  }, [wake, director]);
  // Nothing is drawn until the shaders are compiled, and nothing while the canvas is off screen.
  const frameloop: Frameloop = !ready || !visible ? "never" : continuous ? "always" : "demand";
  return (
    <div
      className="absolute inset-0 transition-opacity duration-700 ease-out"
      style={{ opacity: ready ? 1 : 0 }}
      onPointerMove={() => director.wake(700)}
      onPointerDown={() => director.wake(1200)}
      onPointerLeave={() => director.wake(1200)}
    >
      <Canvas
        dpr={[1, budget.dprCap]}
        frameloop={frameloop}
        camera={camera}
        gl={{ antialias: (pinned ?? hint) !== "lite", alpha: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping }}
        style={{ background: "transparent" }}
        onCreated={({ gl }) => setOpening((q) => q ?? openingQuality(hint, gl))}
      >
        {opening && (
          <SettingsProvider value={settings}>
            <LoopControl frameloop={frameloop} />
            {!pinned && <DprGovernor onSlow={budget.lower} />}
            {children}
            <ShaderGate onReady={onReady} />
          </SettingsProvider>
        )}
      </Canvas>
    </div>
  );
}

export default function StrataScene({ hint = null, reduced = false, visible = true, ...props }: StrataSceneProps) {
  return (
    <SceneCanvas hint={hint} visible={visible} camera={{ position: [4, 3.4, 12], fov: 30, near: 0.1, far: 80 }}>
      <SceneLights />
      <group position={[0, -0.02, 0]}>
        <Layers {...props} reduced={reduced} />
        <Ground />
        {(props.mode === "hero" || props.mode === "stage") && !reduced && <Dust />}
      </group>
      <SceneEffects />
    </SceneCanvas>
  );
}
