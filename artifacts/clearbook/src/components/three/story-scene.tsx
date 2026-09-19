import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, useCursor } from "@react-three/drei";
import * as THREE from "three";
import type { MotionValue } from "framer-motion";
import { format } from "date-fns";
import { formatUSD, formatQuantity } from "@/lib/format";
import { reliefRank, type StrataColumn } from "./strata-data";
import {
  COLOR_AMBER,
  COLOR_EDGE,
  Dust,
  Ground,
  LayerTooltipCard,
  LotBlock,
  LotFace,
  SceneEffects,
  SceneLights,
  WIDTH,
  faceVisibility,
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
const COLOR_MONO = new THREE.Color("#72747c");
const COLOR_MONO_DIM = new THREE.Color("#585b63");
/** Where the columns sit on wide screens per chapter: 1 right of the copy, -1 left of it, 0 centred. Mirrors home.tsx. */
export const CHAPTER_SIDE = [1, -1, 1, -1, 0, 0, 0] as const;
type TextMesh = THREE.Mesh & { fillOpacity: number };

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
    const p = progress.get();
    const i = chapterAt(p);
    const l = local(p, i);
    const blend = seg(l, 0.6, 1);
    // Copy and scene swap sides between chapters on wide screens, centred where the copy sits low.
    const sideNow = THREE.MathUtils.lerp(CHAPTER_SIDE[i], CHAPTER_SIDE[Math.min(CHAPTER_COUNT - 1, i + 1)], blend);
    const share = wide ? 0.46 : 1;
    const fitZ = Math.max(8, (totalWidth / 2 + 0.7) / (tanH * aspect * share), (tallest * 0.6 + 1.3) / tanH);
    const visW = 2 * fitZ * tanH * aspect;
    const shiftFor = (side: number) => (wide ? -visW * 0.24 * side : 0);
    const shift = shiftFor(sideNow);
    // On narrow screens the copy sits under the scene, so the columns are raised.
    const vshift = wide ? 0 : -tallest * 0.55;
    // Close ups frame one column at roughly two thirds of the viewport height.
    const closeZFor = (h: number) => Math.max(6.5, (h * 0.8 + 1.3) / tanH) * (wide ? 1 : 1.5);
    const closeShift = vshift * 0.75;
    const closeOffFor = (z: number, side: number) => (wide ? 2 * z * tanH * aspect * 0.2 * side : 0);

    const [f0, f1, f2, f3, f4, f5, f6] = frames;
    // Balance: low and frontal, the row reads as a skyline.
    f0.position.set(shift + fitZ * 0.22, tallest * 0.42 + 1.1 + vshift, fitZ * 0.96);
    f0.target.set(shift, tallest * 0.36 + vshift, 0);

    // Lots: a raking three quarter view that tracks along the row as the chapter scrolls.
    const track = (seg(l, 0.05, 0.95) - 0.5) * totalWidth * 0.55;
    f1.position.set(shift + fitZ * 0.55 + track * 0.6, tallest * 0.9 + 0.6 + vshift, fitZ * 0.72);
    f1.target.set(shift + track, tallest * 0.36 + vshift, 0);

    const hr = focusHeights.relief;
    const zr = closeZFor(hr);
    const offR = closeOffFor(zr, CHAPTER_SIDE[2]);
    f2.position.set(focusX.relief - offR + zr * 0.46, hr * 0.5 + 0.9 + closeShift, zr * 0.88);
    f2.target.set(focusX.relief - offR, hr * 0.42 + closeShift, 0);

    // Income: a high three quarter view from further back, so the band is seen travelling up the
    // column while its neighbours stay low in the frame instead of towering into the copy.
    const hi = focusHeights.income;
    const zi = Math.max(closeZFor(hi), fitZ * 0.66);
    const offI = closeOffFor(zi, CHAPTER_SIDE[3]);
    f3.position.set(focusX.income - offI - zi * 0.3, hi + zi * 0.62 + closeShift, zi * 0.74);
    f3.target.set(focusX.income - offI, hi * 0.4 + closeShift, 0);

    // Marks: high and centred so every column and its colour is in frame above the strip.
    f4.position.set(0, tallest * 1.4 + 0.5 + vshift, fitZ * 1.02);
    f4.target.set(0, tallest * 0.24 + vshift, 0);

    // Proof: low and slightly off axis, the beam crosses the frame.
    f5.position.set(-1.4, tallest * 0.3 + 0.4 + vshift, fitZ * 0.9);
    f5.target.set(0, tallest * 0.42 + vshift, 0);

    // Open: a slow turntable around the whole ledger.
    const turn = reduced ? 0.35 : 0.35 + Math.sin(state.clock.elapsedTime * 0.11) * 0.5;
    f6.position.set(Math.sin(turn) * fitZ * 1.1, tallest * 0.8 + 2 + vshift, Math.cos(turn) * fitZ * 1.1);
    f6.target.set(0, tallest * 0.3 + vshift, 0);

    const a = frames[i];
    const b = frames[Math.min(CHAPTER_COUNT - 1, i + 1)];
    desired.lerpVectors(a.position, b.position, blend);
    lookAt.lerpVectors(a.target, b.target, blend);

    const t = state.clock.elapsedTime;
    const orbitWeight = i === 0 ? 1 - blend : 0;
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
  const edgeMaterials = useRef(new Map<string, THREE.LineBasicMaterial>());
  const faceGroups = useRef(new Map<string, THREE.Group>());
  const faceTexts = useRef(new Map<string, TextMesh>());
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
      const finale = ch === CHAPTER_COUNT - 1 && !hovered ? 0.7 : 1;
      // The income close up keeps its neighbours darker because the copy sits over them.
      const idle = ch === 3 ? 0.26 : 0.42;
      st.dim = THREE.MathUtils.damp(st.dim, (inActive ? 1 : idle) * finale, 5, delta);

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
      mat.emissiveIntensity = (0.14 + 0.06 * sp + st.glow * 1.1) * st.dim;
      // Unknown basis lots turn translucent once the ledger is marked, so the gap in the books is visible.
      mat.opacity = pl.layer.basisUnknown ? THREE.MathUtils.lerp(0.96, 0.42, col) : 1;

      const edge = edgeMaterials.current.get(pl.layer.id);
      if (edge) {
        edge.color.copy(COLOR_EDGE).lerp(COLOR_AMBER, st.glow);
        edge.opacity = (0.06 + 0.1 * sp + st.glow * 0.7) * st.dim;
      }
      const faceGroup = faceGroups.current.get(pl.layer.id);
      const face = faceTexts.current.get(pl.layer.id);
      if (faceGroup && face) {
        faceGroup.position.set(pl.x, centerY, WIDTH / 2 + 0.004 + st.lift);
        const dist = state.camera.position.distanceTo(mesh.position);
        face.fillOpacity = faceVisibility(dist, 10, 15) * sp * st.progress * (isHovered || fraction > 0 ? 1 : 0.8) * (0.2 + 0.8 * st.dim);
      }

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
        <LotBlock
          key={pl.layer.id}
          placement={pl}
          onMesh={(m) => {
            if (m) meshes.current.set(pl.layer.id, m);
            else meshes.current.delete(pl.layer.id);
          }}
          onMaterial={(m) => {
            if (m) materials.current.set(pl.layer.id, m);
            else materials.current.delete(pl.layer.id);
          }}
          onEdges={(m) => {
            if (m) edgeMaterials.current.set(pl.layer.id, m);
            else edgeMaterials.current.delete(pl.layer.id);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(pl);
          }}
          onPointerOut={() => setHovered((h) => (h?.layer.id === pl.layer.id ? null : h))}
          onClick={(e) => {
            e.stopPropagation();
            onSelectColumn?.(pl.column.mint);
          }}
        />
      ))}
      {placements.map((pl) => (
        <LotFace
          key={`face-${pl.layer.id}`}
          placement={pl}
          onGroup={(g) => {
            if (g) faceGroups.current.set(pl.layer.id, g);
            else faceGroups.current.delete(pl.layer.id);
          }}
          onText={(m) => {
            if (m) faceTexts.current.set(pl.layer.id, m as TextMesh);
            else faceTexts.current.delete(pl.layer.id);
          }}
        />
      ))}

      <Beam progress={progress} minX={minX} maxX={maxX} height={tallest} />

      {columns.map((c) => {
        const dimmed = (focusMint !== null && focusMint !== c.mint) || chapter === CHAPTER_COUNT - 1;
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
                <span className="num text-[12px] tracking-[0.16em] text-foreground">{c.symbol}</span>
                <span className="num text-[11px] text-muted-foreground">
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
      <SceneEffects lowPower={lowPower} />
    </Canvas>
  );
}
