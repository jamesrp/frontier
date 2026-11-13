import { BKind, BUILDINGS, Res, TechId, UKind } from './data';
import {
  armyCap, armyCount, bestTileFor, buildSlots, canAfford, cityAt, City, combatUnitsAt, empireOutput, forecast, freeTiles, GameState,
  hasTech, housingCap, canMove, inPeace, slotsOf, idlePeople, orderMove, setGoal, startBuild, startUpgrade, tileBonusStars, train, whyCantBuild,
  whyCantTrain, whyCantUpgrade,
} from './game';

const RESEARCH_PLAN: TechId[] = ['tools', 'civics', 'engines', 'walkers', 'artillery', 'fort', 'industry', 'fusion', 'capitol'];
const PRODUCERS: Record<string, BKind> = { food: 'farm', wood: 'lumber', iron: 'mine', energy: 'power', science: 'lab' };

/**
 * Easy mode is for a slow, careful young player. The Easy opponent:
 * - waits until EASY_FIRST_ATTACK before it attacks anything,
 * - keeps a smaller army that grows with the turn number,
 * - attacks with a small group and always leaves units at home (no all-in pushes),
 * - settles at most EASY_MAX_CITIES cities,
 * - leaves the player's last city alone until EASY_LAST_CITY_TURN.
 */
export const EASY_FIRST_ATTACK = 22;
const EASY_MAX_CITIES = 3;
const EASY_LAST_CITY_TURN = 40;
const easyArmyCap = (turn: number) => 3 + Math.floor(turn / 8);
const easyGroup = (turn: number) => (turn < 35 ? 3 : 4);

/** The computer player makes all its choices for this turn, using the same actions as the human. */
export function aiPlan(s: GameState, owner: number) {
  const p = s.players[owner];
  if (!p.alive) return;
  // player 0 is always the person; Easy only softens the computer players
  const easy = s.difficulty === 'easy' && owner !== 0;
  const threshold = easy ? 80 : 62;

  // Research
  if (!p.goal && !p.researching) {
    const next = RESEARCH_PLAN.find((t) => !p.techs.includes(t));
    if (next) setGoal(p, next);
  }

  const myCities = s.cities.filter((c) => c.owner === owner);
  const enemyNear = (c: City) => s.map[c.territory].neighbors.some((n) =>
    (cityAt(s, n) && cityAt(s, n)!.owner !== owner) || s.units.some((u) => u.at === n && u.owner !== owner));

  // Buildings. Normal holds off on new homes while it is saving food for a settler (with several builders it would otherwise grow every turn and never settle).
  const income = empireOutput(s, owner);
  const freeLandNow = s.map.some((t) => !cityAt(s, t.id));
  const wantSettle = !easy && freeLandNow && myCities.length < 5 && !s.units.some((u) => u.owner === owner && u.kind === 'settler');
  for (const c of myCities) {
    // Easy keeps to one job per city (its tuning predates builder slots); Normal uses every builder
    const limit = easy ? 1 : buildSlots(c);
    for (let n = 0; n < 4 && c.builds.length < limit; n++) {
      const choice = pickBuild(s, c, income, enemyNear(c), wantSettle && c.pop >= 6);
      if (!choice) break;
      const ok = choice.upgrade ? startUpgrade(s, c, choice.upgrade) : choice.kind !== undefined ? startBuild(s, c, choice.kind, choice.tile!) : false;
      if (!ok) break;
    }
  }

  // Settlers: grow to a few cities
  const settlers = s.units.filter((u) => u.owner === owner && u.kind === 'settler');
  for (const st of settlers) {
    if (st.fresh) continue;
    const target = s.map[st.at].neighbors.find((n) => !cityAt(s, n) && !s.units.some((u) => u.at === n && u.owner !== owner));
    if (target !== undefined && canMove(s, st, target)) orderMove(s, [st.id], target);
    else {
      // walk toward any free land
      const step = stepToward(s, st.at, (t) => !cityAt(s, t));
      if (step !== null) orderMove(s, [st.id], step);
    }
  }
  const freeLand = s.map.some((t) => !cityAt(s, t.id));
  if (freeLand && settlers.length === 0 && myCities.length < (easy ? EASY_MAX_CITIES : 6)) {
    const src = myCities.filter((c) => c.pop >= (easy ? 6 : 5) && s.map[c.territory].neighbors.some((n) => !cityAt(s, n)))
      .sort((a, b) => b.pop - a.pop)[0];
    if (src && p.res.food >= 30 && !whyCantTrain(s, src, 'settler')) train(s, src, 'settler');
  }

  // Army: build up to the cap, countering what the enemy has
  const enemyUnits = s.units.filter((u) => u.owner !== owner && u.kind !== 'settler');
  const count = (k: UKind) => enemyUnits.filter((u) => u.kind === k).length;
  const want: UKind[] = [];
  if (count('soldier') >= count('walker') && hasTech(p, 'walkers')) want.push('walker');
  if (count('walker') > 0 && hasTech(p, 'artillery')) want.push('artillery');
  want.push('soldier');
  if (hasTech(p, 'artillery')) want.push('artillery');
  const reserve = { wood: 10, iron: 0 };
  let tries = 0;
  const cap = easy ? Math.min(armyCap(s, owner), easyArmyCap(s.turn)) : armyCap(s, owner);
  while (armyCount(s, owner) < cap && tries++ < 6) {
    const city = myCities.filter((c) => c.buildings.some((b) => b.kind === 'barracks'))
      .sort((a, b) => Number(enemyNear(b)) - Number(enemyNear(a)))[0];
    if (!city) break;
    const kind = want.find((k) => !whyCantTrain(s, city, k));
    if (!kind) break;
    if (p.res.wood < reserve.wood && s.turn < 8) break;
    train(s, city, kind);
  }

  // Movement: attack when the odds are good, otherwise gather at the front
  const stacks = new Map<number, number[]>();
  for (const u of s.units) if (u.owner === owner && u.kind !== 'settler' && !u.fresh) {
    if (!stacks.has(u.at)) stacks.set(u.at, []);
    stacks.get(u.at)!.push(u.id);
  }
  for (const [at, ids] of stacks) {
    if (inPeace(s) || (easy && s.turn < EASY_FIRST_ATTACK)) {
      // peace time: gather toward the front but never step next to danger yet
      continue;
    }
    const units = ids.map((id) => s.units.find((u) => u.id === id)!);
    const home = cityAt(s, at);
    const homeThreat = home && home.owner === owner && enemyNear(home);
    // Easy sends a small group and keeps the rest (at least one) at home
    const group = easy ? units.slice(0, Math.min(easyGroup(s.turn), Math.max(1, units.length - 1))) : units;
    let best: { t: number; odds: number } | null = null;
    for (const n of s.map[at].neighbors) {
      const ec = cityAt(s, n);
      const enemyCity = ec && ec.owner !== owner;
      const enemyArmy = s.units.some((u) => u.at === n && u.owner !== owner && u.kind !== 'settler');
      if (!enemyCity && !enemyArmy) continue;
      if (easy && units.length < 2) continue;
      if (easy && enemyCity && s.turn < EASY_LAST_CITY_TURN && s.cities.filter((c) => c.owner === ec!.owner).length <= 1) continue;
      const odds = forecast(s, group, n, 24);
      const score = odds + (enemyCity ? 8 : 0);
      if (odds >= threshold && (!best || score > best.odds)) best = { t: n, odds: score };
    }
    if (best) {
      // leave one defender at home if it is threatened and we have spare units
      const sending = easy ? group.map((u) => u.id) : homeThreat && units.length > 2 ? ids.slice(1) : ids;
      orderMove(s, sending, best.t);
      continue;
    }
    if (homeThreat) continue; // hold the city
    // not at the front: walk toward the nearest enemy
    // Normal heads for the nearest enemy city or army, so armies meet in the field instead of slipping past each other
    const step = stepToward(s, at, (t) => (cityAt(s, t)?.owner ?? owner) !== owner || (!easy && s.units.some((u) => u.at === t && u.owner !== owner && u.kind !== 'settler')));
    if (step !== null) {
      const target = cityAt(s, step);
      const enemyThere = s.units.some((u) => u.at === step && u.owner !== owner && u.kind !== 'settler') || (target && target.owner !== owner);
      // Normal keeps a small garrison when it marches out of its own city
      const keep = !easy && home && home.owner === owner ? Math.min(2, Math.floor(ids.length / 3)) : 0;
      if (!enemyThere) orderMove(s, ids.slice(keep), step);
    }
  }
}

function stepToward(s: GameState, from: number, goal: (t: number) => boolean): number | null {
  const prev = new Map<number, number>([[from, -1]]);
  const q = [from];
  while (q.length) {
    const t = q.shift()!;
    if (t !== from && goal(t)) {
      let cur = t;
      while (prev.get(cur) !== from) cur = prev.get(cur)!;
      return cur;
    }
    for (const n of s.map[t].neighbors) if (!prev.has(n)) { prev.set(n, t); q.push(n); }
  }
  return null;
}

function pickBuild(s: GameState, c: City, income: Record<Res, number>, threatened: boolean, holdHousing = false):
  { kind?: BKind; tile?: number; upgrade?: City['buildings'][number] } | null {
  const p = s.players[c.owner];
  const has = (k: BKind) => c.buildings.some((b) => b.kind === k);
  const tryNew = (k: BKind) => {
    const res = BUILDINGS[k].produces;
    const tile = res ? bestTileFor(c, res) : freeTiles(c).find((t) => !c.tiles[t].bonus) ?? freeTiles(c)[0];
    if (tile === undefined || whyCantBuild(s, c, k, tile)) return null;
    return { kind: k, tile };
  };
  const tryUp = (k: BKind) => {
    const b = c.buildings.filter((x) => x.kind === k && !whyCantUpgrade(s, c, x))
      .sort((a, b2) => tileBonusStars(c, b2.tile, BUILDINGS[k].produces) - tileBonusStars(c, a.tile, BUILDINGS[k].produces))[0];
    return b ? { upgrade: b } : null;
  };
  // Housing when full
  if (c.pop >= housingCap(s, c) - 1 && !holdHousing) {
    const h = tryUp('housing') || tryUp('center') || tryNew('housing');
    if (h) return h;
  }
  if (!has('barracks') && (threatened || s.cities.filter((x) => x.owner === c.owner).length <= 2)) {
    const b = tryNew('barracks'); if (b) return b;
  }
  if (threatened && !has('tower') && c.buildings.length > 4) { const t = tryNew('tower'); if (t) return t; }
  if (!has('lab')) { const l = tryNew('lab'); if (l) return l; }
  const slots = c.buildings.reduce((n, b) => n + slotsOf(b), 0);
  if (idlePeople(c) > 0 || slots < housingCap(s, c)) {
    // add a job: the resource we make least of
    const needs: Res[] = (['food', 'wood', 'iron', 'energy', 'science'] as Res[])
      .sort((a, b) => income[a] / weightOf(a) - income[b] / weightOf(b));
    for (const r of needs) { const n = tryNew(PRODUCERS[r]); if (n) return n; }
  }
  // Upgrades of producers, then city center, barracks, towers
  for (const k of ['farm', 'mine', 'lumber', 'lab', 'power', 'center', 'barracks', 'housing', 'tower'] as BKind[]) {
    if (holdHousing && (k === 'housing' || k === 'center')) continue;
    const u = tryUp(k); if (u) return u;
  }
  if (freeTiles(c).length && idlePeople(c) >= 0 && c.pop >= housingCap(s, c) - 1) {
    const needs: Res[] = (['food', 'wood', 'iron', 'energy', 'science'] as Res[]).sort((a, b) => income[a] / weightOf(a) - income[b] / weightOf(b));
    for (const r of needs) { const n = tryNew(PRODUCERS[r]); if (n && canAfford(p, BUILDINGS[n.kind].cost[0])) return n; }
  }
  return null;
}
function weightOf(r: Res) { return { food: 4, wood: 3, iron: 3, energy: 1.5, science: 2 }[r]; }
