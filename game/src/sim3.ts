// Easy-mode check: how long does a slow or passive player last against the Easy opponent?
import { newGame, endTurn, GameState } from './game';
import { aiPlan } from './ai';
const N = Number(process.argv[2] || 20);
const PLAYERS = Number(process.argv[3] || 2);
declare const process: any;
for (const model of ['passive', 'slow', 'steady'] as const) {
  const lost: number[] = []; let firstAttack: number[] = []; let survived = 0; let won = 0;
  for (let g = 0; g < N; g++) {
    const s: GameState = newGame({ race: g % 2 ? 'seers' : 'ironhorn', difficulty: 'easy', seed: 500 + g, aiVsAi: true, players: PLAYERS });
    let first = 0;
    while (s.winner === null && s.turn < 80) {
      if ((model === 'slow' && s.turn % 2 === 0) || model === 'steady') aiPlan(s, 0);
      for (const p of s.players) if (p.id !== 0) aiPlan(s, p.id);
      const ev = endTurn(s);
      if (!first && ev.some((e) => e.kind === 'battle' && e.attacker !== 0 && e.defender === 0)) first = s.turn - 1;
    }
    if (first) firstAttack.push(first);
    if (!s.players[0].alive) lost.push(s.turn - 1); else if (s.winner === 0) won++; else survived++;
  }
  const avg = (a: number[]) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-';
  console.log(model, { games: N, lostBy80: lost.length, wonBy80: won, stillGoing: survived, avgLossTurn: avg(lost), earliestLoss: lost.length ? Math.min(...lost) : '-', avgFirstAttack: avg(firstAttack), earliestAttack: firstAttack.length ? Math.min(...firstAttack) : '-' });
}
