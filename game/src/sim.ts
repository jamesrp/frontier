import { newGame, endTurn, GameState } from './game';
import { aiPlan } from './ai';
const N = Number(process.argv[2] || 20);
const results: any[] = [];
for (let g = 0; g < N; g++) {
  const s: GameState = newGame({ race: g % 2 ? 'seers' : 'ironhorn', difficulty: 'normal', seed: 100 + g, aiVsAi: true });
  let battles = 0, founds = 0;
  while (s.winner === null && s.turn < 150) {
    aiPlan(s, 0); aiPlan(s, 1);
    const ev = endTurn(s);
    battles += ev.filter(e => e.kind === 'battle').length;
    founds += ev.filter(e => e.kind === 'found').length;
    if (g === 0 && s.turn % 10 === 0) console.log('t', s.turn, s.players.map(p => `${p.race}: cities ${s.cities.filter(c=>c.owner===p.id).length} pop ${s.cities.filter(c=>c.owner===p.id).reduce((a,c)=>a+c.pop,0)} army ${s.units.filter(u=>u.owner===p.id&&u.kind!=='settler').length} techs ${p.techs.length} res ${JSON.stringify(p.res)}`).join(' | '));
  }
  results.push({ seed: 100 + g, p0: s.players[0].race, winner: s.winner === null ? '-' : s.players[s.winner].race, turns: s.turn, battles, founds });
}
console.table(results);
const wins: any = {}; results.forEach(r => wins[r.winner] = (wins[r.winner] || 0) + 1); console.log(wins);
