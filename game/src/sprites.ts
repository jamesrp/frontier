// Code-drawn pixel sprites: buildings (3 levels each), units, workers, flags, resource icons.
import { BKind, BUILDINGS, Res } from './data';
import { box, cylinder, dith, dome, dot, epx, ellipse, gable, hash2, hex, line, mix, PixBuf, poly, ramp, rect, RGB, shadeRGB, Sprite, tree } from './pixel';

// ---------------------------------------------------------------- pixel maps

/** Build a sprite from rows of letters. Missing letters are transparent; adds a dark outline around the shape. */
export function fromMap(rows: string[], pal: Record<string, RGB>, outline: RGB | null = 0x14100c, anchor?: [number, number]): Sprite {
  const w = Math.max(...rows.map((r) => r.length)) + 2, h = rows.length + 2;
  const b = new PixBuf(w, h);
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch] !== undefined) b.set(x + 1, y + 1, pal[ch]); }));
  if (outline !== null) {
    const solid = (x: number, y: number) => b.alpha(x, y) > 0;
    const add: number[][] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) add.push([x, y]);
    add.forEach(([x, y]) => b.set(x, y, outline));
  }
  return { buf: b, ax: anchor ? anchor[0] + 1 : w / 2, ay: anchor ? anchor[1] + 1 : h - 1 };
}

const SKIN = 0xe8b48a, SKIN_D = 0xb87a52;

/** A pixel map drawn at double detail (k = 2): same on-screen size as a plain map half its width. */
function hiMap(rows: string[], pal: Record<string, RGB>, anchor?: [number, number]): Sprite {
  const sp = fromMap(rows, pal, 0x14100c, anchor);
  sp.buf.k = 2;
  return sp;
}

/** Units are drawn at double detail, facing right. */
export function unitSprite(kind: string, owner: RGB): Sprite {
  const o = owner, O = shadeRGB(owner, 0.3), Q = shadeRGB(owner, 0.55), od = shadeRGB(owner, -0.35);
  const metal = { m: 0x4a5058, M: 0x8a929c, n: 0xc4ccd6, g: 0x30343a, G: 0x7a828c };
  switch (kind) {
    case 'soldier': return hiMap([
      '.......hhhhh..........',
      '......hHHQHHh.........',
      '.....hHHQQHHHh........',
      '.....hHHHHHHHh........',
      '.....hhhvVVVVv........',
      '......sSSvVVVv........',
      '......sSSSSSS.........',
      '.......sSSSs..........',
      '.....ooOOOOOoo........',
      '....oOOQQOOOOOo.......',
      '...oOOQQOOOOOOOo......',
      '...oOOOOooOOOOOoo.....',
      '...oOOOo.oOOOOOOgggggG',
      '...oOOo..oOOOOOgGGnGGG',
      '...sSSs..oOOOOSSgggg..',
      '...sSs...bbbbbbb.gg...',
      '.........dDDDDDd......',
      '.........dDDd.dDd.....',
      '.........dDd..dDd.....',
      '.........dDd..dDd.....',
      '.........dDd...dDd....',
      '........kkkk...kkkk...',
      '........kkkkk..kkkkk..',
    ], { h: od, H: o, Q, s: SKIN_D, S: SKIN, v: 0x2a8ab0, V: 0x9ff0ff, o, O, b: 0x3a3020, d: 0x2a2a30, D: 0x4a4a56, k: 0x18181c, ...metal });
    case 'militia': return hiMap([
      '.........cccc.........f',
      '.......cCCCCCCc.......f',
      '......ccccccccccc.....f',
      '.........sSSs........ff',
      '.........sSSSs.......f.',
      '..........sSs.......f..',
      '.......wwwwwwwww...f...',
      '......wWWWooOWWWw.f....',
      '.....wWWWWoOOWWWWSS....',
      '.....wWWWWWWWWWWw......',
      '.....sS.wWWWWWWw.......',
      '.....sS.wWWWWWWw.......',
      '........bbbbbbb........',
      '........eEEEEEe........',
      '........eEe.eEe........',
      '........eEe.eEe........',
      '........eEe..eEe.......',
      '.......kkkk..kkkk......',
    ], { c: 0x6a4a2a, C: 0x9a7a48, s: SKIN_D, S: SKIN, w: 0x8a8a80, W: 0xb8b8ae, o, O, b: 0x4a3a2a, e: 0x4a3a2a, E: 0x6a5a40, k: 0x1c1814, f: 0xa89870 });
    case 'walker': return hiMap([
      '.......mmmmmmmmm..........',
      '.....mmMnnnnnnMMm.........',
      '....mMnnMMMMMMMMMm........',
      '...mMnMMcCCCMMMMMMggggggg.',
      '...mMMMMcCCCMMMMMMgGGGGGGg',
      '...mMMMMMMMMMMMMMMggggggg.',
      '...mmoooOOOQQOOooomm......',
      '....mmooooOOOOooomm.......',
      '.....mmmmmmmmmmmmm........',
      '.....lll.......lll........',
      '....lLLl.......lLLl.......',
      '....lLLl.......lLLl.......',
      '...lLLl.......lLLl........',
      '...lLLl.......lLLl........',
      '....lLLl.......lLLl.......',
      '.....lLLl.......lLLl......',
      '.....lLLl.......lLLl......',
      '....lllll......lllll......',
      '...lllllll....lllllll.....',
    ], { m: 0x4a5462, M: 0x9aa6b2, n: 0xd0dae4, c: 0x1e6a90, C: 0x9ff0ff, o: od, O: o, Q, l: 0x2e343c, L: 0x6a7480, g: 0x30343a, G: 0x8a929c });
    case 'artillery': return hiMap([
      '.......................gG.',
      '.....................ggGG.',
      '...................ggGGg..',
      '.................ggGGg....',
      '...............ggGGg......',
      '.............ggGGg........',
      '...........mmGGg..........',
      '......mmmmmMMMmmmm........',
      '.....mMMnnnMMMMMMMm.......',
      '....mooooOOOQQOOOoom......',
      '...mMMMMMMMMMMMMMMMMm.....',
      '..mMnnnnnnnnnnnnnnnMMm....',
      '..mmmmmmmmmmmmmmmmmmmm....',
      '..wwWWww......wwWWww......',
      '.wWwwwwWw....wWwwwwWw.....',
      '.wwwXXwww....wwwXXwww.....',
      '..wwWWww......wwWWww......',
    ], { ...metal, o: od, O: o, Q, w: 0x1c1c20, W: 0x6a6a70, X: 0xa8a8b0 });
    case 'settler': return hiMap([
      '.....................p..',
      '......ccccccccc......pOO',
      '....ccCCCCCCCCCcc....pOO',
      '...cCCCCCCCCCCCCCc...pO.',
      '..cCCCCCCCCCCCCCCCc..p..',
      '..cCCcCCCCcCCCCcCCc..p..',
      '..cCCcCCCCcCCCCcCCc..p..',
      '..bbbbbbbbbbbbbbbbbbbp..',
      '..BBBBBBBBBBBBBBBBBBB...',
      '..bbbbbbbbbbbbbbbbbbb...',
      '...kKKk.........kKKk....',
      '..kKkkKk.......kKkkKk...',
      '..kkXXkk.......kkXXkk...',
      '...kKKk.........kKKk....',
    ], { c: 0xb8b098, C: 0xf0ead8, b: 0x6a4a28, B: 0x9a6a3a, k: 0x2a2018, K: 0x8a7a60, X: 0xc8b890, p: 0x6a5a40, O: o });
    default: return fromMap(['o'], { o });
  }
}
export function workerSprite(owner: RGB): Sprite {
  return epx(fromMap([
    '.yyy.',
    '.sss.',
    'ooOoo',
    '.oOo.',
    '.ddd.',
    '.d.d.',
  ], { y: 0xf2c230, s: SKIN, o: owner, O: shadeRGB(owner, 0.35), d: 0x2a2a30 }));
}
export function flagSprite(owner: RGB): Sprite {
  return epx(fromMap([
    'pOOOOOo.',
    'pOoOOOoo',
    'pOOOOOo.',
    'pooooo..',
    'p.......',
    'p.......',
    'p.......',
    'p.......',
    'p.......',
    'P.......',
  ], { p: 0xe0e0d8, P: 0x707070, O: owner, o: shadeRGB(owner, -0.3) }, 0x14100c, [0, 9]));
}
export function starSprite(): Sprite {
  return fromMap(['..y..', '.yYy.', 'yYYYy', '.yYy.', '.y.y.'], { y: 0xd9a21a, Y: 0xffe060 });
}

export function resIcon(r: Res): Sprite {
  switch (r) {
    case 'food': return fromMap([
      '..y.y.y..',
      '.yYyYyYy.',
      '..yYyYy..',
      '...yYy...',
      '....g....',
      '...ggg...',
      '..g.g.g..',
      '...bbb...',
      '....g....',
      '...g.g...',
    ], { y: 0xc89a20, Y: 0xffd848, g: 0x7a9a30, b: 0xa04a20 });
    case 'wood': return fromMap([
      '.bbbbbbre.',
      'bBBBBBBrRr',
      'bBBBBBBrRr',
      '.bbbbbbrr.',
      '..........',
      '.bbbbbbre.',
      'bBBBBBBrRr',
      'bBBBBBBrRr',
      '.bbbbbbrr.',
    ], { b: 0x6a3e1c, B: 0x9a6232, r: 0xc89a62, R: 0xe8c48a, e: 0xc89a62 });
    case 'iron': return fromMap([
      '...MMMMM...',
      '..MHHHHHM..',
      '.MHHHHHHHM.',
      'mmmmmmmmmmm',
      'mMMMMMMMMMm',
      'mmmmmmmmmmm',
    ], { m: 0x4a5462, M: 0x8a98aa, H: 0xd0dceb });
    case 'energy': return fromMap([
      '.....YYY',
      '....YYY.',
      '...YYY..',
      '..YYYYYY',
      '.yYYYYY.',
      '...YYy..',
      '..YYy...',
      '.YYy....',
      'Yy......',
    ], { Y: 0xffe24a, y: 0xd8a010 });
    case 'science': return fromMap([
      '...gg...',
      '...gg...',
      '...gg...',
      '..gGGg..',
      '.gGllGg.',
      'gGllLllg',
      'glllllLg',
      '.gggggg.',
    ], { g: 0xa8c0c8, G: 0xe8f4f8, l: 0x8a5ae0, L: 0xd0b4ff });
  }
}

// ---------------------------------------------------------------- buildings

/** Sprite canvas for a building: 96 x 112 logical units at detail K, anchored at the middle of its tile diamond. */
export const K = 2;
const BW = 96, BH = 112, AX = 48, AY = 88;
const LIT = 0xffe28a, GLASS = 0x2c3e5e, GLASS_L = 0x6a9ac8;

/** Window grid for a box face. At double detail each window is 2 real pixels wide and 3 tall, with a lit frame pixel. */
function windows(seed: number, every = 3, rowEvery = 4, lit = 0.45, glass = GLASS) {
  const px = every + 1, py = rowEvery + 1;
  return (u: number, v: number, x: number) => {
    const row = Math.floor(v) % py, col = x % px;
    if (v < 2 || row === 0 || row === py - 1 || col === 0 || col === px - 1) return null;
    const on = hash2(Math.floor(x / px), Math.floor(v / py), seed) < lit;
    if (row === 1 && !on) return GLASS_L; // a glint on the top pane
    return on ? (row === 1 ? 0xfff2c0 : LIT) : glass;
  };
}
function plaza(b: PixBuf, hw: number, c = 0x8e8a80) {
  box(b, AX, AY, hw, 2, c, { top: c, paintL: () => shadeRGB(c, -0.25), paintR: () => shadeRGB(c, -0.4) });
}
function flagOn(b: PixBuf, x: number, y: number, owner: RGB) { b.blit(flagSprite(owner), x, y); }
function smoke(b: PixBuf, x: number, y: number) {
  ellipse(b, x, y, 3, 2, 0xc8c8c8); ellipse(b, x + 3, y - 4, 4, 3, 0xe0e0e0); ellipse(b, x + 7, y - 9, 3, 2, 0xb8b8b8);
}
function field(b: PixBuf, hw: number, crop: RGB, crop2: RGB) {
  poly(b, [[AX, AY - hw / 2], [AX + hw, AY], [AX, AY + hw / 2], [AX - hw, AY]], (x, y) => {
    const k = Math.floor((x - AX * K) / 2 + (y - AY * K)) & 3; // rows running down-right, one real pixel each
    return k === 0 ? 0x5a3e20 : k === 1 ? crop2 : dith(x, y, 0.5) ? crop : crop2;
  });
}

export function buildingSprite(kind: BKind, level: number, owner: RGB, roof: RGB): Sprite {
  const b = PixBuf.hi(BW, BH, K);
  const body = hex(BUILDINGS[kind].color);
  const seed = kind.length * 31 + level;
  const X = AX, Y = AY;
  switch (kind) {
    case 'center': {
      plaza(b, level === 3 ? 32 : 28);
      if (level === 1) {
        box(b, X, Y - 2, 15, 13, body, { paintL: windows(seed, 3, 4, 0.5), paintR: windows(seed + 1, 3, 4, 0.3), trim: owner });
        dome(b, X - 3, Y - 20, 5, 4, 0xd8dce0);
        line(b, X + 6, Y - 17, X + 9, Y - 23, 0x60646a, K); ellipse(b, X + 10, Y - 24, 3, 2, 0xc0c4ca);
        flagOn(b, X + 8, Y - 15, owner);
      } else if (level === 2) {
        box(b, X, Y - 2, 22, 10, body, { paintL: windows(seed, 3, 4, 0.4), paintR: windows(seed + 1, 3, 4, 0.3) });
        box(b, X, Y - 12, 13, 16, shadeRGB(body, 0.1), { paintL: windows(seed + 2, 2, 3, 0.6, GLASS_L), paintR: windows(seed + 3, 2, 3, 0.5, GLASS_L), trim: owner });
        flagOn(b, X, Y - 34, owner);
      } else {
        box(b, X, Y - 2, 25, 8, body, { paintL: windows(seed, 3, 4, 0.4), paintR: windows(seed + 1, 3, 4, 0.3) });
        box(b, X, Y - 10, 17, 10, shadeRGB(body, 0.08), { paintL: windows(seed + 2, 3, 4, 0.6), paintR: windows(seed + 3, 3, 4, 0.5), trim: owner });
        cylinder(b, X, Y - 18, 8, 18, 0xd8d2c0);
        for (let v = 0; v < 18; v += 4) line(b, X - 7, Y - 21 - v, X + 7, Y - 21 - v, GLASS_L);
        dome(b, X, Y - 38, 8, 6, 0x5ad8f0, true);
        line(b, X, Y - 45, X, Y - 54, 0xe0e0e0);
        flagOn(b, X + 1, Y - 52, owner);
      }
      break;
    }
    case 'housing': {
      if (level === 1) {
        const hut = (dx: number, dy: number) => { box(b, X + dx, Y + dy, 8, 6, body, { paintL: (u, v, x) => (v > 1 && v < 4 && x % 4 === 1 ? LIT : null) }); gable(b, X + dx, Y + dy, 8, 6, 5, roof); };
        hut(-12, -2); hut(11, -3); hut(0, 7);
      } else if (level === 2) {
        plaza(b, 26, 0x7a7670);
        box(b, X - 9, Y + 2, 11, 22, body, { paintL: windows(seed), paintR: windows(seed + 1), trim: owner });
        box(b, X + 11, Y - 4, 10, 16, shadeRGB(body, -0.08), { paintL: windows(seed + 2), paintR: windows(seed + 3), trim: owner });
      } else {
        plaza(b, 26, 0x7a7670);
        box(b, X, Y - 1, 17, 6, shadeRGB(body, -0.1));
        box(b, X, Y - 7, 11, 44, 0x6a86a8, { paintL: windows(seed, 2, 3, 0.55, GLASS), paintR: windows(seed + 1, 2, 3, 0.4, GLASS), trim: owner });
        rect(b, X - 1, Y - 66, 1, 9, 0xd0d0d0); dot(b, X - 1, Y - 67, 0xff4040);
      }
      break;
    }
    case 'farm': {
      field(b, 30, level === 3 ? 0x6ab84a : 0xd8b440, level === 3 ? 0x4a9a3a : 0x9aa83a);
      if (level === 2) for (let i = 0; i < 6; i++) tree(b, X - 16 + (i % 3) * 9 + Math.floor(i / 3) * 6, Y - 2 + Math.floor(i / 3) * 7 - (i % 3) * 3, 6, 0x3a8a3a, i + 3);
      if (level === 3) { dome(b, X - 12, Y - 2, 8, 6, 0x8fe0f0); dome(b, X + 4, Y + 4, 8, 6, 0x8fe0f0); dome(b, X + 6, Y - 9, 7, 5, 0x8fe0f0); }
      // barn
      const bx = level === 3 ? X + 18 : X + 14, by = Y - 6;
      box(b, bx, by, 8, 7, 0xa83a2a, { paintL: (u, v) => (u > 0.4 && u < 0.7 && v < 5 ? 0x5a1a10 : null) });
      gable(b, bx, by, 8, 7, 5, roof);
      if (level >= 2) cylinder(b, bx - 12, by - 3, 3, 15, 0xc9c2b0);
      break;
    }
    case 'lumber': {
      const logs = (lx: number, ly: number, n: number) => {
        for (let i = 0; i < n; i++) { const yy = ly - Math.floor(i / 3) * 3, xx = lx + (i % 3) * 4 - Math.floor(i / 3) * 2; rect(b, xx - 8, yy - 2, 9, 3, 0x8a5a2a); ellipse(b, xx + 1, yy - 1, 2, 2, 0xd8a868); dot(b, xx + 1, yy - 1, 0x8a5a2a); }
      };
      tree(b, X + 18, Y - 8, 11, 0x2f7a3a, seed); tree(b, X + 22, Y + 2, 9, 0x3a8a3a, seed + 4);
      if (level === 1) { box(b, X - 8, Y - 4, 8, 7, body); gable(b, X - 8, Y - 4, 8, 7, 5, roof); logs(X + 2, Y + 8, 5); tree(b, X - 22, Y - 2, 10, 0x2f7a3a, seed + 9); }
      else if (level === 2) {
        box(b, X - 6, Y - 2, 14, 10, body, { paintL: (u, v, x) => (v > 3 && v < 7 && x % 5 < 2 ? 0x3a2410 : null) });
        gable(b, X - 6, Y - 2, 14, 10, 7, roof); logs(X + 6, Y + 10, 6);
      } else {
        box(b, X - 6, Y - 2, 18, 14, 0x7a6a5a, { paintL: windows(seed, 4, 5, 0.5), paintR: windows(seed + 1, 4, 5, 0.3), trim: owner });
        for (let i = 0; i < 3; i++) gable(b, X - 15 + i * 9, Y - 14 - 6 + i * 4, 6, 0, 4, roof);
        cylinder(b, X - 16, Y - 10, 3, 22, 0x8a5040); smoke(b, X - 14, Y - 37); logs(X + 8, Y + 12, 9);
      }
      break;
    }
    case 'mine': {
      const rock = 0x7a6a5a;
      dome(b, X - 4, Y - 2, 22, 12, rock);
      for (let i = 0; i < 26; i++) { const px = X - 22 + ((i * 7) % 40), py = Y - 8 + ((i * 5) % 12); if (hash2(px, py, 9) > 0.5) dot(b, px, py, shadeRGB(rock, -0.4)); }
      ellipse(b, X - 8, Y + 2, 5, 4, (x, y) => (y / K < Y + 4 ? 0x14100c : null));
      const tall = level === 1 ? 18 : level === 2 ? 26 : 0;
      if (tall) {
        line(b, X + 4, Y - 6, X + 10, Y - 6 - tall, 0x5a3a20, K); line(b, X + 16, Y - 6, X + 10, Y - 6 - tall, 0x5a3a20, K);
        line(b, X + 6, Y - 6 - tall / 2, X + 14, Y - 6 - tall / 2, 0x5a3a20, K);
        ellipse(b, X + 10, Y - 6 - tall, 3, 3, 0x9aa0a8); dot(b, X + 10, Y - 6 - tall, 0x30343a);
      }
      // ore cart
      rect(b, X + 12, Y + 6, 7, 4, 0x50565e); rect(b, X + 13, Y + 4, 5, 2, 0x9fb3c8); dot(b, X + 13, Y + 10, 0x14100c); dot(b, X + 17, Y + 10, 0x14100c);
      if (level === 2) box(b, X - 18, Y + 4, 8, 9, 0x6f7480, { paintL: windows(seed), trim: owner });
      if (level === 3) {
        box(b, X + 4, Y - 2, 14, 8, 0x5a606a, { paintL: windows(seed, 4, 4, 0.6), trim: owner });
        box(b, X + 4, Y - 10, 5, 30, 0x8a929c);
        for (let v = 0; v < 30; v += 6) { line(b, X - 1, Y - 12 - v, X + 9, Y - 12 - v - 5, 0x50565e); }
        dome(b, X + 4, Y - 44, 6, 5, 0xffa040, true);
        ellipse(b, X - 8, Y + 2, 5, 4, (x, y) => (y / K < Y + 4 ? (dith(x, y, 0.5) ? 0xff8030 : 0xffc060) : null));
      }
      break;
    }
    case 'power': {
      if (level === 1) {
        box(b, X - 8, Y + 2, 7, 6, 0xe0dccc); gable(b, X - 8, Y + 2, 7, 6, 4, roof);
        cylinder(b, X + 6, Y - 2, 2, 34, 0xf0f0e8);
        const hx = X + 6, hy = Y - 37;
        for (const [dx, dy] of [[0, -17], [15, 9], [-15, 9]]) { line(b, hx, hy, hx + dx, hy + dy, 0xfaf6ec, K); line(b, hx + 1, hy + 1, hx + dx + 1, hy + dy + 1, 0xa8a498); }
        ellipse(b, hx, hy, 2, 2, owner);
      } else if (level === 2) {
        box(b, X - 2, Y, 17, 12, 0x4f6a78, { paintL: windows(seed, 4, 5, 0.3), paintR: windows(seed + 1, 4, 5, 0.2), trim: owner });
        cylinder(b, X + 8, Y - 14, 3, 18, 0xd8d8d0); rect(b, X + 5, Y - 30, 7, 2, 0xc03030);
        cylinder(b, X + 15, Y - 10, 3, 16, 0xd8d8d0); rect(b, X + 12, Y - 25, 7, 2, 0xc03030);
        smoke(b, X + 9, Y - 36); smoke(b, X + 17, Y - 31);
      } else {
        box(b, X, Y, 22, 8, 0x3f5a68, { paintL: windows(seed, 3, 4, 0.5), trim: owner });
        dome(b, X, Y - 14, 16, 11, 0x9aa6b2);
        ellipse(b, X, Y - 16, 17, 5, (x, y) => (Math.abs((((x + 0.5) / K - X) / 17) ** 2 + (((y + 0.5) / K - (Y - 16)) / 5) ** 2 - 0.8) < 0.22 ? 0x7ee0ff : null));
        dome(b, X, Y - 26, 6, 5, 0x9ff4ff, true);
      }
      break;
    }
    case 'lab': {
      if (level === 1) {
        box(b, X, Y, 16, 12, 0xc8b89a, { paintL: windows(seed, 3, 4, 0.5), paintR: windows(seed + 1, 3, 4, 0.4), trim: owner });
        gable(b, X, Y, 16, 12, 6, 0x4a6a8a);
        cylinder(b, X + 2, Y - 18, 3, 6, 0xe8e0c8); dome(b, X + 2, Y - 25, 4, 3, 0x6ac0e0);
        ellipse(b, X - 5, Y - 4, 2, 2, 0xf0f0f0); dot(b, X - 5, Y - 5, 0x14100c);
      } else if (level === 2) {
        box(b, X - 4, Y + 2, 18, 12, 0xd8d0c0, { paintL: windows(seed, 3, 4, 0.5), paintR: windows(seed + 1, 3, 4, 0.4), trim: owner });
        box(b, X + 12, Y - 6, 7, 18, 0xc8c0b0, { paintL: windows(seed + 2) });
        dome(b, X - 4, Y - 16, 9, 7, 0xe8ecf0);
        line(b, X - 6, Y - 22, X - 1, Y - 17, 0x30343a);
      } else {
        box(b, X, Y, 18, 10, 0x4a3a70, { paintL: windows(seed, 3, 4, 0.6, 0x2a2048), paintR: windows(seed + 1, 3, 4, 0.5, 0x2a2048), trim: owner });
        dome(b, X, Y - 14, 13, 10, 0xb488ff, true);
        for (let i = 0; i < 6; i++) dot(b, X - 10 + Math.floor(hash2(i, 1, seed) * 20), Y - 30 + Math.floor(hash2(i, 2, seed) * 10), 0xffffff);
        line(b, X + 8, Y - 22, X + 13, Y - 34, 0xd0d0d0); dot(b, X + 13, Y - 35, 0xff60ff);
      }
      break;
    }
    case 'barracks': {
      if (level === 1) {
        const tent = (dx: number, dy: number) => gable(b, X + dx, Y + dy, 8, 0, 9, 0x8a8a58);
        tent(-12, -2); tent(8, -6); tent(-2, 8);
        flagOn(b, X + 18, Y + 4, owner);
      } else if (level === 2) {
        box(b, X, Y, 22, 8, 0x6a6a48, { paintL: windows(seed, 4, 4, 0.4), paintR: windows(seed + 1, 4, 4, 0.3) });
        gable(b, X, Y, 22, 8, 6, roof);
        flagOn(b, X + 22, Y - 6, owner);
      } else {
        const stone = 0x8a8478;
        box(b, X, Y, 22, 14, stone, { paintL: (u, v, x) => (v > 4 && v < 8 && x % 6 === 2 ? 0x14100c : (Math.floor(v) % 4 === 0 ? shadeRGB(stone, -0.25) : null)), trim: owner });
        for (let i = -20; i <= 20; i += 4) { const yy = Y - 14 - 11 + Math.abs(i) / 2 + (i > 0 ? 0 : 0); rect(b, X + i, yy + 11 - 3 - (i <= 0 ? 0 : 0), 2, 2, shadeRGB(stone, 0.2)); }
        cylinder(b, X - 20, Y - 2, 5, 22, stone); cylinder(b, X + 20, Y - 2, 5, 22, stone);
        cylinder(b, X, Y + 9, 5, 20, stone);
        flagOn(b, X, Y - 9, owner);
      }
      break;
    }
    case 'tower': {
      if (level === 1) {
        const w = 0x7a5530;
        line(b, X - 6, Y + 2, X - 3, Y - 30, w, K); line(b, X + 6, Y + 2, X + 3, Y - 30, w, K); line(b, X, Y + 5, X, Y - 30, w, K);
        for (let v = 4; v < 30; v += 8) line(b, X - 5, Y - v, X + 5, Y - v - 4, shadeRGB(w, -0.2), K);
        box(b, X, Y - 30, 7, 3, 0x9a7040); gable(b, X, Y - 30, 7, 3, 6, roof);
        dot(b, X - 1, Y - 34, 0xffd27a);
      } else if (level === 2) {
        box(b, X, Y, 10, 4, 0x6a7480);
        box(b, X, Y - 4, 4, 32, 0x8d99a6, { trim: owner });
        box(b, X, Y - 36, 7, 5, 0x5a6470, { trim: owner });
        dome(b, X, Y - 44, 4, 3, 0xff4a4a, true);
      } else {
        box(b, X, Y, 14, 8, 0x5a6470, { paintL: windows(seed, 4, 4, 0.4), trim: owner });
        dome(b, X, Y - 12, 10, 7, 0x9aa6b2);
        for (let t = 0; t < 3; t++) line(b, X + 2 + t, Y - 14 + (t === 1 ? 0 : 1), X + 18 + t, Y - 30 + (t === 1 ? 0 : 1), t === 1 ? 0x9aa6b2 : 0x3a4048, K);
        dome(b, X + 20, Y - 32, 4, 4, 0x7ee0ff, true);
      }
      break;
    }
    case 'magic': magicHouse(b, level, owner, seed); break;
  }
  return { buf: b, ax: AX * K, ay: AY * K };
}

/** A pointy wizard-hat roof standing on (x,y), shaded left to right, with gold star dots. */
function cone(b: PixBuf, x: number, y: number, rx: number, h: number, color: RGB, seed: number, bend = 0) {
  const r = ramp(color), k = b.k;
  poly(b, [[x - rx, y], [x + rx, y], [x + bend, y - h]], (px, py) => {
    const lx = (px + 0.5) / k, ly = (py + 0.5) / k;
    const t = (y - ly) / h; const cx = x + bend * t, half = rx * (1 - t);
    const u = half > 0 ? (lx - (cx - half)) / (2 * half) : 0.5;
    if (hash2(px >> 1, py >> 1, seed) > 0.975) return 0xffe27a;
    return u < 0.3 ? r[3] : u < 0.62 ? r[2] : u < 0.88 ? r[1] : r[0];
  });
  ellipse(b, x, y, rx, Math.max(1, rx / 3), (px, py) => ((py + 0.5) / k > y ? r[1] : null));
  dot(b, x + bend, y - h - 1, 0xffe27a);
}
function sparkle(b: PixBuf, x: number, y: number, c: RGB = 0xfff6c0) {
  dot(b, x, y, 0xffffff); dot(b, x - 1, y, c); dot(b, x + 1, y, c); dot(b, x, y - 1, c); dot(b, x, y + 1, c);
}
/** Jay's magic house: a crooked cottage, then a spell tower, then a star castle. */
function magicHouse(b: PixBuf, level: number, owner: RGB, seed: number) {
  const X = AX, Y = AY, wall = 0x8a6ad8, stone = 0xb8b0d8, hat = 0x2c3c9c, glow = 0x7ef0ff, gold = 0xffd060;
  const roundWin = (x: number, y: number, r = 2) => { ellipse(b, x, y, r, r + 0.5, 0x14100c); ellipse(b, x, y, r - 0.5, r, glow); dot(b, x - 0.5, y - 1, 0xffffff); };
  if (level === 1) {
    // a little purple cottage with a floppy wizard-hat roof
    box(b, X, Y, 13, 12, wall, { paintL: (u, v, x) => (v > 6 && v < 14 && u > 0.35 && u < 0.6 ? 0x3a2410 : null), trim: owner });
    cone(b, X, Y - 15, 16, 22, hat, seed, 4);
    roundWin(X + 7, Y - 4);
    cylinder(b, X - 9, Y - 12, 2, 8, 0x6a5aa0); ellipse(b, X - 8, Y - 23, 2, 2, 0xd0f8ff); ellipse(b, X - 6, Y - 27, 2, 1.5, 0xb0e8ff);
    sparkle(b, X + 16, Y - 30); sparkle(b, X - 15, Y - 34, 0xffd0ff);
    for (let i = 0; i < 4; i++) dot(b, X - 12 + i * 7, Y + 8 - (i % 2), [0xff6ad0, 0xffe060, 0x7ef0ff, 0xff9a40][i]); // flowers
  } else if (level === 2) {
    plaza(b, 26, 0x6a6488);
    box(b, X - 8, Y + 4, 12, 11, wall, { trim: owner });
    gable(b, X - 8, Y + 4, 12, 11, 7, hat);
    roundWin(X - 2, Y - 1);
    cylinder(b, X + 9, Y - 2, 7, 32, stone);
    for (let v = 8; v < 30; v += 8) roundWin(X + 9, Y - 2 - v, 1.5);
    cone(b, X + 9, Y - 34, 10, 22, hat, seed, -3);
    ellipse(b, X + 6, Y - 61, 3, 3, glow); dot(b, X + 5, Y - 62, 0xffffff);
    sparkle(b, X - 18, Y - 18); sparkle(b, X + 22, Y - 44, 0xffd0ff); sparkle(b, X - 6, Y - 40);
  } else {
    plaza(b, 32, 0x5a5478);
    box(b, X, Y, 22, 14, stone, { paintL: (u, v, x) => (v > 3 && v < 12 && u > 0.42 && u < 0.6 ? 0x3a2410 : (Math.floor(v) % 6 === 0 ? shadeRGB(stone, -0.2) : null)), trim: owner });
    for (const dx of [-20, 20]) { cylinder(b, X + dx, Y - 1, 5, 28, stone); cone(b, X + dx, Y - 29, 7, 16, hat, seed + dx); }
    cylinder(b, X, Y - 12, 7, 32, wall);
    for (let v = 6; v < 30; v += 9) roundWin(X, Y - 12 - v, 1.5);
    cone(b, X, Y - 44, 10, 24, 0x6a2cb0, seed + 7);
    // a floating star crystal above the castle
    poly(b, [[X, Y - 86], [X + 4, Y - 80], [X, Y - 74], [X - 4, Y - 80]], (px, py) => (((px + py) & 3) === 0 ? 0xffffff : gold));
    for (let i = 0; i < 7; i++) sparkle(b, X - 26 + Math.floor(hash2(i, 3, seed) * 52), Y - 70 + Math.floor(hash2(i, 4, seed) * 40), i % 2 ? 0xffd0ff : 0xfff6c0);
    flagOn(b, X + 22, Y - 50, owner);
  }
}

/** Building scaffold for construction. */
export function scaffoldSprite(height: number): Sprite {
  const b = PixBuf.hi(BW, BH, K), X = AX, Y = AY, c = 0xd8a020, d = 0x8a6010;
  for (const dx of [-14, 0, 14]) line(b, X + dx, Y + 7 - Math.abs(dx) / 2, X + dx, Y + 7 - Math.abs(dx) / 2 - height, c, K);
  for (let v = 0; v <= height; v += 6) { line(b, X - 14, Y - v, X, Y + 7 - v, d, K); line(b, X, Y + 7 - v, X + 14, Y - v, d, K); }
  line(b, X + 14, Y - height, X + 14, Y - height - 14, 0xe0c040, K); line(b, X + 2, Y - height - 14, X + 26, Y - height - 14, 0xe0c040, K);
  line(b, X + 24, Y - height - 14, X + 24, Y - height - 4, 0x60646a, K);
  return { buf: b, ax: AX * K, ay: AY * K };
}

/** Small building for the world map: one block per building, colored by kind. */
export function miniBuilding(b: PixBuf, x: number, y: number, kind: BKind, level: number, owner: RGB, roof: RGB) {
  const body = hex(BUILDINGS[kind].color);
  const h = 2 + level * 3 + (kind === 'housing' || kind === 'center' ? level * 2 : 0);
  box(b, x, y, 4, h, body, { top: kind === 'farm' ? 0x9ab840 : mix(roof, body, 0.3), trim: kind === 'center' ? owner : undefined, paintL: (u, v, px) => (v > 1 && v < h - 1 && px % 2 === 0 && Math.floor(v) % 3 === 1 ? LIT : null) });
}

export const PAL = { LIT, GLASS, ramp };
