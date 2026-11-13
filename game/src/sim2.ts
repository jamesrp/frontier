import { newGame, endTurn, cityOutput } from './game';
import { aiPlan } from './ai';
const s = newGame({ race: 'ironhorn', difficulty: 'normal', seed: 100, aiVsAi: true });
for (let i = 0; i < 16 && s.winner === null; i++) {
  aiPlan(s, 0); aiPlan(s, 1);
  for (const c of s.cities.filter(c => c.owner === 0)) console.log('T', s.turn, c.name, 'pop', c.pop, c.buildings.map(b => `${b.kind}${b.level}w${b.workers}`).join(' '), 'cons', c.construction?.kind, JSON.stringify(cityOutput(s, c)), JSON.stringify(s.players[0].res), 'units', s.units.filter(u=>u.owner===0).map(u=>u.kind+'@'+u.at+(u.moveTo!==null?'->'+u.moveTo:'')).join(','));
  endTurn(s);
}
