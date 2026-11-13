import { CombatKind, COUNTER_MULT, RaceDef, UNITS } from './data';
import { Rng } from './mapgen';

export interface Fighter {
  id: string; side: 0 | 1; kind: CombatKind; owner: number; unitId?: number;
  hp: number; maxHp: number; atk: number; vet: number; icon: string;
}
export interface Shot { from: string; to: string; dmg: number; kill: boolean; counter: boolean }
export interface BattleResult {
  fighters: Fighter[]; // starting line-up (after Mind Sway), with starting hp
  sway: { id: string; toSide: 0 | 1 } | null;
  rounds: Shot[][];
  winner: 0 | 1; // 0 = attackers win, 1 = defenders hold
  survivors: Record<string, number>; // fighter id -> hp left (alive only)
}

const MAX_ROUNDS = 12;
/** Mind Sway needs at least this many Seers units in the battle. */
export const SWAY_MIN = 3;

export function beats(a: CombatKind, b: CombatKind) {
  if (a === 'militia' || a === 'tower') return false;
  return UNITS[a].beats.includes(b);
}

export function simulateBattle(input: Fighter[], races: [RaceDef, RaceDef], rng: Rng): BattleResult {
  const fighters = input.map((f) => ({ ...f }));
  let sway: BattleResult['sway'] = null;
  for (const side of [0, 1] as const) {
    if (sway) break;
    const race = races[side];
    const hasUnit = fighters.filter((f) => f.side === side && f.unitId !== undefined).length >= SWAY_MIN;
    if (!race.mindSway || !hasUnit) continue;
    const targets = fighters.filter((f) => f.side !== side && f.unitId !== undefined);
    if (!targets.length) continue;
    targets.sort((a, b) => b.maxHp * b.atk - a.maxHp * a.atk);
    targets[0].side = side;
    sway = { id: targets[0].id, toSide: side };
  }
  const start = fighters.map((f) => ({ ...f }));
  const rounds: Shot[][] = [];
  const alive = (s: 0 | 1) => fighters.filter((f) => f.side === s && f.hp > 0);
  for (let r = 0; r < MAX_ROUNDS; r++) {
    if (!alive(0).length || !alive(1).length) break;
    const order = fighters.filter((f) => f.hp > 0 && f.atk > 0).map((f) => ({ f, k: rng.next() })).sort((a, b) => a.k - b.k).map((x) => x.f);
    const shots: Shot[] = [];
    for (const f of order) {
      if (f.hp <= 0) continue;
      const foes = alive((1 - f.side) as 0 | 1);
      if (!foes.length) break;
      foes.sort((a, b) => {
        const ca = beats(f.kind, a.kind) ? 0 : 1, cb = beats(f.kind, b.kind) ? 0 : 1;
        return ca - cb || a.hp - b.hp;
      });
      const t = foes[0];
      const counter = beats(f.kind, t.kind);
      const dmg = Math.max(1, Math.round(f.atk * (counter ? COUNTER_MULT : 1) * rng.range(0.8, 1.2)));
      t.hp = Math.max(0, t.hp - dmg);
      shots.push({ from: f.id, to: t.id, dmg, kill: t.hp === 0, counter });
    }
    rounds.push(shots);
  }
  const winner: 0 | 1 = alive(1).length === 0 && alive(0).length > 0 ? 0 : 1;
  const survivors: Record<string, number> = {};
  for (const f of fighters) if (f.hp > 0) survivors[f.id] = f.hp;
  return { fighters: start, sway, rounds, winner, survivors };
}
