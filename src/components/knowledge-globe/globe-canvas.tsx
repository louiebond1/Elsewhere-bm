'use client';
/* eslint-disable react-hooks/immutability, react-hooks/purity, react-hooks/refs -- Three.js scene objects, uniforms and buffers are mutated every frame by design (React Three Fiber's model); React state is never mutated. */
import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { arc, centroid, decorativeParticles, knowledgePosition, type Vec3 } from './geometry';
import type { GlobeProps } from './types';

/**
 * The 3D Knowledge Globe. Two point clouds: decorative particles (no meaning) and knowledge dots (one per real
 * record, positioned by id). Each is a single draw call. Rotation is drag/touch with inertia; picking is done
 * in screen space on the knowledge dots only.
 */
const CAMERA_Z = 4.0;
const SURFACE = 4000, INNER = 600;

const VERT = /* glsl */ `
attribute float aSize; attribute float aBright; attribute float aState; attribute float aPhase;
uniform float uTime; uniform float uPixelRatio; uniform float uScale; uniform float uDim;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float depth = clamp((-mv.z - ${(CAMERA_Z - 1).toFixed(2)}) / 2.0, 0.0, 1.0);
  // aState: 0 dimmed, 1 normal, 2 lit (used in an answer), 3 selected.
  float lit = step(1.5, aState);
  float pulse = lit * (0.5 + 0.5 * sin(uTime * 2.6 + aPhase));
  float grow = aState > 2.5 ? 2.1 : (aState > 1.5 ? 1.45 + 0.35 * pulse : (aState < 0.5 ? 0.85 : 1.0));
  gl_PointSize = aSize * grow * uPixelRatio * uScale * (1.0 - 0.45 * depth);
  float b = aBright * (aState < 0.5 ? 0.2 : 1.0) * uDim;
  vAlpha = clamp(b * (1.0 - 0.72 * depth) + pulse * 0.25, 0.0, 1.0);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */ `
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vec3(1.0), smoothstep(0.5, 0.12, d) * vAlpha);
}`;

function pointsMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uScale: { value: 1 }, uDim: { value: 1 } },
  });
}

type Shared = { group: React.RefObject<THREE.Group | null>; dragging: React.RefObject<boolean>; velocity: React.RefObject<{ x: number; y: number }>; lastInteract: React.RefObject<number>; select: React.RefObject<((id: string | null) => void) | null> };

function Scene({ dots, selectedId, focusCategory, litIds, reducedMotion, shared, calloutEl, onPick }: GlobeProps & { shared: Shared; calloutEl: React.RefObject<HTMLDivElement | null>; onPick: React.RefObject<((x: number, y: number, touch: boolean) => string | null) | null> }) {
  const { size, camera } = useThree();
  const decor = useMemo(() => decorativeParticles(SURFACE, INNER), []);
  const decorMat = useMemo(() => pointsMaterial(), []);
  const dotMat = useMemo(() => pointsMaterial(), []);
  const positions = useMemo(() => dots.map((d) => knowledgePosition(d.id, d.category)), [dots]);
  const byId = useMemo(() => new Map(dots.map((d, i) => [d.id, i])), [dots]);

  const decorGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(decor.pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(decor.size, 1));
    g.setAttribute('aBright', new THREE.BufferAttribute(decor.bright, 1));
    g.setAttribute('aState', new THREE.BufferAttribute(new Float32Array(decor.count).fill(1), 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(decor.count), 1));
    return g;
  }, [decor]);

  const dotGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions.flat()), 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(dots.length).fill(7.5), 1));
    g.setAttribute('aBright', new THREE.BufferAttribute(new Float32Array(dots.length).fill(0.95), 1));
    g.setAttribute('aState', new THREE.BufferAttribute(new Float32Array(dots.length).fill(1), 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(Float32Array.from(dots.map((_, i) => i * 0.7)), 1));
    return g;
  }, [positions, dots]);
  useEffect(() => () => { decorGeo.dispose(); }, [decorGeo]);
  useEffect(() => () => { dotGeo.dispose(); }, [dotGeo]);
  useEffect(() => () => { decorMat.dispose(); dotMat.dispose(); }, [decorMat, dotMat]);

  // Highlight state per dot.
  const lit = useMemo(() => new Set(litIds), [litIds]);
  useEffect(() => {
    const st = dotGeo.getAttribute('aState') as THREE.BufferAttribute;
    dots.forEach((d, i) => {
      const s = d.id === selectedId ? 3 : lit.has(d.id) ? 2 : (lit.size || focusCategory) ? (focusCategory && d.category === focusCategory ? 1 : 0) : 1;
      st.setX(i, s);
    });
    st.needsUpdate = true;
    decorMat.uniforms.uDim.value = lit.size || focusCategory ? 0.5 : selectedId ? 0.8 : 1;
  }, [dots, dotGeo, selectedId, focusCategory, lit, decorMat]);

  // Connections between the dots an answer used, in the order it used them.
  const lines = useMemo(() => {
    const pts = litIds.map((id) => byId.get(id)).filter((i): i is number => i != null).map((i) => positions[i]);
    if (pts.length < 2) return null;
    const all: number[] = [];
    for (let k = 0; k < pts.length - 1; k++) for (const p of arc(pts[k], pts[k + 1])) all.push(...p);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(all), 3));
    return { geo: g, count: all.length / 3, born: performance.now() };
  }, [litIds, byId, positions]);
  useEffect(() => () => { lines?.geo.dispose(); }, [lines]);
  const lineMat = useMemo(() => new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.38, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const lineObj = useMemo(() => (lines ? new THREE.Line(lines.geo, lineMat) : null), [lines, lineMat]);

  const rings = useMemo(() => [
    { r: 1.3, tilt: [1.2, 0.18, 0.14] as Vec3, speed: 0.03, opacity: 0.32 },
    { r: 1.48, tilt: [1.38, -0.42, 0] as Vec3, speed: -0.02, opacity: 0.2 },
    { r: 1.16, tilt: [0.42, 0.85, 0.2] as Vec3, speed: 0.025, opacity: 0.12 },
  ].map((ring) => {
    const g = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 257 }, (_, i) => new THREE.Vector3(Math.cos((i / 256) * Math.PI * 2) * ring.r, 0, Math.sin((i / 256) * Math.PI * 2) * ring.r)));
    return { ...ring, obj: new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: ring.opacity, depthWrite: false })) };
  }), []);
  useEffect(() => () => rings.forEach((r) => { r.obj.geometry.dispose(); (r.obj.material as THREE.Material).dispose(); }), [rings]);

  // Turn the dots that matter towards the camera.
  const target = useRef<THREE.Quaternion | null>(null);
  useEffect(() => {
    const ids = selectedId ? [selectedId] : litIds.length ? litIds : focusCategory ? dots.filter((d) => d.category === focusCategory).map((d) => d.id) : [];
    const c = centroid(ids.map((id) => byId.get(id)).filter((i): i is number => i != null).map((i) => positions[i]));
    const g = shared.group.current;
    if (!c || !g) { target.current = null; return; }
    const world = new THREE.Vector3(...c).applyQuaternion(g.quaternion);
    const delta = new THREE.Quaternion().setFromUnitVectors(world, new THREE.Vector3(0, 0.12, 1).normalize());
    const q = delta.multiply(g.quaternion.clone());
    if (reducedMotion) { g.quaternion.copy(q); target.current = null; } else target.current = q;
    shared.lastInteract.current = performance.now();
  }, [selectedId, litIds, focusCategory, dots, byId, positions, reducedMotion, shared]);

  // Screen-space picking of knowledge dots on the side facing the camera.
  useEffect(() => {
    onPick.current = (x, y, touch) => {
      const g = shared.group.current; if (!g) return null;
      let best = -1, bestD = touch ? 30 : 18;
      const v = new THREE.Vector3();
      positions.forEach((p, i) => {
        v.set(...p).applyQuaternion(g.quaternion);
        if (v.z < 0.08) return;
        v.project(camera);
        const sx = ((v.x + 1) / 2) * size.width, sy = ((1 - v.y) / 2) * size.height;
        const d = Math.hypot(sx - x, sy - y);
        if (d < bestD) { bestD = d; best = i; }
      });
      return best >= 0 ? dots[best].id : null;
    };
  }, [positions, dots, camera, size, shared, onPick]);

  const tmp = useMemo(() => new THREE.Vector3(), []);
  const yAxis = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const xAxis = useMemo(() => new THREE.Vector3(1, 0, 0), []);
  const spin = useMemo(() => new THREE.Quaternion(), []);
  useFrame((state, delta) => {
    const g = shared.group.current; if (!g) return;
    const t = state.clock.elapsedTime;
    for (const m of [decorMat, dotMat]) { m.uniforms.uTime.value = t; m.uniforms.uPixelRatio.value = state.gl.getPixelRatio(); m.uniforms.uScale.value = Math.max(0.6, Math.min(1.6, size.height / 720)); }
    const dt = Math.min(delta, 0.05);
    if (target.current && !shared.dragging.current) {
      g.quaternion.slerp(target.current, 1 - Math.pow(0.02, dt));
      if (g.quaternion.angleTo(target.current) < 0.002) target.current = null;
    } else if (!shared.dragging.current) {
      const v = shared.velocity.current;
      if (Math.abs(v.x) + Math.abs(v.y) > 0.0001) {
        g.quaternion.premultiply(spin.setFromAxisAngle(yAxis, v.x)).premultiply(spin.setFromAxisAngle(xAxis, v.y));
        v.x *= Math.pow(0.05, dt); v.y *= Math.pow(0.05, dt);
      } else if (!reducedMotion && performance.now() - shared.lastInteract.current > 4000) {
        g.quaternion.premultiply(spin.setFromAxisAngle(yAxis, dt * 0.06));
      }
    }
    if (!reducedMotion) rings.forEach((r) => { r.obj.rotation.y += dt * r.speed; });
    if (lines) lines.geo.setDrawRange(0, reducedMotion ? lines.count : Math.min(lines.count, Math.floor(((performance.now() - lines.born) / 900) * lines.count)));
    // Keep the callout on the selected dot.
    const el = calloutEl.current;
    const i = selectedId ? byId.get(selectedId) : undefined;
    if (el) {
      if (i == null) { el.style.opacity = '0'; } else {
        tmp.set(...positions[i]).applyQuaternion(g.quaternion);
        const front = tmp.z > 0;
        tmp.project(camera);
        el.style.transform = `translate3d(${((tmp.x + 1) / 2) * size.width}px, ${((1 - tmp.y) / 2) * size.height}px, 0)`;
        el.style.opacity = front ? '1' : '0.25';
      }
    }
  });

  return (
    <>
      <group ref={shared.group}>
        <points geometry={decorGeo} material={decorMat} />
        <points geometry={dotGeo} material={dotMat} />
        {lineObj && <primitive object={lineObj} />}
      </group>
      {rings.map((r, i) => (
        <group key={i} rotation={r.tilt}>
          <primitive object={r.obj} />
        </group>
      ))}
    </>
  );
}

export default function GlobeCanvas(props: GlobeProps) {
  // One stable object for the life of the globe, so effects don't re-run on every render.
  const sharedRef = useRef<Shared | null>(null);
  if (!sharedRef.current) sharedRef.current = { group: { current: null }, dragging: { current: false }, velocity: { current: { x: 0, y: 0 } }, lastInteract: { current: 0 }, select: { current: null } };
  const shared = sharedRef.current;
  const callout = useRef<HTMLDivElement>(null);
  const onPick = useRef<((x: number, y: number, touch: boolean) => string | null) | null>(null);
  const drag = useRef<{ x: number; y: number; sx: number; sy: number; t: number; touch: boolean } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => { shared.select.current = props.onSelect; }, [props.onSelect, shared]);

  const rotate = (dx: number, dy: number) => {
    const g = shared.group.current; if (!g) return;
    const k = 0.0055;
    g.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * k)).premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy * k));
    shared.velocity.current = { x: dx * k, y: dy * k };
  };

  return (
    <div ref={wrap} className="absolute inset-0 touch-none select-none"
      onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), touch: e.pointerType !== 'mouse' }; shared.dragging.current = true; shared.velocity.current = { x: 0, y: 0 }; shared.lastInteract.current = performance.now(); }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (d) { rotate(e.clientX - d.x, e.clientY - d.y); d.x = e.clientX; d.y = e.clientY; shared.lastInteract.current = performance.now(); }
        else if (e.pointerType === 'mouse') {
          const r = wrap.current!.getBoundingClientRect();
          wrap.current!.style.cursor = onPick.current?.(e.clientX - r.left, e.clientY - r.top, false) ? 'pointer' : 'grab';
        }
      }}
      onPointerUp={(e) => {
        const d = drag.current; drag.current = null; shared.dragging.current = false;
        if (d && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6) {
          shared.velocity.current = { x: 0, y: 0 };
          const r = wrap.current!.getBoundingClientRect();
          shared.select.current?.(onPick.current?.(e.clientX - r.left, e.clientY - r.top, d.touch) ?? null);
        }
      }}
      onPointerCancel={() => { drag.current = null; shared.dragging.current = false; }}>
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0, CAMERA_Z], fov: 35 }} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }} onCreated={({ gl }) => gl.setClearColor(0x000000, 0)} aria-hidden>
        <Scene {...props} shared={shared} calloutEl={callout} onPick={onPick} />
      </Canvas>
      <div ref={callout} className="pointer-events-none absolute left-0 top-0 opacity-0 transition-opacity duration-300">{props.callout}</div>
    </div>
  );
}
