// SVG drawing helpers: isometric buildings and small shapes. Everything returns SVG markup strings.
import { BKind, BUILDINGS } from './data';

export function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt))));
  r = f(r); g = f(g); b = f(b);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
const P = (pts: number[][]) => pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

/** An isometric box standing on the diamond centered at (x,y). */
export function box(x: number, y: number, hw: number, hh: number, h: number, body: string, top?: string, trim?: string) {
  const T = [x, y - hh], R = [x + hw, y], B = [x, y + hh], L = [x - hw, y];
  const up = (p: number[]) => [p[0], p[1] - h];
  const t = top ?? shade(body, 0.28);
  return `<polygon points="${P([L, B, up(B), up(L)])}" fill="${shade(body, -0.12)}"/>`
    + `<polygon points="${P([B, R, up(R), up(B)])}" fill="${shade(body, -0.32)}"/>`
    + `<polygon points="${P([up(T), up(R), up(B), up(L)])}" fill="${t}" ${trim ? `stroke="${trim}" stroke-width="2"` : ''}/>`;
}

export function diamond(x: number, y: number, hw: number, hh: number, attrs: string) {
  return `<polygon points="${P([[x, y - hh], [x + hw, y], [x, y + hh], [x - hw, y]])}" ${attrs}/>`;
}

/**
 * Draw one building of a kind and level at (x,y), the center of its tile diamond.
 * s scales the whole drawing (1 = city view). trim is the owner's color.
 */
export function building(kind: BKind, level: number, x: number, y: number, s: number, trim: string, roof: string) {
  const d = BUILDINGS[kind];
  const hw = 46 * s, hh = 23 * s;
  const h = d.height[level - 1] * s;
  const body = d.color;
  let out = '';
  switch (kind) {
    case 'farm': {
      out += box(x, y, hw * 1.05, hh * 1.05, Math.max(3, h * 0.35), '#6b4f2a', shade(body, 0.1), trim);
      const top = y - Math.max(3, h * 0.35);
      for (let i = -2; i <= 2; i++) out += `<line x1="${x - hw * 0.8 + i * 9 * s}" y1="${top + i * 4.5 * s}" x2="${x + i * 9 * s + hw * 0.1}" y2="${top + i * 4.5 * s + hh * 0.9}" stroke="${shade(body, -0.3)}" stroke-width="${2 * s}"/>`;
      if (level >= 2) out += box(x + hw * 0.55, y - hh * 0.1, 9 * s, 4.5 * s, h * 1.6, '#c9c2b0', roof);
      if (level >= 3) out += `<ellipse cx="${x + hw * 0.55}" cy="${y - hh * 0.1 - h * 1.6}" rx="${10 * s}" ry="${6 * s}" fill="#9be7ff" opacity=".85"/>`;
      break;
    }
    case 'lumber': {
      out += box(x - hw * 0.15, y + hh * 0.1, hw * 0.55, hh * 0.55, h, body, roof, trim);
      const tree = (tx: number, ty: number, r: number) => `<rect x="${tx - 2 * s}" y="${ty - 6 * s}" width="${4 * s}" height="${8 * s}" fill="#5a3a1c"/><circle cx="${tx}" cy="${ty - 12 * s}" r="${r * s}" fill="#2f8a4a"/><circle cx="${tx - 3 * s}" cy="${ty - 15 * s}" r="${r * 0.6 * s}" fill="#49a862"/>`;
      out += tree(x + hw * 0.55, y - hh * 0.2, 9 + level) + tree(x + hw * 0.2, y + hh * 0.55, 8 + level);
      if (level >= 2) out += `<rect x="${x - hw * 0.75}" y="${y + hh * 0.2}" width="${16 * s}" height="${5 * s}" rx="${2 * s}" fill="#b07a45"/>`;
      break;
    }
    case 'mine': {
      out += box(x, y + hh * 0.15, hw * 0.65, hh * 0.65, h * 0.6, body, roof, trim);
      const top = y + hh * 0.15 - h * 0.6;
      out += `<polygon points="${P([[x - 12 * s, top], [x, top - h * 0.9 - 10 * s], [x + 12 * s, top]])}" fill="none" stroke="#3d3f47" stroke-width="${3 * s}"/>`;
      out += `<circle cx="${x}" cy="${top - h * 0.9 - 10 * s}" r="${4 * s}" fill="#ffb547"/>`;
      out += `<ellipse cx="${x - hw * 0.6}" cy="${y + hh * 0.5}" rx="${10 * s}" ry="${5 * s}" fill="#9fb3c8"/>`;
      break;
    }
    case 'power': {
      if (level === 1) {
        out += box(x, y, 7 * s, 3.5 * s, h, '#e9e4d8');
        const cx = x, cy = y - h;
        out += `<g class="spin" style="transform-origin:${cx}px ${cy}px">`;
        for (let i = 0; i < 3; i++) out += `<rect x="${cx - 2 * s}" y="${cy - 22 * s}" width="${4 * s}" height="${22 * s}" rx="${2 * s}" fill="#f6f2e8" transform="rotate(${i * 120} ${cx} ${cy})"/>`;
        out += `</g><circle cx="${cx}" cy="${cy}" r="${3 * s}" fill="${trim}"/>`;
      } else {
        out += box(x, y, hw * 0.7, hh * 0.7, h * 0.55, body, roof, trim);
        const top = y - h * 0.55;
        if (level === 2) out += box(x + hw * 0.3, top + 2 * s, 6 * s, 3 * s, h * 0.6, '#9aa3ad');
        else out += `<circle class="glow" cx="${x}" cy="${top - 14 * s}" r="${13 * s}" fill="#7ee0ff"/><circle cx="${x}" cy="${top - 14 * s}" r="${7 * s}" fill="#e9fbff"/>`;
      }
      break;
    }
    case 'lab': {
      out += box(x, y, hw * 0.7, hh * 0.7, h * 0.6, body, roof, trim);
      const top = y - h * 0.6;
      out += `<path d="M${x - 18 * s},${top} a${18 * s},${16 * s} 0 0 1 ${36 * s},0 z" fill="${level >= 3 ? '#c9a2ff' : '#e6e0f5'}"/>`;
      if (level >= 2) out += `<line x1="${x}" y1="${top - 16 * s}" x2="${x + 10 * s}" y2="${top - 26 * s}" stroke="#3b3550" stroke-width="${3 * s}"/>`;
      break;
    }
    case 'housing': {
      out += box(x - hw * 0.2, y + hh * 0.15, hw * 0.45, hh * 0.45, Math.min(h, 18 * s), body, roof, trim);
      out += box(x + hw * 0.35, y - hh * 0.05, hw * 0.35, hh * 0.35, h, shade(body, -0.05), roof, trim);
      if (level >= 3) out += `<rect x="${x + hw * 0.35 - 1 * s}" y="${y - hh * 0.05 - h - 14 * s}" width="${2 * s}" height="${14 * s}" fill="#ddd"/>`;
      break;
    }
    case 'barracks': {
      out += box(x, y, hw * 0.75, hh * 0.75, h, body, roof, trim);
      out += `<line x1="${x + hw * 0.4}" y1="${y - h}" x2="${x + hw * 0.4}" y2="${y - h - 24 * s}" stroke="#ddd" stroke-width="${2 * s}"/>`;
      out += `<polygon class="flag" points="${P([[x + hw * 0.4, y - h - 24 * s], [x + hw * 0.4 + 16 * s, y - h - 19 * s], [x + hw * 0.4, y - h - 14 * s]])}" fill="${trim}"/>`;
      break;
    }
    case 'tower': {
      out += box(x, y, hw * 0.32, hh * 0.32, h, body, roof, trim);
      out += `<circle class="glow" cx="${x}" cy="${y - h - 6 * s}" r="${(5 + level * 2) * s}" fill="${level === 1 ? '#ffd27a' : level === 2 ? '#ff6b6b' : '#7ee0ff'}"/>`;
      break;
    }
    case 'center': {
      out += box(x, y, hw * 0.9, hh * 0.9, h * 0.45, body, roof, trim);
      out += box(x, y - h * 0.45, hw * 0.5, hh * 0.5, h * 0.55, shade(body, 0.08), roof, trim);
      const top = y - h;
      out += `<line x1="${x}" y1="${top - hh * 0.5}" x2="${x}" y2="${top - hh * 0.5 - 26 * s}" stroke="#eee" stroke-width="${2 * s}"/>`;
      out += `<polygon class="flag" points="${P([[x, top - hh * 0.5 - 26 * s], [x + 18 * s, top - hh * 0.5 - 21 * s], [x, top - hh * 0.5 - 16 * s]])}" fill="${trim}"/>`;
      break;
    }
  }
  return out;
}

export function stars(n: number) { return '★'.repeat(n); }
