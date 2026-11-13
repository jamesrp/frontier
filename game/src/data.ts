// All game numbers live here, so balance changes never touch the rules code.

export type Res = 'food' | 'wood' | 'iron' | 'energy' | 'science';
export const RES_LIST: Res[] = ['food', 'wood', 'iron', 'energy', 'science'];
export type Stock = Partial<Record<Res, number>>;

export const RES_INFO: Record<Res, { name: string; icon: string; color: string; what: string }> = {
  food: { name: 'Food', icon: '🌾', color: '#e8c547', what: 'Grows your cities and trains soldiers and settlers.' },
  wood: { name: 'Wood', icon: '🪵', color: '#b9824a', what: 'Main building material.' },
  iron: { name: 'Iron', icon: '⛓️', color: '#9fb3c8', what: 'For bigger buildings and war machines.' },
  energy: { name: 'Energy', icon: '⚡', color: '#7ee0ff', what: 'Powers upgrades, walkers and artillery.' },
  science: { name: 'Science', icon: '🧪', color: '#c9a2ff', what: 'Researches new technology.' },
};

export type Terrain = 'plains' | 'forest' | 'mountains' | 'crystal';
export const TERRAIN: Record<Terrain, { name: string; bonus: Res; fill: string; deco: string; tile: string }> = {
  plains: { name: 'Plains', bonus: 'food', fill: '#8a8a3c', deco: '🌾', tile: '#9c9a4a' },
  forest: { name: 'Forest', bonus: 'wood', fill: '#2f6b3f', deco: '🌲', tile: '#3d7a4a' },
  mountains: { name: 'Mountains', bonus: 'iron', fill: '#6b5a50', deco: '⛰️', tile: '#7b6a5e' },
  crystal: { name: 'Crystal Flats', bonus: 'energy', fill: '#2c6f78', deco: '💎', tile: '#3a808a' },
};

export type BKind = 'center' | 'housing' | 'farm' | 'lumber' | 'mine' | 'power' | 'lab' | 'barracks' | 'tower' | 'magic';
export type TechId = 'tools' | 'engines' | 'civics' | 'walkers' | 'artillery' | 'fort' | 'industry' | 'fusion' | 'capitol';

export interface BDef {
  kind: BKind;
  names: [string, string, string];
  icon: string;
  color: string; // body color
  produces?: Res;
  workers?: [number, number, number];
  perWorker?: [number, number, number];
  housing?: [number, number, number];
  armyCap?: [number, number, number];
  tower?: { hp: [number, number, number]; atk: [number, number, number] };
  flat?: [Stock, Stock, Stock]; // output with no workers needed
  cost: [Stock, Stock, Stock];
  turns: [number, number, number];
  tech: [TechId | null, TechId | null, TechId | null];
  height: [number, number, number];
  buildable: boolean; // false for the City Center (founded, never placed)
  unique?: boolean; // only one per city
  blurb: string;
}

/** Extra output from a bonus tile, per level, for a building that makes that tile's resource. */
export const TILE_BONUS = [2, 3, 4];

export const BUILDINGS: Record<BKind, BDef> = {
  center: {
    kind: 'center', names: ['Outpost', 'Town Hall', 'Capitol'], icon: '🏛️', color: '#c9b37a',
    housing: [4, 8, 12], armyCap: [4, 6, 8],
    flat: [{ food: 2, wood: 2, iron: 2, energy: 1, science: 2 }, { food: 3, wood: 3, iron: 3, energy: 2, science: 3 }, { food: 4, wood: 4, iron: 4, energy: 3, science: 4 }],
    tower: { hp: [24, 40, 60], atk: [3, 5, 8] },
    cost: [{}, { wood: 30, iron: 30, energy: 10 }, { wood: 60, iron: 60, energy: 30 }],
    turns: [0, 2, 3], tech: [null, 'civics', 'capitol'], height: [34, 52, 72], buildable: false,
    blurb: 'The heart of a city. Makes a little of everything, gives homes and army room, and fights back with militia when enemies attack.',
  },
  housing: {
    kind: 'housing', names: ['Huts', 'Apartments', 'Sky Tower'], icon: '🏠', color: '#d98f6a',
    housing: [4, 8, 12],
    cost: [{ wood: 12 }, { wood: 20, iron: 12 }, { wood: 30, iron: 30, energy: 15 }],
    turns: [1, 2, 2], tech: [null, 'engines', 'fusion'], height: [16, 30, 50], buildable: true,
    blurb: 'More homes, so the city can grow bigger.',
  },
  farm: {
    kind: 'farm', names: ['Field', 'Orchard', 'Hydro Farm'], icon: '🌾', color: '#a7b84a', produces: 'food',
    workers: [2, 3, 4], perWorker: [3, 4, 5],
    cost: [{ wood: 10 }, { wood: 15, iron: 10 }, { wood: 25, iron: 25, energy: 10 }],
    turns: [1, 2, 2], tech: [null, 'tools', 'industry'], height: [6, 14, 26], buildable: true,
    blurb: 'Makes food. Best on golden plains tiles.',
  },
  lumber: {
    kind: 'lumber', names: ['Lumber Camp', 'Sawmill', 'Timber Works'], icon: '🪵', color: '#8c6239', produces: 'wood',
    workers: [2, 3, 4], perWorker: [3, 4, 5],
    cost: [{ food: 10 }, { wood: 10, iron: 12 }, { wood: 20, iron: 25, energy: 10 }],
    turns: [1, 2, 2], tech: [null, 'tools', 'industry'], height: [14, 24, 36], buildable: true,
    blurb: 'Makes wood. Best on forest tiles.',
  },
  mine: {
    kind: 'mine', names: ['Mine', 'Deep Mine', 'Core Drill'], icon: '⛏️', color: '#6f7480', produces: 'iron',
    workers: [2, 3, 4], perWorker: [3, 4, 5],
    cost: [{ wood: 15 }, { wood: 20, iron: 10 }, { wood: 30, iron: 25, energy: 10 }],
    turns: [1, 2, 2], tech: [null, 'tools', 'industry'], height: [12, 22, 40], buildable: true,
    blurb: 'Makes iron. Best on mountain tiles.',
  },
  power: {
    kind: 'power', names: ['Windmill', 'Generator', 'Fusion Plant'], icon: '⚡', color: '#4fb0c6', produces: 'energy',
    workers: [1, 2, 3], perWorker: [3, 4, 5],
    cost: [{ wood: 15, iron: 5 }, { wood: 15, iron: 20 }, { wood: 20, iron: 40, energy: 10 }],
    turns: [1, 2, 2], tech: [null, 'engines', 'fusion'], height: [28, 30, 44], buildable: true,
    blurb: 'Makes energy. Best on crystal tiles.',
  },
  lab: {
    kind: 'lab', names: ['School', 'University', 'Quantum Lab'], icon: '🔬', color: '#9a7fd1', produces: 'science',
    workers: [2, 3, 4], perWorker: [2, 3, 4],
    cost: [{ wood: 15, iron: 10 }, { wood: 20, iron: 20, energy: 5 }, { wood: 30, iron: 40, energy: 20 }],
    turns: [1, 2, 2], tech: [null, 'engines', 'fusion'], height: [20, 32, 48], buildable: true,
    blurb: 'Makes science for research. Labs get no tile bonus.',
  },
  barracks: {
    kind: 'barracks', names: ['Camp', 'Barracks', 'War Academy'], icon: '🛡️', color: '#b0563f',
    armyCap: [2, 4, 6],
    cost: [{ wood: 15, iron: 10 }, { wood: 20, iron: 25 }, { wood: 30, iron: 50, energy: 20 }],
    turns: [1, 2, 2], tech: [null, 'civics', 'capitol'], height: [16, 26, 38], buildable: true,
    blurb: 'Lets this city train fighters and raises your army limit.',
  },
  tower: {
    kind: 'tower', names: ['Watchtower', 'Laser Tower', 'Ion Cannon'], icon: '🗼', color: '#8d99a6',
    tower: { hp: [20, 32, 48], atk: [3, 5, 8] },
    cost: [{ wood: 15, iron: 10 }, { wood: 15, iron: 25, energy: 5 }, { wood: 20, iron: 45, energy: 20 }],
    turns: [1, 2, 2], tech: [null, 'fort', 'fusion'], height: [40, 54, 66], buildable: true,
    blurb: 'Shoots at enemies who attack this city.',
  },
  // Jay's idea: a magic house with three levels
  magic: {
    kind: 'magic', names: ['Magic Cottage', 'Spell Tower', 'Star Castle'], icon: '✨', color: '#7d5bd0',
    housing: [2, 4, 6],
    flat: [{ science: 2, energy: 1 }, { science: 4, energy: 2 }, { science: 7, energy: 4 }],
    tower: { hp: [10, 20, 32], atk: [2, 4, 6] },
    cost: [{ wood: 25, energy: 10 }, { wood: 30, iron: 20, energy: 20 }, { wood: 40, iron: 40, energy: 40 }],
    turns: [2, 3, 3], tech: [null, 'engines', 'fusion'], height: [30, 50, 74], buildable: true, unique: true,
    blurb: 'One per city. A home for a wizard: a few people live here, it makes science and energy with no workers, and it zaps attackers with magic.',
  },
};
export const BUILD_ORDER: BKind[] = ['farm', 'lumber', 'mine', 'power', 'lab', 'housing', 'magic', 'barracks', 'tower', 'center'];

export type UKind = 'settler' | 'soldier' | 'walker' | 'artillery';
export type CombatKind = 'soldier' | 'walker' | 'artillery' | 'militia' | 'tower';

export interface UDef {
  kind: UKind; name: string; icon: string; hp: number; atk: number; cost: Stock; tech: TechId | null;
  beats: CombatKind[]; blurb: string; popCost?: number;
}
export const UNITS: Record<UKind, UDef> = {
  settler: { kind: 'settler', name: 'Settler', icon: '🚩', hp: 0, atk: 0, cost: { food: 25, wood: 10 }, tech: null, beats: [], popCost: 2,
    blurb: 'Walks to an empty territory next door and starts a new city. Uses 2 people from the city.' },
  soldier: { kind: 'soldier', name: 'Soldier', icon: '🪖', hp: 12, atk: 3, cost: { food: 10, iron: 8 }, tech: null, beats: ['artillery'],
    blurb: 'Cheap and quick. Strong against artillery.' },
  walker: { kind: 'walker', name: 'Walker', icon: '🤖', hp: 26, atk: 4, cost: { iron: 18, wood: 6, energy: 6 }, tech: 'walkers', beats: ['soldier', 'militia'],
    blurb: 'Big armored robot. Strong against soldiers and militia.' },
  artillery: { kind: 'artillery', name: 'Artillery', icon: '🎯', hp: 9, atk: 6, cost: { wood: 12, iron: 12, energy: 6 }, tech: 'artillery', beats: ['walker', 'tower'],
    blurb: 'Long-range cannon. Strong against walkers and towers.' },
};
export const COMBAT_UNITS: UKind[] = ['soldier', 'walker', 'artillery'];
export const COUNTER_MULT = 2;
export const MILITIA = { hp: 9, atk: 2, icon: '🧑‍🌾' };

export interface TechDef { id: TechId; name: string; icon: string; cost: number; tier: number; req: TechId[]; unlocks: string }
export const TECHS: Record<TechId, TechDef> = {
  tools: { id: 'tools', name: 'Better Tools', icon: '🔧', cost: 20, tier: 1, req: [], unlocks: 'Orchard, Sawmill, Deep Mine' },
  engines: { id: 'engines', name: 'Engines', icon: '⚙️', cost: 25, tier: 1, req: [], unlocks: 'Generator, University, Apartments' },
  civics: { id: 'civics', name: 'City Planning', icon: '📐', cost: 30, tier: 1, req: [], unlocks: 'Town Hall, Barracks' },
  walkers: { id: 'walkers', name: 'Walker Mechs', icon: '🤖', cost: 35, tier: 2, req: ['tools'], unlocks: 'Walker unit' },
  artillery: { id: 'artillery', name: 'Artillery', icon: '🎯', cost: 35, tier: 2, req: ['engines'], unlocks: 'Artillery unit' },
  fort: { id: 'fort', name: 'Fortress Walls', icon: '🧱', cost: 35, tier: 2, req: ['civics'], unlocks: 'Laser Tower' },
  industry: { id: 'industry', name: 'Heavy Industry', icon: '🏭', cost: 70, tier: 3, req: ['walkers'], unlocks: 'Hydro Farm, Timber Works, Core Drill' },
  fusion: { id: 'fusion', name: 'Fusion Power', icon: '☀️', cost: 70, tier: 3, req: ['artillery'], unlocks: 'Fusion Plant, Quantum Lab, Sky Tower, Ion Cannon' },
  capitol: { id: 'capitol', name: 'Grand Capitol', icon: '👑', cost: 80, tier: 3, req: ['fort'], unlocks: 'Capitol, War Academy' },
};
export const TECH_ORDER: TechId[] = ['tools', 'engines', 'civics', 'walkers', 'artillery', 'fort', 'industry', 'fusion', 'capitol'];

export type RaceId = 'ironhorn' | 'seers' | 'hivekin' | 'rootfolk';
export const RACE_ORDER: RaceId[] = ['ironhorn', 'seers', 'hivekin', 'rootfolk'];
export interface RaceDef {
  id: RaceId; name: string; icon: string; color: string; roof: string; tagline: string;
  traits: { title: string; text: string }[];
  prodMult: Partial<Record<Res, number>>;
  unitHpMult: Partial<Record<UKind, number>>;
  unitAtkMult: Partial<Record<UKind, number>>;
  housingMult: number;
  mindSway: boolean;
  /** Buildings finish this many turns sooner (never under 1 turn). */
  buildFaster?: number;
  /** Army units (not settlers) cost this much of the normal price. */
  unitCostMult?: number;
  /** Units fighting in a territory with their own city get this much more health. */
  homeHpMult?: number;
  /** Army limit is this much bigger. */
  armyCapMult?: number;
  /** Extra food each new person costs. */
  growExtra?: number;
  cityNames: string[];
}
export const RACES: Record<RaceId, RaceDef> = {
  ironhorn: {
    id: 'ironhorn', name: 'Ironhorn', icon: '🐂', color: '#e0662f', roof: '#7a2f18',
    tagline: 'Huge horned giants who farm big and hit hard.',
    traits: [
      { title: 'Mighty Soldiers', text: 'Soldiers have 40% more health and 25% more attack.' },
      { title: 'Big Farms', text: 'Farms make 50% more food.' },
      { title: 'Slow Thinkers', text: 'Labs make 25% less science.' },
    ],
    prodMult: { food: 1.5, science: 0.75 }, unitHpMult: { soldier: 1.4 }, unitAtkMult: { soldier: 1.25 }, housingMult: 1, mindSway: false,
    cityNames: ['Hornhold', 'Anvil Rock', 'Stompford', 'Bullgate', 'Rustmoor', 'Bigfield', 'Thunderhoof'],
  },
  seers: {
    id: 'seers', name: 'Seers', icon: '🔮', color: '#9b6bff', roof: '#3b2a7a',
    tagline: 'Small glowing-eyed psychics who out-think everyone.',
    traits: [
      { title: 'Mind Sway', text: 'In a battle with 3 or more Seers units, the strongest enemy unit switches to the Seers side.' },
      { title: 'Deep Thinkers', text: 'Labs make 50% more science.' },
      { title: 'Fragile', text: 'Seers units have 15% less health, and homes hold 25% fewer people.' },
    ],
    prodMult: { science: 1.5 }, unitHpMult: { soldier: 0.85, walker: 0.85, artillery: 0.85 }, unitAtkMult: {}, housingMult: 0.75, mindSway: true,
    cityNames: ['Glimmerspire', 'Veilhaven', 'Starwell', 'Mindmere', 'Prism Hollow', 'Dreamfall', 'Lumen Gate'],
  },
  hivekin: {
    id: 'hivekin', name: 'Hivekin', icon: '🐝', color: '#f2c014', roof: '#3a2a12',
    tagline: 'Buzzing beetle folk who build fast and swarm in numbers.',
    traits: [
      { title: 'Busy Builders', text: 'Buildings and upgrades finish 1 turn faster.' },
      { title: 'Swarm', text: 'Army units cost 25% less, and your army can be 50% bigger.' },
      { title: 'Stingers', text: 'Soldiers hit 20% harder, but every Hivekin unit has 10% less health.' },
    ],
    prodMult: {}, unitHpMult: { soldier: 0.9, walker: 0.9, artillery: 0.9 }, unitAtkMult: { soldier: 1.2 }, housingMult: 1, mindSway: false,
    buildFaster: 1, unitCostMult: 0.75, armyCapMult: 1.5,
    cityNames: ['Honeycomb', 'Buzzborough', 'Waxwell', 'Stingmoor', 'Nectar Hill', 'Droneport', 'Amberhive'],
  },
  rootfolk: {
    id: 'rootfolk', name: 'Rootfolk', icon: '🌿', color: '#3fcf6a', roof: '#8a5a1c',
    tagline: 'Walking mossy plants with deep roots and rich land.',
    traits: [
      { title: 'Rich Roots', text: 'Lumber and mines make 30% more. Farms make 15% more.' },
      { title: 'Deep Roots', text: 'Units fighting where they have a city get 25% more health.' },
      { title: 'Slow Sprouts', text: 'Each new person costs 4 more food.' },
    ],
    prodMult: { wood: 1.3, iron: 1.3, food: 1.15 }, unitHpMult: {}, unitAtkMult: {}, housingMult: 1, mindSway: false,
    homeHpMult: 1.25, growExtra: 4,
    cityNames: ['Mossheart', 'Thornvale', 'Oakroot', 'Fernwick', 'Bramblegate', 'Sproutholm', 'Willowmere'],
  },
};

export type Focus = 'balanced' | 'grow' | 'build' | 'science' | 'war';
export const FOCUS: Record<Focus, { name: string; icon: string; weights: Partial<Record<Res, number>>; text: string }> = {
  balanced: { name: 'Balanced', icon: '⚖️', weights: {}, text: 'Workers spread out over every job.' },
  grow: { name: 'Grow', icon: '🌱', weights: { food: 3 }, text: 'Workers go to farms first.' },
  build: { name: 'Build', icon: '🔨', weights: { wood: 2.5, iron: 2.5 }, text: 'Workers go to lumber and mines first.' },
  science: { name: 'Science', icon: '🧪', weights: { science: 3 }, text: 'Workers go to labs first.' },
  war: { name: 'War', icon: '⚔️', weights: { iron: 2.5, energy: 2.5, food: 1.5 }, text: 'Workers make iron, energy and food for armies.' },
};

export const START_RES: Record<Res, number> = { food: 30, wood: 40, iron: 25, energy: 10, science: 0 };
export function growCost(pop: number) { return 6 + pop; }
