import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import type { MotionValue } from "framer-motion";
import { MONO_FONT, WIDTH } from "./strata-scene";
import { CHAPTERS, CHAPTER_COUNT, copyVisibility } from "./story-data";

/**
 * Set dressing for the landing story: the parts of the scene that are not lots.
 * Everything here reads scroll progress or the pointer every frame and never re-renders.
 */

type TextMesh = THREE.Mesh & { fillOpacity: number };

/**
 * A warm spotlight that follows the pointer across the floor. The scene is dark by design, so the
 * torch is how a visitor discovers the columns: whatever they point at is lit, the rest recedes.
 */
export function Torch({ enabled, reach = 12 }: { enabled: boolean; reach?: number }) {
  const light = useRef<THREE.SpotLight>(null);
  const gl = useThree((s) => s.gl);
  const target = useMemo(() => new THREE.Object3D(), []);
  // Aim at column height rather than the floor, so pointing at a face lights that column and a ray
  // above the horizon still lands somewhere sensible. The result is clamped to the ledger's ground.
  const aimPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.6), []);
  const hit = useMemo(() => new THREE.Vector3(), []);
  const goal = useMemo(() => new THREE.Vector3(0, 0, 2), []);
  const inside = useRef(false);
  const power = useRef(0);

  useEffect(() => {
    const el = gl.domElement;
    const on = () => (inside.current = true);
    const off = () => (inside.current = false);
    el.addEventListener("pointerenter", on);
    el.addEventListener("pointerleave", off);
    return () => {
      el.removeEventListener("pointerenter", on);
      el.removeEventListener("pointerleave", off);
    };
  }, [gl]);

  useFrame((state, delta) => {
    const l = light.current;
    if (!l) return;
    if (l.target !== target) l.target = target;
    state.raycaster.setFromCamera(state.pointer, state.camera);
    if (state.raycaster.ray.intersectPlane(aimPlane, hit)) {
      goal.set(THREE.MathUtils.clamp(hit.x, -reach, reach), 0, THREE.MathUtils.clamp(hit.z, -5, 7));
    }
    target.position.x = THREE.MathUtils.damp(target.position.x, goal.x, 7, delta);
    target.position.z = THREE.MathUtils.damp(target.position.z, goal.z, 7, delta);
    target.position.y = 0.4;
    target.updateMatrixWorld();
    // The lamp hangs above and slightly in front of the target so column faces catch it.
    l.position.set(target.position.x + 0.6, 5.8, target.position.z + 1.6);
    const want = enabled && inside.current ? 1 : 0;
    power.current = THREE.MathUtils.damp(power.current, want, 4, delta);
    l.intensity = 340 * power.current;
    l.visible = power.current > 0.01;
  });

  return (
    <>
      <primitive object={target} />
      <spotLight ref={light} angle={0.42} penumbra={0.9} distance={24} decay={1.6} intensity={0} color="#ffd6a3" visible={false} />
    </>
  );
}

/**
 * The chapter name set into the floor in front of the ledger, like a mark cut into a bench. It sits
 * in front of the ledger itself rather than the camera centre, so it reads as a plinth label, and it
 * only reads while its chapter is in view.
 */
export function FloorType({ progress }: { progress: MotionValue<number> }) {
  const texts = useRef<(TextMesh | null)[]>([]);
  useFrame(() => {
    const p = progress.get();
    for (let i = 0; i < CHAPTER_COUNT; i++) {
      const t = texts.current[i];
      if (!t) continue;
      const v = copyVisibility(p, i);
      t.fillOpacity = v * 0.09;
      t.visible = v > 0.01;
    }
  });
  return (
    <group>
      {CHAPTERS.map((c, i) => (
        <Text
          key={c.id}
          ref={(m: TextMesh | null) => {
            texts.current[i] = m;
          }}
          font={MONO_FONT}
          fontSize={0.9}
          letterSpacing={0.24}
          anchorX="center"
          anchorY="middle"
          position={[0, 0.006, 3.6]}
          rotation={[-Math.PI / 2, 0, 0]}
          color="#ffffff"
          fillOpacity={0}
          renderOrder={1}
        >
          {`${String(i).padStart(2, "0")}  ${c.label.toUpperCase()}`}
          <meshBasicMaterial transparent depthWrite={false} toneMapped={false} />
        </Text>
      ))}
    </group>
  );
}

const HORIZON_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const HORIZON_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec2 vUv;
  void main() {
    // Brightest along the ground line, gone two thirds of the way up, softened toward both ends.
    float band = exp(-pow(vUv.y * 4.2, 1.35));
    float ends = smoothstep(0.0, 0.32, vUv.x) * smoothstep(1.0, 0.68, vUv.x);
    float a = band * ends * uStrength;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

/**
 * A faint warm band far behind the ledger. It gives the floor a horizon so the columns stand in a
 * place rather than in a void, and it is all the colour the scene allows outside the data.
 */
export function Horizon({ progress }: { progress: MotionValue<number> }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const camera = useThree((s) => s.camera);
  const uniforms = useMemo(() => ({ uColor: { value: new THREE.Color("#ffa733") }, uStrength: { value: 0.16 } }), []);
  // The band lives on its own layer so the reflective floor does not mirror it into a grey wash.
  useEffect(() => {
    mesh.current?.layers.set(1);
    camera.layers.enable(1);
  }, [camera]);
  useFrame(() => {
    if (!mat.current) return;
    // The band warms through the story and settles once the ledger is coloured.
    const p = progress.get();
    mat.current.uniforms.uStrength.value = 0.09 + Math.min(1, p * 1.6) * 0.07;
  });
  return (
    <mesh ref={mesh} position={[0, 11, -46]} renderOrder={-1}>
      <planeGeometry args={[220, 22]} />
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        vertexShader={HORIZON_VERT}
        fragmentShader={HORIZON_FRAG}
        transparent
        depthWrite={false}
        depthTest={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

/**
 * A dimension line beside one column: a vertical rule with a tick at every lot boundary, the way a
 * core sample is measured. Ticks follow the lots as they split and lift, so the geometry is rewritten
 * each frame from the boundaries passed in.
 */
export function DimensionLine({ maxLots = 24 }: { maxLots?: number }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    // Two vertices for the rule plus two per tick, one tick per boundary (lots + 1).
    const pos = new Float32Array((2 + (maxLots + 1) * 2) * 3);
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setDrawRange(0, 0);
    return g;
  }, [maxLots]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const material = useMemo(() => new THREE.LineBasicMaterial({ color: "#f2f1ec", transparent: true, opacity: 0, depthWrite: false }), []);
  useEffect(() => () => material.dispose(), [material]);
  const line = useMemo(() => new THREE.LineSegments(geometry, material), [geometry, material]);
  return <primitive object={line} />;
}

function putVertex(arr: Float32Array, n: number, x: number, y: number, z: number): number {
  arr[n * 3] = x;
  arr[n * 3 + 1] = y;
  arr[n * 3 + 2] = z;
  return n + 1;
}

/** Writes a dimension line. `bounds` are y values of lot boundaries from the floor up, already lifted. */
export function writeDimensionLine(line: THREE.LineSegments, x: number, z: number, bounds: number[], opacity: number) {
  const attr = line.geometry.getAttribute("position") as THREE.BufferAttribute;
  const arr = attr.array as Float32Array;
  const tick = 0.14;
  const rx = x - WIDTH / 2 - 0.34;
  const capacity = arr.length / 3;
  let n = 0;
  if (bounds.length >= 2 && n + 2 <= capacity) {
    n = putVertex(arr, n, rx, bounds[0], z);
    n = putVertex(arr, n, rx, bounds[bounds.length - 1], z);
  }
  for (const y of bounds) {
    if (n + 2 > capacity) break;
    n = putVertex(arr, n, rx, y, z);
    n = putVertex(arr, n, rx + tick, y, z);
  }
  attr.needsUpdate = true;
  line.geometry.setDrawRange(0, n);
  (line.material as THREE.LineBasicMaterial).opacity = opacity * 0.5;
  line.visible = opacity > 0.01;
}
