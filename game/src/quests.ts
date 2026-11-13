// Starred quests: small goals that teach the game by playing it. Each one done earns a star and a little gift.
import { BKind, Res, Stock } from './data';
import { armyCount, GameState, TurnEvent } from './game';

export interface QuestState { done: string[]; won: number; captured: number; chests?: number }
export interface Quest {
  id: string; icon: string; text: string; tip: string; reward: Stock;
  /** [how far along, how many needed] for player 0 */
  progress: (s: GameState, q: QuestState) => [number, number];
}

const ME = 0;
const mine = (s: GameState) => s.cities.filter((c) => c.owner === ME);
const countB = (s: GameState, k: BKind, minLevel = 1) => mine(s).reduce((n, c) => n + c.buildings.filter((b) => b.kind === k && b.level >= minLevel).length, 0);
const anyLevel = (s: GameState, lvl: number) => mine(s).some((c) => c.buildings.some((b) => b.kind !== 'center' && b.level >= lvl));
const has = (s: GameState, k: BKind, min = 1): [number, number] => [Math.min(min, countB(s, k)), min];

export const QUESTS: Quest[] = [
  { id: 'farm2', icon: '🌾', text: 'Build a second Field', tip: 'Open your city and tap Field. Gold tiles give extra food.', reward: { wood: 15 }, progress: (s) => has(s, 'farm', 2) },
  { id: 'mine', icon: '⛏️', text: 'Build a Mine', tip: 'Mines make iron for soldiers. Grey mountain tiles are best.', reward: { food: 15 }, progress: (s) => has(s, 'mine') },
  { id: 'tech1', icon: '🧪', text: 'Finish your first research', tip: 'Science adds up each turn. Tap the research button to pick a goal.', reward: { energy: 10 }, progress: (s) => [Math.min(1, s.players[ME].techs.length), 1] },
  { id: 'camp', icon: '🛡️', text: 'Build a Camp', tip: 'A Camp lets that city train soldiers.', reward: { iron: 15 }, progress: (s) => has(s, 'barracks') },
  { id: 'magic', icon: '✨', text: 'Build a Magic Cottage', tip: 'One per city. It makes science and energy with no workers, and zaps attackers.', reward: { energy: 15 }, progress: (s) => has(s, 'magic') },
  { id: 'army4', icon: '🪖', text: 'Have 4 army units', tip: 'Train soldiers in a city with a Camp.', reward: { food: 20 }, progress: (s) => [Math.min(4, armyCount(s, ME)), 4] },
  { id: 'chest', icon: '🎁', text: 'Open a treasure chest', tip: 'Chests sit on empty land. Drag an army or settler onto one.', reward: { food: 10 }, progress: (s, q) => [Math.min(1, q.chests ?? 0), 1] },
  { id: 'city2', icon: '🚩', text: 'Start a second city', tip: 'Train a Settler (the city needs 3 people), then drag it to an empty land next door.', reward: { wood: 25, iron: 15 }, progress: (s) => [Math.min(2, mine(s).length), 2] },
  { id: 'up2', icon: '⬆️', text: 'Upgrade a building to 2 stars', tip: 'Tap a building in your city, then Upgrade. Some need research first.', reward: { iron: 20 }, progress: (s) => [anyLevel(s, 2) ? 1 : 0, 1] },
  { id: 'pop8', icon: '👥', text: 'Grow a city to 8 people', tip: 'Cities grow with food. Build homes when a city is full.', reward: { food: 25 }, progress: (s) => [Math.min(8, Math.max(0, ...mine(s).map((c) => c.pop))), 8] },
  { id: 'win1', icon: '⚔️', text: 'Win a battle', tip: 'After the peace turns, drag an army onto an enemy. Check the odds first!', reward: { iron: 20, food: 10 }, progress: (s, q) => [Math.min(1, q.won), 1] },
  { id: 'hall', icon: '🏛️', text: 'Upgrade a City Center to a Town Hall', tip: 'Needs City Planning research. A Town Hall gives one more builder.', reward: { wood: 30 }, progress: (s) => [Math.min(1, countB(s, 'center', 2)), 1] },
  { id: 'city3', icon: '🏙️', text: 'Have 3 cities', tip: 'More cities, more of everything.', reward: { wood: 30, iron: 30 }, progress: (s) => [Math.min(3, mine(s).length), 3] },
  { id: 'spell', icon: '🔮', text: 'Upgrade a Magic Cottage to a Spell Tower', tip: 'Needs Engines research.', reward: { energy: 25 }, progress: (s) => [Math.min(1, countB(s, 'magic', 2)), 1] },
  { id: 'farms5', icon: '🌽', text: 'Have 5 Fields', tip: 'Food feeds big cities and big armies.', reward: { wood: 30 }, progress: (s) => has(s, 'farm', 5) },
  { id: 'capture', icon: '🏰', text: 'Capture an enemy city', tip: 'Bring a big army. Walkers beat militia, artillery beats towers.', reward: { iron: 40, energy: 20 }, progress: (s, q) => [Math.min(1, q.captured), 1] },
  { id: 'star', icon: '⭐', text: 'Build a Star Castle', tip: 'The top level of the Magic Cottage. Needs Fusion research.', reward: { science: 40 }, progress: (s) => [Math.min(1, countB(s, 'magic', 3)), 1] },
];

/** The quest record lives in the save, so stars stay when you come back. */
export function questState(s: GameState): QuestState {
  const any = s as GameState & { qs?: QuestState };
  if (!any.qs) any.qs = { done: [], won: 0, captured: 0 };
  return any.qs;
}
export const starsEarned = (s: GameState) => questState(s).done.length;
/** The next few goals to show. */
export function activeQuests(s: GameState, n = 3) {
  const q = questState(s);
  return QUESTS.filter((x) => !q.done.includes(x.id)).slice(0, n);
}
/** Count battles won and cities taken this turn. */
export function noteEvents(s: GameState, ev: TurnEvent[]) {
  const q = questState(s);
  for (const e of ev) if (e.kind === 'treasure' && e.player === ME) q.chests = (q.chests ?? 0) + 1;
  for (const e of ev) if (e.kind === 'battle') {
    const winner = e.result.winner === 0 ? e.attacker : e.defender;
    if (winner === ME) q.won++;
    if (e.captured && e.attacker === ME) q.captured++;
  }
}
/** Mark finished quests and hand out their gifts. Returns the quests just finished. */
export function checkQuests(s: GameState): Quest[] {
  const q = questState(s);
  const p = s.players[ME];
  const fresh: Quest[] = [];
  for (const x of QUESTS) {
    if (q.done.includes(x.id)) continue;
    const [a, b] = x.progress(s, q);
    if (a < b) continue;
    q.done.push(x.id);
    for (const r of Object.keys(x.reward) as Res[]) p.res[r] += x.reward[r] ?? 0;
    fresh.push(x);
  }
  return fresh;
}
