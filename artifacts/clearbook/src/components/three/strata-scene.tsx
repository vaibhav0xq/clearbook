import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, RoundedBox, Environment, Lightformer, MeshReflectorMaterial, useCursor } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import type { CostMethod } from "@workspace/api-client-react";
import { format } from "date-fns";
import { formatUSD, formatQuantity, formatPercent } from "@/lib/format";
import { reliefPreview, reliefRank, type StrataColumn, type StrataLayer } from "./strata-data";

export type StrataMode = "hero" | "portfolio" | "trade";

export interface StrataSceneProps {
  columns: StrataColumn[];
  method: CostMethod;
  mode: StrataMode;
  highlightMint?: string | null;
  preview?: { mint: string; quantity: number } | null;
  onHoverColumn?: (mint: string | null) => void;
  onSelectColumn?: (mint: string) => void;
  lowPower?: boolean;
  /** Reduced motion: no orbit, dust, entrance or pulse animation. Hover feedback stays. */
  reduced?: boolean;
  frameloop?: "always" | "never";
}

const PITCH = 1.6;
const WIDTH = 0.92;
const GAP = 0.06;
const MIN_H = 0.1;
const MAX_STACK = 4.0;

const COLOR_LOSS = new THREE.Color("#ff6a5b");
const COLOR_FLAT = new THREE.Color("#5f6f92");
const COLOR_GAIN = new THREE.Color("#35d39c");
const COLOR_UNKNOWN = new THREE.Color("#3a4152");
const COLOR_AMBER = new THREE.Color("#f7b544");
const COLOR_BG = "#06080d";

function layerColor(layer: StrataLayer): THREE.Color {
  if (layer.basisUnknown) return COLOR_UNKNOWN.clone();
  const pct = layer.pnlPct;
  if (pct === null) return COLOR_FLAT.clone();
  const t = Math.min(1, Math.abs(pct) / 35);
  const target = pct >= 0 ? COLOR_GAIN : COLOR_LOSS;
  return COLOR_FLAT.clone().lerp(target, 0.25 + 0.75 * t);
}

interface LayerPlacement {
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
  lift: number;
  glow: number;
  born: number | null;
}

function useLayout(columns: StrataColumn[]) {
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

function Rig({ totalWidth, tallest, mode, reduced }: { totalWidth: number; tallest: number; mode: StrataMode; reduced: boolean }) {
  const { camera, size } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, delta) => {
    const aspect = size.width / Math.max(1, size.height);
    const persp = camera as THREE.PerspectiveCamera;
    const halfFov = THREE.MathUtils.degToRad(persp.fov / 2);
    const wide = aspect > 1.15;
    // In the hero the copy sits on the left, so the scene is framed toward the right.
    const widthShare = mode === "hero" && wide ? 0.58 : 1;
    const fitZ = (totalWidth / 2 + 1.2) / (Math.tan(halfFov) * aspect * widthShare);
    // Leave room above the tallest column for its label, less in wide panels where height is scarce.
    const headroom = aspect > 2.2 ? 0.9 : 1.5;
    const fitY = (tallest * 0.62 + headroom) / Math.tan(halfFov);
    const baseZ = Math.max(7.5, fitZ, fitY);
    const baseY = tallest * 0.5 + 1.6;
    const visibleWidth = 2 * baseZ * Math.tan(halfFov) * aspect;
    const shift = mode === "hero" && wide ? -visibleWidth * 0.2 : 0;
    const px = state.pointer.x;
    const py = state.pointer.y;
    const t = state.clock.elapsedTime;
    const orbit = mode === "hero" && !reduced ? Math.sin(t * 0.12) * 0.9 : 0;
    const parallax = reduced ? 0.35 : 1;
    const desiredX = shift + px * 1.1 * parallax + orbit;
    const desiredY = baseY + py * 0.55 * parallax;
    const desiredZ = baseZ;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, desiredX, 2.2, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, desiredY, 2.2, delta);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, desiredZ, 2.2, delta);
    target.set(shift, tallest * 0.4, 0);
    camera.lookAt(target);
  });
  return null;
}

function Dust({ count = 260, spread = 18 }: { count?: number; spread?: number }) {
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
      <pointsMaterial size={0.035} color="#f7b544" transparent opacity={0.35} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

function Layers({
  columns,
  method,
  mode,
  highlightMint,
  preview,
  onHoverColumn,
  onSelectColumn,
  reduced = false,
}: Omit<StrataSceneProps, "lowPower" | "frameloop">) {
  const { placements, heights, totalWidth, tallest } = useLayout(columns);
  const meshes = useRef(new Map<string, THREE.Mesh>());
  const materials = useRef(new Map<string, THREE.MeshPhysicalMaterial>());
  const states = useRef(new Map<string, LayerState>());
  // Reused every frame so the render loop does not allocate.
  const stackHeights = useRef(new Map<string, number>());
  const [hovered, setHovered] = useState<LayerPlacement | null>(null);
  const pulseStart = useRef<number>(-10);
  const lastMethod = useRef(method);
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

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    if (pulseStart.current === -1) pulseStart.current = t;
    const sincePulse = t - pulseStart.current;
    const activeMint = hovered?.column.mint ?? highlightMint ?? null;
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
        st = { progress: 0, lift: 0, glow: 0, born: null };
        states.current.set(p.layer.id, st);
      }
      if (st.born === null) st.born = t + p.columnIndex * 0.05 + p.layerIndex * 0.07;
      const age = Math.max(0, t - st.born);
      const target = reduced ? 1 : age <= 0 ? 0 : 1 - Math.pow(2, -10 * Math.min(1, age / 0.9));
      st.progress = Math.max(st.progress, target);

      const fraction = previewFractions.get(p.layer.id) ?? 0;
      const isHovered = hovered?.layer.id === p.layer.id;
      const inActiveColumn = activeMint === p.column.mint;
      const dim = anyActive && !inActiveColumn ? 0.45 : 1;

      const rank = ranks.get(p.layer.id) ?? 0;
      const band = sincePulse - 0.25 - rank * 0.16;
      const pulse = !reduced && sincePulse >= 0 && sincePulse < 6 ? Math.max(0, 1 - Math.abs(band) * 3.4) : 0;

      const targetLift = fraction > 0 ? 1.05 * fraction : isHovered ? 0.18 : 0;
      const targetGlow = fraction > 0 ? 0.7 : isHovered ? 0.85 : pulse * 0.85;
      st.lift = THREE.MathUtils.damp(st.lift, targetLift, 6, delta);
      st.glow = THREE.MathUtils.damp(st.glow, targetGlow, 8, delta);

      const y0 = acc.get(p.column.mint) ?? 0;
      const h = p.h * st.progress;
      mesh.position.set(p.x, y0 + h / 2, st.lift);
      mesh.scale.set(1, Math.max(0.0001, st.progress), 1);
      acc.set(p.column.mint, y0 + h + GAP * st.progress);

      const base = p.color;
      mat.color.copy(base).multiplyScalar(dim);
      mat.emissive.copy(base).lerp(COLOR_AMBER, st.glow);
      mat.emissiveIntensity = (0.22 + st.glow * 1.1) * dim;
      mat.opacity = p.layer.basisUnknown ? 0.7 : 0.94;
    }
  });

  const showValues = mode !== "hero";
  const viewportSize = useThree((state) => state.size);
  // On narrow hero viewports the copy sits over the scene, so labels stay out of the way.
  const showLabels = !(mode === "hero" && viewportSize.width / Math.max(1, viewportSize.height) < 1.15);

  return (
    <group>
      <Rig totalWidth={totalWidth} tallest={tallest} mode={mode} reduced={reduced} />
      {placements.map((p) => (
        <RoundedBox
          key={p.layer.id}
          ref={(m: THREE.Mesh | null) => {
            if (m) meshes.current.set(p.layer.id, m);
            else meshes.current.delete(p.layer.id);
          }}
          args={[WIDTH, p.h, WIDTH]}
          radius={0.035}
          smoothness={3}
          position={[p.x, p.y + p.h / 2, 0]}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(p);
          }}
          onPointerOut={() => setHovered((h) => (h?.layer.id === p.layer.id ? null : h))}
          onClick={(e) => {
            e.stopPropagation();
            onSelectColumn?.(p.column.mint);
          }}
        >
          <meshPhysicalMaterial
            ref={(m: THREE.MeshPhysicalMaterial | null) => {
              if (m) materials.current.set(p.layer.id, m);
              else materials.current.delete(p.layer.id);
            }}
            color={p.color}
            emissive={p.color}
            emissiveIntensity={0.22}
            roughness={0.22}
            metalness={0.08}
            clearcoat={1}
            clearcoatRoughness={0.18}
            transparent
            opacity={0.94}
            envMapIntensity={1.1}
          />
        </RoundedBox>
      ))}

      {showLabels && columns.map((c, i) => {
        const n = columns.length;
        const pitch = n > 9 ? PITCH * (9 / n) : PITCH;
        const x = (i - (n - 1) / 2) * pitch;
        const h = heights.get(c.mint) ?? 0;
        const active = (hovered?.column.mint ?? highlightMint) === c.mint;
        return (
          <Html key={c.mint} position={[x, h + 0.42, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
            <div
              className={`flex flex-col items-center gap-0.5 whitespace-nowrap transition-all duration-500 ${
                active ? "opacity-100 scale-105" : "opacity-70"
              }`}
              style={{ transitionTimingFunction: "cubic-bezier(0.16,1,0.3,1)" }}
            >
              <span className="num text-[11px] tracking-[0.12em] text-foreground">{c.symbol}</span>
              {showValues && <span className="num text-[10px] text-muted-foreground">{formatUSD(c.value)}</span>}
            </div>
          </Html>
        );
      })}

      {hovered && (
        <Html
          position={[hovered.x, hovered.y + hovered.h / 2, 0.9]}
          zIndexRange={[40, 0]}
          style={{ pointerEvents: "none", transform: "translate(18px, -50%)" }}
        >
          <div className="glass-strong rounded-lg px-3.5 py-3 min-w-[220px] animate-in fade-in zoom-in-95 duration-300">
            <div className="flex items-baseline justify-between gap-6">
              <span className="num text-[12px] text-foreground tracking-[0.1em]">{hovered.layer.symbol}</span>
              <span className="label !text-[9px]">
                {hovered.layer.openedAt ? `Lot ${format(new Date(hovered.layer.openedAt), "MMM d, yyyy")}` : "Position"}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1.5 text-[11px]">
              <span className="text-muted-foreground">Shares</span>
              <span className="num text-right text-foreground">{formatQuantity(hovered.layer.quantity, 4)}</span>
              <span className="text-muted-foreground">Cost / share</span>
              <span className="num text-right text-foreground">
                {hovered.layer.basisUnknown ? "Unknown" : formatUSD(hovered.layer.costPerShare)}
              </span>
              <span className="text-muted-foreground">Value</span>
              <span className="num text-right text-foreground">{formatUSD(hovered.layer.value)}</span>
              <span className="text-muted-foreground">Unrealized</span>
              <span
                className={`num text-right ${
                  (hovered.layer.unrealizedPnl ?? 0) > 0
                    ? "text-success"
                    : (hovered.layer.unrealizedPnl ?? 0) < 0
                      ? "text-destructive"
                      : "text-foreground"
                }`}
              >
                {hovered.layer.unrealizedPnl === null
                  ? "Unknown"
                  : `${formatUSD(hovered.layer.unrealizedPnl)} (${formatPercent(hovered.layer.pnlPct)})`}
              </span>
            </div>
            <div className="mt-2.5 pt-2 border-t hairline flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">{method.toUpperCase()} relief order</span>
              <span className="num text-primary">#{(ranks.get(hovered.layer.id) ?? 0) + 1}</span>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

function Ground({ lowPower }: { lowPower: boolean }) {
  if (lowPower) {
    return (
      <mesh rotation-x={-Math.PI / 2} position-y={-0.001} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#0a0d15" roughness={1} metalness={0} />
      </mesh>
    );
  }
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.001}>
      <planeGeometry args={[60, 60]} />
      <MeshReflectorMaterial
        blur={[500, 120]}
        resolution={640}
        mixBlur={1}
        mixStrength={14}
        roughness={0.9}
        depthScale={1.1}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.6}
        color="#0b0e16"
        metalness={0.45}
        mirror={0.55}
      />
    </mesh>
  );
}

export default function StrataScene({ lowPower = false, reduced = false, frameloop = "always", ...props }: StrataSceneProps) {
  return (
    <Canvas
      dpr={lowPower ? [1, 1.25] : [1, 1.75]}
      frameloop={frameloop}
      camera={{ position: [0, 3.4, 12], fov: 30, near: 0.1, far: 80 }}
      gl={{ antialias: !lowPower, alpha: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping }}
      style={{ background: "transparent" }}
    >
      <fog attach="fog" args={[COLOR_BG, 14, 34]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 10, 6]} intensity={1.5} color="#fff4e0" />
      <pointLight position={[-7, 4, -3]} intensity={26} distance={24} color="#f7b544" />
      <pointLight position={[8, 3, -5]} intensity={18} distance={24} color="#5b8cff" />
      <Environment resolution={128} frames={1}>
        <group>
          <Lightformer intensity={2.2} form="rect" position={[0, 7, -6]} scale={[14, 5, 1]} color="#fff2dc" />
          <Lightformer intensity={1.1} form="rect" position={[-8, 3, 2]} rotation-y={Math.PI / 2} scale={[6, 2, 1]} color="#f7b544" />
          <Lightformer intensity={0.9} form="rect" position={[8, 2, 2]} rotation-y={-Math.PI / 2} scale={[6, 2, 1]} color="#6f9cff" />
        </group>
      </Environment>
      <group position={[0, -0.02, 0]}>
        <Layers {...props} reduced={reduced} />
        <Ground lowPower={lowPower} />
        {props.mode === "hero" && !reduced && <Dust />}
      </group>
      {!lowPower && (
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur intensity={0.75} luminanceThreshold={0.72} luminanceSmoothing={0.25} radius={0.7} />
          <Vignette eskil={false} offset={0.18} darkness={0.62} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
