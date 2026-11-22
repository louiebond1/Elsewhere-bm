'use client';
import { Component, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { decorativeParticles, knowledgePosition } from './geometry';
import type { GlobeProps } from './types';

const GlobeCanvas = dynamic(() => import('./globe-canvas'), { ssr: false, loading: () => null });

let webgl: boolean | null = null;
function webglAvailable() {
  if (webgl === null) {
    try {
      const c = document.createElement('canvas');
      webgl = !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch { webgl = false; }
  }
  return webgl;
}
const never = () => () => {};

const REDUCE = '(prefers-reduced-motion: reduce)';
const onMotionChange = (cb: () => void) => { const m = window.matchMedia(REDUCE); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); };
const prefersReduced = () => window.matchMedia(REDUCE).matches;
/** True when the person has asked their device for less motion: no spinning, no animated turns or lines. */
export function useReducedMotion() {
  return useSyncExternalStore(onMotionChange, prefersReduced, () => false);
}

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** The 3D globe where WebGL works; otherwise the same dots, flat and still, and still clickable. */
export function KnowledgeGlobe(props: GlobeProps) {
  // Known only in the browser; nothing is drawn on the server.
  const gl = useSyncExternalStore(never, webglAvailable, () => null);
  const flat = <FlatGlobe {...props} />;
  if (gl === null) return null;
  return gl ? <Boundary fallback={flat}><GlobeCanvas {...props} /></Boundary> : flat;
}

/** No WebGL: a still, front-facing view drawn in SVG. Knowledge dots are buttons. */
function FlatGlobe({ dots, selectedId, focusCategory, litIds, onSelect, callout }: GlobeProps) {
  const decor = useMemo(() => {
    const d = decorativeParticles(1400, 0), out: { x: number; y: number; o: number; r: number }[] = [];
    for (let i = 0; i < d.count; i++) { const z = d.pos[i * 3 + 2]; if (z > 0) out.push({ x: d.pos[i * 3], y: d.pos[i * 3 + 1], o: d.bright[i] * (0.35 + 0.65 * z), r: d.size[i] * 0.0028 }); }
    return out;
  }, []);
  const lit = new Set(litIds);
  // A fixed view: each dot shown on the side facing us (mirrored if it sits at the back).
  const pts = dots.map((d) => { const [x, y, z] = knowledgePosition(d.id, d.category); return { ...d, x: z >= 0 ? x : -x, y }; });
  const sel = pts.find((p) => p.id === selectedId);
  return (
    <div className="absolute inset-0">
      <svg viewBox="-1.25 -1.25 2.5 2.5" className="h-full w-full" role="group" aria-label="Knowledge globe">
        {decor.map((p, i) => <circle key={i} cx={p.x} cy={-p.y} r={p.r} fill="#fff" opacity={p.o * (lit.size || focusCategory ? 0.5 : 1)} />)}
        <ellipse cx="0" cy="0" rx="1.2" ry="0.32" fill="none" stroke="#fff" strokeOpacity="0.14" strokeWidth="0.004" transform="rotate(-18)" />
        {pts.map((p) => {
          const on = p.id === selectedId || lit.has(p.id) || (!lit.size && (!focusCategory || p.category === focusCategory));
          return <circle key={p.id} role="button" tabIndex={-1} aria-label={p.id} onClick={() => onSelect(p.id)} cx={p.x} cy={-p.y} r={p.id === selectedId ? 0.03 : lit.has(p.id) ? 0.022 : 0.015} fill="#fff" opacity={on ? 1 : 0.2} className="cursor-pointer" />;
        })}
      </svg>
      {sel && <div className="pointer-events-none absolute" style={{ left: `${((sel.x + 1.25) / 2.5) * 100}%`, top: `${((-sel.y + 1.25) / 2.5) * 100}%` }}>{callout}</div>}
    </div>
  );
}
