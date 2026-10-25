'use strict';

/* ======================================================================
   Zomb Survive - solo-survivor base-builder / wall-defense
   No day/night: hordes arrive on their own schedule and you only get
   warning if you have lookouts. You scavenge, scout, fortify and recruit.
   ====================================================================== */

// ---- tuning ---------------------------------------------------------------
const T = 16;                    // sprite pixels per world tile
const W = 64, H = 44;            // map size in tiles
const PITCH = 11;                // road grid spacing
const CORE = { x: 34, y: 23 };   // centre tile of the 3x3 camp core

const COST = { wall: { m: 3 }, tower: { m: 12 }, lookout: { m: 10 } };
const WALL_PATH_COST = 12;       // how much zombies dislike climbing (they take gaps if close)
const WALL_HP = { 1: 120, 2: 260, 3: 90 };
const BUILD_RANGE = 11;          // tiles from the survivor
const PLAYER = { hp: 100, speed: 3.6, sprint: 1.5, wallSlow: 0.45, vision: 10 };

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
  house:     { label: 'House',     w: 5, rate: { m: 0.45, f: 0.25 }, loot: { m: 12, f: 6,  a: 4 },  roof: ['#a0524a', '#8d4a52', '#96603f'] },
  store:     { label: 'Store',     w: 2, rate: { f: 1.1, m: 0.15 },  loot: { m: 5,  f: 22, a: 2 },  roof: ['#3f7aa6', '#4a8c9a'] },
  garage:    { label: 'Garage',    w: 2, rate: { a: 0.9, m: 0.3 },   loot: { m: 15, f: 2,  a: 22 }, roof: ['#767a84', '#6a6f78'] },
  warehouse: { label: 'Warehouse', w: 2, rate: { m: 1.0, a: 0.25 },  loot: { m: 28, f: 5,  a: 8 },  roof: ['#8a7a48', '#7d7048'] },
};
const LOOT_TIME = 3, SURVIVOR_CHANCE = 0.12;

const ZTYPES = {
  walker: { hp: 20,  speed: 1.0,  dmg: 6,  climb: 1.8, scale: 1.0 },
  runner: { hp: 16,  speed: 2.3,  dmg: 5,  climb: 1.0, scale: 0.9 },
  brute:  { hp: 140, speed: 0.75, dmg: 16, climb: 3.0, scale: 1.5 },
};
const MAX_ZOMBIES = 6000;
const AMBIENT = { start: 320, keep: 260, notice: 7, noise: 12, forget: 17 };

// Hordes: first one arrives after HORDE.first seconds, then at random intervals, growing 1.4x each time.
const HORDE = { first: 270, gapMin: 55, gapMax: 110, base: 40, growth: 1.4, spawnSecs: 22 };
const LOOKOUT = { detect: 16, detectPerLevel: 3, vision: 12 };

const GUN = { dmg: 24, range: 8, cd: 0.8, towerRange: 11, towerCd: 0.55 };
const MELEE = { dmg: 20, range: 1.6, cd: 0.35 };
const REFUGEE_GAP = 70;          // seconds between refugees at a sealed, fed camp

// ---- helpers ----------------------------------------------------------------
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
let rng = Math.random;
const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const isCoreTile = (x, y) => Math.abs(x - CORE.x) <= 1 && Math.abs(y - CORE.y) <= 1;
const COMPASS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
const compass = (dx, dy) => COMPASS[Math.round(Math.atan2(dy, dx) / (Math.PI / 4) + 8) % 8];

// ---- world state ---------------------------------------------------------------
const ground = new Uint8Array(W * H);          // 0 grass, 1 road, 2 park
const bld = new Int16Array(W * H);             // building index or -1
const wall = new Uint8Array(W * H);            // 0 none, 1 wall, 2 tower, 3 lookout
const wallHp = new Float32Array(W * H);
const claimed = new Uint8Array(W * H);
const explored = new Uint8Array(W * H);
const vis = new Uint8Array(W * H);             // currently in sight
const dist = new Float32Array(W * H), nextTile = new Int32Array(W * H);     // flow field to the camp
const pdist = new Float32Array(W * H), pnext = new Int32Array(W * H);       // flow field to the survivor
let buildings = [];
let defAt = new Array(W * H).fill(null);
let zombies = [], defenders = [], hordes = [], tracers = [], parts = [];
let P = null;                                  // the survivor
let G = null;                                  // game state

// ---- town generation ---------------------------------------------------------------
function genTown() {
  bld.fill(-1); ground.fill(0); buildings = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if (x % PITCH < 2 || y % PITCH < 2) ground[y * W + x] = 1;

  const blockXs = [2, 13, 24, 35, 46, 57], blockYs = [2, 13, 24, 35];
  const typeBag = [];
  for (const k in BUILDING_TYPES) for (let i = 0; i < BUILDING_TYPES[k].w; i++) typeBag.push(k);

  for (const by of blockYs) for (const bx of blockXs) {
    const bw = Math.min(9, W - bx), bh = Math.min(9, H - by);
    const nearCore = bx <= CORE.x + 5 && bx + bw >= CORE.x - 5 && by <= CORE.y + 5 && by + bh >= CORE.y - 5;
    if (!nearCore && rng() < 0.13) {            // park block
      for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) ground[y * W + x] = 2;
      continue;
    }
    const placed = [];
    for (let t = 0; t < 16; t++) {
      const w = 3 + (rng() * 4 | 0), h = 3 + (rng() * 3 | 0);
      if (w > bw - 2 || h > bh - 2) continue;
      const x = bx + 1 + (rng() * (bw - 1 - w) | 0), y = by + 1 + (rng() * (bh - 1 - h) | 0);
      if (x + w > CORE.x - 6 && x < CORE.x + 7 && y + h > CORE.y - 6 && y < CORE.y + 7) continue;
      if (placed.some(p => x < p.x + p.w + 1 && x + w + 1 > p.x && y < p.y + p.h + 1 && y + h + 1 > p.y)) continue;
      placed.push({ x, y, w, h });
    }
    for (const p of placed) {
      const type = typeBag[rng() * typeBag.length | 0];
      const roofs = BUILDING_TYPES[type].roof;
      const b = { ...p, type, roof: roofs[rng() * roofs.length | 0], claimed: false, looted: false };
      const id = buildings.push(b) - 1;
      for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) bld[y * W + x] = id;
    }
  }
}

// ---- pixel art ---------------------------------------------------------------
function makeSprite(rows, pal) {
  const c = document.createElement('canvas');
  c.width = rows[0].length; c.height = rows.length;
  const g = c.getContext('2d');
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
    const col = pal[rows[y][x]];
    if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
  }
  return c;
}
const ZOMBIE_ROWS = [
  '...GGG...', '..GGGGG..', '..GrGrG..', '..GGGGG..', '...GGG...', '.CCCCCCC.',
  'GCCCCCCCG', 'G.CCCCC.G', '..PPPPP..', '..P...P..', '..P...P..'];
const DEF_ROWS = [
  '...HHH...', '..HHHHH..', '..SSSSS..', '...SSS...', '.BBBBBBB.', 'SBBBBBBBK',
  '.BBBBBBKK', '..BBBBB..', '..PP.PP..', '..PP.PP..', '..KK.KK..'];
let SPR = {};
function buildSprites() {
  SPR.walker = makeSprite(ZOMBIE_ROWS, { G: '#7aa65a', r: '#e84a3a', C: '#6b5a7a', P: '#3f4a5c' });
  SPR.walker2 = makeSprite(ZOMBIE_ROWS, { G: '#8fb066', r: '#e84a3a', C: '#7a6a52', P: '#4a4a42' });
  SPR.runner = makeSprite(ZOMBIE_ROWS, { G: '#b5a45a', r: '#ff3b2a', C: '#a8483c', P: '#3a3a3a' });
  SPR.brute = makeSprite(ZOMBIE_ROWS, { G: '#5a7a4a', r: '#ffcc22', C: '#3a3f4a', P: '#2a2d34' });
  SPR.def = makeSprite(DEF_ROWS, { H: '#4a5560', S: '#e0b48a', B: '#3f7fb8', K: '#2a2a2e', P: '#4a5a40' });
  SPR.player = makeSprite(DEF_ROWS, { H: '#7a5a3a', S: '#e0b48a', B: '#e0842b', K: '#2a2a2e', P: '#3a4a60' });
}

let terrain, claimLayer, decals, miniTerrain;
const fogCanvas = document.createElement('canvas'); fogCanvas.width = W; fogCanvas.height = H;
const fogCtx = fogCanvas.getContext('2d'), fogImg = fogCtx.createImageData(W, H);
function renderTerrain() {
  terrain = document.createElement('canvas'); terrain.width = W * T; terrain.height = H * T;
  const g = terrain.getContext('2d');
  const r = mulberry32(1234);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = ground[y * W + x];
    const base = k === 1 ? ['#3b3f44', '#363a3f', '#41454a'] : k === 2 ? ['#3f6b3a', '#3a6435', '#447440'] : ['#4a5c3a', '#465736', '#4f6340'];
    g.fillStyle = base[r() * 3 | 0]; g.fillRect(x * T, y * T, T, T);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = base[r() * 3 | 0]; g.globalAlpha = 0.8;
      g.fillRect(x * T + (r() * T | 0), y * T + (r() * T | 0), 1 + (r() * 2 | 0), 1);
    }
    g.globalAlpha = 1;
  }
  g.fillStyle = '#6d6a50';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (ground[y * W + x] !== 1) continue;
    if (x % PITCH === 1 && y % PITCH >= 2 && (y % 2 === 0)) g.fillRect(x * T, y * T + 3, 1, 6);
    if (y % PITCH === 1 && x % PITCH >= 2 && (x % 2 === 0)) g.fillRect(x * T + 3, y * T, 6, 1);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (ground[y * W + x] !== 2 || r() > 0.14) continue;
    const px = x * T + 8, py = y * T + 8;
    g.fillStyle = '#4a3a24'; g.fillRect(px - 1, py + 1, 2, 5);
    g.fillStyle = '#2b5a2a'; g.fillRect(px - 5, py - 5, 10, 8);
    g.fillStyle = '#356b32'; g.fillRect(px - 4, py - 6, 8, 3);
  }
  for (const b of buildings) {
    const x = b.x * T, y = b.y * T, w = b.w * T, h = b.h * T;
    g.fillStyle = '#00000055'; g.fillRect(x + 2, y + 2, w, h);
    g.fillStyle = b.roof; g.fillRect(x, y, w, h);
    g.fillStyle = '#ffffff22'; g.fillRect(x, y, w, 2);
    g.fillStyle = '#00000044'; g.fillRect(x, y + h - 2, w, 2); g.fillRect(x + w - 2, y, 2, h);
    g.fillStyle = '#00000033';
    for (let i = 1; i < b.w; i++) g.fillRect(x + i * T - 1, y + 2, 1, h - 4);
    if (b.type === 'store') { g.fillStyle = '#e8d070'; g.fillRect(x + 3, y + h - 6, w - 6, 3); }
    if (b.type === 'garage') { g.fillStyle = '#4a4e56'; g.fillRect(x + w / 2 - 8, y + h - 7, 16, 5); }
    if (b.type === 'warehouse') { g.fillStyle = '#5e5233'; g.fillRect(x + 4, y + 4, 6, 6); g.fillRect(x + w - 10, y + 4, 6, 6); }
    if (b.type === 'house') { g.fillStyle = '#3a2a22'; g.fillRect(x + w / 2 - 2, y + h - 6, 4, 5); }
  }
  const cx = (CORE.x - 1) * T, cy = (CORE.y - 1) * T;
  g.fillStyle = '#5a5a52'; g.fillRect(cx - 2, cy - 2, T * 3 + 4, T * 3 + 4);

  decals = document.createElement('canvas'); decals.width = W * T; decals.height = H * T;
  claimLayer = document.createElement('canvas'); claimLayer.width = W * T; claimLayer.height = H * T;
  miniTerrain = document.createElement('canvas'); miniTerrain.width = W; miniTerrain.height = H;
  const m = miniTerrain.getContext('2d'); m.imageSmoothingEnabled = true; m.drawImage(terrain, 0, 0, W, H);
}

function renderClaim() {
  const g = claimLayer.getContext('2d');
  g.clearRect(0, 0, claimLayer.width, claimLayer.height);
  g.fillStyle = 'rgba(90,170,255,0.13)';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (claimed[y * W + x]) g.fillRect(x * T, y * T, T, T);
  for (const b of buildings) if (b.claimed) {
    g.fillStyle = 'rgba(110,210,120,0.22)'; g.fillRect(b.x * T, b.y * T, b.w * T, b.h * T);
    g.strokeStyle = 'rgba(140,240,150,0.7)'; g.lineWidth = 1;
    g.strokeRect(b.x * T + 0.5, b.y * T + 0.5, b.w * T - 1, b.h * T - 1);
  }
}

// ---- flow fields (Dijkstra, walls are expensive-but-passable) ---------------------------
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const N4 = NB.slice(0, 4);
function stepCost(i) {
  if (bld[i] >= 0) return Infinity;
  return wall[i] ? WALL_PATH_COST : 1;
}
function diagOpen(x, y, dx, dy) {
  const a = y * W + (x + dx), b = (y + dy) * W + x;
  return bld[a] < 0 && bld[b] < 0 && !wall[a] && !wall[b];
}
function computeField(sources, D, N) {
  D.fill(Infinity); N.fill(-1);
  const heap = [];
  const push = (d, i) => {
    heap.push([d, i]);
    let k = heap.length - 1;
    while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last; let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1; let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m;
      }
    }
    return top;
  };
  for (const i of sources) { D[i] = 0; push(0, i); }
  while (heap.length) {
    const [d, i] = pop();
    if (d > D[i]) continue;
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of NB) {
      const nx = x + dx, ny = y + dy;
      if (!inb(nx, ny)) continue;
      if (dx && dy && !diagOpen(x, y, dx, dy)) continue;
      const ni = ny * W + nx;
      if (bld[ni] >= 0) continue;
      const nd = d + (dx && dy ? 1.414 : 1) * stepCost(i);   // a zombie on ni pays to enter tile i
      if (nd < D[ni]) { D[ni] = nd; push(nd, ni); }
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (D[i] === Infinity || D[i] === 0) continue;
    let best = Infinity, bi = -1;
    for (const [dx, dy] of NB) {
      const nx = x + dx, ny = y + dy;
      if (!inb(nx, ny)) continue;
      if (dx && dy && !diagOpen(x, y, dx, dy)) continue;
      const ni = ny * W + nx;
      if (D[ni] < best) { best = D[ni]; bi = ni; }
    }
    N[i] = bi;
  }
}
function computeBaseField() {
  const src = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) src.push((CORE.y + dy) * W + CORE.x + dx);
  computeField(src, dist, nextTile);
}
function computePlayerField() {
  const tx = clamp(P.px | 0, 0, W - 1), ty = clamp(P.py | 0, 0, H - 1);
  computeField([ty * W + tx], pdist, pnext);
}

// ---- territory ---------------------------------------------------------------
function computeTerritory() {
  claimed.fill(0);
  for (const b of buildings) b.claimed = false;
  const cap = LEVELS[G.level - 1].cap;
  const q = [];
  const start = (x, y) => { const i = y * W + x; if (inb(x, y) && !claimed[i] && !isCoreTile(x, y) && bld[i] < 0 && !wall[i]) { claimed[i] = 1; q.push(i); } };
  for (let d = -2; d <= 2; d++) { start(CORE.x + d, CORE.y - 2); start(CORE.x + d, CORE.y + 2); start(CORE.x - 2, CORE.y + d); start(CORE.x + 2, CORE.y + d); }
  let count = q.length, sealed = true;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of N4) {
      const nx = x + dx, ny = y + dy;
      if (!inb(nx, ny)) { sealed = false; continue; }
      const ni = ny * W + nx;
      if (claimed[ni] || bld[ni] >= 0 || wall[ni] || isCoreTile(nx, ny)) continue;
      if (count >= cap) { sealed = false; continue; }
      claimed[ni] = 1; q.push(ni); count++;
    }
  }
  const inc = { m: 0, f: 0, a: 0 };
  let held = 0;
  const mult = 1 + 0.15 * (G.level - 1);
  for (const i of q) {
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of N4) {
      const nx = x + dx, ny = y + dy;
      if (inb(nx, ny) && bld[ny * W + nx] >= 0) buildings[bld[ny * W + nx]].claimed = true;
    }
  }
  for (const b of buildings) if (b.claimed) {
    held++;
    const r = BUILDING_TYPES[b.type].rate;
    inc.m += (r.m || 0) * mult; inc.f += (r.f || 0) * mult; inc.a += (r.a || 0) * mult;
  }
  G.territory = count; G.sealed = sealed; G.income = inc; G.held = held;
  renderClaim();
}

// ---- vision / fog of war ---------------------------------------------------------------
const lookoutR = () => LOOKOUT.detect + LOOKOUT.detectPerLevel * (G.level - 1);
function reveal(cx, cy, r) {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    if (dx * dx + dy * dy <= r2) { const i = y * W + x; vis[i] = 1; explored[i] = 1; }
  }
}
function updateVision() {
  vis.fill(0);
  reveal(P.px, P.py, PLAYER.vision);
  reveal(CORE.x + 0.5, CORE.y + 0.5, 8);
  for (const d of defenders) reveal(d.px, d.py, 7);
  G.lookouts = [];
  for (let i = 0; i < W * H; i++) if (wall[i] === 3) {
    const x = i % W + 0.5, y = ((i / W) | 0) + 0.5;
    G.lookouts.push({ x, y }); reveal(x, y, LOOKOUT.vision);
  }
  const d = fogImg.data;
  for (let i = 0; i < W * H; i++) {
    d[i * 4] = 4; d[i * 4 + 1] = 7; d[i * 4 + 2] = 11;
    d[i * 4 + 3] = vis[i] ? 0 : explored[i] ? 125 : 255;
  }
  fogCtx.putImageData(fogImg, 0, 0);
}

// ---- game setup ---------------------------------------------------------------
function newGame() {
  rng = mulberry32((Math.random() * 2 ** 31) | 0);
  genTown();
  wall.fill(0); wallHp.fill(0); explored.fill(0); vis.fill(0);
  defAt = new Array(W * H).fill(null);
  zombies = []; defenders = []; hordes = []; tracers = []; parts = [];
  G = {
    level: 1, ammo: 40, mat: 45, food: 30, idle: 0,
    coreHp: LEVELS[0].coreHp, kills: 0, elapsed: 0,
    hordeN: 0, hordesBeaten: 0, nextHorde: HORDE.first, hordeId: 0,
    over: false, paused: false, speed: 1, tool: 'wall',
    territory: 0, sealed: false, income: { m: 0, f: 0, a: 0 }, held: 0, lookouts: [],
    fieldDirty: true, fieldTimer: 0, pfTimer: 0, repairT: 0, hudT: 0, visT: 0, scanT: 0, refugeeT: REFUGEE_GAP,
    ambientT: 0, visibleZ: 0,
    cam: { x: CORE.x + 0.5, y: CORE.y + 3, zoom: 2.4, free: false },
    net: { a: 0, m: 0, f: 0 }, hordeMsg: null,
  };
  P = { px: CORE.x + 0.5, py: CORE.y + 2.8, hp: PLAYER.hp, cd: 0, mcd: 0, face: 1, shot: 0, stab: 0, loot: 0, lootB: -1, hurt: 0, noiseT: 0 };
  renderTerrain();
  computeBaseField(); computePlayerField(); computeTerritory();
  seedAmbient();
  updateVision();
  toast('You are alone. Scavenge buildings (hold E), scout, and fortify before the first horde.');
}

const maxHp = k => WALL_HP[k] * (1 + 0.25 * (G.level - 1));
function setWall(x, y, k) { const i = y * W + x; wall[i] = k; wallHp[i] = maxHp(k); }
function addDefender(x, y) {
  const i = y * W + x;
  if (!wall[i] || defAt[i]) return false;
  const d = { x, y, px: x + 0.5, py: y + 0.5, hp: 60, cd: 0, mcd: 0, face: 1, shot: 0, noiseT: 0 };
  defAt[i] = d; defenders.push(d); return true;
}
function removeDefender(d) { defAt[d.y * W + d.x] = null; defenders.splice(defenders.indexOf(d), 1); }

// ---- zombies: spawning ---------------------------------------------------------------
function makeZombie(x, y, mode, h) {
  const n = G.hordeN;
  let type = 'walker';
  if (mode === 2) {
    const r = rng();
    if (n >= 5 && r < Math.min(0.015 * n, 0.1)) type = 'brute';
    else if (n >= 3 && r < Math.min(0.06 + 0.025 * n, 0.3)) type = 'runner';
  } else if (rng() < 0.05) type = 'runner';
  const zt = ZTYPES[type];
  return {
    x, y, type, hp: zt.hp, mode, h: h || 0, lose: 0, wt: 0, wx: 0, wy: 0,
    speed: zt.speed * (0.85 + rng() * 0.3), climb: 0, lift: 0, anim: rng() * 6, face: 1,
    variant: rng() < 0.5 ? 'walker' : 'walker2',
  };
}
function seedAmbient() {
  let made = 0;
  for (let c = 0; c < 400 && made < AMBIENT.start; c++) {
    const cx = rng() * W | 0, cy = rng() * H | 0;
    if (Math.max(Math.abs(cx - CORE.x), Math.abs(cy - CORE.y)) < 13) continue;
    const n = 6 + (rng() * 8 | 0);
    for (let k = 0; k < n; k++) {
      const x = cx + (rng() - 0.5) * 6, y = cy + (rng() - 0.5) * 6;
      if (!inb(x | 0, y | 0)) continue;
      const i = (y | 0) * W + (x | 0);
      if (bld[i] >= 0 || dist[i] === Infinity) continue;
      zombies.push(makeZombie(x, y, 0)); made++;
    }
  }
}
function spawnAmbient() {          // trickle in zombies out of sight so the town never empties
  for (let t = 0; t < 10; t++) {
    const x = rng() * W | 0, y = rng() * H | 0, i = y * W + x;
    if (bld[i] >= 0 || wall[i] || dist[i] === Infinity || vis[i] || claimed[i]) continue;
    zombies.push(makeZombie(x + 0.5, y + 0.5, 0)); return;
  }
}
function startHorde() {
  const n = ++G.hordeN;
  const size = Math.round(HORDE.base * Math.pow(HORDE.growth, n - 1) * (0.9 + rng() * 0.2));
  hordes.push({ id: ++G.hordeId, n, side: rng() * 4 | 0, pos: rng(), left: size, total: size, acc: 0, seen: false, heard: false, announced: false, alive: 0, near: Infinity, cx: 0, cy: 0 });
  G.nextHorde = (HORDE.gapMin + rng() * (HORDE.gapMax - HORDE.gapMin)) * Math.max(0.6, 1 - 0.03 * n);
}
function spawnHordeZombie(h) {
  if (zombies.length >= MAX_ZOMBIES) return;
  for (let t = 0; t < 12; t++) {
    const along = (h.pos + (rng() - 0.5) * 0.18 + 1) % 1;
    const s = h.side;
    const x = s === 0 ? 0 : s === 1 ? W - 1 : (along * W | 0);
    const y = s === 2 ? 0 : s === 3 ? H - 1 : (along * H | 0);
    const i = y * W + x;
    if (bld[i] >= 0 || wall[i] || dist[i] === Infinity) continue;
    zombies.push(makeZombie(x + 0.3 + rng() * 0.4, y + 0.3 + rng() * 0.4, 2, h.id)); return;
  }
}

// ---- zombies: behaviour ---------------------------------------------------------------
const cellHead = new Int32Array(W * H), cellNext = [];
let pile = new Uint16Array(W * H), pileNow = new Uint16Array(W * H);
function updateZombies(dt) {
  const n = zombies.length;
  cellHead.fill(-1); cellNext.length = n;
  for (let k = 0; k < n; k++) {
    const z = zombies[k], c = (z.y | 0) * W + (z.x | 0);
    cellNext[k] = cellHead[c]; cellHead[c] = k;
  }
  const cx = CORE.x + 0.5, cy = CORE.y + 0.5;
  [pile, pileNow] = [pileNow, pile]; pileNow.fill(0);
  let seen = 0;
  for (let k = n - 1; k >= 0; k--) {
    const z = zombies[k], zt = ZTYPES[z.type];
    if (z.hp <= 0) { killZombie(k); continue; }
    const tx = z.x | 0, ty = z.y | 0, ti = ty * W + tx;
    z.anim += dt * z.speed * 4;
    z.lift = 0;
    if (vis[ti]) seen++;

    // bite the survivor
    const pdx = P.px - z.x, pdy = P.py - z.y;
    if (pdx * pdx + pdy * pdy < 0.5) {
      P.hp -= zt.dmg * dt; P.hurt = 1.5; z.face = pdx > 0 ? 1 : -1;
      if (P.hp <= 0 && !G.over) gameOver('The survivor was overrun');
      continue;
    }
    // bite a defender (only once the zombie is up on the wall tile beside them)
    let target = null;
    if (defenders.length) {
      for (let dy = -1; dy <= 1 && !target; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = tx + dx, ny = ty + dy;
        if (!inb(nx, ny)) continue;
        const d = defAt[ny * W + nx], dd = d ? Math.hypot(d.px - z.x, d.py - z.y) : 9;
        if (d && dd < 0.95 && (wall[ti] > 0 || dd < 0.6)) { target = d; break; }
      }
    }
    if (target) {
      target.hp -= zt.dmg * dt; target.hurt = 0.2;
      z.face = target.px > z.x ? 1 : -1;
      if (target.hp <= 0) { removeDefender(target); addBurst(target.px, target.py, '#e8524a', 8); }
      continue;
    }
    if (Math.hypot(z.x - cx, z.y - cy) < 2.2) {
      G.coreHp -= zt.dmg * dt; z.face = cx > z.x ? 1 : -1;
      if (G.coreHp <= 0 && !G.over) gameOver('The camp has fallen');
      continue;
    }

    // idle zombies shuffle about until they notice the survivor
    if (z.mode === 0) {
      if (pdx * pdx + pdy * pdy < AMBIENT.notice * AMBIENT.notice) { z.mode = 1; z.lose = 0; continue; }
      z.wt -= dt;
      if (z.wt <= 0) { z.wt = 1.5 + rng() * 3; const a = rng() * 6.283; z.wx = Math.cos(a); z.wy = Math.sin(a); if (rng() < 0.4) { z.wx = 0; z.wy = 0; } }
      stepMove(z, z.wx * 0.35 * dt, z.wy * 0.35 * dt, false);
      if (z.wx) z.face = z.wx > 0 ? 1 : -1;
      continue;
    }
    let D = dist, N = nextTile;
    if (z.mode === 1) {
      D = pdist; N = pnext;
      if (pdx * pdx + pdy * pdy > AMBIENT.forget * AMBIENT.forget) { z.lose += dt; if (z.lose > 5) { z.mode = 0; continue; } } else z.lose = 0;
    }
    if (D[ti] === Infinity) { if (z.mode === 1) z.mode = 0; else { zombies[k] = zombies[zombies.length - 1]; zombies.pop(); } continue; }

    let tcx, tcy, ni = -1;
    if (N[ti] < 0) { tcx = P.px; tcy = P.py; }                // standing on the target tile
    else { ni = N[ti]; tcx = ni % W + 0.5; tcy = ((ni / W) | 0) + 0.5; }
    const dx = tcx - z.x, dy = tcy - z.y, dd = Math.hypot(dx, dy) || 1;
    const onWall = wall[ti] > 0;

    if (ni >= 0 && wall[ni] && !onWall && Math.max(Math.abs(dx), Math.abs(dy)) <= 0.9) {
      // queue at the wall and climb over the pile
      const p = pile[ni];
      pileNow[ni]++;
      z.lift = Math.min(10, p * 0.25);
      wallHp[ni] -= PILE_PRESSURE * p * dt;
      if (wallHp[ni] <= 1) wallHp[ni] = 1;                    // walls hold
      z.face = dx > 0 ? 1 : -1;
      z.climb += dt * Math.min(PILE_MAX_SPEEDUP, 1 + p * PILE_SPEEDUP);
      if (z.climb >= zt.climb) { z.climb = 0; z.lift = 0; z.x = tcx + (rng() - 0.5) * 0.3; z.y = tcy + (rng() - 0.5) * 0.3; }
      separate(k, z, dt);
      continue;
    }
    const sp = z.speed * dt;
    stepMove(z, dx / dd * sp, dy / dd * sp, onWall);
    if (Math.abs(dx) > 0.01) z.face = dx > 0 ? 1 : -1;
    separate(k, z, dt);
  }
  G.visibleZ = seen;
}
function stepMove(z, mx, my, onWall) {
  const free = (x, y) => {
    if (!inb(x | 0, y | 0)) return false;
    const i = (y | 0) * W + (x | 0);
    if (bld[i] >= 0 || isCoreTile(x | 0, y | 0)) return false;
    if (wall[i] && !onWall && !(((z.x | 0) === (x | 0)) && ((z.y | 0) === (y | 0)))) return false;
    return true;
  };
  if (free(z.x + mx, z.y)) z.x += mx;
  if (free(z.x, z.y + my)) z.y += my;
}
function separate(k, z, dt) {
  const tx = z.x | 0, ty = z.y | 0;
  let px = 0, py = 0, seen = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = tx + dx, ny = ty + dy;
    if (!inb(nx, ny)) continue;
    for (let j = cellHead[ny * W + nx]; j >= 0 && seen < 4; j = cellNext[j]) {
      if (j === k) continue;
      const o = zombies[j]; if (!o) continue;
      const ox = z.x - o.x, oy = z.y - o.y, d2 = ox * ox + oy * oy;
      if (d2 < 0.2 && d2 > 0.0001) { const d = Math.sqrt(d2), f = (0.45 - d) / d; px += ox * f; py += oy * f; seen++; }
    }
  }
  if (seen) stepMove(z, px * dt * 2.2, py * dt * 2.2, wall[(z.y | 0) * W + (z.x | 0)] > 0);
}
function killZombie(k) {
  const z = zombies[k];
  G.kills++;
  if (rng() < 0.1) G.mat = Math.min(storeCap(), G.mat + 1);
  if (rng() < 0.03) G.food = Math.min(storeCap(), G.food + 1);
  const g = decals.getContext('2d');
  g.fillStyle = rng() < 0.5 ? '#6a1c1c' : '#4a2a1a'; g.globalAlpha = 0.7;
  for (let i = 0; i < 4; i++) g.fillRect(z.x * T + (rng() - 0.5) * 8, z.y * T + (rng() - 0.5) * 8, 1 + (rng() * 2 | 0), 1 + (rng() * 2 | 0));
  g.globalAlpha = 1;
  addBurst(z.x, z.y, '#7a1c1c', 3);
  zombies[k] = zombies[zombies.length - 1]; zombies.pop();
}
function alertNoise(x, y, r, mode) {           // gunfire draws idle zombies in
  const r2 = r * r;
  for (const z of zombies) {
    if (z.mode !== 0) continue;
    const dx = z.x - x, dy = z.y - y;
    if (dx * dx + dy * dy < r2) { z.mode = mode; z.lose = 0; }
  }
}

// ---- fighting (shared by defenders and the survivor) ---------------------------------------------------------------
function fight(e, dt, o) {
  e.cd -= dt; e.mcd -= dt; e.shot -= dt; e.noiseT -= dt;
  if (!zombies.length) return;
  let near = null, nd = MELEE.range * MELEE.range;
  for (let j = 0; j < zombies.length; j++) {
    const z = zombies[j], dx = z.x - e.px, dy = z.y - e.py, q = dx * dx + dy * dy;
    if (z.hp > 0 && q < nd) { nd = q; near = z; }
  }
  if (near) {
    e.face = near.x >= e.px ? 1 : -1;
    if (e.mcd <= 0) {
      e.mcd = MELEE.cd * (o.starving ? 1.7 : 1);
      near.hp -= MELEE.dmg; e.stab = 0.15;
      addBurst(near.x, near.y, '#9ad06a', 2);
      tracers.push({ x1: near.x - 0.25, y1: near.y - 0.3, x2: near.x + 0.25, y2: near.y + 0.1, life: 0.1, slash: true });
      if (near.mode === 0) { near.mode = o.noiseMode; near.lose = 0; }
    }
    return;
  }
  if (e.cd > 0 || G.ammo < 1) return;
  let best = null, bd = o.range * o.range;
  for (let j = 0; j < zombies.length; j++) {
    const z = zombies[j]; if (z.hp <= 0) continue;
    const dx = z.x - e.px, dy = z.y - e.py, q = dx * dx + dy * dy;
    if (q < bd) { bd = q; best = z; }
  }
  if (best) {
    G.ammo -= 1; best.hp -= GUN.dmg; e.shot = 0.08;
    e.cd = o.cd * (o.starving ? 1.8 : 1) * (0.9 + rng() * 0.2);
    e.face = best.x >= e.px ? 1 : -1;
    tracers.push({ x1: e.px, y1: e.py - 0.2, x2: best.x, y2: best.y - 0.2, life: 0.09 });
    addBurst(best.x, best.y, '#c33', 1);
    if (e.noiseT <= 0) { e.noiseT = 0.6; alertNoise(e.px, e.py, AMBIENT.noise, o.noiseMode); }
  }
}
function updateDefenders(dt) {
  const starving = G.food <= 0;
  for (let k = defenders.length - 1; k >= 0; k--) {
    const d = defenders[k];
    if (d.hurt) d.hurt -= dt;
    const tower = wall[d.y * W + d.x] === 2;
    fight(d, dt, { starving, noiseMode: 2, range: tower ? GUN.towerRange : GUN.range, cd: tower ? GUN.towerCd : GUN.cd });
  }
}
function addBurst(x, y, color, n) {
  if (parts.length > 500) return;
  for (let i = 0; i < n; i++) parts.push({ x, y, vx: (rng() - 0.5) * 3, vy: (rng() - 0.5) * 3 - 0.5, life: 0.25 + rng() * 0.25, color });
}

// ---- the survivor ---------------------------------------------------------------
const keys = {};
function playerFree(x, y) {
  const tx = x | 0, ty = y | 0;
  return inb(tx, ty) && bld[ty * W + tx] < 0 && !isCoreTile(tx, ty);
}
function nearBuilding() {
  let best = null, bd = 1.7;
  for (const b of buildings) {
    const dx = Math.max(b.x - P.px, 0, P.px - (b.x + b.w)), dy = Math.max(b.y - P.py, 0, P.py - (b.y + b.h));
    const d = Math.hypot(dx, dy);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
function updatePlayer(dt) {
  let mx = 0, my = 0;
  if (keys.w || keys.arrowup) my -= 1;
  if (keys.s || keys.arrowdown) my += 1;
  if (keys.a || keys.arrowleft) mx -= 1;
  if (keys.d || keys.arrowright) mx += 1;
  const moving = mx || my;
  if (moving) {
    G.cam.free = false;
    const onWall = wall[(P.py | 0) * W + (P.px | 0)] > 0;
    const sp = PLAYER.speed * (keys.shift ? PLAYER.sprint : 1) * (onWall ? PLAYER.wallSlow : 1) * dt / Math.hypot(mx, my);
    if (playerFree(P.px + mx * sp, P.py)) P.px += mx * sp;
    if (playerFree(P.px, P.py + my * sp)) P.py += my * sp;
    if (mx) P.face = mx > 0 ? 1 : -1;
  }
  P.hurt -= dt; if (P.stab > 0) P.stab -= dt;
  const safe = claimed[(P.py | 0) * W + (P.px | 0)] || Math.hypot(P.px - CORE.x, P.py - CORE.y) < 6;
  if (P.hurt <= 0) P.hp = Math.min(PLAYER.hp, P.hp + (safe ? 2.5 : 0.3) * dt);

  // scavenging: hold E beside a building
  const b = nearBuilding();
  if (keys.e && b && !b.looted && !moving) {
    const bi = buildings.indexOf(b);
    if (P.lootB !== bi) { P.lootB = bi; P.loot = 0; }
    P.loot += dt;
    if (P.loot >= LOOT_TIME) { scavenge(b); P.loot = 0; P.lootB = -1; }
  } else { P.loot = 0; P.lootB = -1; }

  const tile = wall[(P.py | 0) * W + (P.px | 0)];
  fight(P, dt, { starving: false, noiseMode: 1, range: tile === 2 ? GUN.towerRange : GUN.range, cd: GUN.cd * 0.75 });
}
function scavenge(b) {
  b.looted = true;
  const t = BUILDING_TYPES[b.type], got = [];
  const roll = v => Math.round(v * (0.7 + rng() * 0.6));
  const m = roll(t.loot.m), f = roll(t.loot.f), a = roll(t.loot.a);
  G.mat = Math.min(storeCap(), G.mat + m); G.food = Math.min(storeCap(), G.food + f); G.ammo = Math.min(storeCap(), G.ammo + a);
  if (m) got.push('+' + m + ' materials'); if (f) got.push('+' + f + ' food'); if (a) got.push('+' + a + ' ammo');
  let msg = t.label + ': ' + got.join(', ');
  if (rng() < SURVIVOR_CHANCE && G.idle + defenders.length < LEVELS[G.level - 1].defs) { G.idle++; msg += ' - and a survivor was hiding inside! They follow you back.'; }
  toast(msg);
}

// ---- economy ---------------------------------------------------------------
const storeCap = () => LEVELS[G.level - 1].store;
function updateEconomy(dt) {
  const mouths = G.idle + defenders.length;
  const upkeep = 0.05 * mouths;
  const base = 1 + 0.3 * (G.level - 1);
  const ra = G.income.a + 0.04 * base, rm = G.income.m + 0.1 * base, rf = G.income.f + 0.08 * base - upkeep;
  G.net = { a: ra, m: rm, f: rf };
  const cap = storeCap();
  G.ammo = clamp(G.ammo + ra * dt, 0, cap);
  G.mat = clamp(G.mat + rm * dt, 0, cap);
  G.food = clamp(G.food + rf * dt, 0, cap);

  G.repairT -= dt;
  if (G.repairT <= 0) {
    G.repairT = 0.5;
    let left = 6;
    for (let i = 0; i < W * H && left > 0 && G.mat >= 1; i++) {
      if (!wall[i]) continue;
      const m = maxHp(wall[i]);
      if (wallHp[i] < m) { wallHp[i] = Math.min(m, wallHp[i] + 25); G.mat -= 1; left--; }
    }
    const L = LEVELS[G.level - 1];
    if (G.coreHp < L.coreHp) G.coreHp = Math.min(L.coreHp, G.coreHp + 6);
  }

  // a sealed, fed camp draws refugees
  if (G.sealed && G.territory >= 20 && G.food >= 20 && mouths < LEVELS[G.level - 1].defs) {
    G.refugeeT -= dt * (1 + G.territory / 150);
    if (G.refugeeT <= 0) { G.refugeeT = REFUGEE_GAP; G.idle++; toast('A refugee saw your walls and joined the camp'); }
  }
}

// ---- hordes: schedule, detection, warnings ---------------------------------------------------------------
function updateHordes(dt) {
  G.nextHorde -= dt;
  if (G.nextHorde <= 0) startHorde();
  for (const h of hordes) {
    if (h.left > 0) {
      h.acc += dt * h.total / HORDE.spawnSecs;
      while (h.acc >= 1 && h.left > 0) { h.acc -= 1; h.left--; spawnHordeZombie(h); }
    }
  }
  G.scanT -= dt;
  if (G.scanT > 0) return;
  G.scanT = 0.5;
  const R2 = lookoutR() ** 2, byId = {};
  for (const h of hordes) { h.alive = 0; h.near = Infinity; h.cx = h.cy = 0; byId[h.id] = h; }
  for (const z of zombies) {
    const h = z.h && byId[z.h]; if (!h) continue;
    h.alive++; h.cx += z.x; h.cy += z.y;
    const d = Math.hypot(z.x - CORE.x, z.y - CORE.y);
    if (d < h.near) h.near = d;
    if (!h.seen) for (const l of G.lookouts) { const dx = z.x - l.x, dy = z.y - l.y; if (dx * dx + dy * dy < R2) { h.seen = true; break; } }
  }
  let msg = null;
  for (let i = hordes.length - 1; i >= 0; i--) {
    const h = hordes[i];
    if (h.alive === 0 && h.left === 0) {
      hordes.splice(i, 1); G.hordesBeaten++;
      if (h.seen || h.heard) toast('The horde has been destroyed');
      continue;
    }
    if (h.alive) { h.cx /= h.alive; h.cy /= h.alive; }
    if (!h.heard && h.near < 13) { h.heard = true; if (!h.seen) toast('You hear groaning... a horde is at the walls!'); }
    if (h.seen && !h.announced) { h.announced = true; toast('Lookout: horde sighted to the ' + compass(h.cx - CORE.x, h.cy - CORE.y) + '!'); }
    if (h.alive === 0) continue;
    const eta = Math.ceil(Math.max(0, h.near - 3));
    const dir = compass(h.cx - CORE.x, h.cy - CORE.y);
    const cnt = h.left + h.alive;
    if (h.seen) msg = { cls: 'alert', text: 'HORDE from the ' + dir + ' - about ' + cnt + ' - ' + (h.near < 6 ? 'at the walls' : 'arrives in ~' + eta + 's') };
    else if (h.heard && !msg) msg = { cls: 'heard', text: 'Something is at the walls...' };
  }
  G.hordeMsg = msg;
}

// ---- build actions ---------------------------------------------------------------
function canAfford(c) { return (!c.m || G.mat >= c.m) && (!c.f || G.food >= c.f) && (!c.a || G.ammo >= c.a); }
function pay(c) { G.mat -= c.m || 0; G.food -= c.f || 0; G.ammo -= c.a || 0; }
let warnT = 0;
function warn(msg) { if (performance.now() > warnT) { toast(msg); warnT = performance.now() + 1500; } }
function inBuildRange(tx, ty) { return Math.hypot(tx + 0.5 - P.px, ty + 0.5 - P.py) <= BUILD_RANGE; }
const KIND = { wall: 1, tower: 2, lookout: 3 };
function tryBuild(tx, ty) {
  if (G.over || !inb(tx, ty)) return;
  const i = ty * W + tx;
  if (bld[i] >= 0 || isCoreTile(tx, ty)) return;
  const tool = G.tool;
  if (!inBuildRange(tx, ty)) return warn('Too far - walk closer to build there');
  if (!explored[i]) return;
  if (KIND[tool]) {
    const kind = KIND[tool];
    if (wall[i] === kind) return;
    if (wall[i] && !(wall[i] === 1 && kind === 2)) return;                 // only wall -> tower upgrades
    const cost = wall[i] === 1 && kind === 2 ? { m: COST.tower.m - COST.wall.m } : COST[tool];
    if (!canAfford(cost)) return warn('Not enough materials');
    pay(cost);
    setWall(tx, ty, kind);
    G.fieldDirty = true; G.visT = 0;
  } else if (tool === 'def') {
    if (!wall[i] || defAt[i]) return;
    if (G.idle < 1) return warn('No idle survivors. Scavenge for them, or seal your camp to draw refugees.');
    G.idle--; addDefender(tx, ty); G.visT = 0;
  } else if (tool === 'erase') {
    if (defAt[i]) { removeDefender(defAt[i]); G.idle++; return; }
    if (wall[i]) {
      G.mat += (wall[i] === 2 ? COST.tower.m : wall[i] === 3 ? COST.lookout.m : COST.wall.m) / 2;
      wall[i] = 0; wallHp[i] = 0; G.fieldDirty = true; G.visT = 0;
    }
  }
}
function upgradeCore() {
  const L = LEVELS[G.level - 1];
  if (!L.up) return toast('Camp is at max level');
  if (!canAfford(L.up)) return toast('Need ' + L.up.m + ' materials and ' + L.up.f + ' food');
  pay(L.up); G.level++;
  G.coreHp = LEVELS[G.level - 1].coreHp;
  for (let i = 0; i < W * H; i++) if (wall[i]) wallHp[i] = Math.max(wallHp[i], maxHp(wall[i]) * 0.8);
  G.fieldDirty = true;
  toast('Camp upgraded to level ' + G.level + ' - territory limit ' + LEVELS[G.level - 1].cap);
}

// ---- rendering ---------------------------------------------------------------
const canvas = $('c'), ctx = canvas.getContext('2d');
const mini = $('mini'), mctx = mini.getContext('2d');
let dpr = 1;
function resize() {
  dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
}
addEventListener('resize', resize);

function drawSprite(img, x, y, scale, flip, bob) {
  const w = img.width * scale, h = img.height * scale;
  const px = x * T, py = y * T - h * 0.7 + (bob || 0);
  if (flip) {
    ctx.save(); ctx.translate(px, 0); ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, py, w, h); ctx.restore();
  } else ctx.drawImage(img, px - w / 2, py, w, h);
}

function render() {
  const { cam } = G, z = cam.zoom * dpr;
  const cw = canvas.width, ch = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#05080a'; ctx.fillRect(0, 0, cw, ch);
  ctx.setTransform(z, 0, 0, z, cw / 2 - cam.x * T * z, ch / 2 - cam.y * T * z);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(terrain, 0, 0);
  ctx.drawImage(decals, 0, 0);
  ctx.drawImage(claimLayer, 0, 0);

  const vx0 = clamp(((cam.x * T - cw / 2 / z) / T | 0) - 1, 0, W - 1), vx1 = clamp(((cam.x * T + cw / 2 / z) / T | 0) + 1, 0, W - 1);
  const vy0 = clamp(((cam.y * T - ch / 2 / z) / T | 0) - 1, 0, H - 1), vy1 = clamp(((cam.y * T + ch / 2 / z) / T | 0) + 1, 0, H - 1);

  // scavenged buildings go dark
  for (const b of buildings) if (b.looted) {
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fillRect(b.x * T, b.y * T, b.w * T, b.h * T);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(b.x * T + b.w * T / 2 - 3, b.y * T + b.h * T / 2 - 1, 6, 2);
  }

  // camp core
  const cx = (CORE.x - 1) * T, cy = (CORE.y - 1) * T;
  ctx.fillStyle = '#3b4a58'; ctx.fillRect(cx, cy, T * 3, T * 3);
  ctx.fillStyle = '#51677a'; ctx.fillRect(cx + 2, cy + 2, T * 3 - 4, T * 3 - 4);
  ctx.fillStyle = '#2a3844'; ctx.fillRect(cx + 10, cy + 10, T * 3 - 20, T * 3 - 20);
  ctx.fillStyle = '#e84a3a'; ctx.fillRect(cx + T * 1.5 - 1, cy + 2, 1, 9); ctx.fillRect(cx + T * 1.5, cy + 2, 6, 4);
  const frac = Math.max(0, G.coreHp / LEVELS[G.level - 1].coreHp);
  if (frac < 0.999) {
    ctx.fillStyle = '#000a'; ctx.fillRect(cx, cy - 5, T * 3, 3);
    ctx.fillStyle = frac > 0.4 ? '#5ec26a' : '#e8524a'; ctx.fillRect(cx, cy - 5, T * 3 * frac, 3);
  }

  // walls, towers, lookouts
  for (let y = vy0; y <= vy1; y++) for (let x = vx0; x <= vx1; x++) {
    const i = y * W + x, k = wall[i];
    if (!k) continue;
    const px = x * T, py = y * T;
    if (k === 1) {
      ctx.fillStyle = '#00000066'; ctx.fillRect(px + 1, py + 2, T, T);
      ctx.fillStyle = '#7a5a36'; ctx.fillRect(px, py, T, T);
      ctx.fillStyle = '#8f6c42'; ctx.fillRect(px, py, T, 3);
      ctx.fillStyle = '#5a4026'; ctx.fillRect(px, py + 5, T, 1); ctx.fillRect(px, py + 10, T, 1);
      ctx.fillStyle = '#c9b48a'; ctx.fillRect(px + 2, py + 1, 1, 1); ctx.fillRect(px + 12, py + 1, 1, 1);
    } else if (k === 2) {
      ctx.fillStyle = '#00000077'; ctx.fillRect(px + 1, py + 3, T, T);
      ctx.fillStyle = '#6a7078'; ctx.fillRect(px, py, T, T);
      ctx.fillStyle = '#8a9098'; ctx.fillRect(px, py, T, 3);
      ctx.fillStyle = '#4f545b'; ctx.fillRect(px + 1, py + 4, T - 2, T - 5);
      ctx.fillStyle = '#7d848c'; ctx.fillRect(px + 2, py + 5, T - 4, T - 7);
      ctx.fillStyle = '#8a9098'; for (let c = 0; c < 4; c++) ctx.fillRect(px + c * 4, py - 1, 3, 2);
    } else {
      ctx.fillStyle = '#00000077'; ctx.fillRect(px + 2, py + 3, T, T);
      ctx.fillStyle = '#5a4026'; ctx.fillRect(px + 2, py + 2, 2, T - 2); ctx.fillRect(px + T - 4, py + 2, 2, T - 2);
      ctx.fillStyle = '#8f6c42'; ctx.fillRect(px, py, T, 6);
      ctx.fillStyle = '#6a4c2c'; ctx.fillRect(px, py + 5, T, 1);
      ctx.fillStyle = '#4fa3e8'; ctx.fillRect(px + 6, py + 1, 4, 3);
      ctx.fillStyle = '#d8f0ff'; ctx.fillRect(px + 7, py + 2, 2, 1);
    }
    const f = wallHp[i] / maxHp(k);
    if (f < 0.97) {
      ctx.fillStyle = 'rgba(0,0,0,' + ((1 - f) * 0.5) + ')'; ctx.fillRect(px, py, T, T);
      ctx.fillStyle = '#000a'; ctx.fillRect(px + 1, py + T - 3, T - 2, 2);
      ctx.fillStyle = f > 0.4 ? '#e8c547' : '#e8524a'; ctx.fillRect(px + 1, py + T - 3, (T - 2) * f, 2);
    }
  }

  // people and zombies, sorted by y so crowds layer correctly
  const items = [];
  for (const zb of zombies) {
    if (zb.x < vx0 - 1 || zb.x > vx1 + 2 || zb.y < vy0 - 1 || zb.y > vy1 + 2) continue;
    if (!vis[(zb.y | 0) * W + (zb.x | 0)]) continue;
    items.push(zb);
  }
  for (const d of defenders) items.push(d);
  items.push(P);
  const sortY = o => o.px !== undefined ? o.py : o.y;
  items.sort((a, b) => sortY(a) - sortY(b));
  for (const o of items) {
    if (o.px !== undefined) {
      const isP = o === P;
      if (o.stab > 0 && !isP) o.stab -= 0.016;
      drawSprite(isP ? SPR.player : SPR.def, o.px, o.py + 0.1, 1, o.face < 0, (o.stab > 0 ? -1 : 0) - 2);
      const mhp = isP ? PLAYER.hp : 60;
      if (o.hp < mhp) { ctx.fillStyle = '#000a'; ctx.fillRect(o.px * T - 5, o.py * T - 14, 10, 2); ctx.fillStyle = '#e8524a'; ctx.fillRect(o.px * T - 5, o.py * T - 14, 10 * Math.max(0, o.hp) / mhp, 2); }
      if (o.shot > 0) { ctx.fillStyle = '#ffe9a0'; ctx.fillRect(o.px * T + (o.face > 0 ? 6 : -8), o.py * T - 6, 3, 2); }
      if (isP) {
        ctx.fillStyle = '#ffd27a'; ctx.fillRect(o.px * T - 1, o.py * T - 19, 3, 2);       // "you" marker
        if (P.loot > 0) {
          ctx.fillStyle = '#000a'; ctx.fillRect(o.px * T - 8, o.py * T - 24, 16, 3);
          ctx.fillStyle = '#7fcf6a'; ctx.fillRect(o.px * T - 8, o.py * T - 24, 16 * P.loot / LOOT_TIME, 3);
        }
      }
    } else {
      const zt = ZTYPES[o.type];
      const img = o.type === 'walker' ? SPR[o.variant] : SPR[o.type];
      drawSprite(img, o.x, o.y, zt.scale, o.face < 0, Math.sin(o.anim) * 0.8 - o.lift);
      if (o.type === 'brute' && o.hp < zt.hp) { ctx.fillStyle = '#000a'; ctx.fillRect(o.x * T - 6, o.y * T - 22, 12, 2); ctx.fillStyle = '#e8524a'; ctx.fillRect(o.x * T - 6, o.y * T - 22, 12 * o.hp / zt.hp, 2); }
    }
  }
  // idle survivors milling around the camp
  for (let i = 0; i < Math.min(G.idle, 8); i++) {
    drawSprite(SPR.def, CORE.x + 0.5 - 1.6 + i * 0.45, CORE.y + 2.1 + (i % 2) * 0.35, 1, i % 2 === 0, -2);
  }

  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i]; t.life -= 0.016;
    if (t.life <= 0) { tracers.splice(i, 1); continue; }
    ctx.strokeStyle = t.slash ? '#ffffff' : '#ffe27a'; ctx.lineWidth = t.slash ? 1.2 : 0.8;
    ctx.beginPath(); ctx.moveTo(t.x1 * T, t.y1 * T); ctx.lineTo(t.x2 * T, t.y2 * T); ctx.stroke();
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life -= 0.016; p.x += p.vx * 0.016; p.y += p.vy * 0.016;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    ctx.fillStyle = p.color; ctx.fillRect(p.x * T, p.y * T, 1.5, 1.5);
  }

  // fog of war (smoothed so the edges are soft)
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(fogCanvas, 0, 0, W * T, H * T);
  ctx.imageSmoothingEnabled = false;

  // build cursor
  if (G.hover && !G.over) {
    const { tx, ty } = G.hover, i = ty * W + tx;
    let ok = inb(tx, ty) && bld[i] < 0 && !isCoreTile(tx, ty) && inBuildRange(tx, ty) && explored[i];
    if (ok && G.tool === 'def') ok = wall[i] > 0 && !defAt[i] && G.idle > 0;
    if (ok && G.tool === 'erase') ok = wall[i] > 0 || !!defAt[i];
    if (ok && KIND[G.tool]) ok = !wall[i] || (wall[i] === 1 && G.tool === 'tower');
    ctx.fillStyle = ok ? 'rgba(120,255,140,0.28)' : 'rgba(255,90,80,0.28)';
    ctx.fillRect(tx * T, ty * T, T, T);
    ctx.strokeStyle = ok ? '#7dff8c' : '#ff5a50'; ctx.lineWidth = 0.8; ctx.strokeRect(tx * T + 0.5, ty * T + 0.5, T - 1, T - 1);
    ctx.setLineDash([3, 3]);
    if (G.tool === 'def' && ok) {
      ctx.strokeStyle = 'rgba(255,230,120,0.5)';
      ctx.beginPath(); ctx.arc((tx + 0.5) * T, (ty + 0.5) * T, (wall[i] === 2 ? GUN.towerRange : GUN.range) * T, 0, 7); ctx.stroke();
    }
    if (G.tool === 'lookout') {
      ctx.strokeStyle = 'rgba(100,180,255,0.55)';
      ctx.beginPath(); ctx.arc((tx + 0.5) * T, (ty + 0.5) * T, lookoutR() * T, 0, 7); ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  // build range ring around the survivor while a build tool is held
  if (G.tool !== 'erase') {
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(P.px * T, P.py * T, BUILD_RANGE * T, 0, 7); ctx.stroke();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (P.hurt > 0.8) { ctx.fillStyle = 'rgba(200,0,0,' + Math.min(0.25, (P.hurt - 0.8) * 0.35) + ')'; ctx.fillRect(0, 0, cw, ch); }
}

function renderMini() {
  mctx.imageSmoothingEnabled = false;
  mctx.clearRect(0, 0, W, H);
  mctx.drawImage(miniTerrain, 0, 0);
  mctx.drawImage(fogCanvas, 0, 0);
  for (let i = 0; i < W * H; i++) if (wall[i] && explored[i]) { mctx.fillStyle = wall[i] === 3 ? '#4fa3e8' : '#d9a85a'; mctx.fillRect(i % W, (i / W) | 0, 1, 1); }
  mctx.fillStyle = '#e84a3a';
  for (const z of zombies) if (vis[(z.y | 0) * W + (z.x | 0)]) mctx.fillRect(z.x | 0, z.y | 0, 1, 1);
  for (const h of hordes) if (h.seen && h.alive) { mctx.strokeStyle = '#ff5a50'; mctx.strokeRect((h.cx | 0) - 3, (h.cy | 0) - 3, 7, 7); }
  mctx.fillStyle = '#7dd0ff'; mctx.fillRect(CORE.x - 1, CORE.y - 1, 3, 3);
  mctx.fillStyle = '#ffd27a'; mctx.fillRect((P.px | 0) - 1, (P.py | 0) - 1, 3, 3);
}

// ---- HUD ---------------------------------------------------------------
let toastTimer = 0;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 4200);
}
const fmtRate = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '/s';
const costStr = c => [c.m && c.m + 'm', c.f && c.f + 'f', c.a && c.a + 'a'].filter(Boolean).join(' ');
const fmtTime = s => (s / 60 | 0) + ':' + String(s % 60 | 0).padStart(2, '0');
function updateHud() {
  const L = LEVELS[G.level - 1];
  $('rAmmo').textContent = G.ammo | 0; $('dAmmo').textContent = fmtRate(G.net.a);
  $('rMat').textContent = G.mat | 0; $('dMat').textContent = fmtRate(G.net.m);
  $('rFood').textContent = G.food | 0; $('dFood').textContent = fmtRate(G.net.f);
  $('rFood').style.color = G.food <= 0 ? 'var(--bad)' : '';
  $('rAmmo').style.color = G.ammo < 1 ? 'var(--bad)' : '';
  $('pHp').textContent = Math.max(0, P.hp | 0); $('pHp').style.color = P.hp < 35 ? 'var(--bad)' : '';
  $('zCount').textContent = G.visibleZ;
  const hd = $('horde');
  if (G.hordeMsg) { hd.className = 'panel ' + G.hordeMsg.cls; hd.textContent = G.hordeMsg.text; }
  else { hd.className = 'panel'; hd.textContent = G.lookouts.length ? 'Lookouts watching - no horde sighted' : 'No lookouts - you will get almost no warning'; }
  $('cWall').textContent = costStr(COST.wall); $('cTower').textContent = costStr(COST.tower); $('cLook').textContent = costStr(COST.lookout);
  $('cDef').textContent = G.idle + ' idle';
  $('cUp').textContent = L.up ? costStr(L.up) : 'MAX';
  $('btnUp').disabled = !L.up || !canAfford(L.up);
  document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === G.tool));
  document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', +b.dataset.speed === 0 ? G.paused : !G.paused && +b.dataset.speed === G.speed));
  $('iLvl').textContent = G.level + ' / ' + LEVELS.length;
  $('iCore').textContent = Math.max(0, G.coreHp | 0) + ' / ' + L.coreHp;
  $('iTerr').textContent = G.territory + ' / ' + L.cap;
  const seal = $('iSeal'); seal.textContent = G.sealed ? 'Sealed' : 'OPEN'; seal.className = G.sealed ? 'ok' : 'warn';
  $('iBld').textContent = G.held;
  $('iIdle').textContent = G.idle;
  $('iDef').textContent = defenders.length + ' (max ' + L.defs + ' people)' + (G.food <= 0 ? ' starving' : '');
  $('iLook').textContent = G.lookouts.length;
  $('iTime').textContent = fmtTime(G.elapsed); $('iHordes').textContent = G.hordesBeaten; $('iKills').textContent = G.kills;
  let e = 0; for (let i = 0; i < W * H; i++) e += explored[i];
  $('iExp').textContent = Math.round(e / (W * H) * 100) + '%';

  const b = nearBuilding(), pr = $('prompt');
  if (b && !G.over) {
    pr.style.display = 'block';
    pr.textContent = b.looted ? BUILDING_TYPES[b.type].label + ' - already scavenged' : 'Hold E to scavenge the ' + BUILDING_TYPES[b.type].label;
  } else pr.style.display = 'none';
}

function gameOver(why) {
  G.over = true;
  $('ovTitle').textContent = why;
  $('ovBody').innerHTML = '<p>You lasted <b>' + fmtTime(G.elapsed) + '</b>, beat <b>' + G.hordesBeaten + '</b> horde' + (G.hordesBeaten === 1 ? '' : 's') +
    ' and killed <b>' + G.kills + '</b> zombies.</p>';
  $('btnStart').textContent = 'Try again';
  $('overlay').classList.remove('hidden');
}

// ---- input ---------------------------------------------------------------
let panning = false, painting = false, lastPaint = null, lastMouse = { x: 0, y: 0 };
function screenToTile(sx, sy) {
  const z = G.cam.zoom;
  const wx = (sx - innerWidth / 2) / z / T + G.cam.x, wy = (sy - innerHeight / 2) / z / T + G.cam.y;
  return { tx: Math.floor(wx), ty: Math.floor(wy) };
}
function paintLine(a, b) {                       // bresenham so fast drags leave no gaps
  let x0 = a.tx, y0 = a.ty; const x1 = b.tx, y1 = b.ty;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    tryBuild(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
const overlayUp = () => !$('overlay').classList.contains('hidden');
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => {
  if (!G || overlayUp()) return;
  lastMouse = { x: e.clientX, y: e.clientY };
  if (e.button === 2 || e.button === 1) { panning = true; G.cam.free = true; return; }
  if (e.button === 0) { painting = true; lastPaint = screenToTile(e.clientX, e.clientY); tryBuild(lastPaint.tx, lastPaint.ty); }
});
addEventListener('mouseup', () => { panning = false; painting = false; lastPaint = null; });
canvas.addEventListener('mousemove', e => {
  if (!G) return;
  G.hover = screenToTile(e.clientX, e.clientY);
  if (panning) {
    G.cam.x -= (e.clientX - lastMouse.x) / G.cam.zoom / T; G.cam.y -= (e.clientY - lastMouse.y) / G.cam.zoom / T;
  } else if (painting) {
    const cur = G.hover; if (lastPaint) paintLine(lastPaint, cur); lastPaint = cur;
  }
  lastMouse = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('mouseleave', () => { if (G) G.hover = null; });
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const z0 = G.cam.zoom;
  const wx = (e.clientX - innerWidth / 2) / z0 / T + G.cam.x, wy = (e.clientY - innerHeight / 2) / z0 / T + G.cam.y;
  const z1 = G.cam.zoom = clamp(z0 * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.9, 6);
  if (G.cam.free) { G.cam.x = wx - (e.clientX - innerWidth / 2) / z1 / T; G.cam.y = wy - (e.clientY - innerHeight / 2) / z1 / T; }
}, { passive: false });
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  keys[k] = true; if (e.shiftKey) keys.shift = true;
  if (!G) return;
  if (k === '1') G.tool = 'wall'; else if (k === '2') G.tool = 'tower'; else if (k === '3') G.tool = 'lookout';
  else if (k === '4') G.tool = 'def'; else if (k === '5') G.tool = 'erase';
  else if (k === 'u') upgradeCore();
  else if (k === ' ') { G.paused = !G.paused; e.preventDefault(); }
  if (k.startsWith('arrow')) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; if (!e.shiftKey) keys.shift = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => { G.tool = b.dataset.tool; }));
document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => {
  const s = +b.dataset.speed; if (s === 0) G.paused = !G.paused; else { G.paused = false; G.speed = s; }
}));
$('btnUp').addEventListener('click', upgradeCore);
$('btnStart').addEventListener('click', () => {
  if (!G || G.over) newGame();
  $('overlay').classList.add('hidden');
});

// ---- main loop ---------------------------------------------------------------
let last = performance.now(), miniT = 0;
function frame(now) {
  const real = Math.min(0.05, (now - last) / 1000); last = now;
  if (G) {
    const playing = !G.paused && !G.over && !overlayUp();
    if (playing) for (let s = 0; s < G.speed; s++) simulate(real);
    if (!G.cam.free) { const f = Math.min(1, real * 6); G.cam.x += (P.px - G.cam.x) * f; G.cam.y += (P.py - G.cam.y) * f; }
    G.hudT -= real;
    if (G.hudT <= 0) { G.hudT = 0.1; updateHud(); }
    miniT -= real; if (miniT <= 0) { miniT = 0.2; renderMini(); }
    render();
  }
  requestAnimationFrame(frame);
}
function simulate(dt) {
  G.elapsed += dt;
  G.fieldTimer -= dt;
  if (G.fieldDirty && G.fieldTimer <= 0) {
    computeBaseField(); computePlayerField(); computeTerritory();
    G.fieldDirty = false; G.fieldTimer = 0.2;
  }
  G.pfTimer -= dt;
  if (G.pfTimer <= 0) { G.pfTimer = 0.25; computePlayerField(); }
  G.visT -= dt;
  if (G.visT <= 0) { G.visT = 0.15; updateVision(); }
  G.ambientT -= dt;
  if (G.ambientT <= 0) {
    G.ambientT = 2;
    let idle = 0; for (const z of zombies) if (z.mode === 0) idle++;
    if (idle < AMBIENT.keep) for (let i = 0; i < 3; i++) spawnAmbient();
  }
  updatePlayer(dt);
  updateHordes(dt);
  updateZombies(dt);
  updateDefenders(dt);
  updateEconomy(dt);
}

buildSprites();
resize();
newGame();
$('overlay').classList.remove('hidden');
requestAnimationFrame(frame);

// exposed for debugging / tests
window.__game = {
  get G() { return G; }, get P() { return P; }, zombies: () => zombies, defenders: () => defenders, hordes: () => hordes,
  tryBuild, startHorde, simulate, keys, buildings: () => buildings,
};
