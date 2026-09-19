import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, RoundedBox, useCursor } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import type { MotionValue } from "framer-motion";
import { format } from "date-fns";
import { formatUSD, formatQuantity } from "@/lib/format";
import { reliefRank, type StrataColumn } from "./strata-data";
import {
  COLOR_AMBER,
  Dust,
  Ground,
  LayerTooltipCard,
  SceneLights,
  WIDTH,
  useLayout,
  type LayerPlacement,
} from "./strata-scene";
import { CHAPTER_COUNT, chapterAt, colorize, dividendWave, local, reliefStory, scan, seg, split } from "./story-data";

export interface StorySceneProps {
  columns: StrataColumn[];
  /** Scroll progress through the pinned story, 0 to 1. Read every frame, never re-rendered. */
  progress: MotionValue<number>;
  /** Column walked through the relief chapter. */
  featuredMint: string | null;
  /** Column that receives the multiplier increase in the income chapter. */
  incomeMint: string | null;
  onHoverColumn?: (mint: string | null) => void;
  onSelectColumn?: (mint: string) => void;
  lowPower?: boolean;
  reduced?: boolean;
  frameloop?: "always" | "never";
}

/** Gap between lots once the block has split. Wider than the app scene so the split reads. */
const STORY_GAP = 0.2;
/** Visual growth of the income column. The real multiplier change is printed in the copy. */
const INCOME_GROWTH = 0.07;
const COLOR_MONO = new THREE.Color("#676b75");
const COLOR_MONO_DIM = new THREE.Color("#4f535c");

interface LayerState {
  progress: number;
  lift: number;
  glow: number;
  dim: number;
  born: number | null;
}

interface Keyframe {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

function StoryRig({
  progress,
  totalWidth,
  tallest,
  focusX,
  focusHeights,
  reduced,
}: {
  progress: MotionValue<number>;
  totalWidth: number;
  tallest: number;
  focusX: { relief: number; income: number };
  focusHeights: { relief: number; income: number };
  reduced: boolean;
}) {
  const { camera, size, scene } = useThree();
  const lookAt = useMemo(() => new THREE.Vector3(), []);
  const desired = useMemo(() => new THREE.Vector3(), []);
  const frames = useMemo<Keyframe[]>(
    () => Array.from({ length: CHAPTER_COUNT }, () => ({ position: new THREE.Vector3(), target: new THREE.Vector3() })),
    [],
  );

  useFrame((state, delta) => {
    const persp = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    const wide = aspect > 1.15;
    const fov = wide ? 30 : 44;
    if (persp.fov !== fov) {
      persp.fov = fov;
      persp.updateProjectionMatrix();
    }
    const halfFov = THREE.MathUtils.degToRad(fov / 2);
    const tanH = Math.tan(halfFov);
    // Copy sits on the left on wide screens, so the scene is framed toward the right.
    const share = wide ? 0.42 : 1;
    const fitZ = Math.max(8, (totalWidth / 2 + 0.7) / (tanH * aspect * share), (tallest * 0.6 + 1.3) / tanH);
    const visW = 2 * fitZ * tanH * aspect;
    const shift = wide ? -visW * 0.235 : 0;
    // On narrow screens the copy sits under the scene, so the columns are raised.
    const vshift = wide ? 0 : -tallest * 0.55;
    // Close ups frame one column at roughly two thirds of the viewport height.
    const closeZFor = (h: number) => Math.max(7, (h * 0.78 + 1.3) / tanH) * (wide ? 1 : 1.5);
    const closeShift = vshift * 0.75;
    const closeOffFor = (z: number) => (wide ? 2 * z * tanH * aspect * 0.19 : 0);

    const [f0, f1, f2, f3, f4, f5, f6] = frames;
    f0.position.set(shift, tallest * 0.55 + 1.4 + vshift, fitZ);
    f0.target.set(shift, tallest * 0.38 + vshift, 0);

    f1.position.set(shift + fitZ * 0.6, tallest * 1.05 + vshift, fitZ * 0.74);
    f1.target.set(shift, tallest * 0.34 + vshift, 0);

    const hr = focusHeights.relief;
    const zr = closeZFor(hr);
    const offR = closeOffFor(zr);
    f2.position.set(focusX.relief - offR + zr * 0.42, hr * 0.62 + 1.2 + closeShift, zr * 0.9);
    f2.target.set(focusX.relief - offR, hr * 0.44 + closeShift, 0);

    const hi = focusHeights.income;
    const zi = closeZFor(hi);
    const offI = closeOffFor(zi);
    f3.position.set(focusX.income - offI + zi * 0.34, hi * 1.5 + 3.2 + closeShift, zi * 0.78);
    f3.target.set(focusX.income - offI, hi * 0.46 + closeShift, 0);

    f4.position.set(shift, tallest * 1.35 + vshift, fitZ * 1.04);
    f4.target.set(shift, tallest * 0.3 + vshift, 0);

    f5.position.set(shift - 1.2, tallest * 0.32 + 0.3 + vshift, fitZ * 0.92);
    f5.target.set(shift, tallest * 0.4 + vshift, 0);

    f6.position.copy(f0.position);
    f6.target.copy(f0.target);

    const p = progress.get();
    const i = chapterAt(p);
    const l = local(p, i);
    const blend = seg(l, 0.6, 1);
    const a = frames[i];
    const b = frames[Math.min(CHAPTER_COUNT - 1, i + 1)];
    desired.lerpVectors(a.position, b.position, blend);
    lookAt.lerpVectors(a.target, b.target, blend);

    const t = state.clock.elapsedTime;
    const orbitWeight = i === 0 ? 1 - blend : i === CHAPTER_COUNT - 1 ? blend * 0 + 1 : 0;
    const orbit = reduced ? 0 : Math.sin(t * 0.12) * 0.8 * orbitWeight;
    const parallax = reduced ? 0 : 0.8;
    desired.x += orbit + state.pointer.x * 0.9 * parallax;
    desired.y += state.pointer.y * 0.45 * parallax;

    const k = reduced ? 12 : 5.5;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, desired.x, k, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, desired.y, k, delta);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, desired.z, k, delta);
    camera.lookAt(lookAt);

    // Fog follows the camera distance so close ups keep depth without hiding the far columns.
    const fog = scene.fog as THREE.Fog | null;
    if (fog) {
      const dist = camera.position.distanceTo(lookAt);
      fog.near = dist * 1.25;
      fog.far = dist * 3.4;
    }
  });
  return null;
}

/** A soft falloff texture so the beam has no visible plane edges. */
function useBeamTexture() {
  return useMemo(() => {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const img = ctx.createImageData(size, size);
      for (let y = 0; y < size; y++) {
        const v = y / (size - 1);
        const vertical = Math.min(1, v * 6) * Math.min(1, (1 - v) * 3);
        for (let x = 0; x < size; x++) {
          const u = (x / (size - 1) - 0.5) / 0.22;
          const a = Math.exp(-u * u) * vertical;
          // alphaMap reads the green channel, so the falloff goes into every channel.
          const i = (y * size + x) * 4;
          const v8 = Math.round(a * 255);
          img.data[i] = v8;
          img.data[i + 1] = v8;
          img.data[i + 2] = v8;
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, []);
}

/** Disposes a manually created texture when its owner unmounts. */
function useDispose(tex: THREE.Texture) {
  useEffect(() => () => tex.dispose(), [tex]);
}

function Beam({ progress, minX, maxX, height }: { progress: MotionValue<number>; minX: number; maxX: number; height: number }) {
  const group = useRef<THREE.Group>(null);
  const falloff = useBeamTexture();
  useDispose(falloff);
  const core = useRef<THREE.MeshBasicMaterial>(null);
  const halo = useRef<THREE.MeshBasicMaterial>(null);
  const light = useRef<THREE.PointLight>(null);
  useFrame(() => {
    const s = scan(progress.get());
    const on = s > 0 && s < 1 ? Math.sin(s * Math.PI) ** 0.35 : 0;
    if (!group.current) return;
    group.current.visible = on > 0.001;
    group.current.position.x = THREE.MathUtils.lerp(minX - 1.6, maxX + 1.6, s);
    if (core.current) core.current.opacity = 1 * on;
    if (halo.current) halo.current.opacity = 0.45 * on;
    if (light.current) light.current.intensity = 34 * on;
  });
  return (
    <group ref={group} position={[0, height / 2 + 0.4, 0.15]}>
      <mesh>
        <planeGeometry args={[0.16, height + 2.2]} />
        <meshBasicMaterial ref={core} color="#ffd18a" alphaMap={falloff} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh>
        <planeGeometry args={[1.6, height + 2.2]} />
        <meshBasicMaterial ref={halo} color="#ffa733" alphaMap={falloff} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <pointLight ref={light} color="#ffb454" distance={7} intensity={0} position={[0, 0, 0.8]} />
    </group>
  );
}

function StoryLayers({
  columns,
  progress,
  featuredMint,
  incomeMint,
  onHoverColumn,
  onSelectColumn,
  reduced = false,
}: Omit<StorySceneProps, "lowPower" | "frameloop">) {
  const { placements, totalWidth, tallest } = useLayout(columns);
  const meshes = useRef(new Map<string, THREE.Mesh>());
  const materials = useRef(new Map<string, THREE.MeshPhysicalMaterial>());
  const states = useRef(new Map<string, LayerState>());
  const labelGroups = useRef(new Map<string, THREE.Group>());
  const tagGroups = useRef(new Map<string, THREE.Group>());
  const tooltipGroup = useRef<THREE.Group>(null);
  const stackHeights = useRef(new Map<string, number>());
  const [hovered, setHovered] = useState<LayerPlacement | null>(null);
  const [chapter, setChapter] = useState(0);
  const [reliefMethod, setReliefMethod] = useState<"fifo" | "lifo" | "hifo">("fifo");
  const reliefCache = useRef<{ p: number; column: StrataColumn | null; story: ReturnType<typeof reliefStory> }>({ p: -1, column: null, story: null });
  useCursor(!!hovered);

  const featured = useMemo(() => columns.find((c) => c.mint === featuredMint) ?? null, [columns, featuredMint]);
  const incomeColumn = useMemo(() => columns.find((c) => c.mint === incomeMint) ?? null, [columns, incomeMint]);

  const columnX = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of placements) if (!m.has(p.column.mint)) m.set(p.column.mint, p.x);
    return m;
  }, [placements]);

  const fullHeights = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of columns) {
      const hs = placements.filter((p) => p.column.mint === c.mint).map((p) => p.h);
      m.set(c.mint, hs.reduce((s, h) => s + h, 0) + Math.max(0, hs.length - 1) * STORY_GAP);
    }
    return m;
  }, [columns, placements]);

  const ranks = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of columns) reliefRank(c, reliefMethod).forEach((r, id) => m.set(id, r));
    return m;
  }, [columns, reliefMethod]);

  useEffect(() => {
    onHoverColumn?.(hovered ? hovered.column.mint : null);
  }, [hovered, onHoverColumn]);

  const xs = placements.map((p) => p.x);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 0;

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const p = progress.get();
    const ch = chapterAt(p);
    if (ch !== chapter) setChapter(ch);
    const sp = split(p);
    const col = colorize(p);
    const wave = dividendWave(p);
    const sc = scan(p);
    // The relief walk sorts lots, so it is only recomputed when scroll or data changed.
    const cache = reliefCache.current;
    if (cache.p !== p || cache.column !== featured) {
      cache.p = p;
      cache.column = featured;
      cache.story = reliefStory(p, featured ?? undefined);
    }
    const relief = cache.story;
    if (relief && relief.method !== reliefMethod) setReliefMethod(relief.method);
    const focusMint = ch === 2 ? featuredMint : ch === 3 ? incomeMint : null;
    const activeMint = hovered?.column.mint ?? focusMint;
    const beamX = THREE.MathUtils.lerp(minX - 1.6, maxX + 1.6, sc);
    const beamOn = sc > 0 && sc < 1;

    const acc = stackHeights.current;
    acc.clear();
    for (const pl of placements) {
      const mesh = meshes.current.get(pl.layer.id);
      const mat = materials.current.get(pl.layer.id);
      if (!mesh || !mat) continue;
      let st = states.current.get(pl.layer.id);
      if (!st) {
        st = { progress: 0, lift: 0, glow: 0, dim: 1, born: null };
        states.current.set(pl.layer.id, st);
      }
      if (st.born === null) st.born = t + pl.columnIndex * 0.05 + pl.layerIndex * 0.07;
      const age = Math.max(0, t - st.born);
      const target = reduced ? 1 : age <= 0 ? 0 : 1 - Math.pow(2, -10 * Math.min(1, age / 0.9));
      st.progress = Math.max(st.progress, target);

      const isIncome = pl.column.mint === incomeMint;
      const grow = isIncome ? 1 + INCOME_GROWTH * wave : 1;
      const fraction = relief?.fractions.get(pl.layer.id) ?? 0;
      const isHovered = hovered?.layer.id === pl.layer.id;
      const inActive = activeMint === null || activeMint === pl.column.mint;
      st.dim = THREE.MathUtils.damp(st.dim, inActive ? 1 : 0.42, 5, delta);

      const y0 = acc.get(pl.column.mint) ?? 0;
      const h = pl.h * st.progress * grow;
      const centerY = y0 + h / 2;
      acc.set(pl.column.mint, y0 + h + STORY_GAP * sp * st.progress);

      // Amber band rising through the income column as the multiplier is applied.
      const colH = (fullHeights.get(pl.column.mint) ?? 1) * (1 + INCOME_GROWTH);
      const bandY = wave * (colH + 0.8) - 0.4;
      const band = isIncome && wave > 0 && wave < 1 ? Math.exp(-Math.pow((centerY - bandY) / 0.5, 2)) : 0;
      const flash = beamOn ? Math.exp(-Math.pow((pl.x - beamX) / 0.55, 2)) : 0;

      const targetLift = fraction > 0 ? 1.05 * fraction : isHovered ? 0.18 : 0;
      const targetGlow = Math.max(fraction > 0 ? 0.5 + 0.2 * fraction : 0, isHovered ? 0.85 : 0, band * 0.9, flash * 0.55);
      st.lift = THREE.MathUtils.damp(st.lift, targetLift, 6, delta);
      st.glow = THREE.MathUtils.damp(st.glow, targetGlow, 9, delta);

      mesh.position.set(pl.x, centerY, st.lift);
      mesh.scale.set(1, Math.max(0.0001, st.progress * grow), 1);

      // One unbroken block before the split, then beds of alternating tone, then colour by result.
      const mono = pl.layerIndex % 2 === 0 ? COLOR_MONO : COLOR_MONO_DIM;
      mat.color.copy(COLOR_MONO).lerp(mono, sp).lerp(pl.color, col).multiplyScalar(st.dim);
      mat.emissive.copy(mat.color).lerp(COLOR_AMBER, st.glow);
      // Flat emissive fill is lowest before the split so the block reads by its lighting alone.
      mat.emissiveIntensity = (0.1 + 0.1 * sp + st.glow * 1.1) * st.dim;
      mat.opacity = pl.layer.basisUnknown && col > 0.5 ? 0.72 : 0.94;

      const tag = tagGroups.current.get(pl.layer.id);
      if (tag) tag.position.set(pl.x - WIDTH / 2 - 0.16, centerY, 0.3);
      if (isHovered && tooltipGroup.current) tooltipGroup.current.position.set(pl.x, centerY, st.lift);
    }

    for (const c of columns) {
      const g = labelGroups.current.get(c.mint);
      if (g) g.position.set(columnX.get(c.mint) ?? 0, (acc.get(c.mint) ?? 0) + 0.42, 0);
    }
  });

  const focusMint = chapter === 2 ? featuredMint : chapter === 3 ? incomeMint : null;
  const showValues = chapter >= 4;
  const viewport = useThree((state) => state.size);
  // Lot tags sit left of the column, which only fits beside the copy on wide screens.
  const showTags = chapter === 2 && viewport.width / Math.max(1, viewport.height) > 1.15;
  const focusHeights = {
    relief: featured ? (fullHeights.get(featured.mint) ?? tallest) : tallest,
    income: incomeColumn ? (fullHeights.get(incomeColumn.mint) ?? tallest) : tallest,
  };
  const focusX = {
    relief: featured ? (columnX.get(featured.mint) ?? 0) : 0,
    income: incomeColumn ? (columnX.get(incomeColumn.mint) ?? 0) : 0,
  };

  return (
    <group>
      <StoryRig progress={progress} totalWidth={totalWidth} tallest={tallest} focusX={focusX} focusHeights={focusHeights} reduced={reduced} />
      {placements.map((pl) => (
        <RoundedBox
          key={pl.layer.id}
          ref={(m: THREE.Mesh | null) => {
            if (m) meshes.current.set(pl.layer.id, m);
            else meshes.current.delete(pl.layer.id);
          }}
          args={[WIDTH, pl.h, WIDTH]}
          radius={0.035}
          smoothness={3}
          position={[pl.x, pl.y + pl.h / 2, 0]}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(pl);
          }}
          onPointerOut={() => setHovered((h) => (h?.layer.id === pl.layer.id ? null : h))}
          onClick={(e) => {
            e.stopPropagation();
            onSelectColumn?.(pl.column.mint);
          }}
        >
          <meshPhysicalMaterial
            ref={(m: THREE.MeshPhysicalMaterial | null) => {
              if (m) materials.current.set(pl.layer.id, m);
              else materials.current.delete(pl.layer.id);
            }}
            color={COLOR_MONO}
            emissive={COLOR_MONO}
            emissiveIntensity={0.2}
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

      <Beam progress={progress} minX={minX} maxX={maxX} height={tallest} />

      {columns.map((c) => {
        const dimmed = focusMint !== null && focusMint !== c.mint;
        const active = (hovered?.column.mint ?? focusMint) === c.mint;
        return (
          <group
            key={c.mint}
            ref={(g: THREE.Group | null) => {
              if (g) labelGroups.current.set(c.mint, g);
              else labelGroups.current.delete(c.mint);
            }}
          >
            <Html center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
              <div
                className={`flex flex-col items-center gap-1 whitespace-nowrap transition-all duration-700 ${
                  dimmed ? "opacity-15" : active ? "opacity-100 scale-105" : "opacity-75"
                }`}
                style={{ transitionTimingFunction: "cubic-bezier(0.16,1,0.3,1)" }}
              >
                <span className="num text-[11px] tracking-[0.14em] text-foreground">{c.symbol}</span>
                <span className="num text-[10px] text-muted-foreground">
                  {showValues ? formatUSD(c.value) : `${formatQuantity(c.quantity, 4)} sh`}
                </span>
              </div>
            </Html>
          </group>
        );
      })}

      {showTags &&
        featured &&
        featured.layers.map((layer) => (
          <group
            key={layer.id}
            ref={(g: THREE.Group | null) => {
              if (g) tagGroups.current.set(layer.id, g);
              else tagGroups.current.delete(layer.id);
            }}
          >
            <Html zIndexRange={[20, 0]} style={{ pointerEvents: "none", transform: "translate(-100%, -50%)" }}>
              <div className="flex items-center gap-2.5 whitespace-nowrap text-[11px] animate-in fade-in slide-in-from-right-2 duration-500">
                <span className="text-foreground/90">{layer.openedAt ? format(new Date(layer.openedAt), "MMM d, yyyy") : "Opening balance"}</span>
                <span className="num text-muted-foreground">{layer.basisUnknown ? "Unknown cost" : `${formatUSD(layer.costPerShare)} / sh`}</span>
                <span className="num text-primary">#{(ranks.get(layer.id) ?? 0) + 1}</span>
              </div>
            </Html>
          </group>
        ))}

      {hovered && (
        <group ref={tooltipGroup}>
          <Html position={[0, 0, 0.9]} zIndexRange={[40, 0]} style={{ pointerEvents: "none", transform: "translate(18px, -50%)" }}>
            <LayerTooltipCard layer={hovered.layer} method={reliefMethod} rank={ranks.get(hovered.layer.id) ?? 0} />
          </Html>
        </group>
      )}
    </group>
  );
}

export default function StoryScene({ lowPower = false, reduced = false, frameloop = "always", ...props }: StorySceneProps) {
  return (
    <Canvas
      dpr={lowPower ? [1, 1.25] : [1, 1.75]}
      frameloop={frameloop}
      camera={{ position: [0, 3.4, 12], fov: 30, near: 0.1, far: 120 }}
      gl={{ antialias: !lowPower, alpha: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping }}
      style={{ background: "transparent" }}
    >
      <SceneLights />
      <group position={[0, -0.02, 0]}>
        <StoryLayers {...props} reduced={reduced} />
        <Ground lowPower={lowPower} />
        {!reduced && <Dust />}
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
