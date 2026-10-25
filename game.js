'use strict';

/* ======================================================================
   Zomb Survive - base-builder / wall-defense vertical slice
   ====================================================================== */

// ---- tuning ---------------------------------------------------------------
const T = 16;                    // sprite pixels per world tile
const W = 64, H = 44;            // map size in tiles
const PITCH = 11;                // road grid spacing
const CORE = { x: 34, y: 23 };   // centre tile of the 3x3 core

const COST = { wall: { m: 3 }, tower: { m: 12 }, def: { f: 12 } };
const WALL_PATH_COST = 12, TOWER_PATH_COST = 16;     // how much zombies dislike climbing
const WALL_HP = 120, TOWER_HP = 260;

const LEVELS = [   // index = core level - 1
  { cap: 130, defs: 8,  store: 400,  coreHp: 600,  up: { m: 120, f: 50 } },
  { cap: 230, defs: 14, store: 700,  coreHp: 900,  up: { m: 260, f: 110 } },
  { cap: 360, defs: 22, store: 1100, coreHp: 1300, up: { m: 480, f: 200 } },
  { cap: 520, defs: 32, store: 1600, coreHp: 1800, up: { m: 800, f: 320 } },
  { cap: 760, defs: 45, store: 2400, coreHp: 2500, up: null },
];

const BUILDING_TYPES = {
  house:     { label: 'House',     w: 5, rate: { m: 0.45, f: 0.25 }, roof: ['#a0524a', '#8d4a52', '#96603f'] },
  store:     { label: 'Store',     w: 2, rate: { f: 1.1, m: 0.15 },  roof: ['#3f7aa6', '#4a8c9a'] },
  garage:    { label: 'Garage',    w: 2, rate: { a: 0.9, m: 0.3 },   roof: ['#767a84', '#6a6f78'] },
  warehouse: { label: 'Warehouse', w: 2, rate: { m: 1.0, a: 0.25 },  roof: ['#8a7a48', '#7d7048'] },
};

const ZTYPES = {
  walker: { hp: 20,  speed: 1.0, dmg: 6,  wallDmg: 2,  climb: 1.6, scale: 1.0 },
  runner: { hp: 16,  speed: 2.3, dmg: 5,  wallDmg: 1.5, climb: 0.9, scale: 0.9 },
  brute:  { hp: 140, speed: 0.75, dmg: 16, wallDmg: 24, climb: 0,   scale: 1.5 },
};

const DAY_LEN = 50, NIGHT_LEN = 60, MAX_ZOMBIES = 1500;
const GUN = { dmg: 24, range: 8, cd: 0.8, towerRange: 11, towerCd: 0.55 };
const MELEE = { dmg: 20, range: 1.6, cd: 0.35 };

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

// ---- world state ---------------------------------------------------------------
const ground = new Uint8Array(W * H);          // 0 grass, 1 road, 2 park
const bld = new Int16Array(W * H);             // building index or -1
const wall = new Uint8Array(W * H);            // 0 none, 1 wall, 2 tower
const wallHp = new Float32Array(W * H);
const claimed = new Uint8Array(W * H);
const dist = new Float32Array(W * H);          // zombie flow field
const nextTile = new Int32Array(W * H);
let buildings = [];
let defAt = new Array(W * H).fill(null);
let zombies = [], defenders = [], tracers = [], parts = [];
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
      const b = { ...p, type, roof: roofs[rng() * roofs.length | 0], claimed: false };
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
}

let terrain, claimLayer, decals;
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
  // lane markings on road centres
  g.fillStyle = '#6d6a50';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (ground[y * W + x] !== 1) continue;
    if (x % PITCH === 1 && y % PITCH >= 2 && (y % 2 === 0)) g.fillRect(x * T, y * T + 3, 1, 6);
    if (y % PITCH === 1 && x % PITCH >= 2 && (x % 2 === 0)) g.fillRect(x * T + 3, y * T, 6, 1);
  }
  // park trees
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (ground[y * W + x] !== 2 || r() > 0.14) continue;
    const px = x * T + 8, py = y * T + 8;
    g.fillStyle = '#4a3a24'; g.fillRect(px - 1, py + 1, 2, 5);
    g.fillStyle = '#2b5a2a'; g.fillRect(px - 5, py - 5, 10, 8);
    g.fillStyle = '#356b32'; g.fillRect(px - 4, py - 6, 8, 3);
  }
  // buildings
  for (const b of buildings) {
    const x = b.x * T, y = b.y * T, w = b.w * T, h = b.h * T;
    g.fillStyle = '#00000055'; g.fillRect(x + 2, y + 2, w, h);
    g.fillStyle = b.roof; g.fillRect(x, y, w, h);
    g.fillStyle = '#ffffff22'; g.fillRect(x, y, w, 2);
    g.fillStyle = '#00000044'; g.fillRect(x, y + h - 2, w, 2); g.fillRect(x + w - 2, y, 2, h);
    g.fillStyle = '#00000033';
    for (let i = 1; i < b.w; i++) g.fillRect(x + i * T - 1, y + 2, 1, h - 4);   // roof panel seams
    if (b.type === 'store') { g.fillStyle = '#e8d070'; g.fillRect(x + 3, y + h - 6, w - 6, 3); }
    if (b.type === 'garage') { g.fillStyle = '#4a4e56'; g.fillRect(x + w / 2 - 8, y + h - 7, 16, 5); }
    if (b.type === 'warehouse') { g.fillStyle = '#5e5233'; g.fillRect(x + 4, y + 4, 6, 6); g.fillRect(x + w - 10, y + 4, 6, 6); }
    if (b.type === 'house') { g.fillStyle = '#3a2a22'; g.fillRect(x + w / 2 - 2, y + h - 6, 4, 5); }
  }
  // core plaza
  const cx = (CORE.x - 1) * T, cy = (CORE.y - 1) * T;
  g.fillStyle = '#5a5a52'; g.fillRect(cx - 2, cy - 2, T * 3 + 4, T * 3 + 4);

  decals = document.createElement('canvas'); decals.width = W * T; decals.height = H * T;
  claimLayer = document.createElement('canvas'); claimLayer.width = W * T; claimLayer.height = H * T;
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

// ---- flow field (Dijkstra, walls are expensive-but-passable) ---------------------------
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const N4 = NB.slice(0, 4);
function stepCost(i) {
  if (bld[i] >= 0) return Infinity;
  const w = wall[i];
  return w === 2 ? TOWER_PATH_COST : w === 1 ? WALL_PATH_COST : 1;
}
function diagOpen(x, y, dx, dy) {
  const a = (y) * W + (x + dx), b = (y + dy) * W + x;
  return bld[a] < 0 && bld[b] < 0 && !wall[a] && !wall[b];
}
function computeField() {
  dist.fill(Infinity); nextTile.fill(-1);
  const heap = []; // [d, idx]
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
        let l = 2 * k + 1, r = l + 1, m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m;
      }
    }
    return top;
  };
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const i = (CORE.y + dy) * W + CORE.x + dx; dist[i] = 0; push(0, i);
  }
  while (heap.length) {
    const [d, i] = pop();
    if (d > dist[i]) continue;
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of NB) {
      const nx = x + dx, ny = y + dy;
      if (!inb(nx, ny)) continue;
      if (dx && dy && !diagOpen(x, y, dx, dy)) continue;
      const ni = ny * W + nx;
      if (bld[ni] >= 0) continue;
      const nd = d + (dx && dy ? 1.414 : 1) * stepCost(i);   // a zombie on ni pays to enter tile i
      if (nd < dist[ni]) { dist[ni] = nd; push(nd, ni); }
    }
  }
  // best neighbour for each tile
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (dist[i] === Infinity || dist[i] === 0) continue;
    let best = Infinity, bi = -1;
    for (const [dx, dy] of NB) {
      const nx = x + dx, ny = y + dy;
      if (!inb(nx, ny)) continue;
      if (dx && dy && !diagOpen(x, y, dx, dy)) continue;
      const ni = ny * W + nx;
      if (dist[ni] < best) { best = dist[ni]; bi = ni; }
    }
    nextTile[i] = bi;
  }
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
  // buildings touching claimed tiles are ours
  let inc = { m: 0, f: 0, a: 0 }, held = 0;
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

// ---- game setup ---------------------------------------------------------------
function newGame() {
  rng = mulberry32((Math.random() * 2 ** 31) | 0);
  genTown();
  wall.fill(0); wallHp.fill(0); defAt = new Array(W * H).fill(null);
  zombies = []; defenders = []; tracers = []; parts = [];
  G = {
    level: 1, ammo: 150, mat: 200, food: 90,
    coreHp: LEVELS[0].coreHp, kills: 0,
    night: false, nightNum: 0, phaseT: 0, spawnAcc: 0, nightTotal: 0, nightsSurvived: 0,
    over: false, paused: false, speed: 1, tool: 'wall',
    territory: 0, sealed: false, income: { m: 0, f: 0, a: 0 }, held: 0,
    fieldDirty: true, fieldTimer: 0, repairT: 0, hudT: 0,
    cam: { x: CORE.x + 0.5, y: CORE.y + 0.5, zoom: 2.2 },
    net: { a: 0, m: 0, f: 0 },
  };
  // starter ring around the core (gap on the south side)
  for (let d = -4; d <= 4; d++) {
    for (const [x, y] of [[CORE.x + d, CORE.y - 4], [CORE.x + d, CORE.y + 4], [CORE.x - 4, CORE.y + d], [CORE.x + 4, CORE.y + d]]) {
      if (x === CORE.x && y === CORE.y + 4) continue;
      setWall(x, y, 1);
    }
  }
  addDefender(CORE.x - 1, CORE.y + 4, true); addDefender(CORE.x + 1, CORE.y + 4, true);
  renderTerrain();
  computeField(); computeTerritory();
  toast('Seal the gap, expand your walls, and hold until dawn');
}

const maxHp = k => (k === 2 ? TOWER_HP : WALL_HP) * (1 + 0.25 * (G.level - 1));
function setWall(x, y, k) { const i = y * W + x; wall[i] = k; wallHp[i] = maxHp(k); }
function addDefender(x, y, free) {
  const i = y * W + x;
  if (!wall[i] || defAt[i]) return false;
  const d = { x, y, px: x + 0.5, py: y + 0.5, hp: 60, cd: 0, mcd: 0, face: 1, shot: 0 };
  defAt[i] = d; defenders.push(d); return true;
}
function removeDefender(d) { defAt[d.y * W + d.x] = null; defenders.splice(defenders.indexOf(d), 1); }

// ---- spawning ---------------------------------------------------------------
function spawnZombie() {
  if (zombies.length >= MAX_ZOMBIES) return;
  for (let t = 0; t < 12; t++) {
    const side = rng() * 4 | 0;
    const x = side === 0 ? 0 : side === 1 ? W - 1 : rng() * W | 0;
    const y = side === 2 ? 0 : side === 3 ? H - 1 : rng() * H | 0;
    const i = y * W + x;
    if (bld[i] >= 0 || wall[i] || dist[i] === Infinity) continue;
    const n = G.nightNum;
    let type = 'walker';
    const r = rng();
    if (n >= 3 && r < Math.min(0.02 * n, 0.12)) type = 'brute';
    else if (n >= 2 && r < Math.min(0.08 + 0.03 * n, 0.32)) type = 'runner';
    const zt = ZTYPES[type];
    zombies.push({
      x: x + 0.3 + rng() * 0.4, y: y + 0.3 + rng() * 0.4, type, hp: zt.hp,
      speed: zt.speed * (0.85 + rng() * 0.3), climb: 0, anim: rng() * 6, face: 1,
      variant: rng() < 0.5 ? 'walker' : 'walker2',
    });
    return;
  }
}

// ---- zombie logic ---------------------------------------------------------------
const cellHead = new Int32Array(W * H), cellNext = [];
function updateZombies(dt) {
  const n = zombies.length;
  cellHead.fill(-1); cellNext.length = n;
  for (let k = 0; k < n; k++) {
    const z = zombies[k], c = (z.y | 0) * W + (z.x | 0);
    cellNext[k] = cellHead[c]; cellHead[c] = k;
  }
  const cx = CORE.x + 0.5, cy = CORE.y + 0.5;
  for (let k = n - 1; k >= 0; k--) {
    const z = zombies[k], zt = ZTYPES[z.type];
    if (z.hp <= 0) { killZombie(k); continue; }
    const tx = z.x | 0, ty = z.y | 0, ti = ty * W + tx;
    z.anim += dt * z.speed * 4;

    // attack an adjacent defender
    let target = null;
    if (defenders.length) {
      for (let dy = -1; dy <= 1 && !target; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = tx + dx, ny = ty + dy;
        if (!inb(nx, ny)) continue;
        const d = defAt[ny * W + nx];
        if (d && (wall[ti] > 0 || Math.hypot(d.px - z.x, d.py - z.y) < 0.6) && Math.hypot(d.px - z.x, d.py - z.y) < 0.95) { target = d; break; }
      }
    }
    if (target) {
      target.hp -= zt.dmg * dt; target.hurt = 0.2;
      z.face = target.px > z.x ? 1 : -1;
      if (target.hp <= 0) { removeDefender(target); addBurst(target.px, target.py, '#e8524a', 8); }
      continue;
    }
    const cdist = Math.hypot(z.x - cx, z.y - cy);
    if (cdist < 2.2) {
      G.coreHp -= zt.dmg * dt; z.face = cx > z.x ? 1 : -1;
      if (G.coreHp <= 0 && !G.over) gameOver();
      continue;
    }
    if (dist[ti] === Infinity || nextTile[ti] < 0) { zombies[k] = zombies[zombies.length - 1]; zombies.pop(); continue; }

    const ni = nextTile[ti], nx = ni % W, ny = (ni / W) | 0;
    const tcx = nx + 0.5, tcy = ny + 0.5;
    let dx = tcx - z.x, dy = tcy - z.y;
    const dd = Math.hypot(dx, dy) || 1;
    const onWall = wall[ti] > 0;

    if (wall[ni] && !onWall) {
      // at a wall: climb it (or smash it, for brutes)
      if (Math.max(Math.abs(dx), Math.abs(dy)) <= 0.72) {
        wallHp[ni] -= zt.wallDmg * dt;
        z.face = dx > 0 ? 1 : -1;
        if (wallHp[ni] <= 0) { breakWall(ni); continue; }
        if (zt.climb > 0) {
          z.climb += dt;
          if (z.climb >= zt.climb) { z.climb = 0; z.x = tcx + (rng() - 0.5) * 0.3; z.y = tcy + (rng() - 0.5) * 0.3; }
        }
        separate(k, z, dt);
        continue;
      }
    }
    const sp = z.speed * dt;
    stepMove(z, dx / dd * sp, dy / dd * sp, onWall);
    if (Math.abs(dx) > 0.01) z.face = dx > 0 ? 1 : -1;
    separate(k, z, dt);
  }
}
function stepMove(z, mx, my, onWall) {
  const free = (x, y) => {
    if (!inb(x | 0, y | 0)) return false;
    const i = (y | 0) * W + (x | 0);
    if (bld[i] >= 0) return false;
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
    for (let j = cellHead[ny * W + nx]; j >= 0 && seen < 8; j = cellNext[j]) {
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
  if (rng() < 0.35) G.mat = Math.min(storeCap(), G.mat + 1);
  if (rng() < 0.06) G.food = Math.min(storeCap(), G.food + 1);
  const g = decals.getContext('2d');
  g.fillStyle = rng() < 0.5 ? '#6a1c1c' : '#4a2a1a'; g.globalAlpha = 0.7;
  for (let i = 0; i < 4; i++) g.fillRect(z.x * T + (rng() - 0.5) * 8, z.y * T + (rng() - 0.5) * 8, 1 + (rng() * 2 | 0), 1 + (rng() * 2 | 0));
  g.globalAlpha = 1;
  addBurst(z.x, z.y, '#7a1c1c', 3);
  zombies[k] = zombies[zombies.length - 1]; zombies.pop();
}
function breakWall(i) {
  wall[i] = 0; wallHp[i] = 0;
  const d = defAt[i]; if (d) removeDefender(d);
  G.fieldDirty = true;
  addBurst(i % W + 0.5, ((i / W) | 0) + 0.5, '#9a7a4a', 8);
}

// ---- defenders ---------------------------------------------------------------
function updateDefenders(dt) {
  const starving = G.food <= 0;
  for (let k = defenders.length - 1; k >= 0; k--) {
    const d = defenders[k];
    d.cd -= dt; d.mcd -= dt; d.shot -= dt; if (d.hurt) d.hurt -= dt;
    if (!zombies.length) continue;
    const tower = wall[d.y * W + d.x] === 2;
    // melee first: anything within stabbing reach
    let near = null, nd = MELEE.range * MELEE.range;
    for (let j = 0; j < zombies.length; j++) {
      const z = zombies[j], dx = z.x - d.px, dy = z.y - d.py, q = dx * dx + dy * dy;
      if (z.hp > 0 && q < nd) { nd = q; near = z; }
    }
    if (near) {
      d.face = near.x >= d.px ? 1 : -1;
      if (d.mcd <= 0) {
        d.mcd = MELEE.cd * (starving ? 1.7 : 1);
        near.hp -= MELEE.dmg; d.stab = 0.15;
        addBurst(near.x, near.y, '#9ad06a', 2);
        slashFx(d, near);
      }
      continue;
    }
    // then shoot the closest thing in range
    if (d.cd > 0 || G.ammo < 1) continue;
    const range = tower ? GUN.towerRange : GUN.range;
    let best = null, bd = range * range;
    for (let j = 0; j < zombies.length; j++) {
      const z = zombies[j]; if (z.hp <= 0) continue;
      const dx = z.x - d.px, dy = z.y - d.py, q = dx * dx + dy * dy;
      if (q < bd) { bd = q; best = z; }
    }
    if (best) {
      G.ammo -= 1; best.hp -= GUN.dmg; d.shot = 0.08;
      d.cd = (tower ? GUN.towerCd : GUN.cd) * (starving ? 1.8 : 1) * (0.9 + rng() * 0.2);
      d.face = best.x >= d.px ? 1 : -1;
      tracers.push({ x1: d.px, y1: d.py - 0.2, x2: best.x, y2: best.y - 0.2, life: 0.09 });
      addBurst(best.x, best.y, '#c33', 1);
    }
  }
}
function slashFx(d, z) { tracers.push({ x1: z.x - 0.25, y1: z.y - 0.3, x2: z.x + 0.25, y2: z.y + 0.1, life: 0.1, slash: true }); }
function addBurst(x, y, color, n) {
  if (parts.length > 500) return;
  for (let i = 0; i < n; i++) parts.push({ x, y, vx: (rng() - 0.5) * 3, vy: (rng() - 0.5) * 3 - 0.5, life: 0.25 + rng() * 0.25, color });
}

// ---- economy ---------------------------------------------------------------
const storeCap = () => LEVELS[G.level - 1].store;
function updateEconomy(dt) {
  const upkeep = 0.15 + 0.08 * defenders.length;
  const base = 1 + 0.3 * (G.level - 1);
  const ra = (G.income.a + 0.2 * base), rm = (G.income.m + 0.35 * base), rf = (G.income.f + 0.25 * base) - upkeep;
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
    if (G.coreHp < LEVELS[G.level - 1].coreHp) G.coreHp = Math.min(LEVELS[G.level - 1].coreHp, G.coreHp + 6);
  }
}

// ---- phases ---------------------------------------------------------------
function updatePhase(dt) {
  G.phaseT += dt;
  if (!G.night) {
    // thin daytime trickle
    G.spawnAcc += dt * (0.15 + 0.05 * G.nightNum);
    if (G.phaseT >= DAY_LEN) startNight();
  } else {
    G.spawnAcc += dt * (G.nightTotal / NIGHT_LEN);
    if (G.phaseT >= NIGHT_LEN) {
      G.night = false; G.phaseT = 0; G.nightsSurvived++;
      toast('Dawn. Night ' + G.nightNum + ' survived - rebuild and expand');
    }
  }
  while (G.spawnAcc >= 1) { G.spawnAcc -= 1; spawnZombie(); }
}
function startNight() {
  G.night = true; G.phaseT = 0; G.nightNum++;
  G.nightTotal = 30 + 25 * G.nightNum;
  toast('Night ' + G.nightNum + ' - about ' + G.nightTotal + ' of them are coming');
}

// ---- build actions ---------------------------------------------------------------
function canAfford(c) { return (!c.m || G.mat >= c.m) && (!c.f || G.food >= c.f) && (!c.a || G.ammo >= c.a); }
function pay(c) { G.mat -= c.m || 0; G.food -= c.f || 0; G.ammo -= c.a || 0; }
function tryBuild(tx, ty) {
  if (G.over || !inb(tx, ty)) return;
  const i = ty * W + tx;
  if (bld[i] >= 0 || isCoreTile(tx, ty)) return;
  const tool = G.tool;
  if (tool === 'wall' || tool === 'tower') {
    const kind = tool === 'wall' ? 1 : 2;
    if (wall[i] === kind || wall[i] > kind) return;
    const cost = wall[i] === 1 && kind === 2 ? { m: COST.tower.m - COST.wall.m } : COST[tool];
    if (!canAfford(cost)) { if (!G.warnT || G.warnT < performance.now()) { toast('Not enough materials'); G.warnT = performance.now() + 1500; } return; }
    pay(cost);
    const hadDef = defAt[i];
    setWall(tx, ty, kind);
    if (hadDef) defAt[i] = hadDef;
    G.fieldDirty = true;
  } else if (tool === 'def') {
    if (!wall[i] || defAt[i]) return;
    if (defenders.length >= LEVELS[G.level - 1].defs) { toast('Defender limit reached - upgrade the core'); return; }
    if (!canAfford(COST.def)) { toast('Not enough food'); return; }
    pay(COST.def); addDefender(tx, ty);
  } else if (tool === 'erase') {
    if (defAt[i]) { removeDefender(defAt[i]); G.food += COST.def.f / 2; return; }
    if (wall[i]) {
      G.mat += (wall[i] === 2 ? COST.tower.m : COST.wall.m) / 2;
      wall[i] = 0; wallHp[i] = 0; G.fieldDirty = true;
    }
  }
}
function upgradeCore() {
  const L = LEVELS[G.level - 1];
  if (!L.up) return toast('Core is at max level');
  if (!canAfford(L.up)) return toast('Need ' + L.up.m + ' materials and ' + L.up.f + ' food');
  pay(L.up); G.level++;
  G.coreHp = LEVELS[G.level - 1].coreHp;
  for (let i = 0; i < W * H; i++) if (wall[i]) wallHp[i] = Math.max(wallHp[i], maxHp(wall[i]) * 0.8);
  G.fieldDirty = true;
  toast('Core upgraded to level ' + G.level + ' - territory limit ' + LEVELS[G.level - 1].cap);
}

// ---- rendering ---------------------------------------------------------------
const canvas = $('c'), ctx = canvas.getContext('2d');
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
  ctx.fillStyle = '#0e1210'; ctx.fillRect(0, 0, cw, ch);
  ctx.setTransform(z, 0, 0, z, cw / 2 - cam.x * T * z, ch / 2 - cam.y * T * z);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(terrain, 0, 0);
  ctx.drawImage(decals, 0, 0);
  ctx.drawImage(claimLayer, 0, 0);

  // visible tile range
  const vx0 = clamp(((cam.x * T - cw / 2 / z) / T | 0) - 1, 0, W - 1), vx1 = clamp(((cam.x * T + cw / 2 / z) / T | 0) + 1, 0, W - 1);
  const vy0 = clamp(((cam.y * T - ch / 2 / z) / T | 0) - 1, 0, H - 1), vy1 = clamp(((cam.y * T + ch / 2 / z) / T | 0) + 1, 0, H - 1);

  // core
  const cx = (CORE.x - 1) * T, cy = (CORE.y - 1) * T;
  ctx.fillStyle = '#3b4a58'; ctx.fillRect(cx, cy, T * 3, T * 3);
  ctx.fillStyle = '#51677a'; ctx.fillRect(cx + 2, cy + 2, T * 3 - 4, T * 3 - 4);
  ctx.fillStyle = '#2a3844'; ctx.fillRect(cx + 10, cy + 10, T * 3 - 20, T * 3 - 20);
  ctx.fillStyle = '#e84a3a'; ctx.fillRect(cx + T * 1.5 - 1, cy + 2, 1, 9); ctx.fillRect(cx + T * 1.5, cy + 2, 6, 4);
  const frac = Math.max(0, G.coreHp / LEVELS[G.level - 1].coreHp);
  ctx.fillStyle = '#000a'; ctx.fillRect(cx, cy - 5, T * 3, 3);
  ctx.fillStyle = frac > 0.4 ? '#5ec26a' : '#e8524a'; ctx.fillRect(cx, cy - 5, T * 3 * frac, 3);

  // walls
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
    } else {
      ctx.fillStyle = '#00000077'; ctx.fillRect(px + 1, py + 3, T, T);
      ctx.fillStyle = '#6a7078'; ctx.fillRect(px, py, T, T);
      ctx.fillStyle = '#8a9098'; ctx.fillRect(px, py, T, 3);
      ctx.fillStyle = '#4f545b'; ctx.fillRect(px + 1, py + 4, T - 2, T - 5);
      ctx.fillStyle = '#7d848c'; ctx.fillRect(px + 2, py + 5, T - 4, T - 7);
      ctx.fillStyle = '#8a9098'; for (let c = 0; c < 4; c++) ctx.fillRect(px + c * 4 + 0, py - 1, 3, 2);
    }
    const f = wallHp[i] / maxHp(k);
    if (f < 0.97) {
      ctx.fillStyle = 'rgba(0,0,0,' + ((1 - f) * 0.5) + ')'; ctx.fillRect(px, py, T, T);
      ctx.fillStyle = '#000a'; ctx.fillRect(px + 1, py + T - 3, T - 2, 2);
      ctx.fillStyle = f > 0.4 ? '#e8c547' : '#e8524a'; ctx.fillRect(px + 1, py + T - 3, (T - 2) * f, 2);
    }
  }

  // collect drawables, sorted by y so crowds layer correctly
  const items = [];
  for (const zb of zombies) {
    if (zb.x < vx0 - 1 || zb.x > vx1 + 2 || zb.y < vy0 - 1 || zb.y > vy1 + 2) continue;
    items.push(zb);
  }
  for (const d of defenders) items.push(d);
  const sortY = o => o.px !== undefined ? o.py : o.y;
  items.sort((a, b) => sortY(a) - sortY(b));
  for (const o of items) {
    if (o.px !== undefined) {
      const bob = o.stab > 0 ? -1 : 0; o.stab -= 0.016;
      drawSprite(SPR.def, o.px, o.py + 0.1, 1, o.face < 0, bob - 2);
      if (o.hp < 60) { ctx.fillStyle = '#000a'; ctx.fillRect(o.px * T - 5, o.py * T - 14, 10, 2); ctx.fillStyle = '#e8524a'; ctx.fillRect(o.px * T - 5, o.py * T - 14, 10 * o.hp / 60, 2); }
      if (o.shot > 0) { ctx.fillStyle = '#ffe9a0'; ctx.fillRect(o.px * T + (o.face > 0 ? 6 : -8), o.py * T - 6, 3, 2); }
    } else {
      const zt = ZTYPES[o.type];
      const img = o.type === 'walker' ? SPR[o.variant] : SPR[o.type];
      const bob = Math.sin(o.anim) * 0.8 - (o.climb > 0 ? 3 : 0);
      drawSprite(img, o.x, o.y, zt.scale, o.face < 0, bob);
      if (o.type === 'brute' && o.hp < zt.hp) { ctx.fillStyle = '#000a'; ctx.fillRect(o.x * T - 6, o.y * T - 22, 12, 2); ctx.fillStyle = '#e8524a'; ctx.fillRect(o.x * T - 6, o.y * T - 22, 12 * o.hp / zt.hp, 2); }
    }
  }

  // tracers + particles
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

  // build cursor
  if (G.hover && !G.over) {
    const { tx, ty } = G.hover, i = ty * W + tx;
    let ok = inb(tx, ty) && bld[i] < 0 && !isCoreTile(tx, ty);
    if (ok && G.tool === 'def') ok = wall[i] > 0 && !defAt[i];
    if (ok && G.tool === 'erase') ok = wall[i] > 0 || !!defAt[i];
    if (ok && (G.tool === 'wall' || G.tool === 'tower')) ok = wall[i] < (G.tool === 'wall' ? 1 : 2);
    ctx.fillStyle = ok ? 'rgba(120,255,140,0.28)' : 'rgba(255,90,80,0.28)';
    ctx.fillRect(tx * T, ty * T, T, T);
    ctx.strokeStyle = ok ? '#7dff8c' : '#ff5a50'; ctx.lineWidth = 0.8; ctx.strokeRect(tx * T + 0.5, ty * T + 0.5, T - 1, T - 1);
    if (G.tool === 'def' && ok) {
      const r = (wall[i] === 2 ? GUN.towerRange : GUN.range) * T;
      ctx.strokeStyle = 'rgba(255,230,120,0.5)'; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc((tx + 0.5) * T, (ty + 0.5) * T, r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // night tint
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const f = nightAmount();
  if (f > 0) { ctx.fillStyle = 'rgba(4,8,30,' + (0.5 * f).toFixed(3) + ')'; ctx.fillRect(0, 0, cw, ch); }
}
function nightAmount() {
  const fade = 6;
  if (G.night) return Math.min(1, G.phaseT / fade, (NIGHT_LEN - G.phaseT) / fade);
  return 0;
}

// ---- HUD ---------------------------------------------------------------
let toastTimer = 0;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}
const fmtRate = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '/s';
function costStr(c) { return [c.m && c.m + 'm', c.f && c.f + 'f', c.a && c.a + 'a'].filter(Boolean).join(' '); }
function updateHud() {
  const L = LEVELS[G.level - 1];
  $('rAmmo').textContent = G.ammo | 0; $('dAmmo').textContent = fmtRate(G.net.a);
  $('rMat').textContent = G.mat | 0; $('dMat').textContent = fmtRate(G.net.m);
  $('rFood').textContent = G.food | 0; $('dFood').textContent = fmtRate(G.net.f);
  $('rFood').style.color = G.food <= 0 ? 'var(--bad)' : '';
  $('rAmmo').style.color = G.ammo < 1 ? 'var(--bad)' : '';
  $('zCount').textContent = zombies.length;
  const clock = $('clock');
  clock.classList.toggle('night', G.night);
  $('clockTxt').textContent = G.night ? 'Night ' + G.nightNum : 'Day ' + (G.nightNum + 1) + ' - night in ' + Math.max(0, Math.ceil(DAY_LEN - G.phaseT)) + 's';
  $('clockBar').style.width = (G.phaseT / (G.night ? NIGHT_LEN : DAY_LEN) * 100) + '%';
  $('cWall').textContent = costStr(COST.wall); $('cTower').textContent = costStr(COST.tower); $('cDef').textContent = costStr(COST.def);
  $('cUp').textContent = L.up ? costStr(L.up) : 'MAX';
  $('btnUp').disabled = !L.up || !canAfford(L.up);
  $('btnNight').disabled = G.night;
  document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === G.tool));
  document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', (+b.dataset.speed === 0 ? G.paused : !G.paused && +b.dataset.speed === G.speed)));
  $('iLvl').textContent = G.level + ' / ' + LEVELS.length;
  $('iCore').textContent = Math.max(0, G.coreHp | 0) + ' / ' + L.coreHp;
  $('iTerr').textContent = G.territory + ' / ' + L.cap;
  const seal = $('iSeal'); seal.textContent = G.sealed ? 'Sealed' : 'OPEN'; seal.className = G.sealed ? 'ok' : 'warn';
  $('iBld').textContent = G.held;
  $('iDef').textContent = defenders.length + ' / ' + L.defs + (G.food <= 0 ? ' (starving)' : '');
  $('iNights').textContent = G.nightsSurvived; $('iKills').textContent = G.kills;
}

function gameOver() {
  G.over = true;
  $('ovTitle').textContent = 'The core has fallen';
  $('ovBody').innerHTML = '<p>You survived <b>' + G.nightsSurvived + '</b> night' + (G.nightsSurvived === 1 ? '' : 's') +
    ' and killed <b>' + G.kills + '</b> zombies.</p>';
  $('btnStart').textContent = 'Try again';
  $('overlay').classList.remove('hidden');
}

// ---- input ---------------------------------------------------------------
const keys = {};
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
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => {
  if (!G || $('overlay').classList.contains('hidden') === false) return;
  lastMouse = { x: e.clientX, y: e.clientY };
  if (e.button === 2 || e.button === 1) { panning = true; return; }
  if (e.button === 0) { painting = true; lastPaint = screenToTile(e.clientX, e.clientY); tryBuild(lastPaint.tx, lastPaint.ty); }
});
addEventListener('mouseup', () => { panning = false; painting = false; lastPaint = null; });
canvas.addEventListener('mousemove', e => {
  if (!G) return;
  G.hover = screenToTile(e.clientX, e.clientY);
  if (panning) {
    G.cam.x -= (e.clientX - lastMouse.x) / G.cam.zoom / T; G.cam.y -= (e.clientY - lastMouse.y) / G.cam.zoom / T;
  } else if (painting && (G.tool !== 'none')) {
    const cur = G.hover; if (lastPaint) paintLine(lastPaint, cur); lastPaint = cur;
  }
  lastMouse = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('mouseleave', () => { if (G) G.hover = null; });
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const z0 = G.cam.zoom;                          // keep the point under the cursor fixed
  const wx = (e.clientX - innerWidth / 2) / z0 / T + G.cam.x, wy = (e.clientY - innerHeight / 2) / z0 / T + G.cam.y;
  const z1 = G.cam.zoom = clamp(z0 * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.9, 6);
  G.cam.x = wx - (e.clientX - innerWidth / 2) / z1 / T; G.cam.y = wy - (e.clientY - innerHeight / 2) / z1 / T;
}, { passive: false });
addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if (!G) return;
  const k = e.key.toLowerCase();
  if (k === '1') G.tool = 'wall'; else if (k === '2') G.tool = 'tower'; else if (k === '3') G.tool = 'def'; else if (k === '4') G.tool = 'erase';
  else if (k === 'u') upgradeCore();
  else if (k === 'n') callNight();
  else if (k === ' ') { G.paused = !G.paused; e.preventDefault(); }
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => { G.tool = b.dataset.tool; }));
document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => {
  const s = +b.dataset.speed; if (s === 0) G.paused = !G.paused; else { G.paused = false; G.speed = s; }
}));
$('btnUp').addEventListener('click', upgradeCore);
$('btnNight').addEventListener('click', callNight);
function callNight() { if (G && !G.night && !G.over) startNight(); }
$('btnStart').addEventListener('click', () => {
  if (!G || G.over) newGame();
  $('overlay').classList.add('hidden');
});

// ---- main loop ---------------------------------------------------------------
let last = performance.now();
function frame(now) {
  const real = Math.min(0.05, (now - last) / 1000); last = now;
  if (G) {
    const spd = (keys.shift ? 2.2 : 1) * 600 / G.cam.zoom / T;
    if (keys.w || keys.arrowup) G.cam.y -= spd * real;
    if (keys.s || keys.arrowdown) G.cam.y += spd * real;
    if (keys.a || keys.arrowleft) G.cam.x -= spd * real;
    if (keys.d || keys.arrowright) G.cam.x += spd * real;
    G.cam.x = clamp(G.cam.x, 0, W); G.cam.y = clamp(G.cam.y, 0, H);

    const playing = !G.paused && !G.over && $('overlay').classList.contains('hidden');
    if (playing) {
      for (let s = 0; s < G.speed; s++) simulate(real);
    }
    G.hudT -= real;
    if (G.hudT <= 0) { G.hudT = 0.1; updateHud(); }
    render();
  }
  requestAnimationFrame(frame);
}
function simulate(dt) {
  G.fieldTimer -= dt;
  if (G.fieldDirty && G.fieldTimer <= 0) {
    computeField(); computeTerritory();
    G.fieldDirty = false; G.fieldTimer = 0.2;
  }
  updatePhase(dt);
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
window.__game = { get G() { return G; }, zombies: () => zombies, defenders: () => defenders, tryBuild, startNight, simulate };
