// A tiny pixel raster: no anti-aliasing, ordered dithering, value noise and isometric shapes.
// Everything draws into a PixBuf, which the UI copies onto a low-res <canvas> scaled up with nearest-neighbor.

export type RGB = number; // 0xRRGGBB

export class PixBuf {
  data: Uint8ClampedArray;
  /** w and h are in real pixels. k is the detail factor: shape functions take coordinates in units of k pixels. */
  constructor(public w: number, public h: number, public k = 1) { this.data = new Uint8ClampedArray(w * h * 4); }
  /** A buffer of lw x lh logical units at detail k. */
  static hi(lw: number, lh: number, k: number) { return new PixBuf(Math.round(lw * k), Math.round(lh * k), k); }
  clone() { const b = new PixBuf(this.w, this.h, this.k); b.data.set(this.data); return b; }
  set(x: number, y: number, c: RGB) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = c >> 16; this.data[i + 1] = (c >> 8) & 255; this.data[i + 2] = c & 255; this.data[i + 3] = 255;
  }
  get(x: number, y: number): RGB {
    const i = (y * this.w + x) * 4;
    return (this.data[i] << 16) | (this.data[i + 1] << 8) | this.data[i + 2];
  }
  alpha(x: number, y: number) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.data[(y * this.w + x) * 4 + 3]; }
  /** Mix a color over a pixel (t = 0..1), keeping it a flat pixel. */
  tint(x: number, y: number, c: RGB, t: number) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.set(x, y, mix(this.get(x, y), c, t));
  }
  /** Copy a sprite's opaque pixels with its anchor at logical (x,y). Low-detail sprites are scaled up to this buffer's detail. */
  blit(s: Sprite, x: number, y: number, flip = false) {
    const f = Math.max(1, Math.round(this.k / s.buf.k));
    const ox = Math.round(x * this.k - s.ax * f), oy = Math.round(y * this.k - s.ay * f);
    for (let j = 0; j < s.buf.h; j++) for (let i = 0; i < s.buf.w; i++) {
      const si = flip ? s.buf.w - 1 - i : i;
      if (!s.buf.alpha(si, j)) continue;
      const c = s.buf.get(si, j);
      for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) this.set(ox + i * f + dx, oy + j * f + dy, c);
    }
  }
}
/** A drawing with an anchor point (usually the middle of its footprint on the ground), in real pixels of buf. */
export interface Sprite { buf: PixBuf; ax: number; ay: number }
/** One logical dot: a k x k block. */
export function dot(b: PixBuf, x: number, y: number, c: RGB) {
  const k = b.k, x0 = Math.round(x * k), y0 = Math.round(y * k);
  for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) b.set(x0 + i, y0 + j, c);
}

export function hex(s: string): RGB { return parseInt(s.slice(1), 16); }
export function mix(a: RGB, b: RGB, t: number): RGB {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
export function shadeRGB(c: RGB, amt: number): RGB { return amt >= 0 ? mix(c, 0xffffff, amt) : mix(c, 0x000000, -amt); }
/** A 5-step ramp: darkest outline, shadow, mid, light, highlight. */
export function ramp(c: RGB): RGB[] { return [shadeRGB(c, -0.72), shadeRGB(c, -0.38), c, shadeRGB(c, 0.22), shadeRGB(c, 0.5)]; }

// ---------------------------------------------------------------- dithering and noise

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** True when value t (0..1) passes the ordered-dither threshold at this pixel. */
export function dith(x: number, y: number, t: number) { return t * 16 > BAYER[((y & 3) << 2) | (x & 3)] + 0.5; }

export function hash2(x: number, y: number, seed: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function smooth(t: number) { return t * t * (3 - 2 * t); }
export function vnoise(x: number, y: number, seed: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}
/** Fractal noise, 0..1. */
export function fbm(x: number, y: number, seed: number, oct = 3) {
  let v = 0, amp = 0.5, f = 1, tot = 0;
  for (let i = 0; i < oct; i++) { v += amp * vnoise(x * f, y * f, seed + i * 17); tot += amp; amp *= 0.5; f *= 2.1; }
  return v / tot;
}

// ---------------------------------------------------------------- shapes

export type Fill = RGB | ((x: number, y: number) => RGB | null);
const pick = (f: Fill, x: number, y: number) => (typeof f === 'number' ? f : f(x, y));

/** Scanline polygon fill on pixel centers. */
export function poly(b: PixBuf, lpts: number[][], f: Fill) {
  const pts = b.k === 1 ? lpts : lpts.map((p) => [p[0] * b.k, p[1] * b.k]);
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(b.h - 1, Math.ceil(y1)); y++) {
    const cy = y + 0.5, xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) xs.push(ax + (cy - ay) / (by - ay) * (bx - ax));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(b.w - 1, Math.floor(xs[k + 1] - 0.5)); x++) {
        const c = pick(f, x, y); if (c !== null) b.set(x, y, c);
      }
    }
  }
}
export function rect(b: PixBuf, x: number, y: number, w: number, h: number, f: Fill) {
  const k = b.k; x *= k; y *= k; w *= k; h *= k;
  for (let j = Math.round(y); j < Math.round(y + h); j++) for (let i = Math.round(x); i < Math.round(x + w); i++) { const c = pick(f, i, j); if (c !== null) b.set(i, j, c); }
}
/** A line between logical points; width is in real pixels (default 1, which is thin at high detail). */
export function line(b: PixBuf, x0: number, y0: number, x1: number, y1: number, c: RGB, width = 1) {
  const k = b.k;
  x0 = Math.round(x0 * k); y0 = Math.round(y0 * k); x1 = Math.round(x1 * k); y1 = Math.round(y1 * k);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  for (let n = 0; n < 4000; n++) {
    if (width === 1) b.set(x0, y0, c); else for (let j = 0; j < width; j++) for (let i = 0; i < width; i++) b.set(x0 + i, y0 + j, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
}
export function ellipse(b: PixBuf, cx: number, cy: number, rx: number, ry: number, f: Fill) {
  const k = b.k; cx *= k; cy *= k; rx *= k; ry *= k;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    if (dx * dx + dy * dy <= 1) { const c = pick(f, x, y); if (c !== null) b.set(x, y, c); }
  }
}
/** Iso diamond centered at (x,y). */
export function diamondPts(x: number, y: number, hw: number, hh: number) { return [[x, y - hh], [x + hw, y], [x, y + hh], [x - hw, y]]; }

/**
 * An isometric box standing on the diamond centered at (x,y) with half-width hw (half-height hw/2).
 * Faces are shaded from the color's ramp, with a dark outline and a light top edge.
 * Optional face painters get (u, v) on the face: u across (0..1), v up in pixels.
 */
export interface BoxOpts {
  top?: RGB; left?: RGB; right?: RGB; outline?: boolean; trim?: RGB;
  paintL?: (u: number, v: number, x: number, y: number) => RGB | null;
  paintR?: (u: number, v: number, x: number, y: number) => RGB | null;
}
export function box(b: PixBuf, x: number, y: number, hw: number, h: number, color: RGB, o: BoxOpts = {}) {
  const hh = hw / 2, r = ramp(color), k = b.k, e = 1 / k;
  const L = [x - hw, y], B = [x, y + hh], R = [x + hw, y], T = [x, y - hh];
  const up = (p: number[]) => [p[0], p[1] - h];
  const left = o.left ?? r[2], right = o.right ?? r[1], top = o.top ?? r[3];
  // face painters get u across the face and v in real pixels up from the ground line
  poly(b, [L, B, up(B), up(L)], (px, py) => {
    const u = ((px + 0.5) / k - (x - hw)) / hw, v = ((y + u * hh) - (py + 0.5) / k) * k;
    return (o.paintL && o.paintL(u, v, px, py)) ?? left;
  });
  poly(b, [B, R, up(R), up(B)], (px, py) => {
    const u = ((px + 0.5) / k - x) / hw, v = ((y + hh - u * hh) - (py + 0.5) / k) * k;
    return (o.paintR && o.paintR(u, v, px, py)) ?? right;
  });
  poly(b, [up(T), up(R), up(B), up(L)], top);
  if (o.outline !== false) {
    const d = r[0];
    line(b, L[0], L[1], L[0], L[1] - h, d); line(b, R[0] - e, R[1], R[0] - e, R[1] - h, d);
    line(b, L[0], L[1], B[0], B[1] - e, d); line(b, B[0], B[1] - e, R[0] - e, R[1], d);
    line(b, L[0], L[1] - h, T[0], T[1] - h, d); line(b, T[0], T[1] - h, R[0] - e, R[1] - h, d);
    // light front edges of the roof
    const hi = o.trim ?? r[4];
    line(b, L[0] + e, L[1] - h, B[0], B[1] - h, hi, k); line(b, B[0], B[1] - h, R[0] - 2 * e, R[1] - h, o.trim ?? r[3], k);
    line(b, B[0], B[1] - h + e, B[0], B[1] - e, shadeRGB(right, -0.15));
  }
}

/** A pitched (gable) roof over a box footprint, ridge running along the left face. */
export function gable(b: PixBuf, x: number, y: number, hw: number, base: number, rise: number, color: RGB) {
  const hh = hw / 2, r = ramp(color);
  const L = [x - hw, y - base], B = [x, y + hh - base], R = [x + hw, y - base], T = [x, y - hh - base];
  const mLB = [(L[0] + T[0]) / 2, (L[1] + T[1]) / 2 - rise], mBR = [(B[0] + R[0]) / 2, (B[1] + R[1]) / 2 - rise];
  // front slope (towards viewer) and back slope
  poly(b, [L, B, mBR, mLB], (px, py) => (dith(px, py, 0.2) ? r[3] : r[2]));
  poly(b, [B, R, mBR], r[1]);
  poly(b, [mLB, mBR, R, T], r[3]);
  // shingle rows on the front slope at high detail
  if (b.k > 1) { const n = Math.max(2, Math.round(rise)); for (let i = 1; i < n; i++) { const t = i / n; line(b, L[0] + (mLB[0] - L[0]) * t, L[1] + (mLB[1] - L[1]) * t, B[0] + (mBR[0] - B[0]) * t, B[1] + (mBR[1] - B[1]) * t, r[1]); } }
  line(b, mLB[0], mLB[1], mBR[0], mBR[1], r[4], b.k);
  line(b, L[0], L[1], B[0], B[1], r[0]); line(b, B[0], B[1], R[0], R[1], r[0]);
}

/** A dome sitting on (x,y) with radius rx. Lit from the upper left. */
export function dome(b: PixBuf, x: number, y: number, rx: number, ry: number, color: RGB, glow = false) {
  const r = ramp(color);
  const k = b.k;
  ellipse(b, x, y, rx, ry, (px, py) => {
    const dx = ((px + 0.5) / k - x) / rx, dy = ((py + 0.5) / k - y) / ry;
    const l = 0.55 - dx * 0.5 - dy * 0.45;
    if (dx * dx + dy * dy > 0.82) return r[glow ? 2 : 0];
    if (l > 0.95) return glow ? 0xffffff : r[4];
    if (l > 0.6) return dith(px, py, (l - 0.6) * 3) ? r[4] : r[3];
    if (l > 0.3) return dith(px, py, (l - 0.3) * 3) ? r[3] : r[2];
    return dith(px, py, l * 3) ? r[2] : r[1];
  });
}

/** Upright cylinder (silo, tower), base centered at (x,y). */
export function cylinder(b: PixBuf, x: number, y: number, rx: number, h: number, color: RGB) {
  const r = ramp(color), ry = Math.max(1, rx / 2), k = b.k;
  rect(b, x - rx, y - h, rx * 2, h, (px, py) => {
    const u = ((px + 0.5) / k - (x - rx)) / (2 * rx);
    const c = u < 0.25 ? r[3] : u < 0.55 ? r[2] : u < 0.85 ? r[1] : r[0];
    return k > 1 && py % (3 * k) === 0 ? shadeRGB(c, -0.12) : c;
  });
  ellipse(b, x, y, rx, ry, (px, py) => ((py + 0.5) / k > y ? (((px + 0.5) / k - x) / rx < 0.2 ? r[2] : r[1]) : null));
  ellipse(b, x, y - h, rx, ry, (px) => (((px + 0.5) / k - x) / rx < 0 ? r[4] : r[3]));
}

/** Little conifer/broadleaf tree with a base at (x,y). */
export function tree(b: PixBuf, x: number, y: number, size: number, leaf: RGB, seed: number) {
  const r = ramp(leaf), k = b.k;
  rect(b, x, y - 2, 1, 3, 0x4a2e14);
  ellipse(b, x + 0.5, y - size * 0.8, size * 0.62, size * 0.7, (px, py) => {
    const n = hash2(px, py, seed);
    const l = 0.5 - (px / k - x) / size * 0.6 - (py / k - (y - size)) / size * 0.4 + (n - 0.5) * 0.5;
    return l > 0.75 ? r[4] : l > 0.45 ? r[3] : l > 0.15 ? r[2] : r[1];
  });
}

/** Turn a buffer into a canvas (browser) and optionally a data URL scaled up with nearest-neighbor. */
export function toCanvas(buf: PixBuf, scale = 1): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = buf.w * scale; c.height = buf.h * scale;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const src = scale === 1 ? c : document.createElement('canvas');
  if (scale !== 1) { src.width = buf.w; src.height = buf.h; }
  const sctx = scale === 1 ? ctx : src.getContext('2d');
  if (!sctx) return null;
  const img = sctx.createImageData(buf.w, buf.h);
  img.data.set(buf.data);
  sctx.putImageData(img, 0, 0);
  if (scale !== 1) { ctx.imageSmoothingEnabled = false; ctx.drawImage(src, 0, 0, c.width, c.height); }
  return c;
}
const urlCache = new Map<string, string>();
export function spriteURL(key: string, make: () => PixBuf, scale = 3): string {
  const k = `${key}@${scale}`;
  if (urlCache.has(k)) return urlCache.get(k)!;
  let url = '';
  try { const c = toCanvas(make(), scale); url = c ? c.toDataURL() : ''; } catch { url = ''; }
  urlCache.set(k, url);
  return url;
}

/** Scale2x (EPX): doubles a pixel sprite's detail, rounding its diagonals while keeping hard pixels. */
export function epx(s: Sprite): Sprite {
  const a = s.buf, b = new PixBuf(a.w * 2, a.h * 2, a.k * 2);
  const at = (x: number, y: number) => (a.alpha(x, y) ? a.get(x, y) : -1);
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
    const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
    let p1 = P, p2 = P, p3 = P, p4 = P;
    if (C === A && C !== D && A !== B) p1 = A;
    if (A === B && A !== C && B !== D) p2 = B;
    if (D === C && D !== B && C !== A) p3 = C;
    if (B === D && B !== A && D !== C) p4 = D;
    const put = (px: number, py: number, c: number) => { if (c >= 0) b.set(px, py, c); };
    put(x * 2, y * 2, p1); put(x * 2 + 1, y * 2, p2); put(x * 2, y * 2 + 1, p3); put(x * 2 + 1, y * 2 + 1, p4);
  }
  return { buf: b, ax: s.ax * 2, ay: s.ay * 2 };
}
