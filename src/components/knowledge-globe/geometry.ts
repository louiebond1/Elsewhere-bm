/**
 * Where everything sits on the Knowledge Globe. Pure functions, so the 3D globe, the flat fallback and the
 * tests agree. A knowledge dot's position comes only from its id and area, so it never moves between visits.
 */
export type Vec3 = [number, number, number];

/** FNV-1a: a stable number in [0, 1) from a string. */
export function hash01(s: string, salt = 0) {
  let h = 0x811c9dc5 ^ salt;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0) / 4294967296;
}

const toVec = (latDeg: number, lonDeg: number): Vec3 => {
  const lat = (latDeg * Math.PI) / 180, lon = (lonDeg * Math.PI) / 180;
  return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
};

/** Each area has its own region of the globe. */
export const AREA_CENTRES: Record<string, Vec3> = {
  work: toVec(22, -28), skills: toVec(-14, 34), education: toVec(52, 58), goals: toVec(48, -118),
  values: toVec(4, 112), interests: toVec(-30, 168), personal: toVec(-46, -78), other: toVec(-62, 70),
};
/** How far (radians) an area's dots spread from its centre. */
export const AREA_SPREAD = 0.52;

const norm = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** A unit vector inside the area's cap, spread evenly (square-root radius) and fixed by the id. */
export function knowledgePosition(id: string, area: string): Vec3 {
  const c = AREA_CENTRES[area] ?? AREA_CENTRES.other;
  const t1 = norm(cross(Math.abs(c[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0], c));
  const t2 = cross(c, t1);
  const a = 2 * Math.PI * hash01(id, 1), d = AREA_SPREAD * Math.sqrt(0.04 + 0.96 * hash01(id, 2));
  const s = Math.sin(d), k = Math.cos(d);
  return norm([c[0] * k + (t1[0] * Math.cos(a) + t2[0] * Math.sin(a)) * s, c[1] * k + (t1[1] * Math.cos(a) + t2[1] * Math.sin(a)) * s, c[2] * k + (t1[2] * Math.cos(a) + t2[2] * Math.sin(a)) * s]);
}

/** Decorative particles: an even Fibonacci sphere with a little jitter, plus a faint inner cloud for depth. */
export function decorativeParticles(surface: number, inner: number) {
  const pos = new Float32Array((surface + inner) * 3);
  const bright = new Float32Array(surface + inner);
  const size = new Float32Array(surface + inner);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < surface; i++) {
    const y = 1 - ((i + 0.5) / surface) * 2, r = Math.sqrt(1 - y * y), th = golden * i;
    const j = 1 + (hash01(`d${i}`, 3) - 0.5) * 0.012;
    pos.set([Math.cos(th) * r * j, y * j, Math.sin(th) * r * j], i * 3);
    bright[i] = 0.42 + 0.58 * hash01(`d${i}`, 4) ** 2;
    size[i] = 2.1 + 1.9 * hash01(`d${i}`, 5);
  }
  for (let n = 0; n < inner; n++) {
    const i = surface + n;
    const u = hash01(`i${n}`, 6) * 2 - 1, th = 2 * Math.PI * hash01(`i${n}`, 7), rr = 0.55 + 0.4 * Math.cbrt(hash01(`i${n}`, 8));
    const r = Math.sqrt(1 - u * u);
    pos.set([Math.cos(th) * r * rr, u * rr, Math.sin(th) * r * rr], i * 3);
    bright[i] = 0.16 + 0.24 * hash01(`i${n}`, 9);
    size[i] = 1.5 + 1.0 * hash01(`i${n}`, 10);
  }
  return { pos, bright, size, count: surface + inner };
}

/** Points along the great circle from a to b, lifted off the surface in the middle: a connection line. */
export function arc(a: Vec3, b: Vec3, steps = 32, lift = 0.12): Vec3[] {
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const w = Math.acos(dot), sw = Math.sin(w);
  const out: Vec3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p: Vec3 = sw < 1e-4 ? a : (() => { const ka = Math.sin((1 - t) * w) / sw, kb = Math.sin(t * w) / sw; return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb] as Vec3; })();
    const r = 1.005 + lift * Math.sin(Math.PI * t) * Math.min(1, w);
    out.push([p[0] * r, p[1] * r, p[2] * r]);
  }
  return out;
}

/** The direction to turn towards the camera for a set of dots: their average, or the first dot if they cancel out. */
export function centroid(points: Vec3[]): Vec3 | null {
  if (!points.length) return null;
  const s = points.reduce<Vec3>((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]);
  return Math.hypot(...s) < 1e-3 ? points[0] : norm(s);
}
