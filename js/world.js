'use strict';
/* world.js - map data, town generation, flow fields, territory and fog of war. */

// ---- world state ---------------------------------------------------------------
const ground = new Uint8Array(W * H);          // 0 grass, 1 road, 2 park, 3 sidewalk
const bld = new Int16Array(W * H);             // building index or -1
const wall = new Uint8Array(W * H);            // 0 none, else K.* kind
const wallHp = new Float32Array(W * H);
const claimed = new Uint8Array(W * H);
const explored = new Uint8Array(W * H);
const vis = new Uint8Array(W * H);             // currently in sight
const dist = new Float32Array(W * H), nextTile = new Int32Array(W * H);     // flow field to the camp
const pdist = new Float32Array(W * H), pnext = new Int32Array(W * H);       // flow field to the survivor
let buildings = [], lamps = [];
let defAt = new Array(W * H).fill(null);
let trapAt = new Array(W * H).fill(null);
let zombies = [], defenders = [], hordes = [], traps = [], crates = [];
let tracers = [], parts = [], texts = [], flashes = [];
let P = null;                                  // the survivor
let G = null;                                  // game state

const solidForWalker = i => bld[i] >= 0;

// ---- town generation (deterministic from a seed so saves stay small) -----------------------
function genTown(seed) {
  const wr = mulberry32(seed);
  bld.fill(-1); ground.fill(0); buildings = []; lamps = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if (x % PITCH < 2 || y % PITCH < 2) ground[y * W + x] = 1;

  const blockXs = [2, 13, 24, 35, 46, 57], blockYs = [2, 13, 24, 35];
  const typeBag = [];
  for (const k in BUILDING_TYPES) for (let i = 0; i < BUILDING_TYPES[k].w; i++) typeBag.push(k);

  for (const by of blockYs) for (const bx of blockXs) {
    const bw = Math.min(9, W - bx), bh = Math.min(9, H - by);
    const nearCore = bx <= CORE.x + 5 && bx + bw >= CORE.x - 5 && by <= CORE.y + 5 && by + bh >= CORE.y - 5;
    if (!nearCore && wr() < 0.13) {            // park block
      for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) ground[y * W + x] = 2;
      continue;
    }
    const placed = [];
    for (let t = 0; t < 16; t++) {
      const w = 3 + (wr() * 4 | 0), h = 3 + (wr() * 3 | 0);
      if (w > bw - 2 || h > bh - 2) continue;
      const x = bx + 1 + (wr() * (bw - 1 - w) | 0), y = by + 1 + (wr() * (bh - 1 - h) | 0);
      if (x + w > CORE.x - 6 && x < CORE.x + 7 && y + h > CORE.y - 6 && y < CORE.y + 7) continue;
      if (placed.some(p => x < p.x + p.w + 1 && x + w + 1 > p.x && y < p.y + p.h + 1 && y + h + 1 > p.y)) continue;
      placed.push({ x, y, w, h });
    }
    for (const p of placed) {
      const type = typeBag[wr() * typeBag.length | 0];
      const roofs = BUILDING_TYPES[type].roof;
      const b = { ...p, type, roof: roofs[wr() * roofs.length | 0], seed: wr() * 1e9 | 0, claimed: false, looted: false, crew: false };
      const id = buildings.push(b) - 1;
      for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) bld[y * W + x] = id;
    }
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
function updateVision() {
  vis.fill(0);
  const storm = G.storm > 0 ? 0.65 : 1;
  reveal(P.px, P.py, PLAYER.vision * storm);
  reveal(CORE.x + 0.5, CORE.y + 0.5, 8 * storm);
  for (const d of defenders) reveal(d.px, d.py, 7 * storm);
  G.lookouts = [];
  for (let i = 0; i < W * H; i++) if (wall[i] === K.LOOKOUT) {
    const x = i % W + 0.5, y = ((i / W) | 0) + 0.5;
    G.lookouts.push({ x, y }); reveal(x, y, lookoutVis() * storm);
  }
  const d = fogImg.data;
  for (let i = 0; i < W * H; i++) {
    d[i * 4] = 4; d[i * 4 + 1] = 7; d[i * 4 + 2] = 11;
    d[i * 4 + 3] = vis[i] ? 0 : explored[i] ? 125 : 255;
  }
  fogCtx.putImageData(fogImg, 0, 0);
}
