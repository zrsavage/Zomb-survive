'use strict';
/* world.js - map data, town generation, flow fields, territory and fog of war. */

// ---- world state ---------------------------------------------------------------
const ground = new Uint8Array(W * H);          // 0 grass, 1 road, 2 park, 3 sidewalk
const bld = new Int16Array(W * H);             // building index or -1
const wall = new Uint8Array(W * H);            // 0 none, else K.* kind
const wallHp = new Float32Array(W * H);
const wallTier = new Uint8Array(W * H);         // 0 timber, 1 reinforced, 2 concrete
const elec = new Uint8Array(W * H);             // 1 = electrified wall
const claimed = new Uint8Array(W * H);
const explored = new Uint8Array(W * H);
const vis = new Uint8Array(W * H);             // currently in sight
const dist = new Float64Array(W * H), nextTile = new Int32Array(W * H);     // flow field to the camp
const pdist = new Float64Array(W * H), pnext = new Int32Array(W * H);       // flow field to the survivor
const ndist = new Float64Array(W * H), nnext = new Int32Array(W * H);       // flow field to the latest noise
let buildings = [], lamps = [];
let defAt = new Array(W * H).fill(null);
let trapAt = new Array(W * H).fill(null);
let zombies = [], defenders = [], hordes = [], traps = [], crates = [], decoys = [], rings = [];
let facilities = [], fires = [], turning = [], facAt = new Array(W * H).fill(null);
let sewers = [], herds = [];
let tracers = [], parts = [], texts = [], flashes = [];
let P = null;                                  // the survivor
let G = null;                                  // game state

const solidForWalker = i => bld[i] >= 0;

// ---- town generation (deterministic from a seed so saves stay small) -----------------------
// ---- the town's building layouts (12 unique lots; the town is four mirrored copies of one district) ------------------------------
const LAYOUTS = {
  houses2:    [['house', 0, 1, 4, 3], ['house', 5, 4, 4, 4]],
  cottages3:  [['house', 0, 0, 3, 3], ['house', 4, 0, 4, 3], ['house', 1, 5, 5, 3]],
  house_big:  [['house', 1, 1, 7, 6]],
  yard:       [['house', 2, 2, 5, 5]],
  supermarket:[['store', 1, 1, 7, 5]],
  shop_row:   [['store', 0, 1, 4, 4], ['store', 5, 1, 4, 4]],
  corner_lot: [['store', 0, 0, 4, 3], ['garage', 5, 3, 4, 5]],
  garage:     [['garage', 1, 2, 6, 5]],
  workshop2:  [['garage', 0, 0, 5, 4], ['warehouse', 4, 5, 5, 4]],
  warehouse:  [['warehouse', 0, 1, 8, 6]],
  park:       [],
  orchard:    [],
};
const DISTRICT = [
  ['houses2',   'supermarket', 'park',    'garage'],
  ['cottages3', 'warehouse',   'shop_row', 'house_big'],
  ['workshop2', 'yard',        'orchard', 'corner_lot'],
];

function genTown(seed, wealth) {
  wealth = wealth || 1;
  const wr = mulberry32(seed);
  bld.fill(-1); ground.fill(0); buildings = []; lamps = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if (x % PITCH < 2 || y % PITCH < 2) ground[y * W + x] = 1;

  // The town is four copies of one district (mirrored so they do not look identical). A district is 4 x 3 city blocks,
  // each block holding one of 12 hand-made lot layouts: [type, x, y, w, h] inside the 9 x 9 block.
  const blockXs = [], blockYs = [];
  for (let x = 2; x + 9 <= W; x += PITCH) blockXs.push(x);
  for (let y = 2; y + 9 <= H; y += PITCH) blockYs.push(y);
  const DW = blockXs.length >> 1, DH = blockYs.length >> 1;                       // blocks per district (4 x 3)
  const mx = wr() < 0.5, my = wr() < 0.5;                                          // each town mirrors the template differently
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const flipX = (dx === 1) !== mx, flipY = (dy === 1) !== my;
    for (let r = 0; r < DH; r++) for (let c = 0; c < DW; c++) {
      const lay = LAYOUTS[DISTRICT[r][c]];
      const bx = blockXs[dx * DW + (flipX ? DW - 1 - c : c)], by = blockYs[dy * DH + (flipY ? DH - 1 - r : r)];
      if (!lay.length) { for (let y = by; y < by + 9; y++) for (let x = bx; x < bx + 9; x++) ground[y * W + x] = 2; continue; }
      for (const [type, lx, ly, w, h] of lay) {
        const x = bx + (flipX ? 9 - lx - w : lx), y = by + (flipY ? 9 - ly - h : ly);
        if (x + w > CORE.x - 6 && x < CORE.x + 7 && y + h > CORE.y - 6 && y < CORE.y + 7) continue;     // keep the camp clear
        const roofs = BUILDING_TYPES[type].roof;
        const b = { x, y, w, h, type, roof: roofs[wr() * roofs.length | 0], seed: wr() * 1e9 | 0, claimed: false, looted: false, crew: false };
        const id = buildings.push(b) - 1;
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) bld[yy * W + xx] = id;
      }
    }
  }
  // points of interest: convert some big, distant buildings
  {
    const cand = buildings.map((b, i) => ({ b, i, d: Math.hypot(b.x + b.w / 2 - CORE.x, b.y + b.h / 2 - CORE.y) }))
      .filter(c => c.d >= 13 && c.b.w * c.b.h >= 14).sort(() => wr() - 0.5);
    const used = [];
    for (const type of POI_ORDER) {
      const c = cand.find(c => !used.includes(c.i) && used.every(u => Math.hypot(buildings[u].x - c.b.x, buildings[u].y - c.b.y) > 12));
      if (!c) continue;
      used.push(c.i); c.b.type = type; c.b.poi = true; c.b.locked = !!BUILDING_TYPES[type].locked;
      c.b.roof = BUILDING_TYPES[type].roof[wr() * BUILDING_TYPES[type].roof.length | 0];
    }
  }
  // every building holds a finite stock: scavenging and passive income both draw it down
  for (const b of buildings) {
    const t = BUILDING_TYPES[b.type], mult = (b.poi ? STOCK.poiMult : STOCK.mult) * wealth;
    b.stock = {}; b.s0 = 0;
    for (const k of STOCK_KEYS) if (t.loot[k]) { b.stock[k] = Math.round(t.loot[k] * mult * (0.7 + wr() * 0.6)); b.s0 += b.stock[k]; }
  }
  // sewer access points on the roads around the camp (zombies may use them; sealing needs a grate)
  sewers = [];
  for (let t = 0; t < 200 && sewers.length < SEWER.count; t++) {
    const x = wr() * W | 0, y = wr() * H | 0, d = Math.hypot(x - CORE.x, y - CORE.y);
    if (ground[y * W + x] !== 1 || d < SEWER.minD || d > SEWER.maxD || isCoreTile(x, y)) continue;
    if (sewers.some(s => Math.hypot(s.x - x, s.y - y) < 6)) continue;
    sewers.push({ x, y, found: false, sealed: false });
  }
  // sidewalks: block tiles touching a road
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (ground[i] !== 0 || bld[i] >= 0) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (inb(nx, ny) && ground[ny * W + nx] === 1) { ground[i] = 3; break; }
    }
  }
  // street lamps at block corners
  for (let iy = 0; iy * PITCH < H; iy++) for (let ix = 0; ix * PITCH < W; ix++) {
    const x = ix * PITCH + 2, y = iy * PITCH + 2;
    if (!inb(x, y) || bld[y * W + x] >= 0 || wr() < 0.3) continue;
    lamps.push({ x: x + 0.5, y: y + 0.5, on: wr() < 0.75, ph: wr() * 6 });
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
function computeField(sources, D, N, solid) {
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
  let guard = 0;
  while (heap.length && guard++ < 400000) {          // distances are Float64 so equal values compare equal; the cap is a last-resort safety net
    const [d, i] = pop();
    if (d > D[i]) continue;
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of NB) {
      const nx = x + dx, ny = y + dy;
      if (!inb(nx, ny)) continue;
      if (dx && dy && !diagOpen(x, y, dx, dy)) continue;
      const ni = ny * W + nx;
      if (bld[ni] >= 0 || (solid && wall[ni])) continue;
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

function computeNoiseField(x, y) {
  computeField([clamp(y | 0, 0, H - 1) * W + clamp(x | 0, 0, W - 1)], ndist, nnext);
}

// ---- territory ---------------------------------------------------------------
function computeTerritory() {
  claimed.fill(0);
  for (const b of buildings) b.claimed = false;
  const cap = LEVELS[G.level - 1].cap;
  // Flood outward from the core. Walls and buildings stop it. If the walls really do close a loop, everything inside is yours
  // however big (a block, a district, the whole town); if there is a gap, the camp only holds the ground nearest the core.
  const run = limit => {
    claimed.fill(0);
    const q = [];
    const start = (x, y) => { const i = y * W + x; if (inb(x, y) && !claimed[i] && !isCoreTile(x, y) && bld[i] < 0 && !wall[i]) { claimed[i] = 1; q.push(i); } };
    for (let d = -2; d <= 2; d++) { start(CORE.x + d, CORE.y - 2); start(CORE.x + d, CORE.y + 2); start(CORE.x - 2, CORE.y + d); start(CORE.x + 2, CORE.y + d); }
    let count = q.length, sealed = true;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of N4) {
        const nx = x + dx, ny = y + dy;
        if (!inb(nx, ny)) { sealed = false; if (limit > cap) return { q, count, sealed }; continue; }
        const ni = ny * W + nx;
        if (claimed[ni] || bld[ni] >= 0 || wall[ni] || isCoreTile(nx, ny)) continue;
        if (count >= limit) { sealed = false; continue; }
        claimed[ni] = 1; q.push(ni); count++;
      }
    }
    return { q, count, sealed };
  };
  let r = run(W * H);
  if (!r.sealed) r = run(cap);
  const q = r.q, count = r.count, sealed = r.sealed;
  const inc = { m: 0, f: 0, a: 0, med: 0, fuel: 0 };
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
    inc.m += (r.m || 0) * mult; inc.f += (r.f || 0) * mult; inc.a += (r.a || 0) * mult; inc.med += (r.med || 0) * mult; inc.fuel += (r.fuel || 0) * mult;
  }
  G.territory = count; G.sealed = sealed; G.income = inc; G.held = held;
  Art.renderClaim();
}

// ---- vision / fog of war ---------------------------------------------------------------
const lookoutR = () => (LOOKOUT.detect + LOOKOUT.detectPerLevel * (G.level - 1)) * (has('watch') ? 1.5 : 1);
const lookoutVis = () => LOOKOUT.vision + (has('watch') ? 4 : 0);
function reveal(cx, cy, r) {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    if (dx * dx + dy * dy <= r2) { const i = y * W + x; vis[i] = 1; explored[i] = 1; }
  }
}
const fogCanvas = document.createElement('canvas'); fogCanvas.width = W; fogCanvas.height = H;
const fogCtx = fogCanvas.getContext('2d'), fogImg = fogCtx.createImageData(W, H);
// a posted defender sees as far as the gun can reach, and no further
const defSight = d => { const wk = wall[d.y * W + d.x], tower = wk === K.TOWER || wk === K.OUTPOST; return (tower ? GUN.towerRange : GUN.range) * (d.s.role === 'sniper' ? SNIPER.range : 1) * tmul(d.s, 'range') + 2; };
function updateVision() {
  vis.fill(0);
  const storm = (G.storm > 0 ? 0.65 : 1) * (G.fog > 0 ? FOG.vision : 1);
  reveal(P.px, P.py, PLAYER.vision * storm);
  reveal(CORE.x + 0.5, CORE.y + 0.5, 12 * storm);
  for (const d of defenders) reveal(d.px, d.py, defSight(d) * storm);
  G.lookouts = []; G.outposts = [];
  for (let i = 0; i < W * H; i++) if (wall[i] === K.LOOKOUT || wall[i] === K.OUTPOST) {
    const x = i % W + 0.5, y = ((i / W) | 0) + 0.5;
    G.lookouts.push({ x, y }); reveal(x, y, lookoutVis() * storm);
    if (wall[i] === K.OUTPOST) G.outposts.push({ x, y, i });
  }
  const d = fogImg.data;
  for (let i = 0; i < W * H; i++) {
    d[i * 4] = 4; d[i * 4 + 1] = 7; d[i * 4 + 2] = 11;
    d[i * 4 + 3] = vis[i] ? 0 : explored[i] ? 125 : 255;
  }
  fogCtx.putImageData(fogImg, 0, 0);
}
