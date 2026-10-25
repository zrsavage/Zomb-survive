'use strict';
/* ======================================================================
   config.js - every tunable number and data table lives here.
   ====================================================================== */

const T = 16;                    // world pixels per tile
const W = 64, H = 44;            // map size in tiles
const PITCH = 11;                // road grid spacing
const CORE = { x: 34, y: 23 };   // centre tile of the 3x3 camp core
const SAVE_KEY = 'zomb-survive-save-v1';

const DIFFICULTY = {
  easy:   { label: 'Easy',   size: 0.7, gap: 1.3, first: 360, ambient: 0.7 },
  normal: { label: 'Normal', size: 1.0, gap: 1.0, first: 270, ambient: 1.0 },
  hard:   { label: 'Hard',   size: 1.4, gap: 0.8, first: 200, ambient: 1.3 },
};

// ---- structures ---------------------------------------------------------------
// wall[] tile kinds
const K = { WALL: 1, TOWER: 2, LOOKOUT: 3, GATE: 4, RADIO: 5 };
const WALL_HP = { 1: 120, 2: 260, 3: 90, 4: 100, 5: 500 };
const WALL_PATH_COST = 12;       // how much zombies dislike climbing (they take gaps if close)
const COST = {
  wall: { m: 3 }, tower: { m: 12 }, gate: { m: 6 }, lookout: { m: 10 },
  spike: { m: 6 }, barrel: { m: 16 }, radio: { m: 400, f: 120, a: 100 },
};
const RADIO_LEVEL = 4;           // camp level needed to build the radio tower
const RESCUE_TIME = 240;         // seconds you must hold out after the radio goes up
const BUILD_RANGE = 11;          // tiles from the survivor
const PLAYER = { hp: 100, speed: 3.6, sprint: 1.5, wallSlow: 0.45, vision: 10, respawn: 8, deathPenalty: 0.1 };

// Walls hold: zombies never break through, they pile up and climb over the heap.
// Each zombie queued at a wall tile makes the pile higher, so the others climb faster.
const PILE_SPEEDUP = 0.12, PILE_MAX_SPEEDUP = 6, PILE_PRESSURE = 0.02;

const LEVELS = [   // index = camp level - 1
  { cap: 150, defs: 6,  store: 400,  coreHp: 600,  up: { m: 140, f: 60 } },
  { cap: 260, defs: 12, store: 700,  coreHp: 900,  up: { m: 280, f: 120 } },
  { cap: 380, defs: 20, store: 1100, coreHp: 1300, up: { m: 500, f: 200 } },
  { cap: 540, defs: 30, store: 1600, coreHp: 1800, up: { m: 820, f: 320 } },
  { cap: 780, defs: 45, store: 2400, coreHp: 2500, up: null },
];

const BUILDING_TYPES = {
  house:     { label: 'House',     w: 5, rate: { m: 0.45, f: 0.25 }, loot: { m: 12, f: 6,  a: 4 },  roof: ['#a0524a', '#8d4a52', '#96603f', '#7d5a6a'] },
  store:     { label: 'Store',     w: 2, rate: { f: 1.1, m: 0.15 },  loot: { m: 5,  f: 22, a: 2 },  roof: ['#3f7aa6', '#4a8c9a', '#4a6aa0'] },
  garage:    { label: 'Garage',    w: 2, rate: { a: 0.9, m: 0.3 },   loot: { m: 15, f: 2,  a: 22 }, roof: ['#767a84', '#6a6f78', '#80848a'] },
  warehouse: { label: 'Warehouse', w: 2, rate: { m: 1.0, a: 0.25 },  loot: { m: 28, f: 5,  a: 8 },  roof: ['#8a7a48', '#7d7048', '#6f7a52'] },
};
const LOOT_TIME = 3, SURVIVOR_CHANCE = 0.12;

// ---- zombies ---------------------------------------------------------------
const ZTYPES = {
  walker:   { hp: 20,  speed: 1.0,  dmg: 6,  climb: 1.8,  label: 'Walker' },
  runner:   { hp: 16,  speed: 2.3,  dmg: 5,  climb: 1.0,  label: 'Runner' },
  brute:    { hp: 140, speed: 0.75, dmg: 16, climb: 3.0,  label: 'Brute' },
  screamer: { hp: 14,  speed: 1.2,  dmg: 3,  climb: 1.6,  label: 'Screamer' },   // wakes the dead, enrages the horde
  leaper:   { hp: 12,  speed: 1.7,  dmg: 5,  climb: 0.35, label: 'Leaper' },     // vaults walls almost instantly
  bloater:  { hp: 60,  speed: 0.7,  dmg: 8,  climb: 2.4,  label: 'Bloater' },    // bursts when killed
};
const MAX_ZOMBIES = 6000;
const AMBIENT = { start: 320, keep: 260, notice: 7, noise: 12, forget: 17 };
// first appearance wave, max share of a horde, per special type
const HORDE_MIX = [
  { type: 'runner',   from: 3, base: 0.06, perWave: 0.025, max: 0.26 },
  { type: 'brute',    from: 5, base: 0.0,  perWave: 0.012, max: 0.07 },
  { type: 'screamer', from: 4, base: 0.0,  perWave: 0.006, max: 0.04 },
  { type: 'leaper',   from: 6, base: 0.0,  perWave: 0.015, max: 0.11 },
  { type: 'bloater',  from: 7, base: 0.0,  perWave: 0.01,  max: 0.06 },
];
const SCREAM = { gap: 5, radius: 18, rageRadius: 10, rageTime: 4, rageSpeed: 1.35 };
const BLOAT = { radius: 1.9, defDmg: 28, playerDmg: 22, zombieDmg: 12 };

// Hordes: first arrives after DIFFICULTY.first seconds, then at random intervals, growing 1.4x each time.
const HORDE = { gapMin: 55, gapMax: 110, base: 40, growth: 1.4, spawnSecs: 22, finalGapMin: 16, finalGapMax: 28 };
const LOOKOUT = { detect: 16, detectPerLevel: 3, vision: 12 };

// ---- combat ---------------------------------------------------------------
const GUN = { dmg: 24, range: 8, cd: 0.8, towerRange: 11, towerCd: 0.55 };
const MELEE = { dmg: 20, range: 1.6, cd: 0.35 };
const TRAP = {
  spikeUses: 40, spikeDps: 26, spikeWear: 0.12,
  barrelTrigger: 5, barrelRadius: 2.3, barrelDps: 55, barrelBurn: 2.6,
};

// ---- survivors ---------------------------------------------------------------
const ROLES = {
  fighter:   { label: 'Fighter',   letter: 'F', color: '#7aa6d6', weight: 5, desc: 'Reliable on the wall.' },
  sniper:    { label: 'Sniper',    letter: 'S', color: '#8fcf6a', weight: 2, desc: 'Long range, hits hard, fires slowly.' },
  medic:     { label: 'Medic',     letter: 'M', color: '#f0f0f0', weight: 2, desc: 'Heals defenders nearby and cures the sick.' },
  builder:   { label: 'Builder',   letter: 'B', color: '#f0c040', weight: 2, desc: 'Speeds repairs and cuts build costs.' },
  scavenger: { label: 'Scavenger', letter: 'C', color: '#d98a4a', weight: 2, desc: 'Brings back more loot on crew runs.' },
};
const SNIPER = { dmg: 2.2, range: 1.5, cd: 1.4 };
const MEDIC = { heal: 4, radius: 4, playerBonus: 3, cure: 15 };
const BUILDER = { repairBonus: 1.5, discount: 0.1, maxDiscount: 0.3 };
const SICK = { time: 60, treatCost: 15 };
const REFUGEE_GAP = 70;          // seconds between refugees at a sealed, fed camp
const CREW = { baseTime: 18, perTile: 1.6, lootMul: 1.4, perMember: 0.1, scavBonus: 0.35, baseRisk: 0.06, perTileRisk: 1 / 70, ammoCost: 5 };
const NAMES = ['Ash', 'Bea', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal', 'Ivy', 'Jo', 'Kit', 'Lou', 'Mae', 'Ned', 'Oz', 'Pia', 'Quin', 'Rex', 'Sol', 'Tess', 'Uma', 'Vic', 'Wes', 'Yara', 'Zed'];

// ---- research ---------------------------------------------------------------
const RESEARCH = [
  { id: 'walls',   name: 'Reinforced Walls', desc: 'Walls, towers and gates have 35% more health.',     cost: { m: 150 },         time: 40 },
  { id: 'rapid',   name: 'Rapid Fire',       desc: 'Defenders fire 20% faster.',                         cost: { m: 90, a: 80 },   time: 45 },
  { id: 'ap',      name: 'AP Rounds',        desc: 'Bullets deal 30% more damage.',                      cost: { m: 120, a: 120 }, time: 50 },
  { id: 'hands',   name: 'Fast Hands',       desc: 'Stabbing is 35% harder and 15% faster.',             cost: { m: 100 },         time: 40 },
  { id: 'watch',   name: 'Watch Network',    desc: 'Lookouts see 50% farther and reveal more map.',      cost: { m: 130 },         time: 45 },
  { id: 'scav',    name: 'Scavenging Kit',   desc: 'Loot yields +35% and takes 30% less time.',          cost: { m: 90, f: 40 },   time: 35 },
  { id: 'medicine',name: 'Field Medicine',   desc: 'Everyone heals twice as fast, medics too.',          cost: { m: 80, f: 60 },   time: 40 },
];

// ---- events ---------------------------------------------------------------
const EVENTS = {
  gapMin: 80, gapMax: 150, firstAt: 150,
  crateLife: 180, crateLoot: { m: 40, f: 16, a: 30 },
  traderTime: 90, storm: 70,
  trades: [
    { label: '15 materials -> 25 ammo', give: { m: 15 }, get: { a: 25 } },
    { label: '15 materials -> 20 food', give: { m: 15 }, get: { f: 20 } },
    { label: '20 ammo -> 30 materials', give: { a: 20 }, get: { m: 30 } },
    { label: '20 food -> 30 materials', give: { f: 20 }, get: { m: 30 } },
  ],
};

// ---- colours / lighting ---------------------------------------------------------------
const LIGHT = {
  ambient: [10, 16, 34], ambientAlpha: 0.52, stormAlpha: 0.72, dangerTint: [40, 8, 10],
};

// ---- quality / device ---------------------------------------------------------------
// 'low' is the default on phones: cheaper lighting, no ground fog, fewer particles and a smaller zombie cap.
const QUALITY = {
  high: { name: 'high', dprMax: 2,   light: 3, fog: true,  shadows: true,  parts: 700, maxZ: 6000 },
  low:  { name: 'low',  dprMax: 1.5, light: 5, fog: false, shadows: false, parts: 260, maxZ: 2200 },
};
const Q = Object.assign({}, QUALITY.high);
function setQuality(name) { Object.assign(Q, QUALITY[name] || QUALITY.high); try { localStorage.setItem('zomb-quality', Q.name); } catch (e) { /* ignore */ } }
