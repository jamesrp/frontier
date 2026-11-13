import {
  BKind, BUILDINGS, CombatKind, COMBAT_UNITS, Focus, FOCUS, growCost, MILITIA, RACES, RACE_ORDER, RaceId, Res, RES_LIST, START_RES,
  Stock, TechId, TECHS, TECH_ORDER, TERRAIN, TILE_BONUS, UKind, UNITS,
} from './data';
import { BattleResult, Fighter, simulateBattle } from './battle';
import { makeMap, makeRng, MapCell, startTerritories } from './mapgen';

export const GRID = 4;
export const CENTER_TILE = 5;

export interface Tile { bonus?: Res; stars?: number }
export interface Building { kind: BKind; level: number; tile: number; workers: number }
export interface Construction { kind: BKind; tile: number; level: number; turnsLeft: number; paid: Stock }
export interface City {
  id: number; owner: number; territory: number; name: string; pop: number; growth: number;
  tiles: Tile[]; buildings: Building[]; builds: Construction[];
}
export interface Unit { id: number; kind: UKind; owner: number; at: number; moveTo: number | null; from: number; vet: number; fresh: boolean; paid: Stock }
export interface Player {
  id: number; name: string; race: RaceId; color: string; ai: boolean; res: Record<Res, number>; focus: Focus;
  techs: TechId[]; researching: TechId | null; goal: TechId | null; progress: number; alive: boolean; namesUsed: number;
}
export interface GameState {
  version: 2; seed: number; rng: number; turn: number; map: MapCell[]; cities: City[]; units: Unit[]; players: Player[];
  nextId: number; winner: number | null; difficulty: 'easy' | 'normal';
  /** Territories with a treasure chest waiting for the first army to walk in. */
  treasure?: number[];
}

export type TurnEvent =
  | { kind: 'battle'; territory: number; attacker: number; defender: number; result: BattleResult; captured: boolean; cityId: number | null }
  | { kind: 'found'; player: number; cityId: number }
  | { kind: 'built'; player: number; cityId: number; text: string }
  | { kind: 'tech'; player: number; tech: TechId }
  | { kind: 'grow'; player: number; cityId: number }
  | { kind: 'treasure'; player: number; territory: number; gift: Stock; unit: UKind | null }
  | { kind: 'eliminated'; player: number }
  | { kind: 'win'; player: number };

// ---------- setup ----------

export interface NewGameOpts { race: RaceId; difficulty: 'easy' | 'normal'; seed?: number; aiVsAi?: boolean; players?: number; foes?: RaceId[] }
export function newGame(opts: NewGameOpts): GameState {
  const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
  const rng = makeRng(seed);
  const map = makeMap(rng);
  const n = Math.max(2, Math.min(4, opts.players ?? 2));
  // rivals: the ones asked for, then the other races in a fixed order (a 2-player Ironhorn game still meets the Seers)
  const foes = [...(opts.foes ?? [])];
  for (const r of RACE_ORDER) if (foes.length < n - 1 && r !== opts.race && !foes.includes(r)) foes.push(r);
  const mkPlayer = (id: number, race: RaceId, ai: boolean): Player => ({
    id, name: ai ? `${RACES[race].name} (computer)` : `You (${RACES[race].name})`, race, color: RACES[race].color, ai,
    res: { ...START_RES }, focus: 'balanced', techs: [], researching: null, goal: null, progress: 0, alive: true, namesUsed: 0,
  });
  const s: GameState = {
    version: 2, seed, rng: rng.state(), turn: 1, map, cities: [], units: [],
    players: [mkPlayer(0, opts.race, !!opts.aiVsAi), ...foes.slice(0, n - 1).map((r, i) => mkPlayer(i + 1, r, true))],
    nextId: 1, winner: null, difficulty: opts.difficulty,
  };
  const starts = startTerritories(n);
  s.players.forEach((p, i) => {
    const city = foundCity(s, p.id, starts[i]);
    city.pop = 4;
    const best = (res: Res) => bestTileFor(city, res);
    city.buildings.push({ kind: 'farm', level: 1, tile: best('food'), workers: 0 });
    city.buildings.push({ kind: 'lumber', level: 1, tile: best('wood'), workers: 0 });
    city.buildings.push({ kind: 'housing', level: 1, tile: freeTiles(city).find((t) => !city.tiles[t].bonus)!, workers: 0 });
    assignWorkers(s, city);
    for (let k = 0; k < 2; k++) s.units.push(newUnit(s, 'soldier', p.id, city.territory, false));
  });
  // treasure chests on empty land that isn't right next to anyone's start
  const r = rngOf(s);
  const spots = s.map.filter((t) => !cityAt(s, t.id) && !starts.some((st) => s.map[st].neighbors.includes(t.id))).map((t) => t.id);
  s.treasure = [];
  for (let k = 0; k < (n === 2 ? 3 : 4) && spots.length; k++) s.treasure.push(spots.splice(Math.floor(r.next() * spots.length), 1)[0]);
  r.save();
  return s;
}

function rngOf(s: GameState) {
  // continue the game's random sequence from the saved state
  const rr = makeRng(s.rng);
  return { ...rr, save: () => { s.rng = rr.state(); } };
}

function newUnit(s: GameState, kind: UKind, owner: number, at: number, fresh: boolean, paid: Stock = {}): Unit {
  return { id: s.nextId++, kind, owner, at, moveTo: null, from: at, vet: 0, fresh, paid };
}

export function foundCity(s: GameState, owner: number, territory: number): City {
  const p = s.players[owner];
  const race = RACES[p.race];
  const name = race.cityNames[p.namesUsed % race.cityNames.length];
  p.namesUsed++;
  const r = rngOf(s);
  const terr = s.map[territory].terrain;
  const tiles: Tile[] = Array.from({ length: GRID * GRID }, () => ({}));
  const open = tiles.map((_, i) => i).filter((i) => i !== CENTER_TILE);
  const take = () => open.splice(Math.floor(r.next() * open.length), 1)[0];
  const main = TERRAIN[terr].bonus;
  tiles[take()] = { bonus: main, stars: 2 };
  tiles[take()] = { bonus: main, stars: 1 };
  tiles[take()] = { bonus: main, stars: 1 };
  const others: Res[] = (['food', 'wood', 'iron', 'energy'] as Res[]).filter((x) => x !== main);
  tiles[take()] = { bonus: r.pick(others), stars: 1 };
  tiles[take()] = { bonus: r.pick(others), stars: 1 };
  r.save();
  const city: City = {
    id: s.nextId++, owner, territory, name, pop: 1, growth: 0, tiles,
    buildings: [{ kind: 'center', level: 1, tile: CENTER_TILE, workers: 0 }], builds: [],
  };
  s.cities.push(city);
  return city;
}

// ---------- lookups ----------

export const cityAt = (s: GameState, territory: number) => s.cities.find((c) => c.territory === territory) || null;
export const cityById = (s: GameState, id: number) => s.cities.find((c) => c.id === id) || null;
export const ownerOf = (s: GameState, territory: number) => cityAt(s, territory)?.owner ?? null;
export const unitsAt = (s: GameState, territory: number, owner?: number) =>
  s.units.filter((u) => u.at === territory && (owner === undefined || u.owner === owner));
export const hasTech = (p: Player, t: TechId | null) => !t || p.techs.includes(t);
export const raceOf = (s: GameState, owner: number) => RACES[s.players[owner].race];
export const centerOf = (c: City) => c.buildings.find((b) => b.kind === 'center')!;

export function freeTiles(c: City) {
  const used = new Set(c.buildings.map((b) => b.tile));
  for (const k of c.builds) used.add(k.tile);
  return c.tiles.map((_, i) => i).filter((i) => !used.has(i));
}
/** How many things a city can build or upgrade at once: one more than its City Center level. */
export const buildSlots = (c: City) => centerOf(c).level + 1;
export const freeBuilders = (c: City) => Math.max(0, buildSlots(c) - c.builds.length);
export const buildAt = (c: City, tile: number) => c.builds.find((k) => k.tile === tile) || null;
export function bestTileFor(c: City, res: Res) {
  const free = freeTiles(c);
  free.sort((a, b) => tileBonusStars(c, b, res) - tileBonusStars(c, a, res));
  return free[0];
}
export function tileBonusStars(c: City, tile: number, res: Res | undefined) {
  const t = c.tiles[tile];
  return res && t.bonus === res ? t.stars || 1 : 0;
}

export function housingCap(s: GameState, c: City) {
  const race = raceOf(s, c.owner);
  let cap = 0;
  for (const b of c.buildings) { const h = BUILDINGS[b.kind].housing; if (h) cap += h[b.level - 1]; }
  return Math.max(2, Math.floor(cap * race.housingMult));
}
export function armyCap(s: GameState, owner: number) {
  let cap = 0;
  for (const c of s.cities) if (c.owner === owner) for (const b of c.buildings) {
    const a = BUILDINGS[b.kind].armyCap; if (a) cap += a[b.level - 1];
  }
  return Math.floor(cap * (raceOf(s, owner).armyCapMult ?? 1));
}
export const armyCount = (s: GameState, owner: number) => s.units.filter((u) => u.owner === owner && u.kind !== 'settler').length;

/** What one building makes per turn with a given number of workers. */
export function outputOf(s: GameState, c: City, kind: BKind, level: number, tile: number, workers: number) {
  const d = BUILDINGS[kind];
  if (!d.produces || !d.perWorker || workers <= 0) return 0;
  const race = raceOf(s, c.owner);
  const base = workers * d.perWorker[level - 1];
  const bonus = d.produces === 'science' ? 0 : tileBonusStars(c, tile, d.produces) * TILE_BONUS[level - 1];
  let out = (base + bonus) * (race.prodMult[d.produces] ?? 1);
  if (s.players[c.owner].ai && s.difficulty === 'easy') out *= 0.8;
  return Math.round(out);
}
export function slotsOf(b: Building) { const w = BUILDINGS[b.kind].workers; return w ? w[b.level - 1] : 0; }

export function cityOutput(s: GameState, c: City): Record<Res, number> {
  const out: Record<Res, number> = { food: 0, wood: 0, iron: 0, energy: 0, science: 0 };
  for (const b of c.buildings) {
    const flat = BUILDINGS[b.kind].flat;
    if (flat) for (const r of RES_LIST) out[r] += flat[b.level - 1][r] ?? 0;
    const res = BUILDINGS[b.kind].produces; if (!res) continue;
    out[res] += outputOf(s, c, b.kind, b.level, b.tile, b.workers);
  }
  return out;
}
export function empireOutput(s: GameState, owner: number) {
  const out: Record<Res, number> = { food: 0, wood: 0, iron: 0, energy: 0, science: 0 };
  for (const c of s.cities) if (c.owner === owner) { const o = cityOutput(s, c); for (const r of RES_LIST) out[r] += o[r]; }
  return out;
}

/** Fill jobs with the city's people, following the empire Focus. */
export function assignWorkers(s: GameState, c: City) {
  const weights = FOCUS[s.players[c.owner].focus].weights;
  const jobs = c.buildings.filter((b) => slotsOf(b) > 0);
  jobs.forEach((b) => (b.workers = 0));
  const perRes: Partial<Record<Res, number>> = {};
  for (let i = 0; i < c.pop; i++) {
    let best: Building | null = null, bestScore = -1;
    for (const b of jobs) {
      if (b.workers >= slotsOf(b)) continue;
      const res = BUILDINGS[b.kind].produces!;
      const gain = outputOf(s, c, b.kind, b.level, b.tile, b.workers + 1) - outputOf(s, c, b.kind, b.level, b.tile, b.workers);
      const score = (gain + 0.01) * (weights[res] ?? 1) / (1 + 0.35 * (perRes[res] ?? 0));
      if (score > bestScore) { bestScore = score; best = b; }
    }
    if (!best) break;
    best.workers++;
    const res = BUILDINGS[best.kind].produces!;
    perRes[res] = (perRes[res] ?? 0) + 1;
  }
}
export const idlePeople = (c: City) => c.pop - c.buildings.reduce((n, b) => n + b.workers, 0);

export function setFocus(s: GameState, owner: number, f: Focus) {
  s.players[owner].focus = f;
  s.cities.filter((c) => c.owner === owner).forEach((c) => assignWorkers(s, c));
}

// ---------- money ----------

export function canAfford(p: Player, cost: Stock) { return RES_LIST.every((r) => (p.res[r] ?? 0) >= (cost[r] ?? 0)); }
export function missing(p: Player, cost: Stock): Stock {
  const m: Stock = {};
  for (const r of RES_LIST) { const need = (cost[r] ?? 0) - p.res[r]; if (need > 0) m[r] = need; }
  return m;
}
function pay(p: Player, cost: Stock) { for (const r of RES_LIST) p.res[r] -= cost[r] ?? 0; }
function refund(p: Player, cost: Stock) { for (const r of RES_LIST) p.res[r] += cost[r] ?? 0; }

// ---------- building ----------

/** Returns null if allowed, or a short reason a kid can read. */
export function whyCantBuild(s: GameState, c: City, kind: BKind, tile?: number): string | null {
  const p = s.players[c.owner];
  const d = BUILDINGS[kind];
  if (!d.buildable) return 'Every city has exactly one.';
  if (d.unique && (c.buildings.some((b) => b.kind === kind) || c.builds.some((k) => k.kind === kind))) return 'Only one per city. Upgrade it instead.';
  if (!freeBuilders(c)) return `All ${buildSlots(c)} builders are busy.`;
  if (tile !== undefined && !freeTiles(c).includes(tile)) return 'That spot is taken.';
  if (!freeTiles(c).length) return 'No empty spots left.';
  if (!canAfford(p, d.cost[0])) return 'Not enough resources.';
  return null;
}
/** Turns a build or upgrade to this level takes for this owner (Hivekin are quicker). */
export function buildTurns(s: GameState, owner: number, kind: BKind, level: number) {
  return Math.max(1, BUILDINGS[kind].turns[level - 1] - (raceOf(s, owner).buildFaster ?? 0));
}
export function startBuild(s: GameState, c: City, kind: BKind, tile: number) {
  if (whyCantBuild(s, c, kind, tile)) return false;
  const d = BUILDINGS[kind];
  const p = s.players[c.owner];
  pay(p, d.cost[0]);
  c.builds.push({ kind, tile, level: 1, turnsLeft: buildTurns(s, c.owner, kind, 1), paid: d.cost[0] });
  return true;
}
export function whyCantUpgrade(s: GameState, c: City, b: Building): string | null {
  const p = s.players[c.owner];
  const d = BUILDINGS[b.kind];
  if (b.level >= 3) return 'Already at the top level.';
  const tech = d.tech[b.level];
  if (!hasTech(p, tech)) return `Needs ${TECHS[tech!].name} research.`;
  if (buildAt(c, b.tile)) return 'Already being upgraded.';
  if (!freeBuilders(c)) return `All ${buildSlots(c)} builders are busy.`;
  if (!canAfford(p, d.cost[b.level])) return 'Not enough resources.';
  return null;
}
export function startUpgrade(s: GameState, c: City, b: Building) {
  if (whyCantUpgrade(s, c, b)) return false;
  const d = BUILDINGS[b.kind];
  const p = s.players[c.owner];
  const cost = d.cost[b.level];
  pay(p, cost);
  c.builds.push({ kind: b.kind, tile: b.tile, level: b.level + 1, turnsLeft: buildTurns(s, c.owner, b.kind, b.level + 1), paid: cost });
  return true;
}
export function cancelConstruction(s: GameState, c: City, tile: number) {
  const k = buildAt(c, tile);
  if (!k) return;
  refund(s.players[c.owner], k.paid);
  c.builds = c.builds.filter((x) => x !== k);
}

// ---------- units ----------

/** What a unit costs this owner (Hivekin swarms are cheaper). */
export function unitCost(s: GameState, owner: number, kind: UKind): Stock {
  const m = kind === 'settler' ? 1 : raceOf(s, owner).unitCostMult ?? 1;
  const out: Stock = {};
  for (const r of RES_LIST) { const v = UNITS[kind].cost[r]; if (v) out[r] = Math.max(1, Math.round(v * m)); }
  return out;
}
export const growCostFor = (s: GameState, owner: number, pop: number) => growCost(pop) + (raceOf(s, owner).growExtra ?? 0);
export function whyCantTrain(s: GameState, c: City, kind: UKind): string | null {
  const p = s.players[c.owner];
  const d = UNITS[kind];
  if (!hasTech(p, d.tech)) return `Needs ${TECHS[d.tech!].name} research.`;
  if (kind === 'settler') {
    if (c.pop < 3) return 'The city needs at least 3 people.';
  } else {
    if (!c.buildings.some((b) => b.kind === 'barracks')) return 'Build a Camp in this city first.';
    if (armyCount(s, p.id) >= armyCap(s, p.id)) return 'Your army is full. Build or upgrade a Camp or the City Center.';
  }
  if (!canAfford(p, unitCost(s, p.id, kind))) return 'Not enough resources.';
  return null;
}
export function train(s: GameState, c: City, kind: UKind) {
  if (whyCantTrain(s, c, kind)) return null;
  const p = s.players[c.owner];
  const d = UNITS[kind];
  const cost = unitCost(s, p.id, kind);
  pay(p, cost);
  if (d.popCost) { c.pop -= d.popCost; assignWorkers(s, c); }
  const u = newUnit(s, kind, p.id, c.territory, true, cost);
  s.units.push(u);
  return u;
}
export function untrain(s: GameState, u: Unit) {
  if (!u.fresh) return;
  refund(s.players[u.owner], u.paid);
  if (u.kind === 'settler') { const c = cityAt(s, u.at); if (c) { c.pop += UNITS.settler.popCost!; assignWorkers(s, c); } }
  s.units = s.units.filter((x) => x !== u);
}

export const PEACE_TURNS = 10;
export const inPeace = (s: GameState) => s.turn <= PEACE_TURNS;
/** Territory holds an enemy city or enemy army. */
export function hostileAt(s: GameState, owner: number, t: number) {
  const c = cityAt(s, t);
  return (!!c && c.owner !== owner) || s.units.some((u) => u.at === t && u.owner !== owner && u.kind !== 'settler');
}
export function whyCantMove(s: GameState, u: Unit, to: number): string | null {
  if (u.fresh) return 'New units can move next turn.';
  if (!s.map[u.at].neighbors.includes(to)) return 'Units move one territory at a time.';
  if (u.kind === 'settler' && cityAt(s, to)) return 'Settlers need an empty territory.';
  if (inPeace(s) && hostileAt(s, u.owner, to)) return `Peace time! Attacks start on turn ${PEACE_TURNS + 1}.`;
  return null;
}
export const canMove = (s: GameState, u: Unit, to: number) => !whyCantMove(s, u, to);
export function orderMove(s: GameState, ids: number[], to: number | null) {
  for (const id of ids) {
    const u = s.units.find((x) => x.id === id); if (!u) continue;
    if (to === null || to === u.at) u.moveTo = null;
    else if (canMove(s, u, to)) u.moveTo = to;
  }
}

// ---------- research ----------

export function researchPath(p: Player, goal: TechId): TechId[] {
  const out: TechId[] = [];
  const visit = (t: TechId) => {
    if (p.techs.includes(t) || out.includes(t)) return;
    TECHS[t].req.forEach(visit);
    out.push(t);
  };
  visit(goal);
  return out;
}
export function setGoal(p: Player, goal: TechId | null) {
  if (goal && p.techs.includes(goal)) return;
  p.goal = goal;
  const path = goal ? researchPath(p, goal) : [];
  const next = path[0] ?? null;
  if (next !== p.researching) { p.researching = next; p.progress = 0; }
}

// ---------- combat setup ----------

export function fighterFor(s: GameState, u: Unit, side: 0 | 1): Fighter {
  const race = raceOf(s, u.owner);
  const d = UNITS[u.kind];
  const vetMult = 1 + 0.1 * u.vet;
  const home = race.homeHpMult && cityAt(s, u.at)?.owner === u.owner ? race.homeHpMult : 1;
  const hp = Math.round(d.hp * (race.unitHpMult[u.kind] ?? 1) * vetMult * home);
  const atk = Math.round(d.atk * (race.unitAtkMult[u.kind] ?? 1) * vetMult * 10) / 10;
  return { id: `u${u.id}`, side, kind: u.kind as CombatKind, owner: u.owner, unitId: u.id, hp, maxHp: hp, atk, vet: u.vet, icon: d.icon };
}
export function cityDefenders(s: GameState, c: City): Fighter[] {
  const out: Fighter[] = [];
  const lvl = centerOf(c).level;
  for (let i = 0; i < lvl + 1; i++) out.push({ id: `m${c.id}_${i}`, side: 1, kind: 'militia', owner: c.owner, hp: MILITIA.hp, maxHp: MILITIA.hp, atk: MILITIA.atk, vet: 0, icon: MILITIA.icon });
  for (const b of c.buildings) {
    const t = BUILDINGS[b.kind].tower; if (!t) continue;
    const hp = t.hp[b.level - 1];
    out.push({ id: `t${c.id}_${b.tile}`, side: 1, kind: 'tower', owner: c.owner, hp, maxHp: hp, atk: t.atk[b.level - 1], vet: 0, icon: BUILDINGS[b.kind].icon });
  }
  return out;
}

/** Chance (0-100) that these attackers win at a territory, based on what is there right now. */
export function forecast(s: GameState, attackers: Unit[], territory: number, sims = 40): number {
  if (!attackers.length) return 0;
  const atkOwner = attackers[0].owner;
  const city = cityAt(s, territory);
  const defOwner = city && city.owner !== atkOwner ? city.owner
    : s.units.find((u) => u.at === territory && u.owner !== atkOwner && u.kind !== 'settler')?.owner;
  if (defOwner === undefined || defOwner === null) return 100;
  const fighters: Fighter[] = [
    ...attackers.filter((u) => u.kind !== 'settler').map((u) => fighterFor(s, u, 0)),
    ...s.units.filter((u) => u.at === territory && u.owner === defOwner && u.kind !== 'settler').map((u) => fighterFor(s, u, 1)),
    ...(city && city.owner === defOwner ? cityDefenders(s, city) : []),
  ];
  if (!fighters.some((f) => f.side === 0)) return 0;
  if (!fighters.some((f) => f.side === 1)) return 100;
  let wins = 0;
  const races: [any, any] = [raceOf(s, atkOwner), raceOf(s, defOwner)];
  for (let i = 0; i < sims; i++) if (simulateBattle(fighters, races, makeRng(1000 + i * 7919)).winner === 0) wins++;
  return Math.round((100 * wins) / sims);
}

// ---------- end of turn ----------

export function endTurn(s: GameState): TurnEvent[] {
  const ev: TurnEvent[] = [];
  if (s.winner !== null) return ev;
  const r = rngOf(s);

  // 1. Movement (everyone moves at once)
  const moved = new Set<number>();
  for (const u of s.units) {
    u.from = u.at;
    if (u.moveTo !== null) { u.at = u.moveTo; u.moveTo = null; moved.add(u.id); }
  }

  // 2. Battles
  for (const t of s.map) {
    for (let guard = 0; guard < 4; guard++) {
      const city = cityAt(s, t.id);
      const here = s.units.filter((u) => u.at === t.id);
      const owners = [...new Set(here.filter((u) => u.kind !== 'settler').map((u) => u.owner))];
      let defender: number | null = null, attacker: number | null = null;
      if (city && owners.some((o) => o !== city.owner)) {
        defender = city.owner; attacker = owners.find((o) => o !== city.owner)!;
      } else if (owners.length >= 2) {
        const stayed = owners.find((o) => here.some((u) => u.owner === o && !moved.has(u.id)));
        defender = stayed ?? owners[0]; attacker = owners.find((o) => o !== defender)!;
      }
      if (attacker === null || defender === null) break;
      const atkUnits = here.filter((u) => u.owner === attacker && u.kind !== 'settler');
      const defUnits = here.filter((u) => u.owner === defender && u.kind !== 'settler');
      const fighters: Fighter[] = [
        ...atkUnits.map((u) => fighterFor(s, u, 0)),
        ...defUnits.map((u) => fighterFor(s, u, 1)),
        ...(city && city.owner === defender ? cityDefenders(s, city) : []),
      ];
      const result = simulateBattle(fighters, [raceOf(s, attacker), raceOf(s, defender)], r);
      // apply: deaths, sway, veterancy
      const sideOwner = (side: 0 | 1) => (side === 0 ? attacker! : defender!);
      for (const f of result.fighters) {
        if (f.unitId === undefined) continue;
        const u = s.units.find((x) => x.id === f.unitId)!;
        const hp = result.survivors[f.id];
        if (hp === undefined) { s.units = s.units.filter((x) => x !== u); continue; }
        u.owner = sideOwner(f.side);
        u.vet = Math.min(3, u.vet + 1);
      }
      let captured = false;
      const winnerOwner = sideOwner(result.winner);
      const loserOwner = winnerOwner === attacker ? defender : attacker;
      // losers' settlers here are lost
      s.units = s.units.filter((u) => !(u.at === t.id && u.kind === 'settler' && u.owner === loserOwner && loserOwner === defender));
      if (result.winner === 1) {
        // attackers fall back where they came from
        for (const u of s.units) if (u.at === t.id && u.owner === attacker) u.at = u.from !== t.id ? u.from : u.at;
      } else if (city && city.owner === defender) {
        city.owner = attacker; city.pop = Math.max(1, Math.floor(city.pop / 2)); city.builds = []; city.growth = 0;
        assignWorkers(s, city);
        captured = true;
      }
      ev.push({ kind: 'battle', territory: t.id, attacker, defender, result, captured, cityId: city ? city.id : null });
    }
  }

  // 2b. Treasure: the first army (or settler) to stand alone on a chest opens it
  if (s.treasure) for (const t of [...s.treasure]) {
    const here = s.units.filter((u) => u.at === t);
    const owners = [...new Set(here.map((u) => u.owner))];
    if (owners.length !== 1 || cityAt(s, t)) continue;
    const who = owners[0];
    const p = s.players[who];
    const roll = r.next();
    let gift: Stock = {}, unit: UKind | null = null;
    if (roll < 0.25) gift = { food: 30, wood: 20 };
    else if (roll < 0.5) gift = { wood: 25, iron: 25 };
    else if (roll < 0.7) gift = { energy: 20, science: 20 };
    else if (p.ai && s.difficulty === 'easy') gift = { food: 20, wood: 20 }; // the Easy opponent never gets free fighters
    else { unit = hasTech(p, 'walkers') && roll > 0.9 ? 'walker' : 'soldier'; }
    for (const res of RES_LIST) p.res[res] += gift[res] ?? 0;
    if (unit) s.units.push(newUnit(s, unit, who, t, false));
    s.treasure = s.treasure.filter((x) => x !== t);
    ev.push({ kind: 'treasure', player: who, territory: t, gift, unit });
  }

  // 3. Settlers found cities
  for (const u of [...s.units]) {
    if (u.kind !== 'settler' || !moved.has(u.id)) continue;
    if (cityAt(s, u.at)) { u.at = u.from; continue; }
    if (s.units.some((x) => x.at === u.at && x.owner !== u.owner && x.kind !== 'settler')) { u.at = u.from; continue; }
    const c = foundCity(s, u.owner, u.at);
    c.pop = UNITS.settler.popCost!;
    assignWorkers(s, c);
    s.units = s.units.filter((x) => x !== u);
    ev.push({ kind: 'found', player: u.owner, cityId: c.id });
  }

  // 4. Production and research
  for (const p of s.players) {
    if (!p.alive) continue;
    const out = empireOutput(s, p.id);
    for (const res of RES_LIST) p.res[res] += out[res];
    if (!p.researching && p.goal) setGoal(p, p.goal);
    let guard = 0;
    while (p.researching && guard++ < 5) {
      const need = TECHS[p.researching].cost - p.progress;
      const spend = Math.min(need, p.res.science);
      p.res.science -= spend; p.progress += spend;
      if (p.progress < TECHS[p.researching].cost) break;
      const done = p.researching;
      p.techs.push(done); p.progress = 0; p.researching = null;
      ev.push({ kind: 'tech', player: p.id, tech: done });
      if (p.goal === done) p.goal = null;
      // a person never has to babysit research: pick the cheapest tech that is ready
      if (!p.goal && !p.ai) {
        const ready = TECH_ORDER.filter((t) => !p.techs.includes(t) && TECHS[t].req.every((r) => p.techs.includes(r)))
          .sort((a, b) => TECHS[a].cost - TECHS[b].cost)[0];
        if (ready) p.goal = ready;
      }
      if (p.goal) setGoal(p, p.goal);
    }
  }

  // 5. Construction
  for (const c of s.cities) {
    for (const k of [...c.builds]) {
      k.turnsLeft--;
      if (k.turnsLeft > 0) continue;
      const existing = c.buildings.find((b) => b.tile === k.tile);
      if (existing) existing.level = k.level; else c.buildings.push({ kind: k.kind, level: k.level, tile: k.tile, workers: 0 });
      c.builds = c.builds.filter((x) => x !== k);
      ev.push({ kind: 'built', player: c.owner, cityId: c.id, text: `${c.name} finished a ${BUILDINGS[k.kind].names[k.level - 1]}` });
    }
  }

  // 6. New units are ready; everyone heals
  for (const u of s.units) { u.fresh = false; u.from = u.at; }

  // 7. Growth (one new person per city per turn, paid with food)
  for (const p of s.players) {
    const cities = s.cities.filter((c) => c.owner === p.id).sort((a, b) => a.pop - b.pop);
    for (const c of cities) {
      if (c.pop >= housingCap(s, c)) continue;
      const cost = growCostFor(s, p.id, c.pop);
      if (p.res.food >= cost) { p.res.food -= cost; c.pop++; ev.push({ kind: 'grow', player: p.id, cityId: c.id }); }
    }
  }
  for (const c of s.cities) assignWorkers(s, c);

  // 8. Who is still in the game?
  for (const p of s.players) {
    if (!p.alive) continue;
    if (!s.cities.some((c) => c.owner === p.id)) {
      p.alive = false;
      s.units = s.units.filter((u) => u.owner !== p.id);
      ev.push({ kind: 'eliminated', player: p.id });
    }
  }
  const alive = s.players.filter((p) => p.alive);
  if (alive.length === 1) { s.winner = alive[0].id; ev.push({ kind: 'win', player: alive[0].id }); }

  r.save();
  s.turn++;
  return ev;
}

export function combatUnitsAt(s: GameState, t: number, owner: number) {
  return s.units.filter((u) => u.at === t && u.owner === owner && COMBAT_UNITS.includes(u.kind));
}
export { TECH_ORDER };
