'use strict';
/* ======================================================================
   sim.js - the simulation: setup, zombies, fighting, survivors and crews,
   traps, hordes and detection, events, research, economy and building.
   Rendering never mutates anything here; sim never touches the canvas
   (it only asks Fx for particles/shake and Snd for sounds).
   ====================================================================== */
const keys = {};

// ---- small queries ---------------------------------------------------------------
const has = id => !!(G && G.res && G.res.done[id]);
const storeCap = () => LEVELS[G.level - 1].store;
const crewMembers = () => G.crews.reduce((n, c) => n + c.members.length, 0);
const people = () => G.idle.length + defenders.length + crewMembers();
const countRole = role => G.idle.filter(s => s.role === role && !s.sick).length + defenders.filter(d => d.s.role === role).length;
const maxHp = k => WALL_HP[k] * (1 + 0.25 * (G.level - 1)) * (has('walls') ? 1.35 : 1);
const buildMul = () => 1 - Math.min(BUILDER.maxDiscount, BUILDER.discount * countRole('builder'));
function effCost(name) {
  const c = COST[name], o = {};
  for (const k in c) o[k] = k === 'm' && name !== 'radio' ? Math.ceil(c[k] * buildMul()) : c[k];
  return o;
}
const canAfford = c => (!c.m || G.mat >= c.m) && (!c.f || G.food >= c.f) && (!c.a || G.ammo >= c.a);
function pay(c) { G.mat -= c.m || 0; G.food -= c.f || 0; G.ammo -= c.a || 0; }
function log(msg) { G.log.unshift({ t: G.elapsed, msg }); if (G.log.length > 8) G.log.pop(); toast(msg); }
function newSurvivor(role) { return { id: G.sid++, name: pick(NAMES) + ' ' + String.fromCharCode(65 + (rng() * 26 | 0)) + '.', role: role || weighted(ROLES, 'weight'), sick: 0, cure: 0 }; }
function addRecruit(s, why) {
  G.idle.push(s);
  log(s.name + ' (' + ROLES[s.role].label + ') ' + why);
}
const roomForPerson = () => people() < LEVELS[G.level - 1].defs;

// ---- effects helpers ---------------------------------------------------------------
function addBurst(x, y, color, n, o = {}) {
  if (parts.length > 700) return;
  for (let i = 0; i < n; i++) parts.push({
    x, y, vx: (rng() - 0.5) * (o.spread || 3), vy: (rng() - 0.5) * (o.spread || 3) + (o.up || -0.5),
    life: 0.25 + rng() * 0.25, max: 0.5, color, size: o.size || 1.5, grav: o.grav || 0,
  });
}
function floatText(x, y, str, color) { if (texts.length < 30) texts.push({ x, y, str, color: color || '#fff', life: 1.6 }); }
function shake(a) { G.shake = Math.max(G.shake, a); }

// ---- game setup ---------------------------------------------------------------
function newGame(diffKey, seed) {
  seed = seed || ((Math.random() * 2 ** 31) | 0);
  rng = mulberry32(seed ^ 0x9e3779b9);
  genTown(seed);
  wall.fill(0); wallHp.fill(0); explored.fill(0); vis.fill(0);
  defAt = new Array(W * H).fill(null); trapAt = new Array(W * H).fill(null);
  zombies = []; defenders = []; hordes = []; traps = []; crates = []; tracers = []; parts = []; texts = []; flashes = [];
  const D = DIFFICULTY[diffKey] || DIFFICULTY.normal;
  G = {
    seed, diff: diffKey || 'normal', level: 1, ammo: 40, mat: 45, food: 30, idle: [], crews: [], sel: [], sid: 1,
    coreHp: LEVELS[0].coreHp, kills: 0, elapsed: 0,
    hordeN: 0, hordesBeaten: 0, nextHorde: D.first, hordeId: 0, rescue: null,
    over: false, won: false, paused: false, speed: 1, tool: 'wall',
    territory: 0, sealed: false, income: { m: 0, f: 0, a: 0 }, held: 0, lookouts: [],
    fieldDirty: true, fieldTimer: 0, pfTimer: 0, repairT: 0, hudT: 0, visT: 0, scanT: 0, refugeeT: REFUGEE_GAP,
    ambientT: 0, visibleZ: 0, saveT: 30,
    cam: { x: CORE.x + 0.5, y: CORE.y + 3, zoom: 2.4, free: false },
    net: { a: 0, m: 0, f: 0 }, hordeMsg: null,
    res: { done: {}, active: null }, storm: 0, thunderT: 8, flash: 0, trader: null,
    eventT: EVENTS.firstAt, log: [], shake: 0, rumble: 0, danger: 0, dangerT: 0,
    time: 0, hover: null,
  };
  P = { px: CORE.x + 0.5, py: CORE.y + 2.8, hp: PLAYER.hp, cd: 0, mcd: 0, face: 1, shot: 0, stab: 0, loot: 0, lootB: -1, hurt: 0, noiseT: 0, moving: false, st: 'idle', anim: 0 };
  Art.renderTerrain();
  computeBaseField(); computePlayerField(); computeTerritory();
  seedAmbient(D.ambient);
  updateVision();
  log('You are alone. Scavenge buildings (hold E), scout, and fortify before the first horde.');
}

// ---- zombies: spawning ---------------------------------------------------------------
function pickType(n) {
  const r = rng(); let acc = 0;
  for (const m of HORDE_MIX) {
    if (n < m.from) continue;
    acc += Math.min(m.max, m.base + m.perWave * (n - m.from + 1));
    if (r < acc) return m.type;
  }
  return 'walker';
}
function makeZombie(x, y, mode, h) {
  const type = mode === 2 ? pickType(G.hordeN) : (rng() < 0.05 ? 'runner' : 'walker');
  const zt = ZTYPES[type];
  return {
    x, y, type, hp: zt.hp, mode, h: h || 0, lose: 0, wt: 0, wx: 0, wy: 0, rage: 0, scr: SCREAM.gap * rng(),
    speed: zt.speed * (0.85 + rng() * 0.3), climb: 0, lift: 0, anim: rng() * 6, face: 1, st: 0, v: rng() * 6 | 0,
  };
}
function seedAmbient(mult) {
  let made = 0;
  const want = Math.round(AMBIENT.start * mult);
  for (let c = 0; c < 500 && made < want; c++) {
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
  const n = ++G.hordeN, D = DIFFICULTY[G.diff];
  const size = Math.round(HORDE.base * Math.pow(HORDE.growth, n - 1) * (0.9 + rng() * 0.2) * D.size);
  hordes.push({ id: ++G.hordeId, n, side: rng() * 4 | 0, pos: rng(), left: size, total: size, acc: 0, seen: false, heard: false, announced: false, alive: 0, near: Infinity, cx: 0, cy: 0 });
  const gap = G.rescue !== null ? HORDE.finalGapMin + rng() * (HORDE.finalGapMax - HORDE.finalGapMin)
    : (HORDE.gapMin + rng() * (HORDE.gapMax - HORDE.gapMin)) * Math.max(0.6, 1 - 0.03 * n) * D.gap;
  G.nextHorde = gap;
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
    const z = zombies[k];
    if (!z) continue;
    const zt = ZTYPES[z.type];
    if (z.hp <= 0) { killZombie(k); continue; }
    const tx = z.x | 0, ty = z.y | 0, ti = ty * W + tx;
    z.anim += dt * z.speed * 4;
    z.lift = 0; z.st = 0;
    if (z.rage > 0) z.rage -= dt;
    if (vis[ti]) { seen++; if (rng() < 0.0012) Snd.groan(z.x, z.y); }

    // bite the survivor
    const pdx = P.px - z.x, pdy = P.py - z.y;
    if (pdx * pdx + pdy * pdy < 0.5) {
      P.hp -= zt.dmg * dt; P.hurt = 1.5; z.face = pdx > 0 ? 1 : -1; z.st = 1; Snd.hurt();
      if (P.hp <= 0 && !G.over) endGame(false, 'The survivor was overrun');
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
      target.hp -= zt.dmg * dt; target.hurt = 0.2; z.st = 1;
      z.face = target.px > z.x ? 1 : -1;
      if (target.hp <= 0) killDefender(target);
      continue;
    }
    if (Math.hypot(z.x - cx, z.y - cy) < 2.2) {
      G.coreHp -= zt.dmg * dt; z.face = cx > z.x ? 1 : -1; z.st = 1;
      if (G.coreHp <= 0 && !G.over) endGame(false, 'The camp has fallen');
      continue;
    }

    // screamers rouse the dead and enrage the horde
    if (z.type === 'screamer' && z.mode !== 0) {
      z.scr -= dt;
      if (z.scr <= 0) {
        z.scr = SCREAM.gap;
        Snd.scream(z.x, z.y);
        alertNoise(z.x, z.y, SCREAM.radius, 2);
        const r2 = SCREAM.rageRadius ** 2;
        for (const o of zombies) { const dx = o.x - z.x, dy = o.y - z.y; if (dx * dx + dy * dy < r2) o.rage = SCREAM.rageTime; }
        addBurst(z.x, z.y - 0.5, '#d8e8ff', 8, { spread: 4 });
      }
    }

    // idle zombies shuffle about until they notice the survivor
    if (z.mode === 0) {
      z.st = 3;
      if (pdx * pdx + pdy * pdy < AMBIENT.notice * AMBIENT.notice) { z.mode = 1; z.lose = 0; continue; }
      z.wt -= dt;
      if (z.wt <= 0) { z.wt = 1.5 + rng() * 3; const a = rng() * 6.283; z.wx = Math.cos(a); z.wy = Math.sin(a); if (rng() < 0.4) { z.wx = 0; z.wy = 0; } }
      if (z.wx || z.wy) z.st = 0;
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
      z.st = 2; z.lift = Math.min(10, p * 0.25);
      wallHp[ni] -= PILE_PRESSURE * p * dt;
      if (wallHp[ni] <= 1) wallHp[ni] = 1;                    // walls hold
      z.face = dx > 0 ? 1 : -1;
      z.climb += dt * Math.min(PILE_MAX_SPEEDUP, 1 + p * PILE_SPEEDUP);
      if (z.climb >= zt.climb) { z.climb = 0; z.lift = 0; z.x = tcx + (rng() - 0.5) * 0.3; z.y = tcy + (rng() - 0.5) * 0.3; }
      separate(k, z, dt);
      continue;
    }
    const sp = z.speed * (z.rage > 0 ? SCREAM.rageSpeed : 1) * dt;
    stepMove(z, dx / dd * sp, dy / dd * sp, onWall);
    if (onWall) z.st = 2;
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
  const g = Art.decals.getContext('2d');
  g.fillStyle = rng() < 0.5 ? '#6a1c1c' : '#4a2a1a'; g.globalAlpha = 0.7;
  const big = z.type === 'brute' || z.type === 'bloater' ? 2 : 1;
  for (let i = 0; i < 4 * big; i++) g.fillRect(z.x * T + (rng() - 0.5) * 8 * big, z.y * T + (rng() - 0.5) * 8 * big, 1 + (rng() * 2 | 0), 1 + (rng() * 2 | 0));
  g.globalAlpha = 1;
  addBurst(z.x, z.y - 0.4, z.type === 'bloater' ? '#9ab04a' : '#8a1c1c', 4 * big, { grav: 4 });
  if (z.type === 'bloater') explode(z.x, z.y);
  zombies[k] = zombies[zombies.length - 1]; zombies.pop();
}
function explode(x, y) {
  Snd.boom(x, y); shake(3);
  addBurst(x, y - 0.3, '#b8d060', 22, { spread: 6, grav: 6, size: 2 });
  const r2 = BLOAT.radius ** 2;
  for (const d of defenders.slice()) { const dx = d.px - x, dy = d.py - y; if (dx * dx + dy * dy < r2) { d.hp -= BLOAT.defDmg; d.hurt = 0.3; if (d.hp <= 0) killDefender(d); } }
  { const dx = P.px - x, dy = P.py - y; if (dx * dx + dy * dy < r2) { P.hp -= BLOAT.playerDmg; P.hurt = 1.5; if (P.hp <= 0 && !G.over) endGame(false, 'The survivor was caught in a blast'); } }
  for (const z of zombies) { const dx = z.x - x, dy = z.y - y; if (dx * dx + dy * dy < r2) z.hp -= BLOAT.zombieDmg; }
}
function killDefender(d) {
  removeDefender(d);
  addBurst(d.px, d.py, '#e8524a', 8);
  log(d.s.name + ' (' + ROLES[d.s.role].label + ') was killed on the wall');
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
  e.st = 'idle';
  if (!zombies.length) return;
  let near = null, nd = MELEE.range * MELEE.range;
  for (let j = 0; j < zombies.length; j++) {
    const z = zombies[j], dx = z.x - e.px, dy = z.y - e.py, q = dx * dx + dy * dy;
    if (z.hp > 0 && q < nd) { nd = q; near = z; }
  }
  if (near) {
    e.face = near.x >= e.px ? 1 : -1; e.st = 'stab';
    if (e.mcd <= 0) {
      e.mcd = MELEE.cd * (has('hands') ? 0.85 : 1) * (o.starving ? 1.7 : 1);
      near.hp -= MELEE.dmg * (has('hands') ? 1.35 : 1); e.stab = 0.18;
      addBurst(near.x, near.y - 0.3, '#9ad06a', 2);
      tracers.push({ x1: near.x - 0.25, y1: near.y - 0.5, x2: near.x + 0.25, y2: near.y - 0.1, life: 0.12, slash: true });
      Snd.stab(near.x, near.y);
      if (near.mode === 0) { near.mode = o.noiseMode; near.lose = 0; }
    }
    return;
  }
  if (e.cd > 0 || G.ammo < 1) return;
  const range = o.range * (o.rangeMul || 1);
  let best = null, bd = range * range;
  for (let j = 0; j < zombies.length; j++) {
    const z = zombies[j]; if (z.hp <= 0) continue;
    const dx = z.x - e.px, dy = z.y - e.py, q = dx * dx + dy * dy;
    if (q < bd) { bd = q; best = z; }
  }
  if (best) {
    G.ammo -= 1; best.hp -= GUN.dmg * (o.dmgMul || 1) * (has('ap') ? 1.3 : 1); e.shot = 0.09; e.st = 'shoot';
    e.cd = o.cd * (o.cdMul || 1) * (has('rapid') ? 0.8 : 1) * (o.starving ? 1.8 : 1) * (0.9 + rng() * 0.2);
    e.face = best.x >= e.px ? 1 : -1;
    tracers.push({ x1: e.px + e.face * 0.5, y1: e.py - 0.5, x2: best.x, y2: best.y - 0.4, life: 0.1 });
    if (flashes.length < 40) flashes.push({ x: e.px + e.face * 0.5, y: e.py - 0.5, life: 0.09 });
    if (parts.length < 700) parts.push({ x: e.px, y: e.py - 0.4, vx: -e.face * (0.8 + rng()), vy: -2 - rng(), life: 0.7, max: 0.7, color: '#d8b860', size: 1, grav: 9 });
    addBurst(best.x, best.y - 0.4, '#a02020', 2, { grav: 3 });
    Snd.shot(e.px, e.py, o.dmgMul > 1);
    if (e.noiseT <= 0) { e.noiseT = 0.6; alertNoise(e.px, e.py, AMBIENT.noise, o.noiseMode); }
  }
}
function updateDefenders(dt) {
  const starving = G.food <= 0;
  for (let k = defenders.length - 1; k >= 0; k--) {
    const d = defenders[k];
    if (d.hurt) d.hurt -= dt;
    const tower = wall[d.y * W + d.x] === K.TOWER, sn = d.s.role === 'sniper';
    fight(d, dt, {
      starving, noiseMode: 2, range: tower ? GUN.towerRange : GUN.range, cd: tower ? GUN.towerCd : GUN.cd,
      rangeMul: sn ? SNIPER.range : 1, dmgMul: sn ? SNIPER.dmg : 1, cdMul: sn ? SNIPER.cd : 1,
    });
    if (d.s.role === 'medic') {                // medics patch up the people around them
      const r2 = MEDIC.radius ** 2, heal = MEDIC.heal * (has('medicine') ? 2 : 1) * dt;
      for (const o of defenders) if (o !== d && o.hp < 60 && (o.px - d.px) ** 2 + (o.py - d.py) ** 2 < r2) o.hp = Math.min(60, o.hp + heal);
    }
  }
}
function removeDefender(d) { defAt[d.y * W + d.x] = null; defenders.splice(defenders.indexOf(d), 1); }
function addDefender(x, y, s) {
  const i = y * W + x;
  const k = wall[i];
  if ((k !== K.WALL && k !== K.TOWER && k !== K.LOOKOUT) || defAt[i]) return false;
  const d = { x, y, px: x + 0.5, py: y + 0.5, hp: 60, cd: 0, mcd: 0, face: 1, shot: 0, noiseT: 0, s, st: 'idle', anim: rng() * 6 };
  defAt[i] = d; defenders.push(d); return true;
}

// ---- traps ---------------------------------------------------------------
function updateTraps(dt) {
  for (let ti = traps.length - 1; ti >= 0; ti--) {
    const t = traps[ti], i = t.y * W + t.x;
    let remove = false;
    if (t.type === 'spike') {
      for (let j = cellHead[i]; j >= 0; j = cellNext[j]) {
        const z = zombies[j]; if (!z || (z.x | 0) !== t.x || (z.y | 0) !== t.y) continue;
        z.hp -= TRAP.spikeDps * dt; t.uses -= dt * TRAP.spikeWear * 8;
        if (rng() < dt * 6) addBurst(z.x, z.y - 0.2, '#8a1c1c', 1, { grav: 3 });
      }
      if (t.uses <= 0) remove = true;
    } else {
      if (t.fire <= 0) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = t.x + dx, ny = t.y + dy; if (!inb(nx, ny)) continue;
          for (let j = cellHead[ny * W + nx]; j >= 0; j = cellNext[j]) if (zombies[j]) n++;
        }
        if (n >= TRAP.barrelTrigger) { t.fire = TRAP.barrelBurn; Snd.boom(t.x + 0.5, t.y + 0.5); shake(2); }
      } else {
        t.fire -= dt;
        const r2 = TRAP.barrelRadius ** 2, cx = t.x + 0.5, cy = t.y + 0.5;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
          const nx = t.x + dx, ny = t.y + dy; if (!inb(nx, ny)) continue;
          for (let j = cellHead[ny * W + nx]; j >= 0; j = cellNext[j]) {
            const z = zombies[j]; if (!z) continue;
            if ((z.x - cx) ** 2 + (z.y - cy) ** 2 < r2) z.hp -= TRAP.barrelDps * dt;
          }
        }
        if (rng() < 0.8) parts.push({ x: cx + (rng() - 0.5) * 3, y: cy + (rng() - 0.5) * 2, vx: 0, vy: -2 - rng() * 2, life: 0.5, max: 0.5, color: rng() < 0.5 ? '#ff8a22' : '#ffd23a', size: 2, grav: 0 });
        if (t.fire <= 0) remove = true;
      }
    }
    if (remove) { traps.splice(ti, 1); trapAt[i] = null; }
  }
}

// ---- the survivor ---------------------------------------------------------------
function playerFree(x, y) {
  const tx = x | 0, ty = y | 0;
  return inb(tx, ty) && bld[ty * W + tx] < 0 && !isCoreTile(tx, ty) && wall[ty * W + tx] !== K.RADIO;
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
const lootTime = () => LOOT_TIME * (has('scav') ? 0.7 : 1);
function updatePlayer(dt) {
  let mx = 0, my = 0;
  if (keys.w || keys.arrowup) my -= 1;
  if (keys.s || keys.arrowdown) my += 1;
  if (keys.a || keys.arrowleft) mx -= 1;
  if (keys.d || keys.arrowright) mx += 1;
  const moving = !!(mx || my);
  P.moving = moving;
  if (moving) {
    G.cam.free = false;
    const k = wall[(P.py | 0) * W + (P.px | 0)];
    const sp = PLAYER.speed * (keys.shift ? PLAYER.sprint : 1) * (k && k !== K.GATE ? PLAYER.wallSlow : 1) * dt / Math.hypot(mx, my);
    if (playerFree(P.px + mx * sp, P.py)) P.px += mx * sp;
    if (playerFree(P.px, P.py + my * sp)) P.py += my * sp;
    if (mx) P.face = mx > 0 ? 1 : -1;
    P.anim += dt * 9 * (keys.shift ? 1.4 : 1);
  }
  P.hurt -= dt; if (P.stab > 0) P.stab -= dt;
  const safe = claimed[(P.py | 0) * W + (P.px | 0)] || Math.hypot(P.px - CORE.x, P.py - CORE.y) < 6;
  if (P.hurt <= 0) {
    const medic = safe && G.idle.some(s => s.role === 'medic' && !s.sick) ? MEDIC.playerBonus : 0;
    P.hp = Math.min(PLAYER.hp, P.hp + ((safe ? 2.5 : 0.3) + medic) * (has('medicine') ? 2 : 1) * dt);
  }

  // scavenging: hold E beside a building
  const b = nearBuilding();
  if (keys.e && b && !b.looted && !b.crew && !moving) {
    const bi = buildings.indexOf(b);
    if (P.lootB !== bi) { P.lootB = bi; P.loot = 0; }
    P.loot += dt;
    Snd.tick();
    if (P.loot >= lootTime()) { scavenge(b); P.loot = 0; P.lootB = -1; }
  } else { P.loot = 0; P.lootB = -1; }

  // supply crates
  for (let i = crates.length - 1; i >= 0; i--) {
    const c = crates[i]; c.t -= dt;
    if (Math.hypot(c.x - P.px, c.y - P.py) < 1.3) {
      const L = EVENTS.crateLoot, roll = v => Math.round(v * (0.8 + rng() * 0.5));
      const m = roll(L.m), f = roll(L.f), a = roll(L.a);
      G.mat = Math.min(storeCap(), G.mat + m); G.food = Math.min(storeCap(), G.food + f); G.ammo = Math.min(storeCap(), G.ammo + a);
      floatText(c.x, c.y - 1, '+' + m + 'm +' + f + 'f +' + a + 'a', '#ffe27a'); Snd.pickup();
      log('Supply crate recovered: +' + m + ' materials, +' + f + ' food, +' + a + ' ammo');
      crates.splice(i, 1);
    } else if (c.t <= 0) crates.splice(i, 1);
  }

  const tile = wall[(P.py | 0) * W + (P.px | 0)];
  fight(P, dt, { starving: false, noiseMode: 1, range: tile === K.TOWER ? GUN.towerRange : GUN.range, cd: GUN.cd * 0.75 });
  P.st = P.st === 'idle' && moving ? 'walk' : P.st;
}
function scavenge(b) {
  b.looted = true;
  const t = BUILDING_TYPES[b.type], got = [];
  const bonus = has('scav') ? 1.35 : 1;
  const roll = v => Math.round(v * bonus * (0.7 + rng() * 0.6));
  const m = roll(t.loot.m), f = roll(t.loot.f), a = roll(t.loot.a);
  G.mat = Math.min(storeCap(), G.mat + m); G.food = Math.min(storeCap(), G.food + f); G.ammo = Math.min(storeCap(), G.ammo + a);
  if (m) got.push('+' + m + ' materials'); if (f) got.push('+' + f + ' food'); if (a) got.push('+' + a + ' ammo');
  Snd.loot();
  floatText(b.x + b.w / 2, b.y - 0.2, got.join(' '), '#ffe27a');
  let msg = t.label + ': ' + got.join(', ');
  if (rng() < SURVIVOR_CHANCE && roomForPerson()) { const s = newSurvivor(); G.idle.push(s); msg += ' - ' + s.name + ' (' + ROLES[s.role].label + ') was hiding inside and follows you back!'; }
  log(msg);
}

// ---- survivors: crews, sickness ---------------------------------------------------------------
function selectedIdle() {
  const ok = G.idle.filter(s => !s.sick);
  const chosen = ok.filter(s => G.sel.includes(s.id));
  return chosen.length ? chosen : ok.slice(0, 1);
}
function sendCrew(b) {
  if (!b || b.looted || b.crew) return warn('That building is not available');
  if (!explored[(b.y + (b.h >> 1)) * W + b.x + (b.w >> 1)]) return warn('Scout that building first');
  const members = selectedIdle().slice(0, 3);
  if (!members.length) return warn('No healthy idle survivors to send');
  if (G.ammo < CREW.ammoCost) return warn('A crew needs ' + CREW.ammoCost + ' ammo');
  G.ammo -= CREW.ammoCost;
  const d = Math.hypot(b.x + b.w / 2 - CORE.x, b.y + b.h / 2 - CORE.y);
  const dur = (CREW.baseTime + d * CREW.perTile) * (has('scav') ? 0.8 : 1);
  let near = 0; for (const z of zombies) if (z.mode === 0 && Math.hypot(z.x - (b.x + b.w / 2), z.y - (b.y + b.h / 2)) < 9) near++;
  const fighters = members.filter(s => s.role === 'fighter' || s.role === 'sniper').length;
  const risk = clamp(CREW.baseRisk + d * CREW.perTileRisk + Math.min(0.18, near * 0.012) - 0.04 * fighters, 0.04, 0.65);
  for (const s of members) { G.idle.splice(G.idle.indexOf(s), 1); G.sel = G.sel.filter(id => id !== s.id); }
  b.crew = true;
  G.crews.push({ bi: buildings.indexOf(b), members, t: 0, dur, risk });
  log('Sent ' + members.map(s => s.name).join(', ') + ' to the ' + BUILDING_TYPES[b.type].label + ' (' + Math.round(risk * 100) + '% risk each)');
  Snd.click();
}
function updateCrews(dt) {
  for (let i = G.crews.length - 1; i >= 0; i--) {
    const c = G.crews[i]; c.t += dt;
    if (c.t < c.dur) continue;
    G.crews.splice(i, 1);
    const b = buildings[c.bi], t = BUILDING_TYPES[b.type];
    b.crew = false; b.looted = true;
    const survivors = c.members.filter(() => rng() >= c.risk), lost = c.members.length - survivors.length;
    const scav = c.members.filter(s => s.role === 'scavenger').length;
    const mul = CREW.lootMul + CREW.perMember * (c.members.length - 1) + CREW.scavBonus * scav + (has('scav') ? 0.35 : 0);
    const roll = v => Math.round(v * mul * (0.7 + rng() * 0.6));
    const m = survivors.length ? roll(t.loot.m) : 0, f = survivors.length ? roll(t.loot.f) : 0, a = survivors.length ? roll(t.loot.a) : 0;
    G.mat = Math.min(storeCap(), G.mat + m); G.food = Math.min(storeCap(), G.food + f); G.ammo = Math.min(storeCap(), G.ammo + a);
    for (const s of survivors) G.idle.push(s);
    let msg = 'Crew back from the ' + t.label + ': +' + m + 'm +' + f + 'f +' + a + 'a';
    if (lost) msg += ' - lost ' + c.members.filter(s => !survivors.includes(s)).map(s => s.name).join(', ');
    if (survivors.length && rng() < 0.15 && roomForPerson()) { const s = newSurvivor(); G.idle.push(s); msg += ' - brought back ' + s.name + ' (' + ROLES[s.role].label + ')'; }
    log(msg);
    if (lost) Snd.error(); else Snd.loot();
  }
}
function updateSurvivors(dt) {
  const medic = G.idle.some(s => s.role === 'medic' && !s.sick) || defenders.some(d => d.s.role === 'medic');
  for (let i = G.idle.length - 1; i >= 0; i--) {
    const s = G.idle[i];
    if (s.sick <= 0) continue;
    if (medic) { s.cure += dt * (has('medicine') ? 2 : 1); if (s.cure >= MEDIC.cure) { s.sick = 0; s.cure = 0; log(s.name + ' recovered thanks to the medic'); } }
    else { s.sick -= dt; if (s.sick <= 0) { G.idle.splice(i, 1); log(s.name + ' died of sickness. A medic or ' + SICK.treatCost + ' food could have saved them'); } }
  }
}
function treatSick(id) {
  const s = G.idle.find(x => x.id === id);
  if (!s || s.sick <= 0) return;
  if (G.food < SICK.treatCost) return warn('Need ' + SICK.treatCost + ' food');
  G.food -= SICK.treatCost; s.sick = 0; s.cure = 0; log(s.name + ' was treated'); Snd.pickup();
}

// ---- economy ---------------------------------------------------------------
function updateEconomy(dt) {
  const mouths = people();
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
    const builders = countRole('builder');
    let left = 6 + 4 * builders;
    const gain = 25 * (1 + BUILDER.repairBonus * Math.min(builders, 2)), cost = builders ? 0.5 : 1;
    for (let i = 0; i < W * H && left > 0 && G.mat >= 1; i++) {
      if (!wall[i]) continue;
      const m = maxHp(wall[i]);
      if (wallHp[i] < m) { wallHp[i] = Math.min(m, wallHp[i] + gain); G.mat -= cost; left--; }
    }
    const L = LEVELS[G.level - 1];
    if (G.coreHp < L.coreHp) G.coreHp = Math.min(L.coreHp, G.coreHp + 6);
  }

  // a sealed, fed camp draws refugees
  if (G.sealed && G.territory >= 20 && G.food >= 20 && roomForPerson()) {
    G.refugeeT -= dt * (1 + G.territory / 150);
    if (G.refugeeT <= 0) { G.refugeeT = REFUGEE_GAP; addRecruit(newSurvivor(), 'saw your walls and joined the camp'); Snd.pickup(); }
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
  let msg = null, rumble = 0;
  for (let i = hordes.length - 1; i >= 0; i--) {
    const h = hordes[i];
    if (h.alive === 0 && h.left === 0) {
      hordes.splice(i, 1); G.hordesBeaten++;
      if (h.seen || h.heard) log('The horde has been destroyed');
      continue;
    }
    if (h.alive) { h.cx /= h.alive; h.cy /= h.alive; }
    // the ground shakes before they arrive: a faint warning even without lookouts
    if (h.alive) rumble = Math.max(rumble, clamp(1 - h.near / 30, 0, 1) * h.alive / (h.alive + 40));
    if (!h.heard && h.near < 13) { h.heard = true; if (!h.seen) log('You hear groaning... a horde is at the walls!'); }
    if (h.seen && !h.announced) { h.announced = true; log('Lookout: horde sighted to the ' + compass(h.cx - CORE.x, h.cy - CORE.y) + '!'); Snd.horn(); }
    if (h.alive === 0) continue;
    const eta = Math.ceil(Math.max(0, h.near - 3));
    const dir = compass(h.cx - CORE.x, h.cy - CORE.y);
    const cnt = h.left + h.alive;
    if (h.seen) msg = { cls: 'alert', text: 'HORDE from the ' + dir + ' - about ' + cnt + ' - ' + (h.near < 6 ? 'at the walls' : 'arrives in ~' + eta + 's') };
    else if (h.heard && !msg) msg = { cls: 'heard', text: 'Something is at the walls...' };
  }
  G.hordeMsg = msg; G.rumble = rumble;
  const target = Math.max(rumble, Math.min(1, G.visibleZ / 160), P.hp < 50 ? 0.5 : 0);
  G.danger = lerp(G.danger, target, 0.4);
}

// ---- events, research, rescue ---------------------------------------------------------------
function updateEvents(dt) {
  G.storm = Math.max(0, G.storm - dt);
  if (G.storm > 0) {
    G.thunderT -= dt;
    if (G.thunderT <= 0) { G.thunderT = 6 + rng() * 9; G.flash = 1; setTimeout(() => Snd.thunder(), 400 + rng() * 900); }
  }
  G.flash = Math.max(0, G.flash - dt * 2.5);
  if (G.trader) { G.trader.t -= dt; if (G.trader.t <= 0) { G.trader = null; log('The trader packed up and left'); } }
  G.eventT -= dt;
  if (G.eventT <= 0) { G.eventT = EVENTS.gapMin + rng() * (EVENTS.gapMax - EVENTS.gapMin); fireEvent(); }
}
function fireEvent() {
  const opts = ['drop', 'drop', 'trader', 'storm', 'sick'];
  const kind = pick(opts);
  if (kind === 'drop') {
    for (let t = 0; t < 40; t++) {
      const x = 2 + (rng() * (W - 4) | 0), y = 2 + (rng() * (H - 4) | 0), i = y * W + x, d = Math.hypot(x - CORE.x, y - CORE.y);
      if (bld[i] >= 0 || wall[i] || isCoreTile(x, y) || d < 9 || d > 26) continue;
      crates.push({ x: x + 0.5, y: y + 0.5, t: EVENTS.crateLife });
      log('A supply crate dropped to the ' + compass(x - CORE.x, y - CORE.y) + ' (~' + Math.round(d) + ' tiles). Grab it before the dead do!');
      Snd.drop(); return;
    }
  } else if (kind === 'trader') {
    if (G.trader) return;
    G.trader = { t: EVENTS.traderTime };
    log('A trader has arrived at the camp for ' + EVENTS.traderTime + 's. Open the Trader panel.');
  } else if (kind === 'storm') {
    if (G.storm > 0) return;
    G.storm = EVENTS.storm; G.thunderT = 3;
    log('A storm is rolling in - visibility drops');
  } else {
    const s = G.idle.filter(x => !x.sick)[rng() * G.idle.length | 0];
    if (!s) return;
    s.sick = SICK.time; s.cure = 0;
    log(s.name + ' fell ill. Treat them for ' + SICK.treatCost + ' food, or a medic will cure them.');
  }
}
function doTrade(i) {
  const t = EVENTS.trades[i];
  if (!G.trader || !canAfford(t.give)) return warn('Cannot afford that trade');
  pay(t.give);
  G.mat = Math.min(storeCap(), G.mat + (t.get.m || 0)); G.food = Math.min(storeCap(), G.food + (t.get.f || 0)); G.ammo = Math.min(storeCap(), G.ammo + (t.get.a || 0));
  Snd.pickup();
}
function startResearch(id) {
  const r = RESEARCH.find(x => x.id === id);
  if (!r || G.res.done[id] || G.res.active) return;
  if (!canAfford(r.cost)) return warn('Cannot afford ' + r.name);
  pay(r.cost); G.res.active = { id, t: 0, dur: r.time }; Snd.click();
  toast('Researching ' + r.name + '...');
}
function updateResearch(dt) {
  const a = G.res.active; if (!a) return;
  a.t += dt;
  if (a.t >= a.dur) {
    G.res.done[a.id] = true; G.res.active = null;
    const r = RESEARCH.find(x => x.id === a.id);
    log('Research complete: ' + r.name);
    if (a.id === 'walls') for (let i = 0; i < W * H; i++) if (wall[i]) wallHp[i] = Math.min(maxHp(wall[i]), wallHp[i] * 1.35);
    Snd.upgrade();
  }
}
function updateRescue(dt) {
  if (G.rescue === null) return;
  G.rescue -= dt;
  if (G.rescue <= 0 && !G.over) endGame(true, 'Rescued!');
}

// ---- build actions ---------------------------------------------------------------
let warnT = 0;
function warn(msg) { if (performance.now() > warnT) { toast(msg); warnT = performance.now() + 1500; Snd.error(); } }
function inBuildRange(tx, ty) { return Math.hypot(tx + 0.5 - P.px, ty + 0.5 - P.py) <= BUILD_RANGE; }
const TOOL_KIND = { wall: K.WALL, tower: K.TOWER, lookout: K.LOOKOUT, gate: K.GATE, radio: K.RADIO };
function refund(name) { return Math.floor(((COST[name].m || 0) * 0.5)); }
function tryBuild(tx, ty) {
  if (G.over || !inb(tx, ty)) return;
  const i = ty * W + tx, tool = G.tool;
  if (bld[i] >= 0 || isCoreTile(tx, ty)) { if (tool === 'crew' && bld[i] >= 0) sendCrew(buildings[bld[i]]); return; }
  if (tool === 'crew') return;
  if (!inBuildRange(tx, ty)) return warn('Too far - walk closer to build there');
  if (!explored[i]) return;
  if (TOOL_KIND[tool]) {
    const kind = TOOL_KIND[tool];
    if (wall[i] === kind) return;
    if (wall[i] && !(wall[i] === K.WALL && kind === K.TOWER)) return;                 // only wall -> tower upgrades
    if (trapAt[i]) return;
    if (tool === 'radio') {
      if (G.level < RADIO_LEVEL) return warn('The radio tower needs camp level ' + RADIO_LEVEL);
      if (G.rescue !== null) return warn('The radio is already broadcasting');
      if (!claimed[i]) return warn('Build the radio inside your territory');
    }
    const base = effCost(tool), cost = wall[i] === K.WALL && kind === K.TOWER ? { m: Math.max(0, base.m - effCost('wall').m) } : base;
    if (!canAfford(cost)) return warn(cost.f || cost.a ? 'Not enough supplies' : 'Not enough materials');
    pay(cost);
    wall[i] = kind; wallHp[i] = maxHp(kind);
    G.fieldDirty = true; G.visT = 0; Snd.build();
    if (tool === 'radio') {
      G.rescue = RESCUE_TIME; G.nextHorde = Math.min(G.nextHorde, 10);
      log('The radio is broadcasting! Hold out for ' + fmtTime(RESCUE_TIME) + ' until the helicopter arrives.');
      Snd.horn();
    }
  } else if (tool === 'spike' || tool === 'barrel') {
    if (wall[i] || trapAt[i] || ground[i] === undefined) return;
    const cost = effCost(tool);
    if (!canAfford(cost)) return warn('Not enough materials');
    pay(cost);
    const t = tool === 'spike' ? { type: 'spike', x: tx, y: ty, uses: TRAP.spikeUses } : { type: 'barrel', x: tx, y: ty, fire: 0 };
    traps.push(t); trapAt[i] = t; Snd.build();
  } else if (tool === 'def') {
    if (!wall[i] || defAt[i] || wall[i] === K.GATE || wall[i] === K.RADIO) return;
    const s = selectedIdle()[0];
    if (!s) return warn('No healthy idle survivors. Scavenge for them, or seal your camp to draw refugees.');
    G.idle.splice(G.idle.indexOf(s), 1); G.sel = G.sel.filter(id => id !== s.id);
    addDefender(tx, ty, s); G.visT = 0; Snd.click();
  } else if (tool === 'erase') {
    if (defAt[i]) { const d = defAt[i]; removeDefender(d); G.idle.push(d.s); return; }
    if (trapAt[i]) { const t = trapAt[i]; traps.splice(traps.indexOf(t), 1); trapAt[i] = null; G.mat += refund(t.type); Snd.demolish(); return; }
    if (wall[i] && wall[i] !== K.RADIO) {
      const nm = { 1: 'wall', 2: 'tower', 3: 'lookout', 4: 'gate' }[wall[i]];
      G.mat += refund(nm);
      wall[i] = 0; wallHp[i] = 0; G.fieldDirty = true; G.visT = 0; Snd.demolish();
    }
  }
}
function upgradeCore() {
  const L = LEVELS[G.level - 1];
  if (!L.up) return warn('Camp is at max level');
  if (!canAfford(L.up)) return warn('Need ' + L.up.m + ' materials and ' + L.up.f + ' food');
  pay(L.up); G.level++;
  G.coreHp = LEVELS[G.level - 1].coreHp;
  for (let i = 0; i < W * H; i++) if (wall[i]) wallHp[i] = Math.max(wallHp[i], maxHp(wall[i]) * 0.8);
  G.fieldDirty = true;
  log('Camp upgraded to level ' + G.level + ' - territory limit ' + LEVELS[G.level - 1].cap);
  Snd.upgrade();
}

// ---- end of game ---------------------------------------------------------------
function endGame(won, why) {
  if (G.over) return;
  G.over = true; G.won = won; G.endWhy = why;
  if (won) Snd.rescue();
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  UI.showEnd();
}

// ---- main step ---------------------------------------------------------------
function simulate(dt) {
  G.elapsed += dt; G.time += dt;
  G.shake = Math.max(0, G.shake - dt * 10);
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
    if (idle < AMBIENT.keep * DIFFICULTY[G.diff].ambient) for (let i = 0; i < 3; i++) spawnAmbient();
  }
  updatePlayer(dt);
  updateHordes(dt);
  updateZombies(dt);
  updateTraps(dt);
  updateDefenders(dt);
  updateCrews(dt);
  updateSurvivors(dt);
  updateEconomy(dt);
  updateEvents(dt);
  updateResearch(dt);
  updateRescue(dt);
}
