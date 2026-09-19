import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, RoundedBox, Environment, Lightformer, MeshReflectorMaterial, Grid, Text, useCursor } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import type { CostMethod } from "@workspace/api-client-react";
import { format } from "date-fns";
import { formatUSD, formatQuantity, formatPercent } from "@/lib/format";
import { reliefPreview, reliefRank, type StrataColumn, type StrataLayer } from "./strata-data";

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
  lowPower?: boolean;
  /** Reduced motion: no orbit, dust, entrance or pulse animation. Hover feedback stays. */
  reduced?: boolean;
  frameloop?: "always" | "never";
}

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

/** A stage that is much wider than tall: the band above the reading panel on small screens. */
export function isStageBand(aspect: number): boolean {
  return aspect > 1.6;
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

export function useLayout(columns: StrataColumn[]) {
  return useMemo(() => {
    const n = columns.length;
    const pitch = n > 9 ? PITCH * (9 / n) : PITCH;
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
  }, [columns]);
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

/**
 * One lot. The rounded block carries a hairline edge cage and the engraved face copy in a sibling
 * group, because the block itself is scaled while it grows in and text must never stretch.
 */
export function LotBlock({
  placement,
  onMesh,
  onMaterial,
  onEdges,
  onPointerOver,
  onPointerOut,
  onClick,
  children,
}: {
  placement: LayerPlacement;
  onMesh: (m: THREE.Mesh | null) => void;
  onMaterial: (m: THREE.MeshPhysicalMaterial | null) => void;
  onEdges: (m: THREE.LineBasicMaterial | null) => void;
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  children?: ReactNode;
}) {
  const p = placement;
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(WIDTH + 0.006, p.h + 0.006, WIDTH + 0.006)), [p.h]);
  useEffect(() => () => edges.dispose(), [edges]);
  return (
    <RoundedBox
      ref={onMesh}
      args={[WIDTH, p.h, WIDTH]}
      radius={0.03}
      smoothness={3}
      position={[p.x, p.y + p.h / 2, 0]}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onClick={onClick}
    >
      <meshPhysicalMaterial
        ref={onMaterial}
        color={p.color}
        emissive={p.color}
        emissiveIntensity={0.16}
        roughness={0.3}
        metalness={0.14}
        clearcoat={1}
        clearcoatRoughness={0.14}
        transparent={p.layer.basisUnknown}
        opacity={p.layer.basisUnknown ? 0.42 : 1}
        envMapIntensity={1.25}
      />
      <lineSegments geometry={edges} raycast={() => null}>
        <lineBasicMaterial ref={onEdges} color={COLOR_EDGE} transparent opacity={0.14} depthWrite={false} toneMapped={false} />
      </lineSegments>
      {children}
    </RoundedBox>
  );
}

/** Engraved copy on the front face. The owner positions the group and drives `fillOpacity` per frame. */
export function LotFace({
  placement,
  onGroup,
  onText,
}: {
  placement: LayerPlacement;
  onGroup: (g: THREE.Group | null) => void;
  onText: (t: THREE.Mesh | null) => void;
}) {
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
}

type TextMesh = THREE.Mesh & { fillOpacity: number };

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

  useFrame((state, delta) => {
    const aspect = size.width / Math.max(1, size.height);
    const persp = camera as THREE.PerspectiveCamera;
    const wantedFov = mode === "stage" ? (aspect < 0.9 ? 38 : 32) : 30;
    if (persp.fov !== wantedFov) {
      persp.fov = wantedFov;
      persp.updateProjectionMatrix();
    }
    const tanH = Math.tan(THREE.MathUtils.degToRad(persp.fov / 2));
    const px = state.pointer.x;
    const py = state.pointer.y;
    const t = state.clock.elapsedTime;
    const parallax = reduced ? 0.3 : 1;

    if (mode === "stage") {
      // A three quarter view down the row. The framing is solved numerically so any stage aspect
      // shows the whole ledger, or the focused column, as large as the overlays allow.
      // Short wide stages (the band above the reading panel on small screens) are viewed more
      // frontally so the row spreads across the width, and keep the bottom clear for the caption
      // and the top clear for the brand and wallet controls.
      const band = isStageBand(aspect);
      const yaw = band ? 0.5 : 0.85;
      const el = band ? 0.26 : 0.3;
      const wide = aspect > 1.25;
      const box: FrameBox = band
        ? { left: -0.84, right: 0.84, bottom: -0.4, top: 0.78 }
        : wide
          ? { left: -0.88, right: 0.88, bottom: -0.6, top: 0.86 }
          : { left: -0.9, right: 0.9, bottom: -0.52, top: 0.84 };
      // The point arrays are rebuilt whenever heights or placements change, so their identity is
      // the geometry revision. The key covers the viewport and which column is focused.
      const pts = focusPoints ?? framePoints;
      const key = `${size.width}x${size.height}|${focusKey}`;
      if ((fitted.current.key !== key || fitted.current.pts !== pts) && pts.length > 0) {
        const look = fitted.current.look;
        look.set(0, focusPoints ? 0 : tallest * 0.35, 0);
        if (focusPoints) {
          // Start from the column's own centre so the recentring converges in two passes.
          let sx = 0;
          let sy = 0;
          for (let i = 0; i < focusPoints.length; i += 3) {
            sx += focusPoints[i];
            sy += focusPoints[i + 1];
          }
          look.set(sx / (focusPoints.length / 3), sy / (focusPoints.length / 3), 0);
        }
        fitted.current.distance = fitFrame(pts, yaw, el, look, persp.fov, aspect, box, scratch);
        fitted.current.key = key;
        fitted.current.pts = pts;
      }
      const { distance: d, look } = fitted.current;
      const orbit = reduced ? 0 : Math.sin(t * 0.09) * 0.05;
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
      const k = focusPoints ? 3 : 2.2;
      camera.position.x = THREE.MathUtils.damp(camera.position.x, desired.x, k, delta);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, desired.y, k, delta);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, desired.z, k, delta);
      target.x = THREE.MathUtils.damp(target.x, lookAt.x, k, delta);
      target.y = THREE.MathUtils.damp(target.y, lookAt.y, k, delta);
      target.z = THREE.MathUtils.damp(target.z, lookAt.z, k, delta);
      camera.lookAt(target);
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
    const orbit = mode === "hero" && !reduced ? Math.sin(t * 0.12) * 0.9 : 0;
    const desiredX = shift + px * 1.1 * parallax + orbit;
    const desiredY = baseY + py * 0.55 * parallax;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, desiredX, 2.2, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, desiredY, 2.2, delta);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, baseZ, 2.2, delta);
    target.set(shift, tallest * 0.4, 0);
    camera.lookAt(target);
  });
  return null;
}

export function Dust({ count = 260, spread = 18 }: { count?: number; spread?: number }) {
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
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.y = state.clock.elapsedTime * 0.015;
    ref.current.position.y = Math.sin(state.clock.elapsedTime * 0.2) * 0.15;
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
}: Omit<StrataSceneProps, "lowPower" | "frameloop">) {
  const { placements, heights, totalWidth, tallest } = useLayout(columns);
  const meshes = useRef(new Map<string, THREE.Mesh>());
  const materials = useRef(new Map<string, THREE.MeshPhysicalMaterial>());
  const edgeMaterials = useRef(new Map<string, THREE.LineBasicMaterial>());
  const faceGroups = useRef(new Map<string, THREE.Group>());
  const faceTexts = useRef(new Map<string, TextMesh>());
  const states = useRef(new Map<string, LayerState>());
  // Reused every frame so the render loop does not allocate.
  const stackHeights = useRef(new Map<string, number>());
  const [hovered, setHovered] = useState<LayerPlacement | null>(null);
  const pulseStart = useRef<number>(-10);
  const lastMethod = useRef(method);
  const camera = useThree((s) => s.camera);
  useCursor(!!hovered);

  useEffect(() => {
    if (lastMethod.current !== method) {
      lastMethod.current = method;
      pulseStart.current = -1;
    }
  }, [method]);

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

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    if (pulseStart.current === -1) pulseStart.current = t;
    const sincePulse = t - pulseStart.current;
    const activeMint = hovered?.column.mint ?? highlightMint ?? focusMint ?? null;
    const anyActive = activeMint !== null;

    // Stack heights are recomputed every frame from the animated progress of each layer.
    const acc = stackHeights.current;
    acc.clear();
    for (const p of placements) {
      const mesh = meshes.current.get(p.layer.id);
      const mat = materials.current.get(p.layer.id);
      if (!mesh || !mat) continue;
      let st = states.current.get(p.layer.id);
      if (!st) {
        st = { progress: 0, lift: 0, glow: 0, dim: 1, born: null };
        states.current.set(p.layer.id, st);
      }
      if (st.born === null) st.born = t + p.columnIndex * 0.05 + p.layerIndex * 0.07;
      const age = Math.max(0, t - st.born);
      const target = reduced ? 1 : age <= 0 ? 0 : 1 - Math.pow(2, -10 * Math.min(1, age / 0.9));
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

      const edge = edgeMaterials.current.get(p.layer.id);
      if (edge) {
        edge.color.copy(COLOR_EDGE).lerp(COLOR_AMBER, st.glow);
        edge.opacity = (0.12 + st.glow * 0.7) * st.dim;
      }

      const faceGroup = faceGroups.current.get(p.layer.id);
      const face = faceTexts.current.get(p.layer.id);
      if (faceGroup && face) {
        faceGroup.position.set(p.x, centerY, WIDTH / 2 + 0.004 + st.lift);
        const dist = camera.position.distanceTo(mesh.position);
        const legible = faceVisibility(dist);
        const emphasis = isHovered || fraction > 0 ? 1 : inActiveColumn && anyActive ? 0.95 : 0.78;
        face.fillOpacity = legible * st.progress * emphasis * (0.25 + 0.75 * st.dim);
      }
    }
  });

  const viewportSize = useThree((state) => state.size);
  // Values under the symbols need room. A short wide stage draws the columns small, so it keeps the symbols only.
  const showValues = mode !== "hero" && !isStageBand(viewportSize.width / Math.max(1, viewportSize.height));
  // On narrow hero viewports the copy sits over the scene, so labels stay out of the way.
  const showLabels = !(mode === "hero" && viewportSize.width / Math.max(1, viewportSize.height) < 1.15);

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
        <LotBlock
          key={p.layer.id}
          placement={p}
          onMesh={(m) => {
            if (m) meshes.current.set(p.layer.id, m);
            else meshes.current.delete(p.layer.id);
          }}
          onMaterial={(m) => {
            if (m) materials.current.set(p.layer.id, m);
            else materials.current.delete(p.layer.id);
          }}
          onEdges={(m) => {
            if (m) edgeMaterials.current.set(p.layer.id, m);
            else edgeMaterials.current.delete(p.layer.id);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(p);
          }}
          onPointerOut={() => setHovered((h) => (h?.layer.id === p.layer.id ? null : h))}
          onClick={(e) => {
            e.stopPropagation();
            onSelectColumn?.(p.column.mint);
          }}
        />
      ))}
      {placements.map((p) => (
        <LotFace
          key={`face-${p.layer.id}`}
          placement={p}
          onGroup={(g) => {
            if (g) faceGroups.current.set(p.layer.id, g);
            else faceGroups.current.delete(p.layer.id);
          }}
          onText={(m) => {
            if (m) faceTexts.current.set(p.layer.id, m as TextMesh);
            else faceTexts.current.delete(p.layer.id);
          }}
        />
      ))}

      {showLabels &&
        columns.map((c, i) => {
          const n = columns.length;
          const pitch = n > 9 ? PITCH * (9 / n) : PITCH;
          const x = (i - (n - 1) / 2) * pitch;
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
export function Ground({ lowPower }: { lowPower: boolean }) {
  return (
    <group>
      {lowPower ? (
        <mesh rotation-x={-Math.PI / 2} position-y={-0.001}>
          <planeGeometry args={[80, 80]} />
          <meshStandardMaterial color="#0c0c0d" roughness={1} metalness={0} envMapIntensity={0.12} />
        </mesh>
      ) : (
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
            envMapIntensity={0.12}
          />
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

/**
 * A warm key and a cool rim, both flagged to the ledger. Spot lights rather than directional ones
 * because a directional light also rakes the whole floor, and at the low camera angles the story
 * uses that read as a grey sheen across the slab. The cones cover the columns and fall off before
 * the foreground, so the floor stays black where nothing stands on it.
 */
function KeyLights() {
  const focus = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(0, 1.4, 0);
    return o;
  }, []);
  // Candela chosen so the columns receive the same irradiance the old directional lights gave.
  return (
    <>
      <primitive object={focus} />
      <spotLight position={[6, 12, 7]} target={focus} intensity={415} angle={0.54} penumbra={0.55} decay={2} color="#fff1dc" />
      <spotLight position={[-9, 7, -9]} target={focus} intensity={330} angle={0.6} penumbra={0.5} decay={2} color="#dfe6ff" />
    </>
  );
}

export function SceneLights() {
  return (
    <>
      <fog attach="fog" args={[COLOR_BG, 14, 34]} />
      <ambientLight intensity={0.22} />
      <KeyLights />
      <pointLight position={[-7, 3, 4]} intensity={28} distance={22} color="#ffa733" />
      <pointLight position={[9, 2, -4]} intensity={14} distance={24} color="#7f8cb0" />
      <Environment resolution={256} frames={1}>
        <group>
          <Lightformer intensity={2.4} form="rect" position={[0, 8, -6]} scale={[16, 5, 1]} color="#fff2dc" />
          <Lightformer intensity={3} form="rect" position={[0, 5, 8]} rotation-x={Math.PI / 2.4} scale={[18, 0.5, 1]} color="#ffffff" />
          <Lightformer intensity={1.2} form="rect" position={[-8, 3, 2]} rotation-y={Math.PI / 2} scale={[6, 2, 1]} color="#ffa733" />
          <Lightformer intensity={1} form="rect" position={[8, 2, 2]} rotation-y={-Math.PI / 2} scale={[6, 2, 1]} color="#9aa6c8" />
        </group>
      </Environment>
    </>
  );
}

/** Shared post chain: soft bloom for the amber pulses, a light vignette and filmic tone mapping last. */
export function SceneEffects({ lowPower }: { lowPower: boolean }) {
  if (lowPower) return null;
  return (
    <EffectComposer multisampling={4}>
      <Bloom mipmapBlur intensity={0.8} luminanceThreshold={0.7} luminanceSmoothing={0.25} radius={0.66} />
      <Vignette eskil={false} offset={0.16} darkness={0.6} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}

export default function StrataScene({ lowPower = false, reduced = false, frameloop = "always", ...props }: StrataSceneProps) {
  return (
    <Canvas
      dpr={lowPower ? [1, 1.25] : [1, 1.75]}
      frameloop={frameloop}
      camera={{ position: [4, 3.4, 12], fov: 30, near: 0.1, far: 80 }}
      gl={{ antialias: !lowPower, alpha: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping }}
      style={{ background: "transparent" }}
    >
      <SceneLights />
      <group position={[0, -0.02, 0]}>
        <Layers {...props} reduced={reduced} />
        <Ground lowPower={lowPower} />
        {(props.mode === "hero" || props.mode === "stage") && !reduced && <Dust />}
      </group>
      <SceneEffects lowPower={lowPower} />
    </Canvas>
  );
}
