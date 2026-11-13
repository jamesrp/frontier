// Dev only: render the pixel art to PNG files (node + node-canvas) to look at it without a browser.
import { newGame, endTurn } from './game';
import { aiPlan } from './ai';
import { BKind, RACES } from './data';
import { epx, hex, PixBuf } from './pixel';
import { paintCity, paintMap } from './scene';
import { buildingSprite, resIcon, unitSprite, workerSprite, flagSprite } from './sprites';
declare const require: any; declare const process: any;
const { createCanvas } = require(process.env.CANVAS_MOD);
const fs = require('fs');
const out = process.argv[2];
function save(buf: PixBuf, name: string, scale = 3) {
  const c = createCanvas(buf.w * scale, buf.h * scale), ctx = c.getContext('2d');
  const src = createCanvas(buf.w, buf.h), sctx = src.getContext('2d');
  const img = sctx.createImageData(buf.w, buf.h); img.data.set(buf.data); sctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false; ctx.drawImage(src, 0, 0, c.width, c.height);
  fs.writeFileSync(`${out}/${name}.png`, c.toBuffer('image/png'));
}
const s = newGame({ race: 'ironhorn', difficulty: 'normal', seed: 7, aiVsAi: true });
for (let i = 0; i < 30 && s.winner === null; i++) { aiPlan(s, 0); aiPlan(s, 1); endTurn(s); }
const trim = (o: number) => hex(s.players[o].color), roof = (o: number) => hex(RACES[s.players[o].race].roof);
save(paintMap(s, { sel: s.cities[0].territory, targets: new Set(s.map[s.cities[0].territory].neighbors), trimOf: trim, roofOf: roof }), 'map', 3);
const c = s.cities.find((x) => x.owner === 0) ?? s.cities[0];
save(paintCity(s, c, { trim: trim(c.owner), roof: roof(c.owner), sel: 5 }), 'city', 1);
const c2 = s.cities.find((x) => x.owner === 1) ?? s.cities[s.cities.length - 1]; console.log('cities', s.cities.map((x) => x.owner + ':' + x.name).join(' '), 'winner', s.winner);
save(paintCity(s, c2, { trim: trim(1), roof: roof(1), sel: null }), 'city2', 1);
// sprite sheet
const kinds: BKind[] = ['center', 'housing', 'farm', 'lumber', 'mine', 'power', 'lab', 'barracks', 'tower', 'magic'];
const sheet = new PixBuf(96 * 3, 112 * kinds.length / 3 * 3);
const sheetB = PixBuf.hi(96 * kinds.length, 112 * 3, 2);
kinds.forEach((k, i) => [1, 2, 3].forEach((l) => sheetB.blit(buildingSprite(k, l, 0xe0662f, 0x7a2f18), i * 96 + 48, (l - 1) * 112 + 88)));
for (let y = 0; y < sheetB.h; y++) for (let x = 0; x < sheetB.w; x++) if (!sheetB.alpha(x, y)) sheetB.set(x, y, ((x >> 3) + (y >> 3)) % 2 ? 0x55603a : 0x4c5634);
save(sheetB, 'buildings', 1);
void sheet;
const u = PixBuf.hi(160, 70, 2);
for (let y = 0; y < u.h; y++) for (let x = 0; x < u.w; x++) u.set(x, y, 0x5a6a3a);
['soldier', 'walker', 'artillery', 'settler', 'militia'].forEach((k, i) => u.blit(unitSprite(k, 0x9b6bff), 14 + i * 28, 30));
u.blit(workerSprite(0xe0662f), 150, 30);
(['food', 'wood', 'iron', 'energy', 'science'] as const).forEach((r, i) => u.blit(resIcon(r), 10 + i * 14, 14));
u.blit(flagSprite(0xe0662f), 90, 14);
['soldier', 'walker', 'artillery', 'settler', 'militia'].forEach((k, i) => u.blit(unitSprite(k, 0xe0662f), 14 + i * 28, 62));
u.blit(epx(workerSprite(0xe0662f)), 150, 62); u.blit(epx(flagSprite(0xe0662f)), 120, 50);
save(u, 'units', 3);
console.log('ok turn', s.turn);
