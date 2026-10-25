'use strict';
/* ======================================================================
   art.js - all visuals that are drawn once or generated: the animated
   sprite atlas, the terrain/town, structures, camp and the fog texture.

   Sprites are built parametrically (a body described by dimensions + a pose
   per animation frame) and then outlined. That keeps every unit consistent,
   gives us walk/attack/climb animation for free, and means a hand-drawn atlas
   can later replace Art.sprites[name] without touching game code.
   ====================================================================== */
const Art = { sprites: {}, terrain: null, decals: null, claim: null, mini: null, fogTex: null };

function cell(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); return { c, g }; }

// ---- sprite construction ---------------------------------------------------------------
const DIMS = {
  human: { cw: 16, ch: 20, tw: 8,  th: 7,  hw: 6, hh: 6, legW: 2, legH: 5, armW: 2, armLen: 6 },
  lean:  { cw: 16, ch: 20, tw: 6,  th: 7,  hw: 6, hh: 6, legW: 2, legH: 6, armW: 2, armLen: 7 },
  crouch:{ cw: 16, ch: 18, tw: 7,  th: 6,  hw: 6, hh: 5, legW: 2, legH: 4, armW: 2, armLen: 8 },
  brute: { cw: 28, ch: 30, tw: 16, th: 12, hw: 9, hh: 8, legW: 4, legH: 7, armW: 4, armLen: 9 },
  bloat: { cw: 24, ch: 24, tw: 16, th: 11, hw: 6, hh: 6, legW: 3, legH: 4, armW: 3, armLen: 6 },
};

function figure(g, d, p, pal, o) {
  const cx = d.cw >> 1, feet = d.ch - 1;
  const legTop = feet - d.legH + 1, bob = p.bob || 0, lean = p.lean || 0;
  const tx = cx - (d.tw >> 1) + lean, ty = legTop - d.th + 1 + bob;
  const rect = (c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x | 0, y | 0, w, h); };

  // far arm (behind the torso)
  const farC = shade(pal.shirt, 0.7);
  if (p.arm === 'fwd' || p.arm === 'up') {
    if (p.arm === 'fwd') rect(farC, tx + d.tw - 3, ty + 2 + (p.armDy || 0), d.armLen, d.armW);
    else rect(farC, tx + d.tw - 4, ty - d.armLen + 4, d.armW, d.armLen);
  } else rect(farC, tx - 1, ty + 1, d.armW, d.armLen - 1);

  // legs
  const s = p.swing || 0;
  const legA = cx - (d.tw >> 1) + 1 + lean * 0.5, legB = cx + (d.tw >> 1) - 1 - d.legW + lean * 0.5;
  const liftA = s > 0 ? 1 : 0, liftB = s < 0 ? 1 : 0;
  rect(shade(pal.pants, 0.8), legB - s, legTop + liftB, d.legW, d.legH - liftB);
  rect(pal.pants, legA + s, legTop + liftA, d.legW, d.legH - liftA);
  rect(pal.shoe || '#1c1c20', legB - s, feet - liftB, d.legW + 1, 1);
  rect(pal.shoe || '#1c1c20', legA + s, feet - liftA, d.legW + 1, 1);

  // backpack
  if (o.pack) rect(o.pack, tx - 3, ty + 1, 3, d.th - 2);

  // torso
  rect(pal.shirt, tx, ty, d.tw, d.th);
  rect(shade(pal.shirt, 1.25), tx, ty, d.tw, 1);
  rect(shade(pal.shirt, 0.75), tx + d.tw - 1, ty + 1, 1, d.th - 1);
  rect(pal.belt || shade(pal.pants, 0.7), tx, ty + d.th - 1, d.tw, 1);
  if (o.cross) { rect('#fff', tx + 2, ty + 2, 4, 3); rect('#d33', tx + 3, ty + 2, 2, 3); rect('#d33', tx + 2, ty + 3, 4, 1); }
  if (o.blood) { rect('#7a1818', tx + 1 + (o.blood & 3), ty + 2, 3, 2); rect('#5a1010', tx + 3, ty + d.th - 3, 2, 2); }
  if (o.belly) { rect(o.belly, tx - 1, ty + 1, d.tw + 2, d.th - 2); rect(shade(o.belly, 1.2), tx + 2, ty + 2, 3, 2); rect(o.pustule || '#b05a3a', tx + 8, ty + 3, 2, 2); rect(o.pustule || '#b05a3a', tx + 4, ty + 6, 2, 2); }
  if (o.straps) { rect('#1c1c20', tx + 2, ty, 2, d.th); rect('#1c1c20', tx + d.tw - 4, ty, 2, d.th); }

  // head
  const hx = cx - (d.hw >> 1) + lean + 1, hy = ty - d.hh + 1 + (p.headBob || 0);
  rect(pal.skin, hx, hy, d.hw, d.hh);
  rect(shade(pal.skin, 0.8), hx, hy + d.hh - 1, d.hw, 1);
  const hat = o.hat;
  if (hat === 'helmet') { rect(pal.hat, hx - 1, hy - 1, d.hw + 2, 3); rect(shade(pal.hat, 1.3), hx, hy - 1, d.hw, 1); }
  else if (hat === 'cap') { rect(pal.hat, hx, hy - 1, d.hw, 3); rect(shade(pal.hat, 0.8), hx + d.hw - 1, hy + 1, 3, 1); }
  else if (hat === 'hard') { rect(pal.hat, hx - 1, hy - 1, d.hw + 2, 3); rect(shade(pal.hat, 1.3), hx + 1, hy - 2, d.hw - 2, 1); rect(shade(pal.hat, 0.7), hx - 1, hy + 1, d.hw + 2, 1); }
  else if (pal.hair) { rect(pal.hair, hx, hy, d.hw, 2); rect(pal.hair, hx, hy + 2, 1, 2); }
  const ex = hx + d.hw - 2, ey = hy + (d.hh >> 1) - (hat ? 0 : 1);
  rect(pal.eye || '#111', ex, ey, o.bigEye ? 2 : 1, o.bigEye ? 2 : 1);
  if (o.eye2) rect(pal.eye || '#111', ex - 3, ey, 1, 1);
  if (o.mouth) { const m = o.mouth; rect('#1a0606', hx + d.hw - 2 - m, hy + d.hh - 2 - (m > 1 ? 1 : 0), m + 1, m > 1 ? 3 : 1); }

  // near arm + held item
  const ax = tx + d.tw - 3, ay = ty + 1;
  if (p.arm === 'down') rect(pal.shirt, tx + (d.tw >> 1) - 1, ay + (p.armDy || 0), d.armW, d.armLen - 1);
  else if (p.arm === 'fwd') { rect(pal.shirt, ax, ay + (p.armDy || 0), d.armLen, d.armW); rect(pal.skin, ax + d.armLen - 2, ay + (p.armDy || 0), 2, d.armW); }
  else if (p.arm === 'up') { rect(pal.shirt, ax + 1, ty - d.armLen + 4, d.armW, d.armLen); rect(pal.skin, ax + 1, ty - d.armLen + 3, d.armW, 2); }
  else if (p.arm === 'aim' || p.arm === 'stab') {
    const len = p.arm === 'stab' ? 6 : 4;
    rect(pal.shirt, ax, ay + 1, len, d.armW); rect(pal.skin, ax + len - 1, ay + 1, 2, d.armW);
    if (p.arm === 'aim') {
      const gl = o.longGun ? 9 : 5;
      rect('#26262c', ax + len - 1, ay, gl, 2); rect('#4a4a54', ax + len - 1, ay, gl, 1);
      if (o.longGun) rect('#8fb0c8', ax + len + 2, ay - 1, 2, 1);
    } else { rect('#d8dde4', ax + len + 1, ay + 1, 4, 1); rect('#6a4a2a', ax + len - 1, ay + 1, 2, 2); }
  }
}

function outlined(src, col) {
  const w = src.width + 2, h = src.height + 2;
  const out = cell(w, h), t = cell(w, h);
  for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) t.g.drawImage(src, dx, dy);
  t.g.globalCompositeOperation = 'source-in'; t.g.fillStyle = col || '#0a0c10'; t.g.fillRect(0, 0, w, h);
  out.g.drawImage(t.c, 0, 0); out.g.drawImage(src, 1, 1);
  return out.c;
}
function makeSet(dim, pal, o, moves) {
  const set = { walk: [], attack: [], climb: [], idle: [], ax: 0, ay: 0 };
  const build = (pose, list) => {
    const k = cell(dim.cw, dim.ch);
    figure(k.g, dim, pose, pal, o);
    list.push(outlined(k.c));
  };
  const swing = moves.swing || 2;
  [[0, 0], [swing, -1], [0, 0], [-swing, -1]].forEach(([s, b]) => build({ swing: s, bob: b + (moves.bob || 0), arm: moves.walkArm, lean: moves.lean || 0, armDy: b }, set.walk));
  moves.attack.forEach(pose => build({ ...pose, lean: (moves.lean || 0) + (pose.lean || 0) }, set.attack));
  moves.climb.forEach(pose => build(pose, set.climb));
  build({ arm: moves.idleArm || moves.walkArm, lean: moves.lean || 0, bob: moves.bob || 0 }, set.idle);
  set.ax = (dim.cw >> 1) + 1; set.ay = dim.ch + 1;
  return set;
}

function buildSprites() {
  const S = Art.sprites;
  const zWalk = { walkArm: 'fwd', swing: 1, attack: [{ arm: 'up', bob: 0 }, { arm: 'fwd', bob: 1, lean: 1 }], climb: [{ arm: 'up', bob: -2, swing: 1 }, { arm: 'up', bob: -3, swing: -1 }] };
  // ordinary walkers: six palettes
  const skins = ['#7ea860', '#8db070', '#9bb27a', '#6f9b6a', '#86a868', '#a0b08a'];
  const shirts = ['#6b5a7a', '#7a6a52', '#5a6f86', '#8a4a4a', '#6a7a52', '#887a6a'];
  const pants = ['#3f4a5c', '#4a4a42', '#3a4252', '#52483a', '#40404a', '#46503e'];
  for (let i = 0; i < 6; i++) {
    S['z_walker' + i] = makeSet(DIMS.human, { skin: skins[i], shirt: shirts[i], pants: pants[i], eye: '#e84a3a', hair: i % 2 ? '#2a2018' : null }, { blood: i, eye2: true }, zWalk);
  }
  S.z_runner = makeSet(DIMS.lean, { skin: '#b8a65c', shirt: '#a8483c', pants: '#34343a', eye: '#ff3b2a' }, { blood: 2, eye2: true },
    { walkArm: 'fwd', swing: 3, lean: 2, attack: [{ arm: 'up' }, { arm: 'fwd', lean: 1 }], climb: [{ arm: 'up', bob: -2 }, { arm: 'up', bob: -3 }] });
  S.z_brute = makeSet(DIMS.brute, { skin: '#5f7f4e', shirt: '#3a3f4a', pants: '#2a2d34', eye: '#ffcc22' }, { straps: true, blood: 1, bigEye: true },
    { walkArm: 'fwd', swing: 2, attack: [{ arm: 'up' }, { arm: 'fwd', lean: 1 }], climb: [{ arm: 'up', bob: -2 }, { arm: 'up', bob: -3 }] });
  S.z_screamer = makeSet(DIMS.human, { skin: '#b9c9c0', shirt: '#6a6a80', pants: '#3c3c4a', eye: '#ff5a5a' }, { mouth: 2, bigEye: true, eye2: true },
    { walkArm: 'up', swing: 1, attack: [{ arm: 'up' }, { arm: 'up', bob: -1 }], climb: [{ arm: 'up', bob: -2 }, { arm: 'up', bob: -3 }] });
  S.z_leaper = makeSet(DIMS.crouch, { skin: '#9aa860', shirt: '#5a5646', pants: '#3a3a30', eye: '#ffe14a' }, { blood: 3, eye2: true },
    { walkArm: 'fwd', swing: 3, lean: 2, attack: [{ arm: 'fwd' }, { arm: 'up' }], climb: [{ arm: 'fwd', bob: -2 }, { arm: 'up', bob: -3 }] });
  S.z_bloater = makeSet(DIMS.bloat, { skin: '#8aa05a', shirt: '#b8c47a', pants: '#4a4a3a', eye: '#d8e04a' }, { belly: '#a8b868', pustule: '#c08a4a' },
    { walkArm: 'down', swing: 1, attack: [{ arm: 'fwd' }, { arm: 'fwd', lean: 1 }], climb: [{ arm: 'up', bob: -2 }, { arm: 'up', bob: -3 }] });

  const hum = (shirt, hat, hatC, o, hair) => makeSet(DIMS.human, { skin: '#e0b48a', shirt, pants: '#3a4658', hat: hatC, hair, eye: '#101418' }, { hat, ...o },
    { walkArm: 'aim', swing: 2, attack: [{ arm: 'stab', bob: 0 }, { arm: 'stab', bob: 0, lean: 1 }], climb: [{ arm: 'aim' }, { arm: 'aim' }] });
  S.player = hum('#e0842b', 'cap', '#7a5a3a', { pack: '#5a4228' }, '#3a2a1a');
  S.def_fighter = hum('#3f7fb8', 'helmet', '#4a5560', {});
  S.def_sniper = hum('#4a6a3a', 'cap', '#3a4a2a', { longGun: true });
  S.def_medic = hum('#ececf2', 'cap', '#e8e8ee', { cross: true });
  S.def_builder = hum('#c88a2a', 'hard', '#f0c030', {});
  S.def_scavenger = hum('#8a5a3a', 'cap', '#5a4a3a', { pack: '#3a3a44' });
  S.trader = hum('#6a3a7a', 'cap', '#d0b060', { pack: '#7a5a3a' });
  // pre-mirrored copies so facing left costs nothing at draw time
  for (const k in S) {
    const set = S[k]; set.fl = {};
    for (const list of ['walk', 'attack', 'climb', 'idle']) set.fl[list] = set[list].map(c => { const m = cell(c.width, c.height); m.g.translate(c.width, 0); m.g.scale(-1, 1); m.g.drawImage(c, 0, 0); return m.c; });
  }
}

// ---- terrain / town -----------------------------------------------------------------
function noiseTex() {
  const k = cell(128, 128), r = mulberry32(99);
  for (let i = 0; i < 46; i++) {
    const x = r() * 128, y = r() * 128, rad = 10 + r() * 26;
    for (const ox of [-128, 0, 128]) for (const oy of [-128, 0, 128]) {
      const gr = k.g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      k.g.fillStyle = gr; k.g.fillRect(0, 0, 128, 128);
    }
  }
  return k.c;
}

Art.renderTerrain = function () {
  const k = cell(W * T, H * T), g = k.g, r = mulberry32(1234);
  const R = (c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = ground[y * W + x], px = x * T, py = y * T;
    const pal = t === 1 ? ['#34383d', '#383c41', '#303439', '#3a3e43'] : t === 2 ? ['#3a6334', '#3f6c39', '#365d30', '#44743e'] :
      t === 3 ? ['#6d706c', '#72756f', '#686b67'] : ['#475a38', '#4b5f3b', '#425535', '#4f633f'];
    R(pal[r() * pal.length | 0], px, py, T, T);
    for (let i = 0; i < 9; i++) R(pal[r() * pal.length | 0], px + (r() * T | 0), py + (r() * T | 0), 1 + (r() * 3 | 0), 1);
    if (t === 0 || t === 2) {                                        // grass tufts and dirt
      for (let i = 0; i < 5; i++) { const gx = px + (r() * 15 | 0), gy = py + (r() * 13 | 0); R(r() < 0.5 ? '#2f4024' : '#6a8348', gx, gy, 1, 2 + (r() * 2 | 0)); }
      if (r() < 0.12) R('#5a4a34', px + (r() * 10 | 0), py + (r() * 10 | 0), 4, 2);
      if (t === 2 && r() < 0.15) { const fx = px + (r() * 14 | 0), fy = py + (r() * 14 | 0); R(['#e8d85a', '#e87aa0', '#fff'][r() * 3 | 0], fx, fy, 1, 1); }
    } else if (t === 1) {                                            // cracks, patches
      if (r() < 0.35) { let cx2 = px + (r() * 14 | 0), cy2 = py + (r() * 14 | 0); for (let i = 0; i < 6 + (r() * 6 | 0); i++) { R('#232629', cx2, cy2, 1, 1); cx2 += (r() * 3 | 0) - 1; cy2 += (r() * 3 | 0) - 1; } }
      if (r() < 0.07) R('#2c3035', px + 2, py + 3, 6 + (r() * 6 | 0), 4);
      if (r() < 0.012) { R('#202326', px + 4, py + 4, 8, 8); R('#2a2e32', px + 5, py + 5, 6, 6); R('#1a1c1f', px + 7, py + 5, 1, 6); }
      if (r() < 0.05) { const dc = ['#8a8a82', '#6a5a4a', '#9a9a50', '#a04a3a'][r() * 4 | 0]; R(dc, px + (r() * 12 | 0), py + (r() * 12 | 0), 2 + (r() * 3 | 0), 1 + (r() * 2 | 0)); }
    } else if (t === 3) {
      R('#595c59', px, py + 7, T, 1); R('#595c59', px + 7, py, 1, T);
      if (r() < 0.1) R('#4f7a3a', px + (r() * 14 | 0), py + 7, 1, 2);
    }
  }
  // road markings
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (ground[y * W + x] !== 1) continue;
    const px = x * T, py = y * T;
    if (x % PITCH === 1 && y % PITCH >= 2 && (y % 2 === 0)) R('#a8963a', px, py + 3, 1, 7);
    if (y % PITCH === 1 && x % PITCH >= 2 && (x % 2 === 0)) R('#a8963a', px + 3, py, 7, 1);
    for (const [dx, dy, w, h, ox, oy] of [[1, 0, 1, T, T - 1, 0], [-1, 0, 1, T, 0, 0], [0, 1, T, 1, 0, T - 1], [0, -1, T, 1, 0, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (inb(nx, ny) && ground[ny * W + nx] === 3) { g.globalAlpha = 0.45; R('#d8d8d0', px + ox, py + oy, w, h); g.globalAlpha = 1; }
    }
  }
  // parks: trees, bushes, benches
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (ground[y * W + x] !== 2) continue;
    const px = x * T + 8, py = y * T + 8, v = r();
    if (v < 0.16) {
      g.globalAlpha = 0.35; R('#000', px - 6, py + 4, 14, 4); g.globalAlpha = 1;
      R('#4a3a24', px - 1, py, 3, 7); R('#3a2c1a', px + 1, py, 1, 7);
      R('#234a22', px - 6, py - 7, 13, 9); R('#2b5a2a', px - 5, py - 9, 11, 8); R('#357034', px - 3, py - 10, 7, 4); R('#4a8a44', px - 2, py - 9, 3, 2);
    } else if (v < 0.24) { R('#2a5a2a', px - 3, py, 7, 4); R('#3a7438', px - 2, py - 1, 4, 3); }
    else if (v < 0.265) { R('#5a4228', px - 4, py + 1, 9, 2); R('#3a2a18', px - 4, py + 3, 1, 2); R('#3a2a18', px + 4, py + 3, 1, 2); }
  }
  // buildings (roof + facade)
  for (const b of buildings) drawBuilding(g, b);
  // lamp posts
  for (const l of lamps) {
    const px = l.x * T, py = l.y * T;
    g.globalAlpha = 0.3; R('#000', px - 1, py + 4, 5, 2); g.globalAlpha = 1;
    R('#26282c', px, py - 8, 2, 12);
    R('#26282c', px - 2, py - 9, 6, 2);
    R(l.on ? '#ffe9a0' : '#4a4a46', px - 2, py - 7, 6, 1);
  }
  // camp plaza
  const cx = (CORE.x - 1) * T, cy = (CORE.y - 1) * T;
  R('#55564e', cx - 8, cy - 8, T * 3 + 16, T * 3 + 16);
  for (let i = 0; i < 60; i++) R(r() < 0.5 ? '#5e5f56' : '#4a4b44', cx - 8 + (r() * (T * 3 + 14) | 0), cy - 8 + (r() * (T * 3 + 14) | 0), 2, 1);
  R('#6a6a60', cx - 8, cy - 8, T * 3 + 16, 1); R('#3c3d36', cx - 8, cy + T * 3 + 7, T * 3 + 16, 1);
  Art.terrain = k.c;

  Art.decals = cell(W * T, H * T).c;
  Art.claim = cell(W * T, H * T).c;
  const m = cell(W, H); m.g.imageSmoothingEnabled = true; m.g.drawImage(Art.terrain, 0, 0, W, H);
  Art.mini = m.c;
  Art.fogTex = noiseTex();
};

function drawBuilding(g, b) {
  const x = b.x * T, y = b.y * T, w = b.w * T, h = b.h * T, FH = 9;
  const r = mulberry32(b.seed), R = (c, a, bb, cc, d) => { g.fillStyle = c; g.fillRect(a, bb, cc, d); };
  const rh = h - FH, roof = b.roof;
  g.globalAlpha = 0.38; R('#000', x + 3, y + 3, w, h); g.globalAlpha = 1;
  // facade
  const fc = { house: '#cdbfa0', store: '#d6d2c4', garage: '#9a9ea6', warehouse: '#8d8678' }[b.type];
  R(fc, x, y + rh, w, FH);
  R(shade(fc, 0.62), x, y + rh, w, 2);
  R(shade(fc, 0.7), x, y + h - 1, w, 1);
  R(shade(fc, 0.85), x, y + rh + 2, 1, FH - 2); R(shade(fc, 0.8), x + w - 1, y + rh + 2, 1, FH - 2);
  const fy = y + rh + 3;
  if (b.type === 'house') {
    const n = Math.max(1, Math.floor((w - 8) / 16));
    for (let i = 0; i < n; i++) { const wx = x + 5 + i * 16 + (b.w > 3 ? 0 : 3); R('#2a3a4a', wx, fy, 6, 4); R('#7ab0c8', wx + 1, fy, 2, 2); R('#4a3a2a', wx - 1, fy + 4, 8, 1); }
    R('#5a3a24', x + w - 11, fy - 1, 5, 6); R('#d8b050', x + w - 7, fy + 2, 1, 1);
  } else if (b.type === 'store') {
    R('#2a3a4a', x + 3, fy - 1, w - 16, 5); R('#8cc4d8', x + 4, fy - 1, w - 18, 2);
    R('#3a2a22', x + w - 11, fy - 1, 7, 6); R('#8cc4d8', x + w - 10, fy, 5, 3);
    for (let i = 0; i < w; i += 4) R((i >> 2) % 2 ? '#f0f0e8' : shade(roof, 1.1), x + i, y + rh + 2, 4, 3);       // awning stripes
  } else if (b.type === 'garage') {
    R('#6a6e76', x + 5, fy - 2, w - 10, 7);
    for (let i = 0; i < 7; i += 2) R('#555960', x + 5, fy - 2 + i, w - 10, 1);
  } else {
    R('#2a2d30', x + 5, fy - 1, 10, 6); R('#2a2d30', x + w - 15, fy - 1, 10, 6);
    R('#d8b020', x, y + h - 2, w, 1);
  }
  // roof
  R(roof, x, y, w, rh);
  if (b.type === 'house') {
    R(shade(roof, 1.14), x, y, w, rh >> 1); R(shade(roof, 0.86), x, y + (rh >> 1), w, rh - (rh >> 1));
    R(shade(roof, 0.65), x, y + (rh >> 1) - 1, w, 1);
    g.globalAlpha = 0.14; for (let i = 3; i < rh; i += 3) R('#000', x, y + i, w, 1); g.globalAlpha = 1;
    if (r() < 0.8) { const cx2 = x + 5 + (r() * (w - 14) | 0); R('#7a4a3a', cx2, y + 3, 5, 6); R('#3a2a22', cx2, y + 3, 5, 2); }
  } else if (b.type === 'store') {
    R(shade(roof, 0.82), x, y, w, 2); R(shade(roof, 1.15), x + 1, y + 2, w - 2, 1);
    R('#8a8e94', x + 6, y + 5, 12, 8); R('#6a6e74', x + 8, y + 7, 8, 4); R('#202428', x + 11, y + 8, 2, 2);
    R('#e8d070', x + w - 22, y + rh - 8, 16, 5); R('#b09040', x + w - 21, y + rh - 7, 14, 1);
  } else if (b.type === 'garage') {
    for (let i = 0; i < w; i += 3) R(i % 6 ? shade(roof, 0.88) : shade(roof, 1.1), x + i, y, 1, rh);
  } else {
    R(shade(roof, 1.1), x + 2, y + 2, w - 4, 1);
    const n = 2 + (r() * 2 | 0);
    for (let i = 0; i < n; i++) { const sx = x + 6 + i * ((w - 14) / n | 0); R('#7aa0b0', sx, y + 5, 9, 6); R('#a8d0e0', sx + 1, y + 6, 3, 2); R('#4a6a78', sx, y + 11, 9, 1); }
    R('#555a52', x + w - 10, y + rh - 9, 6, 6); R('#3a3e3a', x + w - 9, y + rh - 8, 4, 4);
  }
  R('#ffffff2a', x, y, w, 1); R('#00000044', x, y + rh - 1, w, 1); R('#0000002a', x + w - 1, y, 1, rh);
  if (r() < 0.25) { R('#2a2a2e', x + 3, y + rh - 3, 1, -8); }
}

// ---- claim layer (territory fill + boundary) ---------------------------------------------------------------
Art.renderClaim = function () {
  const g = Art.claim.getContext('2d');
  g.clearRect(0, 0, Art.claim.width, Art.claim.height);
  g.fillStyle = 'rgba(90,170,255,0.10)';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (claimed[y * W + x]) g.fillRect(x * T, y * T, T, T);
  g.fillStyle = 'rgba(120,200,255,0.55)';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!claimed[y * W + x]) continue;
    if (x + 1 < W && !claimed[y * W + x + 1]) g.fillRect((x + 1) * T - 1, y * T, 1, T);
    if (x > 0 && !claimed[y * W + x - 1]) g.fillRect(x * T, y * T, 1, T);
    if (y + 1 < H && !claimed[(y + 1) * W + x]) g.fillRect(x * T, (y + 1) * T - 1, T, 1);
    if (y > 0 && !claimed[(y - 1) * W + x]) g.fillRect(x * T, y * T, T, 1);
  }
  for (const b of buildings) if (b.claimed) {
    g.fillStyle = 'rgba(110,210,120,0.18)'; g.fillRect(b.x * T, b.y * T, b.w * T, b.h * T);
    g.strokeStyle = 'rgba(140,240,150,0.75)'; g.lineWidth = 1;
    g.strokeRect(b.x * T + 0.5, b.y * T + 0.5, b.w * T - 1, b.h * T - 1);
  }
};

// ---- structures (drawn every frame so they can react: damage, pressure, gate open) ----------------------------
const wallAt = (x, y) => inb(x, y) ? wall[y * W + x] : 0;
Art.drawWall = function (g, x, y, k, f, press, t, gateOpen) {
  const px = x * T, py = y * T, i = y * W + x;
  const below = wallAt(x, y + 1) && wallAt(x, y + 1) !== K.LOOKOUT && k !== K.LOOKOUT;
  const topH = below ? T : 10;
  const R = (c, a, b, w, h) => { g.fillStyle = c; g.fillRect(a, b, w, h); };
  g.globalAlpha = 0.38; R('#000', px + 2, py + 4, T, T); g.globalAlpha = 1;
  if (k === K.WALL) {
    if (!below) { R('#4a3320', px, py + 10, T, 6); R('#5c4328', px + 1, py + 10, 3, 6); R('#5c4328', px + 7, py + 10, 3, 6); R('#3a2816', px, py + 15, T, 1); }
    R('#8c6a40', px, py, T, topH);
    for (let j = 3; j < topH; j += 4) R('#6e5230', px, py + j, T, 1);
    R('#a88455', px, py, T, 1);
    R('#c9b48a', px + 2, py + 1, 1, 1); R('#c9b48a', px + 13, py + 1, 1, 1);
    R('#555a60', px, py + 4, T, 1); R('#3a3e44', px + 3, py + 4, 2, 1);
  } else if (k === K.TOWER) {
    if (!below) { R('#4c535a', px, py + 10, T, 6); for (let j = 0; j < T; j += 5) R('#3c4248', px + j, py + 11 + (j % 2) * 2, 4, 1); R('#1c2024', px + 6, py + 11, 3, 3); }
    R('#7c848c', px, py, T, topH); R('#9aa2aa', px, py, T, 1);
    for (let j = 0; j < T; j += 4) { R('#9aa2aa', px + j, py - 2, 3, 3); R('#5a6168', px + j, py + 1, 3, 1); }
    R('#68707a', px + 2, py + 4, T - 4, topH - 6);
  } else if (k === K.LOOKOUT) {
    R('#4a3320', px + 2, py + 8, 2, 8); R('#4a3320', px + T - 4, py + 8, 2, 8);
    R('#3a2816', px + 3, py + 11, T - 6, 1);
    R('#9a7448', px - 1, py + 1, T + 2, 8); R('#b88a58', px - 1, py + 1, T + 2, 1); R('#6e5230', px - 1, py + 8, T + 2, 1);
    R('#6e5230', px, py - 3, 1, 5); R('#6e5230', px + T - 1, py - 3, 1, 5); R('#6e5230', px, py - 3, T, 1);
    const pulse = 0.6 + Math.sin(t * 3 + x) * 0.4;
    R('#2a3a4a', px + 6, py - 1, 4, 4); g.globalAlpha = pulse; R('#7fd0ff', px + 7, py, 2, 2); g.globalAlpha = 1;
  } else if (k === K.GATE) {
    R('#4a4e54', px, py + 10, T, 6); R('#2a2d30', px + 2, py + 11, T - 4, 4);
    R('#7a7e86', px, py, T, 10); R('#9a9ea6', px, py, T, 1);
    if (gateOpen) { R('#2a2d30', px + 4, py + 2, T - 8, 8); R('#6a6e76', px, py + 1, 3, 9); R('#6a6e76', px + T - 3, py + 1, 3, 9); }
    else { for (let j = 2; j < T; j += 3) R('#55595f', px + j, py + 2, 1, 8); R('#2a2d30', px + 7, py + 1, 2, 9); }
    for (let j = 0; j < T; j += 4) R(j % 8 ? '#e8c020' : '#222', px + j, py + 1, 4, 2);
  } else if (k === K.RADIO) {
    R('#3a3e44', px - 1, py + 5, T + 2, 11); R('#555a62', px, py + 5, T, 7); R('#7a808a', px, py + 5, T, 1);
    g.fillStyle = '#9aa0aa';
    for (let j = 0; j < 30; j += 5) { R('#8a909a', px + 5, py - j + 4, 1, 6); R('#8a909a', px + 10, py - j + 4, 1, 6); R('#8a909a', px + 5, py - j + 4, 6, 1); }
    R('#c8ccd4', px + 2, py - 24, 12, 4); R('#e8ecf0', px + 3, py - 24, 10, 1);
    const on = Math.sin(t * 5) > 0; R(on ? '#ff3030' : '#601818', px + 7, py - 28, 3, 3);
  }
  if (press > 0 && k !== K.RADIO) { g.globalAlpha = Math.min(0.5, press * 0.03); R('#ff4030', px, py, T, topH); g.globalAlpha = 1; }
  if (f < 0.97) {
    g.globalAlpha = (1 - f) * 0.55; R('#000', px, py, T, topH); g.globalAlpha = 1;
    const rr = mulberry32(i * 7919);
    g.fillStyle = '#1a1208';
    for (let c = 0; c < (1 - f) * 7; c++) { let cx2 = px + (rr() * 14 | 0), cy2 = py + (rr() * 8 | 0); for (let s = 0; s < 4; s++) { g.fillRect(cx2, cy2, 1, 1); cx2 += (rr() * 3 | 0) - 1; cy2 += 1; } }
    R('#000a', px + 1, py + T - 3, T - 2, 2); R(f > 0.4 ? '#e8c547' : '#e8524a', px + 1, py + T - 3, (T - 2) * f, 2);
  }
};

// ---- camp ---------------------------------------------------------------
Art.drawCamp = function (g, t, level, hpFrac) {
  const cx = (CORE.x - 1) * T, cy = (CORE.y - 1) * T, R = (c, a, b, w, h) => { g.fillStyle = c; g.fillRect(a, b, w, h); };
  // ground cloth / mats
  R('#3d4a52', cx + 2, cy + 6, T * 3 - 4, T * 3 - 8); R('#4a5a64', cx + 2, cy + 6, T * 3 - 4, 1);
  // tents
  const tent = (tx, ty, c) => {
    g.globalAlpha = 0.35; R('#000', tx + 2, ty + 12, 22, 4); g.globalAlpha = 1;
    for (let i = 0; i < 10; i++) { R(i < 5 ? shade(c, 0.8 + i * 0.06) : shade(c, 1.1 - (i - 5) * 0.06), tx + i * 2, ty + 10 - Math.min(i, 9 - i) * 2, 2, 2 + Math.min(i, 9 - i) * 2); }
    R('#1c1812', tx + 8, ty + 6, 4, 6);
  };
  tent(cx - 4, cy - 4, '#6a7a52');
  if (level >= 2) tent(cx + 28, cy - 4, '#8a6a4a');
  if (level >= 3) tent(cx + 14, cy - 8, '#5a6a7a');
  // crates and barrels
  R('#7a5a34', cx + 4, cy + 30, 9, 8); R('#9a7444', cx + 4, cy + 30, 9, 2); R('#5a4024', cx + 8, cy + 30, 1, 8);
  R('#6a4a2a', cx + 12, cy + 34, 7, 6); R('#8a6a3a', cx + 12, cy + 34, 7, 2);
  R('#3a5a7a', cx + 36, cy + 30, 6, 9); R('#5a7a9a', cx + 36, cy + 30, 6, 2); R('#2a4258', cx + 36, cy + 34, 6, 1);
  if (level >= 3) { R('#2a3a58', cx + 30, cy + 8, 14, 8); R('#4a6a9a', cx + 31, cy + 9, 12, 2); R('#4a6a9a', cx + 31, cy + 12, 12, 2); }
  if (level >= 4) { R('#6a6a30', cx + 2, cy + 14, 8, 6); R('#3a3a1a', cx + 3, cy + 15, 6, 2); }
  // fire pit
  const fx = cx + T * 1.5, fy = cy + T * 2;
  R('#2a2824', fx - 6, fy - 1, 12, 5); R('#44403a', fx - 5, fy - 2, 10, 4); R('#201e1a', fx - 3, fy - 1, 6, 2);
  const fl = Math.sin(t * 13) * 0.5 + Math.sin(t * 7.3), h1 = 6 + fl * 1.8, h2 = 4 + fl;
  R('#d8561a', fx - 4, fy - h1, 8, h1); R('#f08a22', fx - 3, fy - h1 + 1, 6, h1 - 1);
  R('#ffd23a', fx - 2, fy - h2, 4, h2); R('#fff4b0', fx - 1, fy - h2 + 2, 2, h2 - 2);
  // flag
  R('#2a2a2e', cx + 46, cy - 14, 2, 22);
  const wv = Math.sin(t * 3);
  for (let i = 0; i < 9; i++) R(i % 2 ? '#c8342a' : '#e84a3a', cx + 48 + i, cy - 13 + Math.sin(t * 4 + i * 0.6) * 1, 1, 7);
  void wv;
  if (hpFrac < 0.999) { R('#000a', cx, cy - 18, T * 3, 3); R(hpFrac > 0.4 ? '#5ec26a' : '#e8524a', cx, cy - 18, T * 3 * hpFrac, 3); }
};
