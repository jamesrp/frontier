import {
  BKind, BUILDINGS, BUILD_ORDER, COMBAT_UNITS, FOCUS, Focus, growCost, RACES, RACE_ORDER, RaceId, Res, RES_INFO, RES_LIST, Stock,
  TECHS, TECH_ORDER, TechId, TERRAIN, TILE_BONUS, UKind, UNITS, COUNTER_MULT, MILITIA,
} from './data';
import {
  armyCap, armyCount, Building, cancelConstruction, City, cityAt, cityById, cityOutput, CENTER_TILE, empireOutput,
  endTurn, forecast, freeTiles, GameState, GRID, hasTech, housingCap, idlePeople, inPeace, newGame, orderMove,
  outputOf, PEACE_TURNS, researchPath, setFocus, setGoal, slotsOf, startBuild, startUpgrade, tileBonusStars, train,
  TurnEvent, Unit, untrain, whyCantBuild, whyCantMove, whyCantTrain, whyCantUpgrade, hostileAt, raceOf,
  buildSlots, freeBuilders, buildAt, buildTurns, unitCost, growCostFor,
} from './game';
import { aiPlan } from './ai';
import { diamond, stars } from './draw';
import { paintMap, paintCity, paintField, tileArt, ART_MAP_W, ART_MAP_H, ART_CITY_W, ART_CITY_H, CITY_SCALE, CITY_K, TILE_HW, TILE_HH } from './scene';
import { hex, PixBuf, spriteURL } from './pixel';
import { unitSprite, workerSprite, resIcon, buildingSprite } from './sprites';
import { MAP_H, MAP_W, pointInPoly } from './mapgen';
import { Fighter } from './battle';
import { sfx, isMuted, setMuted } from './sound';
import { activeQuests, checkQuests, noteEvents, Quest, QUESTS, questState, starsEarned } from './quests';

// ---------------------------------------------------------------- state

type Overlay = null | 'start' | 'tech' | 'almanac' | 'report' | 'win' | 'empire';
interface MoveMode { from: number; counts: Partial<Record<UKind, number>>; target: number | null }
interface BattlePlay { ev: Extract<TurnEvent, { kind: 'battle' }>; speed: number; done: boolean; token: number }
const ui = {
  g: null as GameState | null,
  view: 'map' as 'map' | 'city' | 'battle',
  sel: null as number | null, // selected territory
  cityId: null as number | null,
  tile: null as number | null,
  placing: null as BKind | null,
  move: null as MoveMode | null,
  overlay: 'start' as Overlay,
  almTab: 'buildings',
  startRace: 'ironhorn' as RaceId,
  startDiff: 'easy' as 'easy' | 'normal',
  startPlayers: 2,
  startFoes: 'random' as RaceId | 'random',
  report: [] as TurnEvent[],
  battles: [] as Extract<TurnEvent, { kind: 'battle' }>[],
  play: null as BattlePlay | null,
  toast: '' as string,
  stay: new Set<number>(), // units told to guard where they are, so Next skips them
  seen: new Set<string>(), // nudges already visited this turn
  nudge: '' as string, // the nudge Next just jumped to
  questPop: [] as Quest[], // quests just finished, shown as a banner
};
const ME = 0;
const SAVE_KEY = 'frontier-save-v2';
let root: HTMLElement;

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const g = () => ui.g!;
const me = () => g().players[ME];

function costChips(cost: Stock, short = false) {
  const p = ui.g ? me() : null;
  return RES_LIST.filter((r) => cost[r]).map((r) => {
    const lack = p && p.res[r] < (cost[r] ?? 0);
    return `<span class="chip ${lack ? 'lack' : ''}" title="${RES_INFO[r].name}">${ricon(r)}${short ? '' : ' '}${cost[r]}</span>`;
  }).join('') || '<span class="chip">free</span>';
}
function outChips(out: Partial<Record<Res, number>>) {
  return RES_LIST.filter((r) => out[r]).map((r) => `<span class="chip">${ricon(r)} +${out[r]}</span>`).join('') || '<span class="dim">nothing yet</span>';
}

// ---------------------------------------------------------------- save / load

function save() { try { if (ui.g) localStorage.setItem(SAVE_KEY, JSON.stringify(ui.g)); } catch { /* storage may be blocked */ } }
function loadSave(): GameState | null {
  try { const t = localStorage.getItem(SAVE_KEY); return t ? JSON.parse(t) : null; } catch { return null; }
}
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }

// ---------------------------------------------------------------- top bar

function renderTop() {
  if (!ui.g) return '';
  const p = me();
  const inc = empireOutput(g(), ME);
  const res = RES_LIST.map((r) => `<div class="res" title="${RES_INFO[r].name}: ${RES_INFO[r].what}">
      <span class="ri">${ricon(r)}</span><b>${Math.floor(p.res[r])}</b><small>+${inc[r]}</small></div>`).join('');
  const research = p.researching
    ? `${TECHS[p.researching].icon} ${TECHS[p.researching].name} <small>${p.progress}/${TECHS[p.researching].cost}</small>`
    : '<span class="warn">Pick research</span>';
  const peace = inPeace(g()) ? `<span class="peace" title="Nobody can attack until turn ${PEACE_TURNS + 1}">🕊️ Peace until turn ${PEACE_TURNS + 1}</span>` : '';
  const others = g().players.filter((x) => x.id !== ME).map((o) => {
    const cities = g().cities.filter((c) => c.owner === o.id).length;
    return `<span class="foe" style="--pc:${o.color}">${RACES[o.race].icon} ${cities} 🏙️ · ${armyCount(g(), o.id)} ⚔️</span>`;
  }).join('');
  return `<header class="top">
    <div class="brand"><span class="logo">Frontier <small class="ver">v0.1</small></span><span class="turn">Turn ${g().turn}</span><button class="stars" data-act="quests" title="Stars from quests">⭐ ${starsEarned(g())}/${QUESTS.length}</button>${peace}</div>
    <div class="resbar">${res}<div class="res" title="Army size and limit"><span class="ri">⚔️</span><b>${armyCount(g(), ME)}/${armyCap(g(), ME)}</b><small>army</small></div></div>
    <div class="actions">
      <button class="btn ghost" data-act="overlay" data-v="tech">🧪 ${research}</button>
      <label class="focus" title="Where your people choose to work">Focus
        <select id="focus-sel" data-change="focus">${(Object.keys(FOCUS) as Focus[]).map((f) => `<option value="${f}" ${p.focus === f ? 'selected' : ''}>${FOCUS[f].icon} ${FOCUS[f].name}</option>`).join('')}</select>
      </label>
      <button class="btn ghost" data-act="overlay" data-v="empire" title="Everything your cities and armies are doing">📋 Empire</button>
      <button class="btn ghost" data-act="overlay" data-v="almanac">📖 Almanac</button>
      <button class="btn ghost icon" data-act="mute" title="${isMuted() ? 'Sound is off' : 'Sound is on'}">${isMuted() ? '🔇' : '🔊'}</button>
      <span class="score"><span class="mine" style="--pc:${p.color}">${RACES[p.race].icon} You</span>${others}</span>
      ${(() => { const n = nudges().length; return `<button class="btn next ${n ? 'hot' : ''}" data-act="next" ${ui.view === 'battle' ? 'disabled' : ''} title="Jump to the next thing that could use you">${n ? `Next 👉 <span class="badge">${n}</span>` : 'All set ✓'}</button>`; })()}
      <button class="btn end ${nudges().length ? '' : 'hot'}" data-act="end-turn" ${ui.view === 'battle' ? 'disabled' : ''}>End turn ▶</button>
    </div>
  </header>`;
}

// ---------------------------------------------------------------- pixel art helpers

type ArtJob = { kind: 'map' } | { kind: 'city'; cityId: number; sel: number | null; owner?: number } | { kind: 'field'; territory: number };
let artJob: ArtJob | null = null;
const trimOf = (o: number) => hex(g().players[o].color);
const roofOf = (o: number) => hex(RACES[g().players[o].race].roof);

function cropBuf(b: PixBuf, pad = 1): PixBuf {
  let x0 = b.w, y0 = b.h, x1 = -1, y1 = -1;
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.alpha(x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 < 0) return b;
  const out = new PixBuf(x1 - x0 + 1 + pad * 2, y1 - y0 + 1 + pad * 2);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (b.alpha(x, y)) out.set(x - x0 + pad, y - y0 + pad, b.get(x, y));
  return out;
}
/** Pixel icon for a resource as an <img>, falling back to the emoji. */
function ricon(r: Res) {
  const url = spriteURL(`res-${r}`, () => resIcon(r).buf, 2);
  return url ? `<img class="pi" src="${url}" alt="${RES_INFO[r].name}">` : RES_INFO[r].icon;
}
/** A little pixel treasure chest for the map. */
function chestSprite() {
  const b = new PixBuf(14, 12, 1);
  const wood = 0x8a5a24, dark = 0x4a2c10, gold = 0xffd84a, hi = 0xfff2a0;
  for (let y = 0; y < 12; y++) for (let x = 0; x < 14; x++) {
    const edge = x === 0 || x === 13 || y === 0 || y === 11;
    let c = edge ? 0x14100c : y < 5 ? (y === 1 ? 0xb07a38 : wood) : (y === 5 ? dark : wood);
    if (!edge && (x === 3 || x === 10)) c = gold;
    if (!edge && y === 5) c = gold;
    if ((x === 6 || x === 7) && y >= 4 && y <= 7) c = y === 4 ? hi : gold;
    if ((x === 0 || x === 13) && (y === 0 || y === 11)) continue;
    b.set(x, y, c);
  }
  return b;
}
function unitURL(kind: string, owner: number, scale = 2) {
  const col = ui.g ? g().players[owner].color : '#e0662f';
  return spriteURL(`u-${kind}-${col}`, () => unitSprite(kind, hex(col)).buf, scale);
}
function uicon(kind: UKind, owner = ME) {
  const url = unitURL(kind, owner, 2);
  return url ? `<img class="pu" src="${url}" alt="${UNITS[kind].name}">` : UNITS[kind].icon;
}
function bicon(kind: BKind, level: number, owner = ME) {
  const col = ui.g ? g().players[owner].color : '#e0662f', rf = ui.g ? RACES[g().players[owner].race].roof : '#7a2f18';
  const url = spriteURL(`b-${kind}-${level}-${col}`, () => cropBuf(buildingSprite(kind, level, hex(col), hex(rf)).buf), 1);
  return url ? `<img class="pb" src="${url}" alt="">` : BUILDINGS[kind].icon;
}

/** Copy the pixel art for the current view onto its canvas. Called after every render. */
function paintArt() {
  const cv = document.getElementById('art-canvas') as HTMLCanvasElement | null;
  if (!cv || !artJob || !ui.g) return;
  const ctx = cv.getContext ? cv.getContext('2d') : null;
  if (!ctx) return;
  let buf: PixBuf;
  if (artJob.kind === 'map') {
    const targets = new Set<number>();
    if (ui.move) for (const n of g().map[ui.move.from].neighbors) targets.add(n);
    buf = paintMap(g(), { sel: ui.sel, targets, trimOf, roofOf });
  } else if (artJob.kind === 'city') {
    const c = cityById(g(), artJob.cityId);
    if (!c) return;
    const o = artJob.owner ?? c.owner;
    buf = paintCity(g(), c, { trim: trimOf(o), roof: roofOf(o), sel: artJob.sel });
  } else buf = paintField(g(), artJob.territory);
  const img = ctx.createImageData(buf.w, buf.h);
  img.data.set(buf.data);
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------- world map

function stackLabel(units: Unit[]) {
  const by: Partial<Record<UKind, number>> = {};
  units.forEach((u) => (by[u.kind] = (by[u.kind] ?? 0) + 1));
  return (Object.keys(by) as UKind[]).map((k) => `${UNITS[k].icon}${by[k]}`).join(' ');
}
function stackHTML(units: Unit[], owner = ME) {
  const by: Partial<Record<UKind, number>> = {};
  units.forEach((u) => (by[u.kind] = (by[u.kind] ?? 0) + 1));
  return (Object.keys(by) as UKind[]).map((k) => `<span class="stk">${uicon(k, owner)}×${by[k]}</span>`).join(' ');
}

/** Keep a centred label inside the map: px is a rough width per letter. */
const lx = (cx: number, text: string, px: number) => { const half = text.length * px / 2 + 10; return Math.max(half, Math.min(MAP_W - half, cx)); };
/** Ready units of mine at a territory (not trained this turn). */
const readyAt = (t: number) => g().units.filter((u) => u.at === t && u.owner === ME && !u.fresh);
function renderMap() {
  const s = g();
  artJob = { kind: 'map' };
  const moveTargets = new Set<number>();
  if (ui.move) for (const n of s.map[ui.move.from].neighbors) moveTargets.add(n);
  let out = `<div class="artbox"><canvas id="art-canvas" class="art" width="${ART_MAP_W}" height="${ART_MAP_H}"></canvas>
    <svg class="world overlay" id="world-svg" viewBox="0 0 ${MAP_W} ${MAP_H}" role="img" aria-label="World map">
    <defs><marker id="arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke"/></marker></defs>`;
  for (const t of s.map) {
    const city = cityAt(s, t.id);
    const pts = t.poly.map((p) => p.join(',')).join(' ');
    const isTarget = moveTargets.has(t.id);
    const [cx, cy] = t.center;
    out += `<g class="terr ${isTarget ? 'target' : ''} ${city && city.owner === ME ? 'mycity' : ''}" data-act="terr" data-v="${t.id}">
      <polygon points="${pts}" class="hit"/>
      ${isTarget ? `<polygon points="${pts}" class="pulse"/>` : ''}
      <text x="${lx(cx, t.name, 13)}" y="${cy + (city ? 58 : 6)}" class="tname">${esc(t.name)}</text>
      ${city ? `<text x="${lx(cx, `${city.name} · ${city.pop}`, 12)}" y="${cy + 84}" class="ctext" style="--pc:${s.players[city.owner].color}">${esc(city.name)} · ${city.pop}</text>` : ''}
    </g>`;
  }
  // treasure chests
  for (const t of s.treasure ?? []) {
    const url = spriteURL('chest', chestSprite, 3);
    const [cx, cy] = s.map[t].center;
    if (url) out += `<g class="chest" data-act="terr" data-v="${t}"><title>Treasure! Walk an army here to open it.</title><image href="${url}" x="${cx - 60}" y="${cy - 40}" width="42" height="36" class="px"/></g>`;
  }
  // armies: a little figure and a count, like a map marker. Yours can be dragged to a next-door territory.
  for (const t of s.map) {
    const owners = [...new Set(s.units.filter((u) => u.at === t.id).map((u) => u.owner))];
    owners.forEach((o, i) => {
      const us = s.units.filter((u) => u.at === t.id && u.owner === o);
      const fighters = us.filter((u) => u.kind !== 'settler');
      const lead = (fighters.length ? fighters : us).reduce((acc, u) => { acc[u.kind] = (acc[u.kind] ?? 0) + 1; return acc; }, {} as Record<string, number>);
      const kind = Object.keys(lead).sort((a, b) => lead[b] - lead[a])[0];
      const x = t.center[0] + (owners.length > 1 ? (i === 0 ? -58 : 58) : 38), y = t.center[1] - (cityAt(s, t.id) ? 32 : 42);
      const url = unitURL(kind, o, 2);
      const sp = unitSprite(kind, 0).buf, sw = sp.w / sp.k * 4, sh = sp.h / sp.k * 4;
      const drag = o === ME && us.some((u) => !u.fresh);
      out += `<g class="army ${drag ? 'drag' : ''}" data-act="terr" data-v="${t.id}" data-owner="${o}"><title>${esc(stackLabel(us))}${drag ? ' (drag to move)' : ''}</title>
        <ellipse cx="${x}" cy="${y + 2}" rx="${sw / 2 + 4}" ry="9" class="ashadow" style="--pc:${s.players[o].color}"/>
        ${url ? `<image href="${url}" x="${x - sw / 2}" y="${y + 4 - sh}" width="${sw}" height="${sh}" class="px"/>` : ''}
        <text x="${x + sw / 2 + 12}" y="${y + 2}" class="acount" style="--pc:${s.players[o].color}">${us.length}</text></g>`;
    });
  }
  // move orders
  const groups = new Map<string, Unit[]>();
  for (const u of s.units) if (u.moveTo !== null && u.owner === ME) {
    const k = `${u.at}>${u.moveTo}`; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(u);
  }
  for (const [k, us] of groups) {
    const [a, b] = k.split('>').map(Number);
    const [x1, y1] = s.map[a].center, [x2, y2] = s.map[b].center;
    const mx = (x1 + x2) / 2 - (y2 - y1) * 0.15, my = (y1 + y2) / 2 + (x2 - x1) * 0.15;
    const hostile = hostileAt(s, ME, b);
    const col = hostile ? '#ff5a4a' : '#ffe27a';
    out += `<path d="M${x1},${y1 - 24} Q${mx},${my} ${x2},${y2 - 24}" stroke="${col}" stroke-width="9" fill="none" marker-end="url(#arrow)" class="order"/>
      <text x="${mx}" y="${my}" class="otext" fill="${col}">${hostile ? 'ATTACK ' : ''}${us.length}</text>`;
  }
  out += `<g id="drag-fx"></g></svg></div>`;
  return out;
}

// ---------------------------------------------------------------- city view

const TW = TILE_HW * 2 * CITY_SCALE, TH = TILE_HH * 2 * CITY_SCALE;
function tilePos(i: number) {
  const [x, y] = tileArt(i);
  return [x * CITY_SCALE, y * CITY_SCALE];
}

function renderCity(c: City, opts: { battle?: boolean } = {}) {
  const s = g();
  const owner = s.players[c.owner];
  const terr = TERRAIN[s.map[c.territory].terrain];
  const mine = c.owner === ME && !opts.battle;
  artJob = { kind: 'city', cityId: c.id, sel: mine ? ui.tile : null };
  let out = '';
  const placeOut: Record<number, number> = {};
  let bestPlace = -1;
  if (ui.placing && mine) {
    const d = BUILDINGS[ui.placing];
    for (const t of freeTiles(c)) placeOut[t] = d.produces ? outputOf(s, c, ui.placing, 1, t, slotsOf({ kind: ui.placing, level: 1 } as Building)) : 0;
    bestPlace = Math.max(...Object.values(placeOut), 0);
    if (bestPlace <= Math.min(...Object.values(placeOut))) bestPlace = -1;
  }
  for (let i = 0; i < GRID * GRID; i++) {
    const [x, y] = tilePos(i);
    out += `<g class="tile" data-act="tile" data-v="${i}">${diamond(x, y, TW / 2 - 2, TH / 2 - 1, 'class="hit"')}</g>`;
  }
  // workers walking around their buildings
  const ws = workerSprite(hex(owner.color)).buf, ww = ws.w / ws.k * 2.8, wh = ws.h / ws.k * 2.8;
  const wurl = spriteURL(`w-${owner.color}`, () => workerSprite(hex(owner.color)).buf, 1);
  for (const b of c.buildings) {
    const [x, y] = tilePos(b.tile);
    for (let w = 0; w < b.workers; w++) {
      const wx = x - 52 + w * 14, wy = y + 14 + (w % 2) * 6 - w * 3;
      if (wurl) out += `<image href="${wurl}" x="${wx}" y="${wy - wh + 2}" width="${ww}" height="${wh}" class="px worker" style="animation-delay:${(w * 0.37 + b.tile * 0.11) % 1.5}s" data-act="tile" data-v="${b.tile}"/>`;
    }
  }
  for (const k of c.builds) {
    const [x, y] = tilePos(k.tile);
    out += `<text x="${x}" y="${y + 10}" class="scaf" data-act="tile" data-v="${k.tile}">🔨 ${k.turnsLeft} turn${k.turnsLeft > 1 ? 's' : ''}</text>`;
  }
  // placement previews
  if (ui.placing && mine) {
    const res = BUILDINGS[ui.placing].produces;
    for (const t of freeTiles(c)) {
      const [x, y] = tilePos(t);
      const v = placeOut[t];
      const best = res && v === bestPlace && v > 0;
      out += `<g class="preview ${best ? 'best' : ''}" data-act="tile" data-v="${t}">
        ${diamond(x, y, TW / 2 - 8, TH / 2 - 4, `fill="${best ? 'rgba(255,226,122,.35)' : 'rgba(255,255,255,.14)'}" stroke="${best ? '#ffe27a' : '#fff'}" stroke-width="3" stroke-dasharray="8 6"`)}
        <text x="${x}" y="${y + 8}" class="pv">${res ? `+${v}` : 'here'}</text></g>`;
    }
  }
  out += `<text x="24" y="44" class="cname">${esc(c.name)}</text>
    <text x="24" y="70" class="csub">${terr.name} · ${c.pop} people · ${RACES[owner.race].name}</text>`;
  return `<div class="artbox"><canvas id="art-canvas" class="art" width="${ART_CITY_W * CITY_K}" height="${ART_CITY_H * CITY_K}"></canvas>
    <svg class="cityview overlay" viewBox="0 0 ${ART_CITY_W * CITY_SCALE} ${ART_CITY_H * CITY_SCALE}" role="img" aria-label="City of ${esc(c.name)}">${out}</svg></div>`;
}

// ---------------------------------------------------------------- side panel

function panelMap() {
  const s = g();
  if (ui.move) return panelMove();
  if (ui.sel === null) {
    return `<h2>Your world</h2>
      <p>Tap a territory to see it. Double-click your city to build. Drag an army to a next-door territory to move it.</p>
      ${myCitiesList()}
      <div class="tip">💡 Settle empty land with a <b>Settler</b> from a city with 3 or more people.</div>`;
  }
  const t = s.map[ui.sel];
  const city = cityAt(s, t.id);
  const mineHere = s.units.filter((u) => u.at === t.id && u.owner === ME);
  const foes = s.units.filter((u) => u.at === t.id && u.owner !== ME);
  let h = `<h2>${esc(t.name)}</h2><div class="row"><span class="chip">${TERRAIN[t.terrain].deco} ${TERRAIN[t.terrain].name}</span><span class="chip">bonus tiles: ${RES_INFO[TERRAIN[t.terrain].bonus].icon} ${RES_INFO[TERRAIN[t.terrain].bonus].name}</span></div>`;
  if (city) {
    const o = s.players[city.owner];
    h += `<div class="card" style="--pc:${o.color}"><div class="ct">${RACES[o.race].icon} <b>${esc(city.name)}</b> <span class="dim">${city.owner === ME ? 'your city' : esc(o.name)}</span></div>
      <div>👥 ${city.pop}/${housingCap(s, city)} people · ${city.buildings.length} buildings</div>
      ${city.owner === ME ? `<div class="row">${outChips(cityOutput(s, city))}</div>` : ''}
      <button class="btn" data-act="open-city" data-v="${city.id}">${city.owner === ME ? '🏗️ Open city' : '👀 Look at city'}</button>${city.owner === ME ? '<div class="dim">Tip: double-click a city on the map to open it.</div>' : ''}</div>`;
  } else h += `<p class="dim">Empty land. A Settler can start a city here.</p>`;
  if (foes.length) h += `<div class="card danger"><b>Enemy army:</b> ${stackHTML(foes, foes[0].owner)}</div>`;
  if (mineHere.length) {
    const ready = mineHere.filter((u) => !u.fresh);
    h += `<div class="card"><b>Your units here:</b> ${stackHTML(mineHere)}
      ${mineHere.some((u) => u.fresh) ? `<div class="dim">New units can move next turn.</div>` : ''}
      ${mineHere.some((u) => u.moveTo !== null) ? `<div class="dim">Some have orders. </div><button class="btn small ghost" data-act="cancel-orders" data-v="${t.id}">Cancel orders</button>` : ''}
      ${ready.length ? `<div class="dim">Drag the army on the map to a glowing neighbor, or use the button.</div>
      <div class="row"><button class="btn" data-act="move-start" data-v="${t.id}">➡️ Move units</button>${ready.some((u) => u.moveTo === null && !ui.stay.has(u.id)) ? `<button class="btn ghost" data-act="guard" data-v="${t.id}" title="Stay here. Next won't ask about them again.">🛡️ Guard</button>` : ''}</div>` : ''}</div>`;
  }
  if (city && city.owner === ME) h += trainBlock(city);
  return h;
}

function myCitiesList() {
  const s = g();
  return `<div class="list">${s.cities.filter((c) => c.owner === ME).map((c) => {
    const free = freeBuilders(c);
    return `<button class="li" data-act="open-city" data-v="${c.id}">
    <span>${RACES[me().race].icon} <b>${esc(c.name)}</b></span><span class="dim">👥 ${c.pop}/${housingCap(s, c)} · 🔨 ${c.builds.length}/${buildSlots(c)}${free ? ` <span class="warn">${free} free</span>` : ''}${idlePeople(c) > 0 ? ' · 💤' + idlePeople(c) : ''}</span></button>`;
  }).join('')}</div>`;
}

/** Small clickable map for hopping between cities without leaving the city view. */
function miniMap(current: City | null) {
  const s = g();
  const scale = 0.2;
  let out = '';
  for (const t of s.map) {
    const city = cityAt(s, t.id);
    const pts = t.poly.map(([x, y]) => `${(x * scale).toFixed(1)},${(y * scale).toFixed(1)}`).join(' ');
    const own = city ? s.players[city.owner].color : 'transparent';
    out += `<polygon points="${pts}" class="mm-t ${TERRAIN[t.terrain] ? t.terrain : ''}" />`;
    if (city) {
      const [cx, cy] = [t.center[0] * scale, t.center[1] * scale];
      const isCur = current && current.id === city.id;
      out += `<g class="mm-c ${isCur ? 'cur' : ''} ${city.owner === ME ? 'mine' : ''}" data-act="open-city" data-v="${city.id}"><title>${esc(city.name)}</title>
        <rect x="${cx - 9}" y="${cy - 9}" width="18" height="18" fill="${own}"/>${isCur ? `<rect x="${cx - 13}" y="${cy - 13}" width="26" height="26" class="mm-ring"/>` : ''}</g>`;
    }
  }
  const mine = s.cities.filter((c) => c.owner === ME);
  const i = current ? mine.findIndex((c) => c.id === current.id) : -1;
  const prev = mine.length > 1 && i >= 0 ? mine[(i - 1 + mine.length) % mine.length] : null;
  const next = mine.length > 1 && i >= 0 ? mine[(i + 1) % mine.length] : null;
  return `<div class="minimap"><svg viewBox="0 0 ${MAP_W * scale} ${MAP_H * scale}" aria-label="Mini map">${out}</svg>
    <div class="row between">${prev ? `<button class="btn small ghost" data-act="open-city" data-v="${prev.id}">◀ ${esc(prev.name)}</button>` : '<span></span>'}
    <button class="btn small ghost" data-act="back-map">🗺️ Map</button>
    ${next ? `<button class="btn small ghost" data-act="open-city" data-v="${next.id}">${esc(next.name)} ▶</button>` : '<span></span>'}</div></div>`;
}

function panelMove() {
  const s = g();
  const m = ui.move!;
  const here = s.units.filter((u) => u.at === m.from && u.owner === ME && !u.fresh);
  const kinds = [...new Set(here.map((u) => u.kind))];
  let h = `<h2>Move from ${esc(s.map[m.from].name)}</h2><p>Pick how many to send, then tap a glowing territory.</p>`;
  for (const k of kinds) {
    const max = here.filter((u) => u.kind === k).length;
    const n = Math.min(max, m.counts[k] ?? max);
    h += `<div class="stepper"><span>${uicon(k)} ${UNITS[k].name}</span>
      <button class="btn small ghost" data-act="move-adj" data-v="${k}" data-d="-1" aria-label="fewer">−</button><b>${n}/${max}</b>
      <button class="btn small ghost" data-act="move-adj" data-v="${k}" data-d="1" aria-label="more">+</button></div>`;
  }
  if (m.target !== null) {
    const chosen = pickMoving();
    const odds = forecast(s, chosen, m.target);
    const col = odds >= 70 ? 'good' : odds >= 40 ? 'warn' : 'bad';
    h += `<div class="card danger"><b>⚔️ Attack ${esc(s.map[m.target].name)}?</b>
      <div class="odds"><div class="bar"><i class="${col}" style="width:${odds}%"></i></div><span>You win about <b>${odds}%</b> of the time</span></div>
      ${defenseSummary(m.target)}
      <button class="btn end" data-act="attack-confirm">⚔️ Attack!</button></div>`;
  }
  h += `<button class="btn ghost" data-act="move-cancel">Cancel</button>`;
  return h;
}
function defenseSummary(t: number) {
  const s = g();
  const city = cityAt(s, t);
  const foes = s.units.filter((u) => u.at === t && u.owner !== ME && u.kind !== 'settler');
  const bits: string[] = [];
  if (foes.length) bits.push(`Army: ${stackHTML(foes, foes[0].owner)}`);
  if (city && city.owner !== ME) {
    const towers = city.buildings.filter((b) => b.kind === 'tower').length;
    const lvl = city.buildings.find((b) => b.kind === 'center')!.level;
    bits.push(`City: ${BUILDINGS.center.icon} walls, ${MILITIA.icon}×${lvl + 1} militia${towers ? `, ${BUILDINGS.tower.icon}×${towers} towers` : ''}`);
  }
  return `<div class="dim">${bits.join('<br>')}</div>`;
}
function pickMoving(): Unit[] {
  const s = g(); const m = ui.move!;
  const here = s.units.filter((u) => u.at === m.from && u.owner === ME && !u.fresh);
  const out: Unit[] = [];
  for (const k of new Set(here.map((u) => u.kind))) {
    const list = here.filter((u) => u.kind === k);
    out.push(...list.slice(0, Math.min(list.length, m.counts[k] ?? list.length)));
  }
  return out;
}

function trainBlock(c: City) {
  const s = g();
  const kinds: UKind[] = ['soldier', 'walker', 'artillery', 'settler'];
  const fresh = s.units.filter((u) => u.at === c.territory && u.owner === ME && u.fresh);
  return `<div class="card"><b>Train</b> <span class="dim">army ${armyCount(s, ME)}/${armyCap(s, ME)}</span>
    <div class="grid2">${kinds.map((k) => {
      const why = whyCantTrain(s, c, k);
      const known = hasTech(me(), UNITS[k].tech);
      return `<button class="opt ${why ? 'off' : ''}" data-act="train" data-v="${k}" data-c="${c.id}" ${why ? `title="${esc(why)}"` : ''}>
        <span class="oi">${known ? uicon(k) : '🔒'}</span><span class="on">${UNITS[k].name}</span>
        <span class="oc">${costChips(unitCost(s, ME, k), true)}${k === 'settler' ? '<span class="chip">👥2</span>' : ''}</span>
        ${why ? `<span class="why">${esc(why)}</span>` : ''}</button>`;
    }).join('')}</div>
    ${fresh.length ? `<div class="row">Training: ${fresh.map((u) => `<button class="chip undo" data-act="untrain" data-v="${u.id}" title="Undo and get resources back">${uicon(u.kind)} ✕</button>`).join('')}</div>` : ''}</div>`;
}

function panelCity(c: City) {
  const s = g();
  if (c.owner !== ME) {
    return `${miniMap(c)}<h2>${esc(c.name)}</h2><p class="dim">An enemy city. ${defenseSummary(c.territory)}</p>`;
  }
  const cap = housingCap(s, c);
  const idle = idlePeople(c);
  const free = freeBuilders(c);
  let h = `${miniMap(c)}<h2>${esc(c.name)}</h2>
    <div>👥 <b>${c.pop}/${cap}</b> people ${c.pop >= cap ? '<span class="warn">· full, build homes</span>' : `<span class="dim">· next person costs ${RES_INFO.food.icon}${growCostFor(s, ME, c.pop)}</span>`}</div>
    ${idle > 0 ? `<div class="warn">💤 ${idle} ${idle === 1 ? 'person has' : 'people have'} no job. Build a farm, camp, mine, windmill or school.</div>` : ''}
    <div class="row">${outChips(cityOutput(s, c))}</div>`;
  h += `<div class="card"><div class="ct"><b>🔨 Builders ${c.builds.length}/${buildSlots(c)}</b> ${free ? `<span class="warn">${free} free</span>` : '<span class="dim">all busy</span>'}</div>
    ${c.builds.map((k) => `<div class="buildrow"><button class="li" data-act="tile" data-v="${k.tile}">${bicon(k.kind, k.level)} ${k.level > 1 ? '⬆️ ' : ''}${BUILDINGS[k.kind].names[k.level - 1]} <span class="dim">${k.turnsLeft} turn${k.turnsLeft > 1 ? 's' : ''}</span></button>
      <button class="btn small ghost" data-act="cancel-cons" data-v="${k.tile}" title="Cancel and get everything back">✕</button></div>`).join('')}
    ${buildSlots(c) < 4 ? `<div class="dim">Upgrade the ${BUILDINGS.center.names[0]} for another builder.</div>` : ''}</div>`;
  const b = ui.tile !== null ? c.buildings.find((x) => x.tile === ui.tile) : undefined;
  const site = ui.tile !== null && !b ? buildAt(c, ui.tile) : null;
  if (ui.placing) {
    const d = BUILDINGS[ui.placing];
    h += `<div class="card hl"><b>${d.icon} Place a ${d.names[0]}</b><p>Tap a spot. ${d.produces && d.produces !== 'science' ? `Glowing spots make the most ${RES_INFO[d.produces].name.toLowerCase()}.` : ''}</p>
      <button class="btn small ghost" data-act="place-cancel">Cancel</button></div>`;
  } else if (b) h += buildingCard(c, b);
  else if (site) h += `<div class="card"><div class="ct">${bicon(site.kind, 1)} <b>${BUILDINGS[site.kind].names[0]}</b> <span class="dim">being built, ${site.turnsLeft} turn${site.turnsLeft > 1 ? 's' : ''} left</span></div>
      <div class="row"><button class="btn small ghost" data-act="cancel-cons" data-v="${site.tile}">Cancel (get it back)</button><button class="btn small ghost" data-act="tile-clear">Done</button></div></div>`;
  else h += buildMenu(c);
  h += trainBlock(c);
  return h;
}

function buildingCard(c: City, b: Building) {
  const s = g();
  const d = BUILDINGS[b.kind];
  let h = `<div class="card"><div class="ct">${bicon(b.kind, b.level, c.owner)} <b>${d.names[b.level - 1]}</b> <span class="gold">${stars(b.level)}</span></div><p class="dim">${d.blurb}</p>`;
  if (d.produces) h += `<div>Workers ${b.workers}/${slotsOf(b)} · makes <b>${outputOf(s, c, b.kind, b.level, b.tile, b.workers)}</b> ${ricon(d.produces)}${tileBonusStars(c, b.tile, d.produces) && d.produces !== 'science' ? ` <span class="gold">(bonus tile ${stars(tileBonusStars(c, b.tile, d.produces))})</span>` : ''}</div>`;
  if (d.flat) h += `<div class="row">${outChips(d.flat[b.level - 1])}</div>`;
  if (d.housing) h += `<div>🏠 Homes for ${d.housing[b.level - 1]}</div>`;
  if (b.kind === 'center') h += `<div>🔨 ${buildSlots(c)} builders: build or upgrade ${buildSlots(c)} things at once</div>`;
  if (d.armyCap) h += `<div>⚔️ Army room +${d.armyCap[b.level - 1]}</div>`;
  if (d.tower) h += `<div>🎯 Shoots for ${d.tower.atk[b.level - 1]}, ${d.tower.hp[b.level - 1]} health</div>`;
  const up = buildAt(c, b.tile);
  if (up) {
    h += `<div class="up"><div>⬆️ Upgrading to <b>${d.names[up.level - 1]}</b> <span class="gold">${stars(up.level)}</span> · ${up.turnsLeft} turn${up.turnsLeft > 1 ? 's' : ''} left</div>
      <button class="btn small ghost" data-act="cancel-cons" data-v="${b.tile}">Cancel (get it back)</button></div>`;
  } else if (b.level < 3) {
    const why = whyCantUpgrade(s, c, b);
    const nl = b.level + 1;
    let gain = '';
    if (d.produces) gain = `${outputOf(s, c, b.kind, nl, b.tile, d.workers![nl - 1])} ${ricon(d.produces)} with ${d.workers![nl - 1]} workers`;
    else if (b.kind === 'center') gain = `homes for ${d.housing![nl - 1]}, one more builder`;
    else if (b.kind === 'magic') gain = `homes for ${d.housing![nl - 1]}, ${outChips(d.flat![nl - 1])}, magic zap ${d.tower!.atk[nl - 1]}`;
    else if (d.housing) gain = `homes for ${d.housing[nl - 1]}`;
    else if (d.armyCap) gain = `army room +${d.armyCap[nl - 1]}`;
    else if (d.tower) gain = `shoots for ${d.tower.atk[nl - 1]}`;
    h += `<div class="up"><div>Next: <b>${d.names[nl - 1]}</b> <span class="gold">${stars(nl)}</span> · ${gain} · ${buildTurns(s, ME, b.kind, nl)} turns</div>
      <div class="row">${costChips(d.cost[nl - 1])}</div>
      <button class="btn" data-act="upgrade" ${why ? 'disabled' : ''}>⬆️ Upgrade</button>${why ? `<div class="why">${esc(why)}</div>` : ''}</div>`;
  } else h += `<div class="gold">Top level!</div>`;
  h += `<button class="btn small ghost" data-act="tile-clear">Done</button></div>`;
  return h;
}

function buildMenu(c: City) {
  const s = g();
  const kinds = BUILD_ORDER.filter((k) => BUILDINGS[k].buildable);
  const full = !freeTiles(c).length;
  return `<div class="card"><b>Build</b> <span class="dim">${full ? 'no empty spots: upgrade instead' : `${freeTiles(c).length} empty spots`}</span>
    <div class="grid2">${kinds.map((k) => {
      const d = BUILDINGS[k];
      const why = whyCantBuild(s, c, k, ui.tile !== null && freeTiles(c).includes(ui.tile) ? ui.tile : undefined);
      let best = '';
      if (d.produces && freeTiles(c).length) {
        const v = Math.max(...freeTiles(c).map((t) => outputOf(s, c, k, 1, t, d.workers![0])));
        best = `best +${v} ${ricon(d.produces)}`;
      } else if (d.housing) best = `🏠 +${d.housing[0]}`; else if (d.armyCap) best = `⚔️ +${d.armyCap[0]}`; else if (d.tower) best = `🎯 ${d.tower.atk[0]}`;
      return `<button class="opt ${why ? 'off' : ''}" data-act="place" data-v="${k}" ${why ? `title="${esc(why)}"` : ''}>
        <span class="oi">${bicon(k, 1)}</span><span class="on">${d.names[0]}</span><span class="ob">${best}</span>
        <span class="oc">${costChips(d.cost[0], true)}</span>${why && why !== 'Not enough resources.' ? `<span class="why">${esc(why)}</span>` : ''}</button>`;
    }).join('')}</div></div>`;
}

// ---------------------------------------------------------------- battle playback

function fighterPos(f: Fighter, idx: number, _sideCount: number, city: City | null): [number, number] {
  if (f.kind === 'tower' && city) {
    const tile = f.id.startsWith('t') ? Number(f.id.split('_')[1]) : CENTER_TILE;
    const [x, y] = tilePos(tile);
    return [x, y - 40];
  }
  if (f.side === 0) {
    // attackers come in from the lower left
    const col = Math.floor(idx / 4), row = idx % 4;
    return [130 + col * 46 + row * 22, 320 + row * 34 - col * 10];
  }
  const [cx, cy] = tilePos(CENTER_TILE + 5);
  const col = Math.floor(idx / 4), row = idx % 4;
  return [cx - 40 + col * 52 - row * 24, cy - 20 + row * 30 + col * 6];
}

/** A little badge over a fighter showing what it beats (double damage), so the counter wheel is visible in every fight. */
function counterBadge(kind: CombatKindT, y: number) {
  if (kind === 'militia' || kind === 'tower') return '';
  const beats = UNITS[kind].beats.filter((b) => b !== 'militia');
  if (!beats.length) return '';
  const icons = beats.map((b, i) => {
    const url = b === 'tower' ? spriteURL('mini-tower', () => cropBuf(buildingSprite('tower', 1, 0x9aa0a8, 0x5a6068).buf), 1) : spriteURL(`u-${b}-grey`, () => unitSprite(b, 0xb8bcc4).buf, 2);
    return url ? `<image href="${url}" x="${4 + i * 17}" y="${y - 17}" width="16" height="16" class="px"/>` : '';
  }).join('');
  const wd = 22 + beats.length * 17;
  return `<g class="beats"><rect x="-18" y="${y - 19}" width="${wd}" height="20" rx="3" fill="#14100c" stroke="#ff8a5c" stroke-width="1.5"/><text x="-12" y="${y - 4}" class="bx">×2</text>${icons}</g>`;
}
type CombatKindT = Fighter['kind'];

function renderBattleStage(ev: Extract<TurnEvent, { kind: 'battle' }>) {
  const s = g();
  const city = ev.cityId !== null ? cityById(s, ev.cityId) : null;
  artJob = city ? { kind: 'city', cityId: city.id, sel: null, owner: ev.defender } : { kind: 'field', territory: ev.territory };
  const counts = [0, 0];
  let tokens = '';
  for (const f of ev.result.fighters) {
    const idx = f.kind === 'tower' ? 0 : counts[f.side]++;
    const [x, y] = fighterPos(f, idx, 0, city);
    const owner = f.side === 0 ? ev.attacker : ev.defender;
    const col = s.players[owner].color;
    const sp = f.kind === 'tower' ? null : unitSprite(f.kind, 0).buf;
    const url = f.kind === 'tower' ? '' : spriteURL(`u-${f.kind}-${col}${f.side === 1 ? '-flip' : ''}`, () => {
      const src = unitSprite(f.kind, hex(col));
      if (f.side === 0) return src.buf;
      const fl = new PixBuf(src.buf.w, src.buf.h, src.buf.k);
      fl.blit({ buf: src.buf, ax: 0, ay: 0 }, 0, 0, true);
      return fl;
    }, 2);
    const w = sp ? sp.w / sp.k * 3 : 0, h = sp ? sp.h / sp.k * 3 : 0;
    const top = (f.kind === 'tower' ? 0 : 16 - h) - 10;
    const n = counts[f.side];
    tokens += `<g class="ftr side${f.side}" id="f-${f.id}" data-x="${x}" data-y="${y}" transform="translate(${x},${y})">
      ${f.kind === 'tower' ? '' : `<ellipse cx="0" cy="14" rx="18" ry="7" fill="${col}" opacity=".55"/>`}
      <g class="body" style="animation-delay:${-(n * 137) % 600}ms">${url ? `<image href="${url}" x="${-w / 2}" y="${16 - h}" width="${w}" height="${h}" class="px"/>` : ''}</g>
      <rect x="-18" y="${top}" width="36" height="6" fill="#14100c"/><rect class="hp" x="-17" y="${top + 1}" width="34" height="4" fill="#6fdc8c"/>
      ${counterBadge(f.kind, top - 4)}
      ${f.vet ? `<text y="32" class="vet">${'▲'.repeat(f.vet)}</text>` : ''}</g>`;
  }
  return `<div class="artbox"><canvas id="art-canvas" class="art" width="${ART_CITY_W * CITY_K}" height="${ART_CITY_H * CITY_K}"></canvas>
    <svg class="cityview overlay battle" id="battle-svg" viewBox="0 0 ${ART_CITY_W * CITY_SCALE} ${ART_CITY_H * CITY_SCALE}"><g id="fx-under"></g>${tokens}<g id="fx"></g>
    <text x="380" y="474" class="bcap" id="bcap"></text></svg></div>`;
}

function panelBattle() {
  const p = ui.play!;
  const s = g();
  const a = s.players[p.ev.attacker], d = s.players[p.ev.defender];
  const city = p.ev.cityId !== null ? cityById(s, p.ev.cityId) : null;
  const youAttack = p.ev.attacker === ME;
  let h = `<h2>⚔️ Battle at ${esc(s.map[p.ev.territory].name)}</h2>
    <div class="vs"><span style="--pc:${a.color}" class="side">${RACES[a.race].icon} ${youAttack ? 'You' : RACES[a.race].name}<small>attacking</small></span>
    <span class="vsx">vs</span><span style="--pc:${d.color}" class="side">${RACES[d.race].icon} ${youAttack ? RACES[d.race].name : 'You'}<small>defending</small></span></div>
    <div class="tip">Counters do double damage: 🪖 beats 🎯, 🎯 beats 🤖 and towers, 🤖 beats 🪖 and militia.</div>`;
  if (p.done) {
    const won = (p.ev.result.winner === 0) === youAttack;
    const txt = p.ev.captured ? (youAttack ? `You captured ${esc(city?.name ?? 'the city')}! 🎉` : `${esc(city?.name ?? 'Your city')} was captured.`)
      : p.ev.result.winner === 0 ? (youAttack ? 'You won the battle!' : 'Your army here was beaten.')
      : (youAttack ? 'The attack failed. Your survivors marched home.' : 'You held them off! 🛡️');
    h += `<div class="card ${won ? 'win' : 'danger'}"><b>${txt}</b></div><button class="btn end" data-act="battle-next">Continue ▶</button>`;
  } else {
    h += `<div class="row"><button class="btn ghost" data-act="battle-speed">${p.speed > 1 ? '🐢 Normal speed' : '⏩ Faster'}</button><button class="btn ghost" data-act="battle-skip">⏭️ Skip</button></div>`;
  }
  return h;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

async function playBattle() {
  const p = ui.play!;
  const token = p.token;
  const svg = document.getElementById('battle-svg');
  if (!svg) return;
  const alive = () => ui.play && ui.play.token === token && !ui.play.done;
  const hp: Record<string, number> = {};
  const max: Record<string, number> = {};
  for (const f of p.ev.result.fighters) { hp[f.id] = f.hp; max[f.id] = f.maxHp; }
  const say = (t: string) => { const cap = document.getElementById('bcap'); if (cap) cap.textContent = t; };
  const wait = (ms: number) => sleep(reduceMotion() ? 0 : ms / (ui.play?.speed ?? 1));
  // march in
  for (const f of p.ev.result.fighters) if (f.side === 0) {
    const el = document.getElementById(`f-${f.id}`);
    if (!el) continue;
    el.setAttribute('transform', `translate(${Number(el.dataset.x) - 120},${Number(el.dataset.y) + 60})`);
  }
  await wait(50);
  if (!alive()) return;
  for (const f of p.ev.result.fighters) if (f.side === 0) {
    const el = document.getElementById(`f-${f.id}`) as unknown as SVGGElement | null;
    if (!el) continue;
    el.classList.add('walking');
    el.style.transition = `transform ${reduceMotion() ? 0 : 900 / p.speed}ms linear`;
    el.setAttribute('transform', `translate(${el.dataset.x},${el.dataset.y})`);
  }
  say('Charge!'); sfx.march();
  await wait(450); sfx.march();
  await wait(500);
  document.querySelectorAll('#battle-svg .walking').forEach((e) => e.classList.remove('walking'));
  if (!alive()) return;
  say('The badges show who each unit beats for ×2 damage');
  await wait(1500);
  svg.classList.add('quiet');
  if (!alive()) return;
  const sway = p.ev.result.sway;
  if (sway && alive()) {
    // the swayed unit was already listed on its new side; show the moment
    const el = document.getElementById(`f-${sway.id}`);
    if (el) el.classList.add('swayed');
    say('🔮 Mind Sway! An enemy unit switches sides!'); sfx.sway();
    await wait(1400);
  }
  let r = 0;
  for (const round of p.ev.result.rounds) {
    if (!alive()) return;
    r++;
    say(`Round ${r}`);
    const fx = document.getElementById('fx');
    if (!fx) return;
    const shots = round.filter((sh) => hp[sh.from] > 0);
    const step = Math.max(40, 420 / Math.max(1, shots.length));
    for (const sh of shots) {
      if (!alive()) return;
      if (hp[sh.from] <= 0) continue;
      const a = document.getElementById(`f-${sh.from}`), b = document.getElementById(`f-${sh.to}`);
      if (!a || !b) return;
      const x1 = Number(a.dataset.x), y1 = Number(a.dataset.y), x2 = Number(b.dataset.x), y2 = Number(b.dataset.y);
      const shooter = p.ev.result.fighters.find((f) => f.id === sh.from);
      lunge(a, x2 - x1, y2 - y1);
      const bolt = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const arc = shooter?.kind === 'artillery' || shooter?.kind === 'tower';
      const mx = (x1 + x2) / 2, my = Math.min(y1, y2) - (arc ? 90 : 0) - 20;
      bolt.setAttribute('d', arc ? `M${x1},${y1 - 20} Q${mx},${my} ${x2},${y2 - 20}` : `M${x1},${y1 - 20} L${x2},${y2 - 20}`);
      bolt.setAttribute('class', `bolt ${sh.counter ? 'counter' : ''} ${arc ? 'shell' : ''}`); bolt.setAttribute('fill', 'none');
      fx.appendChild(bolt);
      sfx.shoot();
      b.classList.add('hit');
      setTimeout(() => b.classList.remove('hit'), 220);
      if (sh.counter) { sfx.crit(); a.querySelector('.beats')?.classList.add('flash'); setTimeout(() => a.querySelector('.beats')?.classList.remove('flash'), 500); }
      else sfx.hit();
      hp[sh.to] = Math.max(0, hp[sh.to] - sh.dmg);
      const bar = b.querySelector('.hp') as SVGRectElement | null;
      if (bar) { bar.setAttribute('width', String(34 * hp[sh.to] / max[sh.to])); bar.setAttribute('fill', hp[sh.to] / max[sh.to] < 0.35 ? '#ff6b6b' : '#6fdc8c'); }
      const num = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      num.setAttribute('x', String(x2 + 12)); num.setAttribute('y', String(y2 - 30)); num.setAttribute('class', `dmg ${sh.counter ? 'counter' : ''}`);
      num.textContent = `-${sh.dmg}${sh.counter ? ' ×2' : ''}`;
      fx.appendChild(num);
      setTimeout(() => { bolt.remove(); num.remove(); }, 650 / (ui.play?.speed ?? 1));
      if (sh.kill) { b.classList.add('dead'); explode(fx, x2, y2); sfx.boom(); shake(); }
      await wait(step);
    }
    await wait(250);
  }
  if (!alive()) return;
  finishBattle();
}
function finishBattle() {
  if (!ui.play) return;
  ui.play.done = true;
  // show final state
  const svg = document.getElementById('battle-svg');
  if (svg) for (const f of ui.play.ev.result.fighters) {
    const el = document.getElementById(`f-${f.id}`);
    if (!el) continue;
    if (!(f.id in ui.play.ev.result.survivors)) el.classList.add('dead');
    const bar = el.querySelector('.hp');
    const left = ui.play.ev.result.survivors[f.id];
    if (bar) bar.setAttribute('width', String(left ? 34 * left / f.maxHp : 0));
  }
  const cap = document.getElementById('bcap');
  if (cap) cap.textContent = ui.play.ev.result.winner === 0 ? 'Attackers win!' : 'Defenders hold!';
  // the winners cheer
  for (const f of ui.play.ev.result.fighters) if (f.id in ui.play.ev.result.survivors) document.getElementById(`f-${f.id}`)?.classList.add('cheer');
  const ev = ui.play.ev; const winner = ev.result.winner === 0 ? ev.attacker : ev.defender;
  if (winner === ME) { if (ev.captured) sfx.capture(); else sfx.win(); } else sfx.lose();
  renderPanelOnly();
}
/** The shooter hops a little toward its target. */
function lunge(el: Element, dx: number, dy: number) {
  const body = el.querySelector('.body') as SVGGElement | null;
  if (!body || reduceMotion() || typeof (body as any).animate !== 'function') return;
  const d = Math.hypot(dx, dy) || 1, k = 10 / d;
  body.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${dx * k}px,${dy * k - 4}px)` }, { transform: 'translate(0,0)' }], { duration: 220 / (ui.play?.speed ?? 1), easing: 'ease-out' });
}
/** A chunky pixel explosion: a flash, a ring and flying sparks. */
function explode(fx: Element, x: number, y: number) {
  const NS = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('class', 'boom'); g.setAttribute('transform', `translate(${x},${y - 14})`);
  let h = `<circle class="flash" r="26" fill="#fff6b0"/><circle class="ring" r="18" fill="none" stroke="#ff8a3c" stroke-width="6"/>`;
  const cols = ['#fff6b0', '#ffd84a', '#ff8a3c', '#ff4a2a', '#8a8a8a'];
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2 + Math.random() * 0.4, dist = 30 + Math.random() * 34, sz = 5 + Math.floor(Math.random() * 3) * 2;
    h += `<rect class="spark" x="${-sz / 2}" y="${-sz / 2}" width="${sz}" height="${sz}" fill="${cols[i % cols.length]}" style="--dx:${(Math.cos(ang) * dist).toFixed(0)}px;--dy:${(Math.sin(ang) * dist - 10).toFixed(0)}px"/>`;
  }
  g.innerHTML = h;
  fx.appendChild(g);
  setTimeout(() => g.remove(), 900);
}
function shake() {
  if (reduceMotion()) return;
  const st = document.getElementById('stage'); if (!st) return;
  st.classList.remove('shake'); void st.offsetWidth; st.classList.add('shake');
  setTimeout(() => st.classList.remove('shake'), 300);
}

// ---------------------------------------------------------------- next-thing nudges and empire overview

interface Nudge { key: string; icon: string; text: string; go: () => void }
/** Can this city start anything right now (a building or an upgrade)? */
function canStartSomething(c: City) {
  const s = g();
  if (!freeBuilders(c)) return false;
  return BUILD_ORDER.some((k) => BUILDINGS[k].buildable && !whyCantBuild(s, c, k)) || c.buildings.some((b) => b.level < 3 && !whyCantUpgrade(s, c, b));
}
function openCity(id: number) {
  const c = cityById(g(), id); if (!c) return;
  ui.view = 'city'; ui.cityId = id; ui.tile = null; ui.placing = null; ui.move = null; ui.sel = c.territory; ui.overlay = null;
}
function showTerritory(t: number) { ui.view = 'map'; ui.cityId = null; ui.tile = null; ui.placing = null; ui.move = null; ui.sel = t; ui.overlay = null; }
/** Things that could use the player this turn, in the order Next visits them. */
function nudges(): Nudge[] {
  if (!ui.g || g().winner !== null) return [];
  const s = g(), out: Nudge[] = [];
  if (!me().researching) out.push({ key: 'tech', icon: '🧪', text: 'Pick something to research.', go: () => { ui.overlay = 'tech'; } });
  for (const c of s.cities.filter((x) => x.owner === ME)) {
    const free = freeBuilders(c);
    if (free && canStartSomething(c)) out.push({ key: `city-${c.id}`, icon: '🔨', text: `${c.name} has ${free} free builder${free > 1 ? 's' : ''}. Build or upgrade something.`, go: () => openCity(c.id) });
  }
  for (const t of s.map) {
    const ready = readyAt(t.id).filter((u) => u.moveTo === null && !ui.stay.has(u.id));
    if (!ready.length) continue;
    const settlers = ready.filter((u) => u.kind === 'settler').length, fighters = ready.length - settlers;
    if (settlers) out.push({ key: `settle-${t.id}`, icon: '🚩', text: `A Settler in ${t.name} is waiting. Drag it to empty land next door.`, go: () => showTerritory(t.id) });
    const chest = (s.treasure ?? []).find((x) => t.neighbors.includes(x));
    if (fighters) out.push({ key: `army-${t.id}`, icon: chest !== undefined ? '🎁' : '⚔️', text: chest !== undefined ? `Treasure next door! Drag your army in ${t.name} onto the chest in ${s.map[chest].name}.` : `${fighters} unit${fighters > 1 ? 's' : ''} in ${t.name} ${fighters > 1 ? 'are' : 'is'} waiting for orders. Drag to move, or tap Guard.`, go: () => showTerritory(t.id) });
  }
  return out;
}
function goNext() {
  const list = nudges();
  if (!list.length) { ui.nudge = ''; ui.toast = 'Everything is busy. Press End turn when you are ready.'; return; }
  let n = list.find((x) => !ui.seen.has(x.key));
  if (!n) { ui.seen.clear(); n = list[0]; }
  ui.seen.add(n.key);
  n.go();
  ui.nudge = `${n.icon} ${n.text}`;
}

function overlayEmpire() {
  const s = g();
  const cities = s.cities.filter((c) => c.owner === ME);
  const rows = cities.map((c) => {
    const free = freeBuilders(c), idle = idlePeople(c);
    const builds = c.builds.map((k) => `<span class="chip">${bicon(k.kind, k.level)} ${k.level > 1 ? '⬆️' : ''}${BUILDINGS[k.kind].names[k.level - 1]} · ${k.turnsLeft}</span>`).join('');
    const training = s.units.filter((u) => u.at === c.territory && u.owner === ME && u.fresh).map((u) => uicon(u.kind)).join('');
    return `<tr><td><button class="li" data-act="open-city" data-v="${c.id}"><b>${esc(c.name)}</b></button></td>
      <td>👥 ${c.pop}/${housingCap(s, c)}${idle ? ` <span class="warn">💤${idle}</span>` : ''}</td>
      <td>${builds}${free ? `<span class="chip ${canStartSomething(c) ? 'hotchip' : ''}">🔨 ${free} free</span>` : ''}${training ? `<div>Training ${training}</div>` : ''}</td>
      <td><div class="row">${outChips(cityOutput(s, c))}</div></td></tr>`;
  }).join('');
  const armies: string[] = [];
  for (const t of s.map) {
    const us = s.units.filter((u) => u.at === t.id && u.owner === ME);
    if (!us.length) continue;
    const orders = [...new Set(us.filter((u) => u.moveTo !== null).map((u) => u.moveTo!))];
    const state = us.every((u) => u.fresh) ? '<span class="dim">new, moves next turn</span>'
      : orders.length ? orders.map((o) => `${hostileAt(s, ME, o) ? '⚔️ attacking' : '➡️ moving to'} ${esc(s.map[o].name)}`).join(', ')
      : us.every((u) => ui.stay.has(u.id) || u.fresh) ? '🛡️ guarding' : '<span class="warn">waiting for orders</span>';
    armies.push(`<tr><td><button class="li" data-act="show-terr" data-v="${t.id}"><b>${esc(t.name)}</b></button></td><td>${stackHTML(us)}</td><td>${state}</td></tr>`);
  }
  const p = me();
  const research = p.researching ? `${TECHS[p.researching].icon} ${TECHS[p.researching].name} <span class="dim">${p.progress}/${TECHS[p.researching].cost}</span>` : '<span class="warn">nothing, pick something!</span>';
  return `<div class="ov"><div class="sheet wide"><div class="row between"><h2>📋 Your empire</h2><button class="btn ghost" data-act="close">Close ✕</button></div>
    <p>Researching: ${research} <button class="btn small ghost" data-act="overlay" data-v="tech">Change</button></p>
    <h3>Cities</h3><div class="tablewrap"><table class="emp"><thead><tr><th>City</th><th>People</th><th>Builders</th><th>Makes each turn</th></tr></thead><tbody>${rows}</tbody></table></div>
    <h3>Armies</h3>${armies.length ? `<div class="tablewrap"><table class="emp"><thead><tr><th>Where</th><th>Units</th><th>Doing</th></tr></thead><tbody>${armies.join('')}</tbody></table></div>` : '<p class="dim">No units yet. Build a Camp, then train some.</p>'}
    <div class="row"><button class="btn next" data-act="next">Next 👉</button></div></div></div>`;
}

// ---------------------------------------------------------------- overlays

/** Three little pixel units in a race's color, for the race cards. */
function raceArmy(id: RaceId) {
  const col = RACES[id].color;
  return `<span class="rarmy">${(['soldier', 'walker', 'artillery'] as const).map((k) => { const url = spriteURL(`u-${k}-${col}`, () => unitSprite(k, hex(col)).buf, 2); return url ? `<img class="pu" src="${url}" alt="">` : ''; }).join('')}</span>`;
}
function overlayStart() {
  const saved = loadSave();
  const raceCard = (id: RaceId) => {
    const r = RACES[id];
    return `<button class="race ${ui.startRace === id ? 'on' : ''}" data-act="start-race" data-v="${id}" style="--pc:${r.color}">
      <span class="rhead"><span class="rface">${r.icon}</span>${raceArmy(id)}</span><span class="rname">${r.name}</span><span class="rtag">${r.tagline}</span>
      <ul>${r.traits.map((t) => `<li><b>${t.title}:</b> ${t.text}</li>`).join('')}</ul></button>`;
  };
  return `<div class="ov start"><div class="sheet">
    <h1 class="title">Frontier <small class="ver">v0.1</small></h1><p class="lede">Settle a new world. Build cities, research technology, raise an army, and beat the other races.</p>
    <h3>Choose your race</h3><div class="races four">${RACE_ORDER.map(raceCard).join('')}</div>
    <h3>How many players?</h3><div class="row">${[2, 3, 4].map((n) => `<button class="btn ${ui.startPlayers === n ? '' : 'ghost'}" data-act="start-players" data-v="${n}">${'👤'.repeat(n)} ${n}</button>`).join('')}</div>
    ${ui.startPlayers === 2 ? `<h3>Your rival</h3><div class="row">${(['random', ...RACE_ORDER.filter((r) => r !== ui.startRace)] as (RaceId | 'random')[]).map((r) => `<button class="btn ${ui.startFoes === r || (ui.startFoes === ui.startRace && r === 'random') ? '' : 'ghost'}" data-act="start-foe" data-v="${r}">${r === 'random' ? '🎲 Surprise me' : `${RACES[r].icon} ${RACES[r].name}`}</button>`).join('')}</div>` : ''}
    <h3>Computer players</h3><div class="row"><button class="btn ${ui.startDiff === 'easy' ? '' : 'ghost'}" data-act="start-diff" data-v="easy">😊 Easy</button><button class="btn ${ui.startDiff === 'normal' ? '' : 'ghost'}" data-act="start-diff" data-v="normal">😤 Normal</button></div>
    <div class="row big"><button class="btn end" data-act="start-game">Start new game ▶</button>${saved && saved.winner === null ? `<button class="btn" data-act="continue">Continue turn ${saved.turn}</button>` : ''}</div>
    <p class="dim">You win by capturing every enemy city. Nobody can attack for the first ${PEACE_TURNS} turns.${ui.startDiff === 'easy' ? ' The Easy opponent waits even longer, and it attacks with small groups.' : ''}</p></div></div>`;
}

function overlayTech() {
  const p = me();
  const tiers = [1, 2, 3];
  const path = p.goal ? researchPath(p, p.goal) : [];
  return `<div class="ov"><div class="sheet wide"><div class="row between"><h2>🧪 Research</h2><button class="btn ghost" data-act="close">Close ✕</button></div>
    <p>Tap a technology to aim for it. Science goes to it each turn, and anything it needs first gets researched on the way. You have <b>${Math.floor(p.res.science)}</b> 🧪 saved and make <b>+${empireOutput(g(), ME).science}</b> each turn.</p>
    <div class="tiers">${tiers.map((t) => `<div class="tier"><h3>Era ${'I'.repeat(t)}</h3>${TECH_ORDER.filter((id) => TECHS[id].tier === t).map((id) => {
      const d = TECHS[id];
      const done = p.techs.includes(id);
      const cur = p.researching === id;
      const onPath = path.includes(id);
      const pct = cur ? Math.round(100 * p.progress / d.cost) : done ? 100 : 0;
      return `<button class="tech ${done ? 'done' : ''} ${cur ? 'cur' : ''} ${onPath ? 'path' : ''}" data-act="tech-goal" data-v="${id}" ${done ? 'disabled' : ''}>
        <span class="ti">${d.icon}</span><span class="tn">${d.name}</span><span class="tc">${done ? '✔ done' : `🧪 ${d.cost}`}</span>
        <span class="tu">${d.unlocks}</span>${d.req.length ? `<span class="tr">needs ${d.req.map((x) => TECHS[x].name).join(', ')}</span>` : ''}
        <span class="tbar"><i style="width:${pct}%"></i></span></button>`;
    }).join('')}</div>`).join('')}</div></div></div>`;
}

function overlayAlmanac() {
  const tabs = [['quests', '⭐ Quests'], ['buildings', '🏗️ Buildings'], ['units', '⚔️ Units'], ['races', '👽 Races'], ['res', '💎 Resources'], ['how', '❓ How to play']];
  let body = '';
  if (ui.almTab === 'quests') {
    const q = ui.g ? questState(g()) : { done: [], won: 0, captured: 0 };
    body = `<p>Finish quests to earn stars and gifts. You have <b>⭐ ${q.done.length}</b> of ${QUESTS.length}.</p><div class="qlist">${QUESTS.map((x) => {
      const done = q.done.includes(x.id);
      const [a, b] = ui.g ? x.progress(g(), q) : [0, 1];
      return `<div class="quest ${done ? 'done' : ''}"><span class="qi">${done ? '⭐' : x.icon}</span><span class="qt"><b>${esc(x.text)}</b>${!done && b > 1 ? ` <span class="dim">${a}/${b}</span>` : ''}<span class="qtip">${esc(x.tip)}</span></span><span class="qr">${done ? '✔' : costChips(x.reward, true)}</span></div>`;
    }).join('')}</div>`;
  } else if (ui.almTab === 'buildings') {
    body = `<div class="tablewrap"><table><thead><tr><th>Building</th><th>★ Level 1</th><th>★★ Level 2</th><th>★★★ Level 3</th></tr></thead><tbody>${BUILD_ORDER.map((k) => {
      const d = BUILDINGS[k];
      const lvl = (i: number) => {
        const bits = [`${bicon(k, i + 1)}<br><b>${d.names[i]}</b>`];
        if (d.produces) bits.push(`${d.workers![i]} workers × ${d.perWorker![i]} ${ricon(d.produces)}${d.produces !== 'science' ? `, bonus tile +${TILE_BONUS[i]}` : ''}`);
        if (d.flat) bits.push(outChips(d.flat[i]));
        if (d.housing) bits.push(`🏠 ${d.housing[i]}`);
        if (d.armyCap) bits.push(`⚔️ room +${d.armyCap[i]}`);
        if (d.tower) bits.push(`🎯 ${d.tower.atk[i]} attack, ${d.tower.hp[i]} health`);
        if (d.tech[i]) bits.push(`<span class="dim">needs ${TECHS[d.tech[i]!].name}</span>`);
        if (Object.keys(d.cost[i]).length) bits.push(costChips(d.cost[i], true));
        return bits.join('<br>');
      };
      return `<tr><td>${bicon(k, 1)} <b>${d.names[0]}</b><br><span class="dim">${d.blurb}</span></td><td>${lvl(0)}</td><td>${lvl(1)}</td><td>${lvl(2)}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  } else if (ui.almTab === 'units') {
    body = `<div class="wheel">🪖 Soldier → beats → 🎯 Artillery → beats → 🤖 Walker → beats → 🪖 Soldier. A counter hit does ×${COUNTER_MULT} damage.</div>
      <div class="tablewrap"><table><thead><tr><th>Unit</th><th>Health</th><th>Attack</th><th>Strong against</th><th>Cost</th></tr></thead><tbody>${(['soldier', 'walker', 'artillery', 'settler'] as UKind[]).map((k) => {
        const d = UNITS[k];
        return `<tr><td>${uicon(k)} <b>${d.name}</b><br><span class="dim">${d.blurb}${d.tech ? ` Needs ${TECHS[d.tech].name}.` : ''}</span></td><td>${d.hp || '-'}</td><td>${d.atk || '-'}</td><td>${d.beats.join(', ') || '-'}</td><td>${costChips(d.cost, true)}</td></tr>`;
      }).join('')}
      <tr><td>${MILITIA.icon} <b>Militia</b><br><span class="dim">City people who fight when their city is attacked. One more for each City Center level.</span></td><td>${MILITIA.hp}</td><td>${MILITIA.atk}</td><td>-</td><td>free</td></tr></tbody></table></div>
      <p>Units that survive a battle earn a ▲ chevron: +10% health and attack, up to ▲▲▲.</p>`;
  } else if (ui.almTab === 'races') {
    body = `<div class="races">${(Object.keys(RACES) as RaceId[]).map((id) => { const r = RACES[id]; return `<div class="race on" style="--pc:${r.color}"><span class="rface">${r.icon}</span><span class="rname">${r.name}</span><span class="rtag">${r.tagline}</span><ul>${r.traits.map((t) => `<li><b>${t.title}:</b> ${t.text}</li>`).join('')}</ul></div>`; }).join('')}</div>`;
  } else if (ui.almTab === 'res') {
    body = `<ul class="plain">${RES_LIST.map((r) => `<li><span class="big">${ricon(r)}</span> <b>${RES_INFO[r].name}</b>: ${RES_INFO[r].what}</li>`).join('')}</ul>
      <p>Every city adds to one shared stockpile, so there's nothing to carry around.</p>
      <h3>Bonus tiles</h3><p>Each territory's city grid has glowing bonus tiles. ${(Object.keys(TERRAIN) as (keyof typeof TERRAIN)[]).map((t) => `${TERRAIN[t].deco} ${TERRAIN[t].name} have ${RES_INFO[TERRAIN[t].bonus].icon} tiles`).join(', ')}.
      A building on a matching tile makes extra: +${TILE_BONUS.join(' / +')} at levels 1 / 2 / 3, doubled on ★★ tiles.</p>
      <h3>Focus</h3><ul class="plain">${(Object.keys(FOCUS) as Focus[]).map((f) => `<li>${FOCUS[f].icon} <b>${FOCUS[f].name}</b>: ${FOCUS[f].text}</li>`).join('')}</ul>`;
  } else {
    body = `<ol class="plain">
      <li><b>Build.</b> Double-click your city to open it, pick a building, then tap a spot. Glowing spots make the most. Each city has builders, so it can build or upgrade a few things at once. A bigger City Center gives one more builder.</li>
      <li><b>Grow.</b> Food grows your city by one person at a time, as long as there are homes. People work in buildings by themselves.</li>
      <li><b>Research.</b> Tap 🧪 at the top and pick what to aim for. New tech unlocks bigger buildings and new units.</li>
      <li><b>Settle.</b> Train a 🚩 Settler and move it to empty land next door. It becomes a new city next turn.</li>
      <li><b>Fight.</b> Build a 🛡️ Camp, train units, and drag them into an enemy territory. Battles happen when you press End turn.</li>
      <li><b>Quests.</b> The ⭐ Quests card shows your next goals. Finish one for a star and a gift.</li>
      <li><b>Treasure.</b> 🎁 Chests sit on empty land. The first army or settler to walk onto one opens it.</li>
      <li><b>Magic house.</b> Every city can build one ✨ Magic Cottage. Upgrade it to a Spell Tower, then a Star Castle.</li>
      <li><b>Not sure what to do?</b> Press <b>Next 👉</b>. It jumps to a city with a free builder or an army waiting for orders. 📋 Empire shows everything at once.</li>
      <li><b>Win.</b> Capture every enemy city.</li></ol>
      <p>Everyone moves at the same time when you press End turn, so plan ahead. Tap 🔊 at the top to turn the sound off or on.</p>`;
  }
  return `<div class="ov"><div class="sheet wide"><div class="row between"><h2>📖 Almanac</h2><button class="btn ghost" data-act="close">Close ✕</button></div>
    <div class="tabs">${tabs.map(([k, n]) => `<button class="tab ${ui.almTab === k ? 'on' : ''}" data-act="alm-tab" data-v="${k}">${n}</button>`).join('')}</div>${body}</div></div>`;
}

function overlayReport() {
  const s = g();
  const lines: string[] = [];
  for (const e of ui.report) {
    if (e.kind === 'built' && e.player === ME) lines.push(`🏗️ ${esc(e.text)}`);
    if (e.kind === 'tech' && e.player === ME) lines.push(`🧪 You discovered <b>${TECHS[e.tech].name}</b>! Unlocks: ${TECHS[e.tech].unlocks}`);
    if (e.kind === 'found') lines.push(e.player === ME ? `🚩 You founded <b>${esc(cityById(s, e.cityId)?.name ?? '')}</b>!` : `🚩 ${RACES[s.players[e.player].race].name} founded a new city.`);
    if (e.kind === 'treasure') lines.push(e.player === ME ? `🎁 <b>Treasure!</b> Your units opened a chest in ${esc(s.map[e.territory].name)}: ${e.unit ? `a free ${UNITS[e.unit].name}!` : outChips(e.gift)}` : `<span class="dim">🎁 ${RACES[s.players[e.player].race].name} opened a treasure chest.</span>`);
    if (e.kind === 'tech' && e.player !== ME) lines.push(`<span class="dim">🧪 ${RACES[s.players[e.player].race].name} discovered ${TECHS[e.tech].name}.</span>`);
  }
  const grew = ui.report.filter((e) => e.kind === 'grow' && e.player === ME).length;
  if (grew) lines.push(`👥 ${grew} ${grew === 1 ? 'city' : 'cities'} grew.`);
  if (s.turn === PEACE_TURNS + 1) lines.push('⚔️ <b>Peace is over.</b> Armies can attack now.');
  if (!me().researching) lines.push('<span class="warn">🧪 Pick something to research.</span>');
  else if (ui.report.some((e) => e.kind === 'tech' && e.player === ME)) lines.push(`<span class="dim">🧪 Next up: ${TECHS[me().researching!].name}. Tap 🧪 at the top to change it.</span>`);
  const idle = s.cities.filter((c) => c.owner === ME && freeBuilders(c) > 0).map((c) => `${esc(c.name)} (${freeBuilders(c)})`);
  if (idle.length) lines.push(`<span class="dim">🔨 Free builders in: ${idle.join(', ')}</span>`);
  return `<div class="ov"><div class="sheet"><h2>Turn ${s.turn}</h2>${lines.length ? `<ul class="plain report">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>` : '<p>A quiet turn.</p>'}
    <button class="btn end" data-act="close">Let's go ▶</button></div></div>`;
}

function overlayWin() {
  const s = g();
  const won = s.winner === ME;
  const confetti = won ? `<div class="confetti" aria-hidden="true">${Array.from({ length: 40 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${(i * 53) % 1400}ms;--c:${['#ffd84a', '#7cf08f', '#ff6b5b', '#7ee0ff', '#c9a2ff'][i % 5]}"></i>`).join('')}</div>` : '';
  return `<div class="ov">${confetti}<div class="sheet center"><h1 class="title">${won ? 'Victory!' : 'Defeat'}</h1>
    <p class="lede">${won ? `You captured every enemy city in ${s.turn - 1} turns. ${RACES[me().race].icon}` : 'Your last city fell. Try again?'}</p>
    <p class="bigstars">⭐ ${starsEarned(s)} of ${QUESTS.length} quest stars</p>
    <button class="btn end" data-act="new-menu">Play again ▶</button></div></div>`;
}

// ---------------------------------------------------------------- render

function mainView() {
  if (!ui.g) return '';
  if (ui.view === 'battle' && ui.play) return renderBattleStage(ui.play.ev);
  if (ui.view === 'city' && ui.cityId !== null) { const c = cityById(g(), ui.cityId); if (c) return renderCity(c); }
  return renderMap();
}
function panel() {
  if (!ui.g) return '';
  if (ui.view === 'battle' && ui.play) return panelBattle();
  if (ui.view === 'city' && ui.cityId !== null) { const c = cityById(g(), ui.cityId); if (c) return panelCity(c); }
  return panelMap();
}

function questCard() {
  const s = g(); const q = questState(s);
  const list = activeQuests(s);
  if (!list.length) return `<div class="card quests"><b>⭐ Every quest done!</b> <span class="dim">You earned all ${QUESTS.length} stars.</span></div>`;
  return `<div class="card quests"><div class="ct"><b>⭐ Quests</b> <button class="link" data-act="quests">see all</button></div>${list.map((x) => {
    const [a, b] = x.progress(s, q);
    return `<div class="quest" title="${esc(x.tip)}"><span class="qi">${x.icon}</span><span class="qt">${esc(x.text)}${b > 1 ? ` <span class="dim">${a}/${b}</span>` : ''}
      <span class="qbar"><span style="width:${Math.round(100 * a / b)}%"></span></span><span class="qtip">${esc(x.tip)}</span></span><span class="qr">${costChips(x.reward, true)}</span></div>`;
  }).join('')}</div>`;
}
function questBanner() {
  if (!ui.questPop.length) return '';
  return `<div class="questpop" data-act="quest-ok">${ui.questPop.map((x) => `<div class="qp"><span class="qstar">⭐</span><div><b>Quest done!</b> ${x.icon} ${esc(x.text)}<div class="gift">Gift: ${outChips(x.reward)}</div></div></div>`).join('')}<div class="dim">tap to close</div></div>`;
}
function render() {
  if (ui.g && ui.g.winner === null && ui.overlay !== 'start' && ui.view !== 'battle') {
    const fresh = checkQuests(ui.g);
    if (fresh.length) { ui.questPop = [...ui.questPop, ...fresh]; sfx.star(); save(); }
  }
  const ov = ui.overlay === 'start' ? overlayStart() : !ui.g ? '' : ui.overlay === 'tech' ? overlayTech() : ui.overlay === 'almanac' ? overlayAlmanac()
    : ui.overlay === 'report' ? overlayReport() : ui.overlay === 'win' ? overlayWin() : ui.overlay === 'empire' ? overlayEmpire() : '';
  root.innerHTML = `${renderTop()}<main class="game ${ui.g ? '' : 'empty'}"><section class="stage" id="stage">${mainView()}${ui.g ? questBanner() : ''}</section><aside class="side" id="side">${ui.nudge && ui.view !== 'battle' ? `<div class="nudge">${esc(ui.nudge)}</div>` : ''}${ui.g && ui.view !== 'battle' && !ui.move ? questCard() : ''}${panel()}${ui.toast ? `<div class="toast">${esc(ui.toast)}</div>` : ''}</aside></main>${ov}`;
  paintArt();
}
function renderPanelOnly() {
  const side = document.getElementById('side');
  if (side) side.innerHTML = panel();
}

// ---------------------------------------------------------------- actions

function startGame(state: GameState) {
  ui.g = state; ui.stay.clear(); ui.seen.clear(); ui.nudge = '';
  ui.view = 'map'; ui.sel = null; ui.cityId = null; ui.tile = null; ui.placing = null; ui.move = null; ui.overlay = null; ui.play = null;
  const home = state.cities.find((c) => c.owner === ME);
  if (home) { ui.sel = home.territory; }
  if (!me().researching && !me().goal) setGoal(me(), 'tools');
  save();
}

async function doEndTurn() {
  const s = g();
  for (const p of s.players) if (p.ai) aiPlan(s, p.id);
  const ev = endTurn(s);
  noteEvents(s, ev);
  ui.questPop = [];
  ui.move = null; ui.placing = null; ui.seen.clear(); ui.nudge = '';
  const alive = new Set(s.units.map((u) => u.id));
  for (const id of [...ui.stay]) if (!alive.has(id)) ui.stay.delete(id);
  ui.report = ev;
  ui.battles = ev.filter((e): e is Extract<TurnEvent, { kind: 'battle' }> => e.kind === 'battle' && (e.attacker === ME || e.defender === ME));
  save();
  nextBattleOrReport();
}
function nextBattleOrReport() {
  const next = ui.battles.shift();
  if (next) {
    ui.view = 'battle';
    ui.play = { ev: next, speed: 1, done: false, token: Math.random() };
    ui.overlay = null;
    render();
    void playBattle();
    return;
  }
  ui.play = null;
  if (ui.view === 'battle') ui.view = 'map';
  if (ui.cityId !== null && cityById(g(), ui.cityId)?.owner !== ME) { ui.view = 'map'; ui.cityId = null; }
  ui.overlay = g().winner !== null ? 'win' : 'report';
  if (g().winner !== null) { clearSave(); if (g().winner === ME) sfx.win(); else sfx.lose(); }
  else reportSounds(ui.report);
  render();
}
/** A little fanfare for the good news in the turn report. */
function reportSounds(ev: TurnEvent[]) {
  const mine = (e: TurnEvent) => 'player' in e && e.player === ME;
  if (ev.some((e) => e.kind === 'treasure' && mine(e))) sfx.coin();
  else if (ev.some((e) => e.kind === 'tech' && mine(e))) sfx.tech();
  else if (ev.some((e) => e.kind === 'found' && mine(e))) sfx.coin();
  else if (ev.some((e) => e.kind === 'built' && mine(e))) sfx.done();
  else if (ev.some((e) => e.kind === 'grow' && mine(e))) sfx.grow();
}

function act(a: string, el: HTMLElement) {
  const v = el.dataset.v ?? '';
  const s = ui.g;
  ui.toast = '';
  if (a !== 'next' && a !== 'move-adj') ui.nudge = '';
  switch (a) {
    case 'next': goNext(); break;
    case 'show-terr': showTerritory(Number(v)); break;
    case 'guard': for (const u of readyAt(Number(v))) { ui.stay.add(u.id); u.moveTo = null; } ui.toast = 'They will guard here until you move them.'; save(); break;
    case 'start-race': ui.startRace = v as RaceId; break;
    case 'start-diff': ui.startDiff = v as 'easy' | 'normal'; break;
    case 'start-players': ui.startPlayers = +v!; break;
    case 'start-foe': ui.startFoes = v as RaceId | 'random'; break;
    case 'start-game': {
      const others = RACE_ORDER.filter((r) => r !== ui.startRace).sort(() => Math.random() - 0.5);
      const pick = ui.startFoes !== 'random' && ui.startFoes !== ui.startRace ? ui.startFoes : null;
      const foes = pick ? [pick, ...others.filter((r) => r !== pick)] : others;
      startGame(newGame({ race: ui.startRace, difficulty: ui.startDiff, players: ui.startPlayers, foes }));
      break;
    }
    case 'continue': { const sv = loadSave(); if (sv) startGame(sv); break; }
    case 'new-menu': ui.overlay = 'start'; ui.g = null; break;
    case 'overlay': ui.overlay = v as Overlay; break;
    case 'close': ui.overlay = null; break;
    case 'alm-tab': ui.almTab = v; break;
    case 'tech-goal': setGoal(me(), v as TechId); save(); break;
    case 'end-turn': if (ui.view !== 'battle') { sfx.turn(); void doEndTurn(); return; } break;
    case 'terr': {
      const t = Number(v);
      if (ui.move) {
        if (t === ui.move.from) { ui.move = null; ui.sel = t; break; }
        if (!s!.map[ui.move.from].neighbors.includes(t)) { ui.move = null; ui.sel = t; break; }
        const units = pickMoving();
        if (!units.length) { ui.toast = 'Pick at least one unit to send.'; break; }
        const why = whyCantMove(s!, units[0], t);
        if (why) { ui.toast = why; break; }
        if (hostileAt(s!, ME, t)) { ui.move.target = t; break; }
        orderMove(s!, units.map((u) => u.id), t); sfx.march(); ui.sel = ui.move.from; ui.move = null; save();
        break;
      }
      // tapping your selected city again (or double-clicking it) opens it
      const city = cityAt(s!, t);
      if (ui.sel === t && city && city.owner === ME && !el.classList.contains('army')) { openCity(city.id); break; }
      ui.sel = t; break;
    }
    case 'move-start': ui.move = { from: Number(v), counts: {}, target: null }; break;
    case 'move-adj': {
      const k = v as UKind; const m = ui.move!;
      const max = s!.units.filter((u) => u.at === m.from && u.owner === ME && !u.fresh && u.kind === k).length;
      m.counts[k] = Math.max(0, Math.min(max, (m.counts[k] ?? max) + Number(el.dataset.d)));
      break;
    }
    case 'move-cancel': ui.move = null; break;
    case 'attack-confirm': {
      const m = ui.move!; const units = pickMoving();
      if (m.target !== null) { orderMove(s!, units.map((u) => u.id), m.target); sfx.march(); }
      ui.sel = m.from; ui.move = null; save(); break;
    }
    case 'cancel-orders': orderMove(s!, s!.units.filter((u) => u.at === Number(v) && u.owner === ME).map((u) => u.id), null); save(); break;
    case 'open-city': openCity(Number(v)); break;
    case 'back-map': ui.view = 'map'; ui.placing = null; ui.tile = null; break;
    case 'tile': {
      const c = cityById(s!, ui.cityId!)!;
      if (c.owner !== ME) break;
      const t = Number(v);
      if (ui.placing) {
        const why = whyCantBuild(s!, c, ui.placing, t);
        if (why) { ui.toast = why; break; }
        if (startBuild(s!, c, ui.placing, t)) sfx.build(); ui.placing = null; ui.tile = null; save(); break;
      }
      ui.tile = ui.tile === t ? null : t; break;
    }
    case 'tile-clear': ui.tile = null; break;
    case 'place': {
      const c = cityById(s!, ui.cityId!)!;
      const k = v as BKind;
      const why = whyCantBuild(s!, c, k);
      if (why) { ui.toast = why === 'Not enough resources.' ? `Not enough resources for a ${BUILDINGS[k].names[0]}.` : why; break; }
      if (ui.tile !== null && freeTiles(c).includes(ui.tile)) { if (startBuild(s!, c, k, ui.tile)) sfx.build(); ui.tile = null; save(); break; }
      ui.placing = k; ui.tile = null; sfx.click(); break;
    }
    case 'place-cancel': ui.placing = null; break;
    case 'upgrade': {
      const c = cityById(s!, ui.cityId!)!; const b = c.buildings.find((x) => x.tile === ui.tile);
      if (b && startUpgrade(s!, c, b)) sfx.build(); save(); break;
    }
    case 'cancel-cons': cancelConstruction(s!, cityById(s!, ui.cityId!)!, Number(v)); save(); break;
    case 'train': {
      const c = cityById(s!, Number(el.dataset.c))!;
      const why = whyCantTrain(s!, c, v as UKind);
      if (why) { ui.toast = why; break; }
      if (train(s!, c, v as UKind)) sfx.pop(); save(); break;
    }
    case 'untrain': { const u = s!.units.find((x) => x.id === Number(v)); if (u) untrain(s!, u); save(); break; }
    case 'battle-speed': if (ui.play) ui.play.speed = ui.play.speed > 1 ? 1 : 3; renderPanelOnly(); return;
    case 'battle-skip': if (ui.play) { ui.play.token = Math.random(); finishBattle(); } return;
    case 'battle-next': nextBattleOrReport(); return;
    case 'mute': setMuted(!isMuted()); if (!isMuted()) sfx.pop(); break;
    case 'quest-ok': ui.questPop = []; break;
    case 'quests': ui.overlay = 'almanac'; ui.almTab = 'quests'; break;
    default: return;
  }
  if (ui.toast && TOAST_DENY.test(ui.toast)) sfx.deny();
  render();
}
// toasts that mean "no", which get a low buzz
const TOAST_DENY = /^(Not enough|All \d|That spot|No empty|Needs|Your army|Build a Camp|New units|Units move|Settlers need|Peace|Pick at least|Armies move|The city needs|Every city)/;

// ---------------------------------------------------------------- dragging armies on the map

interface Drag { from: number; x0: number; y0: number; moved: boolean; svg: SVGSVGElement; over: number | null; id: number }
let drag: Drag | null = null;
let swallowClick = false;
/** Pointer position in map units, and the territory under it. */
function mapPoint(svg: SVGSVGElement, e: PointerEvent): { x: number; y: number; t: number | null } {
  const r = svg.getBoundingClientRect();
  const x = r.width ? (e.clientX - r.left) / r.width * MAP_W : 0, y = r.height ? (e.clientY - r.top) / r.height * MAP_H : 0;
  const hit = g().map.find((m) => pointInPoly([x, y], m.poly));
  return { x, y, t: hit ? hit.id : null };
}
function dragVerdict(from: number, to: number | null): { ok: boolean; hostile: boolean; why: string } {
  const s = g();
  if (to === null || to === from) return { ok: false, hostile: false, why: '' };
  if (!s.map[from].neighbors.includes(to)) return { ok: false, hostile: false, why: 'Armies move one territory at a time. Drop it next door.' };
  const units = readyAt(from);
  const movers = units.filter((u) => !whyCantMove(s, u, to));
  if (!movers.length) return { ok: false, hostile: false, why: (units[0] && whyCantMove(s, units[0], to)) || 'They can’t go there.' };
  return { ok: true, hostile: hostileAt(s, ME, to), why: '' };
}
function drawDrag(p: { x: number; y: number; t: number | null }) {
  const fx = document.getElementById('drag-fx');
  if (!fx || !drag) return;
  const s = g();
  const [x1, y1] = s.map[drag.from].center;
  const v = dragVerdict(drag.from, p.t);
  const col = !p.t || p.t === drag.from ? '#ffffff' : !v.ok ? '#9aa0a8' : v.hostile ? '#ff5a4a' : '#ffe27a';
  const poly = p.t !== null && p.t !== drag.from ? `<polygon points="${s.map[p.t].poly.map((q) => q.join(',')).join(' ')}" class="drag-target ${v.ok ? (v.hostile ? 'bad' : 'good') : 'no'}"/>` : '';
  fx.innerHTML = `${poly}<path d="M${x1},${y1 - 24} L${p.x},${p.y}" stroke="${col}" stroke-width="9" stroke-dasharray="18 10" fill="none" marker-end="url(#arrow)" class="order"/>
    ${p.t !== null && p.t !== drag.from ? `<text x="${p.x}" y="${p.y - 26}" class="otext" fill="${col}">${v.ok ? (v.hostile ? 'ATTACK!' : 'Move here') : 'Can’t go'}</text>` : ''}`;
}
function dropArmy(from: number, to: number | null) {
  const s = g();
  if (to === null || to === from) { ui.sel = from; return; }
  const v = dragVerdict(from, to);
  if (!v.ok) { ui.sel = from; ui.toast = v.why; return; }
  const units = readyAt(from);
  if (v.hostile) { ui.sel = from; ui.move = { from, counts: {}, target: to }; return; }
  const movers = units.filter((u) => !whyCantMove(s, u, to));
  orderMove(s, movers.map((u) => u.id), to); sfx.march();
  for (const u of movers) ui.stay.delete(u.id);
  ui.sel = from; ui.move = null;
  ui.toast = `${movers.length} unit${movers.length > 1 ? 's' : ''} will march to ${s.map[to].name} when you end the turn.`;
  save();
}

export function mount(el: HTMLElement) {
  root = el;
  root.addEventListener('click', (e) => {
    if (swallowClick) { swallowClick = false; return; }
    const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!t || (t as HTMLButtonElement).disabled) return;
    act(t.dataset.act!, t);
  });
  root.addEventListener('dblclick', (e) => {
    const t = (e.target as Element).closest?.('[data-act="terr"]') as HTMLElement | null;
    if (!t || !ui.g || ui.view !== 'map' || ui.move) return;
    const city = cityAt(g(), Number(t.dataset.v));
    if (city) { openCity(city.id); render(); }
  });
  root.addEventListener('pointerdown', (e) => {
    const a = (e.target as Element).closest?.('.army.drag') as SVGGElement | null;
    if (!a || !ui.g || ui.view !== 'map' || e.button > 0) return;
    const svg = a.ownerSVGElement;
    if (!svg) return;
    e.preventDefault(); // no text selection or image ghost while dragging
    drag = { from: Number(a.dataset.v), x0: e.clientX, y0: e.clientY, moved: false, svg, over: null, id: e.pointerId };
    try { svg.setPointerCapture(e.pointerId); } catch { /* not all browsers */ }
  });
  root.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 8) return;
    drag.moved = true;
    const p = mapPoint(drag.svg, e);
    drag.over = p.t;
    drawDrag(p);
  });
  const endDrag = (e: PointerEvent, cancel: boolean) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    try { d.svg.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (!d.moved) return; // a plain tap: the click handler selects it
    swallowClick = true; setTimeout(() => { swallowClick = false; }, 0);
    if (cancel) { render(); return; }
    ui.toast = ''; ui.nudge = '';
    dropArmy(d.from, mapPoint(d.svg, e).t);
    render();
  };
  root.addEventListener('pointerup', (e) => endDrag(e, false));
  root.addEventListener('pointercancel', (e) => endDrag(e, true));
  root.addEventListener('change', (e) => {
    const t = e.target as HTMLSelectElement;
    if (t.dataset.change === 'focus' && ui.g) { setFocus(g(), ME, t.value as Focus); save(); render(); }
  });
  render();
}

// hooks for hot reload in the artifact viewer
export function snapshot() { return { g: ui.g }; }
export function restore(data: { g?: GameState | null }) { if (data?.g) startGame(data.g); }
export { render };
// keep tree-shaker quiet about type-only helpers
export type { RaceId };
void COMBAT_UNITS; void raceOf;
