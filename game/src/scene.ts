// Paints the world map, a city and an open battlefield as low-res pixel art.
import { BUILDINGS, RES_INFO, Res, Terrain } from './data';
import { City, GameState, GRID } from './game';
import { MAP_H, MAP_W, pointInPoly } from './mapgen';
import { dith, diamondPts, dot, ellipse, fbm, hash2, hex, line, mix, PixBuf, poly, RGB, shadeRGB, tree } from './pixel';
import { buildingSprite, flagSprite, K, miniBuilding, resIcon, scaffoldSprite, starSprite } from './sprites';
export { K as CITY_K };

export const MAP_SCALE = 2.5; // map units per pixel
export const ART_MAP_W = Math.round(MAP_W / MAP_SCALE), ART_MAP_H = Math.round(MAP_H / MAP_SCALE);
export const CITY_SCALE = 2; // city view units per pixel
export const ART_CITY_W = 380, ART_CITY_H = 250;
export const TILE_HW = 38, TILE_HH = 19; // half size of a city tile in pixels
export function tileArt(i: number): [number, number] {
  const c = i % GRID, r = Math.floor(i / GRID);
  return [190 + (c - r) * TILE_HW, 75 + (c + r) * TILE_HH];
}

// ---------------------------------------------------------------- terrain

const T: Record<Terrain, RGB[]> = {
  plains: [0x4a4a22, 0x6e6c34, 0x8c8842, 0xaaa058, 0xc4b874],
  forest: [0x14281a, 0x1f3c22, 0x2e5a2c, 0x41763a, 0x5c9248],
  mountains: [0x4a4038, 0x6a5e52, 0x8a7e70, 0xaaa090, 0xcac2b4],
  crystal: [0x24443a, 0x305e4c, 0x3e7a5e, 0x5a9a76, 0x86bea0],
};
const GRASS = [0x34501e, 0x48682a, 0x5d8236];
const WATER = [0x0e2a5a, 0x1a4a8a, 0x2a6ab0, 0x5a9ad0];

const dithAt = dith, hashAt = hash2;
function shadeAt(ramp: RGB[], t: number, x: number, y: number) {
  const f = Math.max(0, Math.min(ramp.length - 1.001, t * (ramp.length - 1)));
  const i = Math.floor(f);
  return dith(x, y, f - i) ? ramp[i + 1] : ramp[i];
}

/** One textured ground pixel. wx, wy are "world" pixel coordinates so neighbouring views line up; s is a seed. */
export function groundPixel(t: Terrain, fx0: number, fy0: number, s: number, water = true, lakeAt = 0.75, k = 1): RGB {
  // noise works in logical units; dithering and specks use the real pixel (fx0, fy0), so higher detail means finer grain
  const wx = fx0 / k, wy = fy0 / k;
  const dith = (_x: number, _y: number, t2: number) => dithAt(fx0, fy0, t2);
  const hash2 = (_x: number, _y: number, sd: number) => hashAt(fx0, fy0, sd);
  const shadeOf = (ramp: RGB[], t2: number, _x: number, _y: number) => shadeAt(ramp, t2, fx0, fy0);
  const relief = (fx: number, fy: number) => fbm(fx / 9, fy / 9, s + 5, 3);
  const lit = (relief(wx - 1, wy - 1) - relief(wx + 1, wy + 1)) * 3.2;
  const lake = fbm(wx / 26, wy / 26, s + 77, 2);
  const la = t === 'forest' ? lakeAt + 0.03 : lakeAt;
  if (water && t !== 'mountains' && lake > la) {
    const edge = lake < la + 0.015;
    return edge ? WATER[3] : shadeOf(WATER, 0.25 + (hash2(wx, wy, s) - 0.5) * 0.25 + (lake - la), wx, wy);
  }
  if (water && t !== 'mountains' && t !== 'crystal' && Math.abs(fbm(wx / 46, wy / 46, s + 31, 2) - 0.5) < 0.006) return WATER[2];
  const speck = (hash2(wx, wy, s + 3) - 0.5) * 0.22;
  switch (t) {
    case 'plains': {
      const g = fbm(wx / 16, wy / 16, s + 9, 3);
      if (g > 0.58) return shadeOf(GRASS, 0.5 + lit + speck * 2, wx, wy);
      return shadeOf(T.plains, 0.55 + lit + speck + (g - 0.45) * 0.6, wx, wy);
    }
    case 'forest': {
      const c = fbm(wx / 3.2, wy / 3.2, s + 13, 2);
      const sh = c - fbm((wx + 1) / 3.2, (wy + 1) / 3.2, s + 13, 2);
      return shadeOf(T.forest, 0.35 + c * 0.5 + sh * 3 + lit * 0.6 + speck * 0.5, wx, wy);
    }
    case 'mountains': {
      const h = fbm(wx / 18, wy / 18, s + 21, 4);
      const sl = (fbm((wx - 1) / 18, (wy - 1) / 18, s + 21, 4) - fbm((wx + 1) / 18, (wy + 1) / 18, s + 21, 4)) * 9;
      if (h > 0.68 && sl > -0.1) return dith(wx, wy, 0.6 + sl) ? 0xf4f6fa : 0xc8ccd6;
      return shadeOf(T.mountains, 0.5 + sl + speck * 0.7 + (h - 0.5) * 0.6, wx, wy);
    }
    case 'crystal': {
      const cx = Math.floor(fx0 / 5), cy = Math.floor(fy0 / 7);
      if (hashAt(cx, cy, s + 41) > (k > 1 ? 0.94 : 0.9)) {
        // a little crystal shard in this cell
        const ox = fx0 - cx * 5 - 2, oy = fy0 - cy * 7;
        if (Math.abs(ox) <= (oy > 2 ? 1 : 0) && oy >= 1 && oy <= 5) return ox < 0 || oy === 1 ? 0xe0ffff : hashAt(cx, cy, s) > 0.5 ? 0x4ad0e8 : 0xa070f0;
      }
      return shadeOf(T.crystal, 0.5 + lit + speck + (fbm(wx / 10, wy / 10, s + 7, 2) - 0.5) * 0.6, wx, wy);
    }
  }
}

// ---------------------------------------------------------------- world map

interface MapBase { seed: number; base: PixBuf; ids: Int8Array; ring: Int8Array }
let mapBase: MapBase | null = null;

function buildMapBase(s: GameState): MapBase {
  const W = ART_MAP_W, H = ART_MAP_H;
  const ids = new Int8Array(W * H).fill(-1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p: [number, number] = [(x + 0.5) * MAP_SCALE, (y + 0.5) * MAP_SCALE];
    for (const t of s.map) if (pointInPoly(p, t.poly)) { ids[y * W + x] = t.id; break; }
  }
  // the thin margin outside every territory takes the nearest territory's ground
  for (let i = 0; i < ids.length; i++) if (ids[i] < 0) {
    const px = (i % W + 0.5) * MAP_SCALE, py = (Math.floor(i / W) + 0.5) * MAP_SCALE;
    const m = 19, q: [number, number] = [Math.max(m, Math.min(MAP_W - m, px)), Math.max(m, Math.min(MAP_H - m, py))];
    ids[i] = s.map.find((t) => pointInPoly(q, t.poly))?.id ?? 0;
  }
  const base = new PixBuf(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = s.map[ids[y * W + x]];
    base.set(x, y, groundPixel(t.terrain, x, y, s.seed % 997));
  }
  // distance (in pixels, up to 3) from each pixel to its territory's border
  const ring = new Int8Array(W * H).fill(9);
  const q: number[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, id = ids[i];
    if ((x + 1 < W && ids[i + 1] !== id) || (x > 0 && ids[i - 1] !== id) || (y + 1 < H && ids[i + W] !== id) || (y > 0 && ids[i - W] !== id)) { ring[i] = 0; q.push(i); }
  }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi], d = ring[i];
    if (d >= 3) continue;
    for (const j of [i + 1, i - 1, i + W, i - W]) if (j >= 0 && j < W * H && ids[j] === ids[i] && ring[j] > d + 1) { ring[j] = d + 1; q.push(j); }
  }
  // dark border lines with a soft light edge
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (ring[i] === 0 && ((x + 1 < W && ids[i + 1] !== ids[i]) || (y + 1 < H && ids[i + W] !== ids[i]))) base.set(x, y, 0x161410);
    else if (ring[i] === 1) base.tint(x, y, 0xffffff, 0.12);
  }
  return { seed: s.seed, base, ids, ring };
}

export function paintMap(s: GameState, opts: { sel: number | null; targets: Set<number>; trimOf: (owner: number) => RGB; roofOf: (owner: number) => RGB }) {
  if (!mapBase || mapBase.seed !== s.seed || mapBase.ids.length !== ART_MAP_W * ART_MAP_H) mapBase = buildMapBase(s);
  const { ids, ring } = mapBase;
  const b = mapBase.base.clone();
  const W = ART_MAP_W, H = ART_MAP_H;
  const ownerOfTerr = new Map<number, number>();
  for (const c of s.cities) ownerOfTerr.set(c.territory, c.owner);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, id = ids[i];
    const o = ownerOfTerr.get(id);
    if (o !== undefined) {
      const col = opts.trimOf(o);
      if (ring[i] === 1 || ring[i] === 2) b.set(x, y, ring[i] === 1 ? col : shadeRGB(col, -0.3));
      else if (ring[i] > 2) b.tint(x, y, col, 0.16);
    }
    if (id === opts.sel) {
      if (ring[i] === 1 || (ring[i] === 3 && dith(x, y, 0.5))) b.set(x, y, 0xffffff);
      else if (ring[i] > 1) b.tint(x, y, 0xffffff, 0.1);
    } else if (opts.targets.has(id) && ring[i] === 2 && ((x + y) >> 1) % 2 === 0) b.set(x, y, 0xffe27a);
  }
  // cities: a small paved plot with a block per building and the owner's flag
  for (const c of s.cities) {
    const t = s.map[c.territory];
    const cx = Math.round(t.center[0] / MAP_SCALE), cy = Math.round(t.center[1] / MAP_SCALE);
    const pave = 0x8a8478;
    poly(b, diamondPts(cx, cy, 16, 8), (x, y) => ((x + y * 2) % 8 === 0 || (x - y * 2) % 8 === 0 ? shadeRGB(pave, 0.15) : dith(x, y, 0.3) ? shadeRGB(pave, -0.08) : pave));
    const spots = [[0, -4], [-6, -1], [6, -1], [0, 2], [-10, 1], [10, 1], [-4, 4], [4, 4]];
    const bs = [...c.buildings].sort((p, q) => (p.kind === 'center' ? -1 : q.kind === 'center' ? 1 : BUILDINGS[q.kind].height[q.level - 1] - BUILDINGS[p.kind].height[p.level - 1])).slice(0, spots.length);
    const placed = bs.map((bd, k) => ({ bd, x: cx + spots[k][0], y: cy + spots[k][1] })).sort((p, q) => p.y - q.y);
    for (const p of placed) miniBuilding(b, p.x, p.y, p.bd.kind, p.bd.level, opts.trimOf(c.owner), opts.roofOf(c.owner));
    b.blit(flagSprite(opts.trimOf(c.owner)), cx - 15, cy - 2);
  }
  return b;
}

/** Which territory is under a point in map units (uses the painted lookup when ready). */
export function territoryAt(s: GameState, mx: number, my: number): number | null {
  if (mapBase && mapBase.seed === s.seed) {
    const x = Math.floor(mx / MAP_SCALE), y = Math.floor(my / MAP_SCALE);
    if (x >= 0 && y >= 0 && x < ART_MAP_W && y < ART_MAP_H) return mapBase.ids[y * ART_MAP_W + x];
  }
  for (const t of s.map) if (pointInPoly([mx, my], t.poly)) return t.id;
  return null;
}

// ---------------------------------------------------------------- city

const groundCache = new Map<string, PixBuf>();
function cityGround(s: GameState, terrain: Terrain, territory: number) {
  const key = `${s.seed}:${territory}`;
  let g = groundCache.get(key);
  if (!g) {
    g = PixBuf.hi(ART_CITY_W, ART_CITY_H, K);
    const seed = (s.seed % 997) + territory * 101;
    for (let fy = 0; fy < g.h; fy++) for (let fx = 0; fx < g.w; fx++) {
      const x = fx / K, y = fy / K;
      // keep the city grid dry: no lakes or rivers under the tiles
      const [gx, gy] = [(x - 190) / TILE_HW, (y - 75 + TILE_HH) / TILE_HH];
      const onGrid = Math.abs(gx) + Math.abs(gy - 4) <= 4.6;
      const c = groundPixel(terrain, fx * 0.9, fy * 0.9, seed, !onGrid, 0.8, K);
      g.set(fx, fy, onGrid ? c : mix(c, 0x0c1008, 0.22));
    }
    if (groundCache.size > 16) groundCache.clear();
    groundCache.set(key, g);
  }
  return g.clone();
}

function bonusFeature(b: PixBuf, res: Res, x: number, y: number, seed: number) {
  const inside = (px: number, py: number) => Math.abs(px - x) / 26 + Math.abs(py - y) / 13 <= 1;
  switch (res) {
    case 'food':
      poly(b, diamondPts(x, y, 24, 12), (px, py) => (Math.floor((px - x * K) / 2 + (py - y * K)) & 3) === 0 ? 0x7a6a24 : dith(px, py, 0.55) ? 0xe8c84a : 0xc8a432);
      break;
    case 'wood':
      for (let k = 0; k < 6; k++) { const px = x - 16 + Math.floor(hash2(k, 1, seed) * 32), py = y - 6 + Math.floor(hash2(k, 2, seed) * 12); if (inside(px, py)) tree(b, px, py + 3, 8, 0x2f7a3a, seed + k); }
      break;
    case 'iron':
      for (let k = 0; k < 4; k++) {
        const px = x - 14 + Math.floor(hash2(k, 3, seed) * 28), py = y - 5 + Math.floor(hash2(k, 4, seed) * 10);
        ellipse(b, px, py, 5, 3, (qx, qy) => (hash2(qx, qy, seed) > 0.85 ? 0xd8e4f4 : qy / K < py ? 0x8a8a90 : 0x5a5a62));
      }
      break;
    case 'energy':
      for (let k = 0; k < 4; k++) {
        const px = x - 14 + Math.floor(hash2(k, 5, seed) * 28), py = y - 4 + Math.floor(hash2(k, 6, seed) * 9), h = 5 + Math.floor(hash2(k, 7, seed) * 6);
        poly(b, [[px - 2, py], [px, py - h], [px + 2, py]], (qx) => (qx / K < px ? 0xb4ffff : 0x3ac8e0));
        dot(b, px, py - h, 0xffffff);
      }
      break;
    default: break;
  }
}

export interface CityPaintOpts { trim: RGB; roof: RGB; sel: number | null; hideBuildings?: boolean }
export function paintCity(s: GameState, c: City, o: CityPaintOpts) {
  const terr = s.map[c.territory].terrain;
  const b = cityGround(s, terr, c.territory);
  // city plot: the 4x4 grid, tiles slightly flattened and outlined with thin light lines
  for (let i = 0; i < GRID * GRID; i++) {
    const [x, y] = tileArt(i);
    poly(b, diamondPts(x, y, TILE_HW, TILE_HH), (px, py) => mix(b.get(px, py), 0x6a6a4a, 0.18));
  }
  // thin grid lines along both iso directions
  for (let k = 0; k <= GRID; k++) {
    const p0 = [190 - k * TILE_HW, 75 - TILE_HH + k * TILE_HH], p1 = [p0[0] + GRID * TILE_HW, p0[1] + GRID * TILE_HH];
    const q0 = [190 + k * TILE_HW, 75 - TILE_HH + k * TILE_HH], q1 = [q0[0] - GRID * TILE_HW, q0[1] + GRID * TILE_HH];
    for (const [a, z] of [[p0, p1], [q0, q1]]) lineDotted(b, a[0], a[1], z[0], z[1]);
  }
  // bonus spots
  for (let i = 0; i < GRID * GRID; i++) {
    const t = c.tiles[i];
    if (!t.bonus) continue;
    const [x, y] = tileArt(i);
    const built = c.buildings.some((bd) => bd.tile === i) || c.builds.some((k) => k.tile === i);
    if (!built) bonusFeature(b, t.bonus, x, y, i * 7 + c.territory);
    // icon and stars near the tile's left corner so they show even under a building
    for (let k = 0; k < (t.stars || 1); k++) b.blit(resIcon(t.bonus), x - TILE_HW + 13 + k * 9, y + 4 + k * 2);
  }
  if (o.sel !== null) {
    const [x, y] = tileArt(o.sel);
    const pts = diamondPts(x, y, TILE_HW - 1, TILE_HH - 1);
    for (let k = 0; k < 4; k++) line(b, pts[k][0], pts[k][1], pts[(k + 1) % 4][0], pts[(k + 1) % 4][1], 0xffffff, K);
  }
  if (o.hideBuildings) return b;
  // buildings, back to front
  const items: { y: number; draw: () => void }[] = [];
  for (const bd of c.buildings) {
    const [x, y] = tileArt(bd.tile);
    const upgrading = c.builds.some((k) => k.tile === bd.tile);
    items.push({ y, draw: () => {
      b.blit(buildingSprite(bd.kind, bd.level, o.trim, o.roof), x, y);
      if (upgrading) b.blit(scaffoldSprite(BUILDINGS[bd.kind].height[Math.min(2, bd.level)] / 2 + 6), x, y);
      for (let k = 0; k < bd.level; k++) b.blit(starSprite(), x - (bd.level - 1) * 3 + k * 6, y + TILE_HH - 2);
    } });
  }
  for (const k of c.builds) {
    if (c.buildings.some((bd) => bd.tile === k.tile)) continue;
    const [x, y] = tileArt(k.tile);
    items.push({ y, draw: () => b.blit(scaffoldSprite(BUILDINGS[k.kind].height[k.level - 1] / 2 + 4), x, y) });
  }
  items.sort((p, q) => p.y - q.y).forEach((it) => it.draw());
  return b;
}
function lineDotted(b: PixBuf, x0: number, y0: number, x1: number, y1: number) {
  x0 *= b.k; y0 *= b.k; x1 *= b.k; y1 *= b.k;
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let k = 0; k <= n; k++) {
    const x = Math.round(x0 + (x1 - x0) * k / n), y = Math.round(y0 + (y1 - y0) * k / n);
    if (x >= 0 && y >= 0 && x < b.w && y < b.h) b.tint(x, y, 0xf4f0d8, 0.55);
  }
}

/** Open ground for a battle away from any city. */
export function paintField(s: GameState, territory: number) {
  return cityGround(s, s.map[territory].terrain, territory);
}

export function resColor(r: Res) { return hex(RES_INFO[r].color); }
