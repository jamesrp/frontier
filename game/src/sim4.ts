// Multi-player and new-race checks: who wins, and do games finish?
import { newGame, endTurn, GameState } from './game';
import { aiPlan } from './ai';
import { RACE_ORDER, RaceId } from './data';
declare const process: any;
const N = Number(process.argv[2] || 20);
const only = process.argv[3] ? process.argv[3].split(',').map(Number) : [2, 3, 4];
for (const players of only) {
  const wins: Record<string, number> = {}; let turns = 0, stall = 0;
  const t0 = Date.now();
  for (let g = 0; g < N; g++) {
    const race = RACE_ORDER[g % 4];
    const rest = RACE_ORDER.filter((r) => r !== race);
    const k = Math.floor(g / 4) % 3;
    const foes = [...rest.slice(k), ...rest.slice(0, k)] as RaceId[];
    const s: GameState = newGame({ race, difficulty: 'normal', seed: 900 + g, aiVsAi: true, players, foes });
    while (s.winner === null && s.turn < 150) { s.players.forEach((p) => aiPlan(s, p.id)); endTurn(s); }
    const w = s.winner === null ? '-' : s.players[s.winner].race; wins[w] = (wins[w] || 0) + 1;
    if (s.winner === null) stall++; else turns += s.turn;
  }
  console.log(players, 'players', JSON.stringify(wins), 'avg turns', (turns / Math.max(1, N - stall)).toFixed(0), 'unfinished', stall, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
