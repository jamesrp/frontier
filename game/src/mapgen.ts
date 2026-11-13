import { Terrain } from './data';

export type Pt = [number, number];

/** Small seeded random generator (mulberry32). */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo: number, hi: number) => lo + (hi - lo) * next(),
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T>(arr: T[]): T => arr[Math.floor(next() * arr.length)],
    state: () => a,
  };
}
export type Rng = ReturnType<typeof makeRng>;

export const MAP_W = 1250;
export const MAP_H = 800;

// Hand-placed layout, point-symmetric so both sides get the same land: the player starts on the left (1), the opponent on the right (10).
const HALF: { p: Pt; terrain: Terrain; name: string }[] = [
  { p: [115, 135], terrain: 'forest', name: 'Glimmerwood' },
  { p: [125, 400], terrain: 'plains', name: 'Amber Flats' },
  { p: [115, 665], terrain: 'mountains', name: 'Iron Teeth' },
  { p: [335, 225], terrain: 'crystal', name: 'Shard Basin' },
  { p: [325, 495], terrain: 'forest', name: 'Whisper Pines' },
  { p: [345, 715], terrain: 'plains', name: 'Sunny Steppe' },
  { p: [540, 110], terrain: 'mountains', name: 'Boulder Bay' },
  { p: [545, 380], terrain: 'crystal', name: 'Starfall Crater' },
  { p: [535, 630], terrain: 'plains', name: 'Copper Dunes' },
];
const OTHER = ['Mossy Hollow', 'Honey Meadow', 'Cinder Cliffs', 'Prism Fields', 'Fern Gully', 'Golden Reach', 'Frostpeak', 'Moonglass Rim', 'Thunder Mesa'];
const SEEDS = [...HALF, ...HALF.map((h, i) => ({ p: [MAP_W - h.p[0], MAP_H - h.p[1]] as Pt, terrain: h.terrain, name: OTHER[i] }))];
export const START_TERRITORIES = [1, 10];
/** Where each player starts. 3 players: you on the left, two rivals in the right corners. 4 players: one in each quarter. */
export function startTerritories(n: number) {
  return n >= 4 ? [5, 14, 0, 9] : n === 3 ? [1, 11, 9] : START_TERRITORIES;
}

export interface MapCell { id: number; name: string; terrain: Terrain; poly: Pt[]; center: Pt; neighbors: number[] }

function clip(poly: Pt[], a: Pt, b: Pt): Pt[] {
  // keep points closer to a than to b
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const nx = b[0] - a[0], ny = b[1] - a[1];
  const side = (p: Pt) => (p[0] - mx) * nx + (p[1] - my) * ny; // <0 means a-side
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const sp = side(p), sq = side(q);
    if (sp <= 0) out.push(p);
    if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) {
      const t = sp / (sp - sq);
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  }
  return out;
}

function centroid(poly: Pt[]): Pt {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length];
    const f = x0 * y1 - x1 * y0;
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  a /= 2;
  return [cx / (6 * a), cy / (6 * a)];
}

export function makeMap(rng: Rng): MapCell[] {
  const pts: Pt[] = SEEDS.map((s) => [s.p[0] + rng.range(-25, 25), s.p[1] + rng.range(-20, 20)]);
  const margin = 18;
  const box: Pt[] = [[margin, margin], [MAP_W - margin, margin], [MAP_W - margin, MAP_H - margin], [margin, MAP_H - margin]];
  const cells: MapCell[] = pts.map((p, i) => {
    let poly = box.slice();
    pts.forEach((q, j) => { if (j !== i) poly = clip(poly, p, q); });
    return { id: i, name: SEEDS[i].name, terrain: SEEDS[i].terrain, poly, center: centroid(poly), neighbors: [] };
  });
  // neighbors: cells that share an edge (two vertices in common)
  const close = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < 0.5 && Math.abs(a[1] - b[1]) < 0.5;
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      let shared = 0;
      for (const a of cells[i].poly) for (const b of cells[j].poly) if (close(a, b)) shared++;
      if (shared >= 2) { cells[i].neighbors.push(j); cells[j].neighbors.push(i); }
    }
  }
  return cells;
}

export function pointInPoly(p: Pt, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
