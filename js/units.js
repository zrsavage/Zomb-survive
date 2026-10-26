'use strict';
/* units.js - survivors as people in the world, commanded the way you command colonists in RimWorld.
   Every survivor who is not posted on a wall has a body that walks around the camp. You select them and give orders
   (move here, man this wall, scavenge that building); anything you don't order they decide for themselves from their work
   toggles: idle people mill about camp, guard-enabled ones man the walls when a horde comes, scavengers go out on their own.
   Scavenging parties physically walk out, loot, fight what they meet, and walk home. */
const Units = (() => {
  const U = new Map();                                   // survivor id -> body
  const SPEED = 2.7, WALL_SLOW = 0.5;
  const home = () => [CORE.x + 0.5, CORE.y + 3.3];
  const free = (x, y) => { const tx = x | 0, ty = y | 0; return inb(tx, ty) && bld[ty * W + tx] < 0 && !isCoreTile(tx, ty) && wall[ty * W + tx] !== K.RADIO; };
  const doorOf = b => [clamp((b.x + b.w / 2) | 0, 0, W - 1), clamp(b.y + b.h, 0, H - 1)];

  const defaultWork = s => ({ guard: s.role === 'fighter' || s.role === 'sniper', loot: s.role === 'scavenger', build: s.role !== 'sniper', train: 'off' });
  const workOf = s => s.work || (s.work = defaultWork(s));

  function of(s, x, y) {
    let u = U.get(s.id);
    if (!u) {
      const [hx, hy] = home(), maxHp = Math.round(60 * tmul(s, 'hp'));
      u = { s, px: x !== undefined ? x : hx + (rng() - 0.5) * 3, py: y !== undefined ? y : hy + rng() * 1.2, face: 1, st: 'idle', anim: rng() * 6, hp: s.hpNow !== undefined ? Math.min(maxHp, s.hpNow) : maxHp, maxHp,
        cd: 0, mcd: 0, shot: 0, noiseT: 0, act: 0, stab: 0, sta: STAMINA.max, tired: false, order: null, D: null, N: null, goal: -1, think: rng() * 2, moving: false, manual: 0, hurt: 0, alertT: 0 };
      U.set(s.id, u);
    }
    return u;
  }
  const busy = s => { const u = U.get(s.id); return !!(u && u.order); };
  const free_ = () => G.idle.filter(s => !s.sick && !busy(s));

  // ---- walking -------------------------------------------------------------------------------
  function route(o, gx, gy) {                            // o is a unit, a crew or the player: anything with D/N/goal
    const i = clamp(gy | 0, 0, H - 1) * W + clamp(gx | 0, 0, W - 1);
    if (!o.D) { o.D = new Float64Array(W * H); o.N = new Int32Array(W * H); o.goal = -1; }
    if (o.goal !== i) {
      o.goal = i;
      const core = [], saved = [];                       // people cannot walk through the camp core: block it for this search
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) core.push((CORE.y + dy) * W + CORE.x + dx);
      for (const c of core) { saved.push(bld[c]); bld[c] = 0; }
      computeField([i], o.D, o.N);
      core.forEach((c, k) => { bld[c] = saved[k]; });
    }
    o.gx = gx; o.gy = gy;
  }
  // returns the heading (unit vector) toward the goal, or null if it cannot be reached
  function heading(o, px, py) {
    const ti = (py | 0) * W + (px | 0);
    if (o.D[ti] === Infinity) return null;
    let tx = o.gx, ty = o.gy;
    if (o.N[ti] >= 0) { const ni = o.N[ti]; tx = ni % W + 0.5; ty = ((ni / W) | 0) + 0.5; }
    const dx = tx - px, dy = ty - py, d = Math.hypot(dx, dy) || 1;
    return [dx / d, dy / d];
  }
  function step(u, hd, dt, mul) {
    const k = wall[(u.py | 0) * W + (u.px | 0)];
    const sp = SPEED * (mul || 1) * (k && k !== K.GATE ? WALL_SLOW : 1) * dt;
    if (free(u.px + hd[0] * sp, u.py)) u.px += hd[0] * sp;
    if (free(u.px, u.py + hd[1] * sp)) u.py += hd[1] * sp;
    if (Math.abs(hd[0]) > 0.05) u.face = hd[0] > 0 ? 1 : -1;
    u.anim += dt * 9; u.moving = true;
  }

  // ---- orders --------------------------------------------------------------------------------
  const pending = () => { const s = new Set(); for (const u of U.values()) if (u.order && u.order.kind === 'post') s.add(u.order.ty * W + u.order.tx); return s; };
  const POSTABLE = k => k === K.WALL || k === K.TOWER || k === K.LOOKOUT || k === K.OUTPOST;
  let edgeT = -1, edgeList = [];
  function edgeWalls() {                                 // posts along the edge of the claimed ground (cached for a second)
    if (G.time - edgeT < 1) return edgeList;
    edgeT = G.time; edgeList = [];
    for (let i = 0; i < W * H; i++) {
      if (!POSTABLE(wall[i])) continue;
      const x = i % W, y = (i / W) | 0;
      if (N4.some(([dx, dy]) => inb(x + dx, y + dy) && claimed[(y + dy) * W + x + dx])) edgeList.push([x, y]);
    }
    return edgeList;
  }
  function orderPost(u, tx, ty, auto) { u.order = { kind: 'post', tx, ty, auto: !!auto }; route(u, tx + 0.5, ty + 0.5); u.manual = auto ? 0 : 90; }
  function orderMove(u, x, y, manual) { u.order = { kind: 'move', x, y }; route(u, x, y); u.manual = manual ? 90 : 0; }
  function cancel(u) { u.order = null; u.manual = 0; }

  function standDown(d) {                                // a posted defender steps off the wall and becomes a walking survivor again
    removeDefender(d); G.idle.push(d.s);
    const u = of(d.s, d.px, d.py); u.hp = d.hp; u.order = null; u.manual = 0;
    const [hx, hy] = home(); orderMove(u, hx + (rng() - 0.5) * 3, hy + rng(), false);
    G.visT = 0;
  }
  function post(s, tx, ty, auto) {                       // 'man this wall': walk there, then take the post
    const i = ty * W + tx;
    if (!POSTABLE(wall[i]) || defAt[i]) return false;
    const u = of(s); orderPost(u, tx, ty, auto); return true;
  }

  // everyone currently selected: survivors (idle bodies, crew members, posted defenders) and the founder
  function selected() {
    const out = [];
    for (const s of G.idle) if (G.sel.includes(s.id)) out.push({ kind: 'idle', s, u: of(s) });
    for (const d of defenders) if (G.sel.includes(d.s.id)) out.push({ kind: 'def', s: d.s, d });
    for (const c of G.crews) for (const s of c.members) if (G.sel.includes(s.id)) out.push({ kind: 'crew', s, c });
    return out;
  }
  function orderAt(tx, ty) {
    const sel = selected(), selP = G.selP && P.dead <= 0;
    if (!sel.length && !selP) return false;
    const i = ty * W + tx;
    // a building: scavenge it
    if (inb(tx, ty) && bld[i] >= 0) {
      const b = buildings[bld[i]];
      if (b.looted || b.crew) { warn('Nothing left to take there'); return true; }
      if (selP) { P.order = { kind: 'loot', b }; const [dx, dy] = doorOf(b); route(P, dx + 0.5, dy + 0.7); }
      const crewers = sel.filter(e => e.kind === 'idle' && !e.s.sick);
      if (crewers.length) {
        if (b.locked) warn('Locked: only the survivor you control can open it (keycard or fuel)');
        else sendCrew(b, crewers.map(e => e.s).slice(0, 3));
      }
      return true;
    }
    // a wall, tower or lookout: man it (several selected people take neighbouring posts)
    if (inb(tx, ty) && POSTABLE(wall[i])) {
      const people = sel.filter(e => e.kind !== 'crew');
      if (!people.length) { warn('Only survivors can man a wall'); return true; }
      const taken = pending(), cands = edgeWalls().concat(wall[i] ? [[tx, ty]] : []).filter(([x, y]) => !defAt[y * W + x] && !taken.has(y * W + x));
      cands.sort((a, b) => Math.hypot(a[0] - tx, a[1] - ty) - Math.hypot(b[0] - tx, b[1] - ty));
      let n = 0;
      for (const e of people) {
        const c = cands[n++]; if (!c) break;
        if (e.kind === 'def') standDown(e.d);
        post(e.s, c[0], c[1], false);
      }
      return true;
    }
    // open ground: move there (spread out a little)
    if (inb(tx, ty) && free(tx + 0.5, ty + 0.5)) {
      const people = sel.filter(e => e.kind !== 'crew'); let n = 0;
      const all = people.length + (selP ? 1 : 0);
      const place = k => { const a = k * 2.4, r = all > 1 ? 0.35 + 0.28 * k : 0; return [tx + 0.5 + Math.cos(a) * r, ty + 0.5 + Math.sin(a) * r]; };
      if (selP) { const [x, y] = place(n++); P.order = { kind: 'move', x, y }; route(P, x, y); }
      for (const e of people) {
        if (e.kind === 'def') standDown(e.d);
        const [x, y] = place(n++); orderMove(of(e.s), free(x, y) ? x : tx + 0.5, free(x, y) ? y : ty + 0.5, true);
      }
      return true;
    }
    return false;
  }
  function standDownSelected() {                         // X: cancel orders and take everyone off the walls
    for (const e of selected()) { if (e.kind === 'def') standDown(e.d); else if (e.kind === 'idle') { cancel(e.u); const [hx, hy] = home(); orderMove(e.u, hx + (rng() - 0.5) * 3, hy + rng(), false); } }
    if (G.selP) { P.order = null; P.autoE = false; }
  }

  // ---- autonomy: what a survivor does when nobody is telling them -----------------------------------
  const alarm = () => {
    if (hordes.some(h => !h.minor)) return true;                                   // a real horde
    let n = 0; for (const z of zombies) if (z.mode === 2 && (z.x - CORE.x) ** 2 + (z.y - CORE.y) ** 2 < 196 && ++n >= 8) return true;      // or a thick crowd at the walls
    return false;
  };
  function nearZ(x, y, r) { let n = 0; const r2 = r * r; for (const z of zombies) if ((z.x - x) ** 2 + (z.y - y) ** 2 < r2) n++; return n; }
  function pickPost() {                                  // a wall tile far from the other posts
    const taken = pending(), c = edgeWalls().filter(([x, y]) => !defAt[y * W + x] && !taken.has(y * W + x) && wall[y * W + x] !== K.GATE);
    let best = null, bd = -1;
    for (const [x, y] of c) {
      let dm = 99; for (const d of defenders) dm = Math.min(dm, Math.hypot(d.x - x, d.y - y)); for (const t of taken) dm = Math.min(dm, Math.hypot((t % W) - x, ((t / W) | 0) - y));
      const bonus = wall[y * W + x] === K.TOWER ? 1.5 : 0;
      if (dm + bonus > bd) { bd = dm + bonus; best = [x, y]; }
    }
    return best;
  }
  function pickLoot() {
    let best = null, bs = 1e9;
    for (const b of buildings) {
      if (b.looted || b.crew || b.nest || b.locked) continue;
      if (!explored[((b.y + (b.h >> 1)) | 0) * W + ((b.x + (b.w >> 1)) | 0)]) continue;
      const d = Math.hypot(b.x + b.w / 2 - CORE.x, b.y + b.h / 2 - CORE.y), sc = d + nearZ(b.x + b.w / 2, b.y + b.h / 2, 8) * 1.6;
      if (sc < bs) { bs = sc; best = b; }
    }
    return best;
  }
  function think(u) {
    const s = u.s, w = workOf(s);
    if (u.bpId) return;                                  // on their way to a build job
    if (s.sick > 0 || u.manual > 0) return;
    if (alarm()) {
      if (w.guard && !G.crews.some(c => c.members.includes(s))) { const p = pickPost(); if (p) post(s, p[0], p[1], true); }
      return;
    }
    if (w.loot && G.nextHorde > 80 && G.crews.length < 2 && G.ammo >= CREW.ammoCost + 15 && s.hpNow === undefined) {
      const b = pickLoot(); if (b) { sendCrew(b, [s]); return; }
    }
    const drop = crates.find(c => c.type === 'airdrop');
    if (drop && !G.idle.some(o => { const b = U.get(o.id); return b && b.order && b.order.drop; })) { orderMove(u, drop.x, drop.y, false); u.order.drop = true; return; }      // someone fetches the supply drop
    if (w.train && w.train !== 'off') { const [sx, sy] = trainSpot(u); if (Math.hypot(sx - u.px, sy - u.py) > 1.6) { orderMove(u, sx, sy, false); u.order.train = true; } return; }
    if (rng() < 0.5) {                                   // mill about the camp
      const [hx, hy] = home(); orderMove(u, hx + (rng() - 0.5) * 6.5, hy + rng() * 2.2, false); u.order.slow = true;
    }
  }

  // ---- the founder (the survivor you can also drive with WASD) --------------------------------------
  function playerOrder(dt) {                             // called from updatePlayer; returns [mx,my] to walk, or null
    const o = P.order; if (!o) { P.autoE = false; return null; }
    if (o.kind === 'loot' && (o.b.looted || o.b.crew)) { P.order = null; P.autoE = false; return null; }
    const d = Math.hypot(P.gx - P.px, P.gy - P.py);
    if (d < (o.kind === 'loot' ? 0.8 : 0.35)) {
      if (o.kind === 'move') { P.order = null; return null; }
      P.autoE = true; return null;                       // arrived at the door: scavenge like holding E
    }
    P.autoE = false;
    const hd = heading(P, P.px, P.py);
    if (!hd) { P.order = null; warn('No way through to there'); return null; }
    return hd;
  }

  // ---- per-frame update -----------------------------------------------------------------------
  function bodies() {
    const live = new Set(), list = [];
    for (const s of G.idle) { live.add(s.id); list.push(of(s)); }
    for (const c of G.crews) for (const s of c.members) { live.add(s.id); list.push(of(s)); }
    for (const id of [...U.keys()]) if (!live.has(id)) U.delete(id);
    return list;
  }
  function fightOpts(u, calm) {
    const s = u.s, sn = s.role === 'sniper';
    return { noWake: true, starving: G.food <= 0, noiseMode: 3, range: calm ? 4.5 : GUN.range, cd: GUN.cd, rangeMul: (sn ? SNIPER.range : 1) * tmul(s, 'range'),
      dmgMul: (sn ? SNIPER.dmg : 1) * tmul(s, 'dmg') * skillMul(s, 'shoot'), cdMul: (sn ? SNIPER.cd : 1) * tmul(s, 'cd') * moraleCd() * (1 - 0.03 * skillLv(s, 'shoot')) * ruleMul('fire'),
      meleeMul: tmul(s, 'melee') * skillMul(s, 'melee'), spear: has('spears') || s.role === 'fighter', ammoCost: tmul(s, 'ammo'), sniper: sn };
  }
  function hurtByZombies(u, dt) {
    const tx = u.px | 0, ty = u.py | 0; let dmg = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = tx + dx, ny = ty + dy; if (!inb(nx, ny)) continue;
      for (let j = cellHead[ny * W + nx]; j >= 0 && n < 4; j = cellNext[j]) {
        const z = zombies[j]; if (!z || z.hp <= 0) continue;
        if ((z.x - u.px) ** 2 + (z.y - u.py) ** 2 < 0.55) { dmg += ZTYPES[z.type].dmg; n++; z.st = 1; }
      }
    }
    if (dmg) { u.hp -= dmg * dt * 0.8; u.hurt = 0.25; }
    return u.hp <= 0;
  }
  function killUnit(u, where) {
    const s = u.s;
    const i = G.idle.indexOf(s); if (i >= 0) G.idle.splice(i, 1);
    for (const c of G.crews) { const k = c.members.indexOf(s); if (k >= 0) c.members.splice(k, 1); }
    G.sel = G.sel.filter(id => id !== s.id); U.delete(s.id);
    addBurst(u.px, u.py, '#e8524a', 8);
    memorialize(s, where || 'killed outside the walls'); moraleHit('defender', s);
    log(who(s) + ' was killed ' + (where ? where.replace('killed ', '') : 'outside the walls'));
    const medic = allPeople().some(p => p.role === 'medic');
    if (rng() < TURN.chance * (medic ? TURN.medicMul : 1)) { turning.push({ x: u.px, y: u.py, t: TURN.delay, s }); log('The body is already stirring...'); }
    Snd.error();
  }
  // ---- training: practice when told to, away from the wall. Shooting costs ammo and the noise draws the dead. ------------------
  function trainSpot(u) {
    let best = null, bd = 1e9;
    for (const f of facilities) if (f.type === 'yard') { const d = Math.hypot(f.x - u.px, f.y - u.py); if (d < bd) { bd = d; best = f; } }
    if (best) return [best.x + 0.5 + ((u.s.id % 3) - 1) * 0.7, best.y + 1.1, true];
    const [hx, hy] = home(); return [hx + ((u.s.id % 5) - 2) * 1.2, hy + 1.3 + (u.s.id % 2) * 0.8, false];
  }
  function trainTick(u, dt) {
    const w = workOf(u.s), kind = w.train;
    u.tr = null;
    if (!kind || kind === 'off' || u.s.sick > 0 || u.bpId || u.manual > 0 || alarm()) return;
    const [sx, sy, yard] = trainSpot(u);
    if (Math.hypot(sx - u.px, sy - u.py) > 1.6) { if (!u.order) { orderMove(u, sx, sy, false); u.order.train = true; } return; }
    if (u.order) return;
    const lv = skillLv(u.s, kind);
    if (lv >= 5) { u.tr = 'max'; return; }
    if (!yard && lv >= TRAIN.noCapLevel) { u.tr = 'cap'; if (!u.capMsg) { u.capMsg = 1; log(who(u.s) + ' has learned all the camp can teach. A training yard would take them further.'); } return; }
    u.face = 1;
    if (kind === 'melee') {
      u.tr = 'melee'; u.st = 'stab'; u.trT = (u.trT || 0) - dt;
      if (u.trT <= 0) { u.trT = 0.65; u.stab = 0.18; u.act = 0.2; u.actK = 'stab'; Snd.stab(u.px + 0.7, u.py); }
      addXp(u.s, 'melee', TRAIN.melee * (yard ? TRAIN.yardMelee : 1) * dt);
    } else {
      if (G.ammo < TRAIN.minAmmo) { u.tr = 'noammo'; return; }
      u.tr = 'shoot'; u.trT = (u.trT || 0) - dt;
      if (u.trT <= 0) {
        u.trT = TRAIN.shootGap; G.ammo -= 1; u.shot = 0.09; u.st = 'shoot'; u.act = 0.2; u.actK = 'shoot'; u.aimA = 0; u.aimT = 0.6;
        if (flashes.length < 40) flashes.push({ x: u.px + 0.5, y: u.py - 0.5, life: 0.09 });
        tracers.push({ x1: u.px + 0.5, y1: u.py - 0.5, x2: u.px + 5, y2: u.py - 0.5, life: 0.07 });
        Snd.shot(u.px, u.py, false); addHeat(HEAT.gun * 0.6); alertNoise(u.px, u.py, gunRadius(false) * 0.85, 3);
        addXp(u.s, 'shoot', TRAIN.shoot * (yard ? TRAIN.yardShoot : 1));
      }
    }
  }
  function updateBody(u, dt, inCrew) {
    u.moving = false; u.hurt -= dt; if (u.stab > 0) u.stab -= dt; if (u.act > 0) u.act -= dt; if (u.manual > 0) u.manual -= dt;
    const s = u.s;
    if (!inCrew) {
      if (u.order) {
        const o = u.order, d = Math.hypot(u.gx - u.px, u.gy - u.py);
        if (d < 0.4) {
          if (o.kind === 'post') {
            const i = o.ty * W + o.tx, k = G.idle.indexOf(s);
            u.order = null;
            if (k >= 0 && POSTABLE(wall[i]) && !defAt[i] && s.sick <= 0) {
              G.idle.splice(k, 1); G.sel = G.sel.filter(id => id !== s.id); U.delete(s.id);
              if (addDefender(o.tx, o.ty, s)) { const dd = defAt[i]; dd.hp = Math.min(dd.maxHp, u.hp); dd.auto = o.auto; dd.calm = 0; G.visT = 0; Snd.click(); }
              else G.idle.push(s);
              return;
            }
          } else u.order = null;
        } else {
          const hd = heading(u, u.px, u.py);
          if (!hd) { u.order = null; } else step(u, hd, dt, o.slow ? 0.55 : 1);
        }
      } else { u.think -= dt; if (u.think <= 0) { u.think = 1.5 + rng() * 2; think(u); } }
    }
    // fight whatever is close; calm survivors only fire at what is nearly on top of them
    if (zombies.length) fight(u, dt, fightOpts(u, !alarm() && !inCrew)); else { u.st = 'idle'; if (u.sta < STAMINA.max) u.sta = Math.min(STAMINA.max, u.sta + STAMINA.restRegen * dt); }
    if (!inCrew) trainTick(u, dt);
    if (u.moving && u.st === 'idle') u.st = 'walk';
    // shout of the gun / the smell of people: nearby idle dead come to look
    u.alertT -= dt;
    if (u.alertT <= 0 && u.moving) { u.alertT = 0.8; alertNoise(u.px, u.py, 2.6, 3); }
    // wounds heal slowly in the camp
    if (u.hp < u.maxHp && claimed[(u.py | 0) * W + (u.px | 0)]) u.hp = Math.min(u.maxHp, u.hp + (0.8 + (G.idle.some(m => m.role === 'medic') ? 1.5 : 0)) * dt);
    s.hpNow = u.hp;
  }

  // ---- scavenging parties that walk out and back -----------------------------------------------------
  function crewUnits(c) { return c.members.map(s => of(s)); }
  function updateCrews(dt) {
    for (let i = G.crews.length - 1; i >= 0; i--) {
      const c = G.crews[i], b = buildings[c.bi], t = BUILDING_TYPES[b.type];
      if (!c.members.length) { G.crews.splice(i, 1); b.crew = false; log('The party sent to the ' + t.label + ' never came back'); continue; }
      c.phase = c.phase || 'out';
      const us = crewUnits(c), [dx, dy] = doorOf(b), [hx, hy] = home();
      for (const u of us) { u.moving = false; }
      if (c.phase === 'out') {
        route(c, dx + 0.5, dy + 0.7);
        let arrived = false;
        for (const u of us) {
          if (Math.hypot(c.gx - u.px, c.gy - u.py) < 1.3) { arrived = true; continue; }
          const hd = heading(c, u.px, u.py); if (hd) step(u, hd, dt, 1);
        }
        c.prog = clamp(0.4 * (1 - (us.reduce((m, u) => Math.min(m, Math.hypot(c.gx - u.px, c.gy - u.py)), 99)) / Math.max(5, Math.hypot(c.gx - CORE.x, c.gy - CORE.y))), 0, 0.4);
        if (arrived) { c.phase = 'work'; c.wt = CREW.work * (b.locked ? 1.5 : 1) * (has('scav') ? 0.75 : 1) * ruleMul('crewTime'); c.wt0 = c.wt; }
      } else if (c.phase === 'work') {
        if (!us.some(u => Math.hypot(dx + 0.5 - u.px, dy + 0.7 - u.py) < 3.5)) { c.phase = 'out'; continue; }      // restored away from the door: walk there again
        c.wt -= dt * (1 + 0.15 * (us.length - 1)); c.prog = 0.4 + 0.3 * (1 - Math.max(0, c.wt) / c.wt0);
        if (c.wt <= 0) {
          b.crew = false; b.looted = true;
          const scav = c.members.filter(s => s.role === 'scavenger').length;
          const mul = (CREW.lootMul + CREW.perMember * (c.members.length - 1) + CREW.scavBonus * scav + (has('scav') ? 0.35 : 0)) * (c.members.reduce((m, s) => m + tmul(s, 'loot') * skillMul(s, 'scav'), 0) / c.members.length);
          for (const s of c.members) addXp(s, 'scav', 25);
          const got = takeLoot(b, mul * (hasTruck() ? TRUCK.crewLoot : 1));
          addRes(got); c.got = got;
          if (b.nest) { Outside.clearNest(b); log('The nest in the ' + t.label.toLowerCase() + ' is destroyed'); }
          Snd.loot(); floatText(b.x + b.w / 2, b.y - 0.2, lootText(got, true), '#ffe27a');
          c.phase = 'back'; route(c, hx, hy);
        }
      } else {
        route(c, hx, hy); let home_ = 0;
        for (const u of us) {
          if (Math.hypot(hx - u.px, hy - u.py) < 2.4) { home_++; continue; }
          const hd = heading(c, u.px, u.py); if (hd) step(u, hd, dt, 1.05);
        }
        c.prog = clamp(0.7 + 0.3 * (home_ / us.length), 0.7, 1);
        if (home_ === us.length) {
          G.crews.splice(i, 1);
          for (const s of c.members) G.idle.push(s);
          let msg = 'Party back from the ' + t.label + ': ' + (lootText(c.got) || 'nothing');
          if (rng() < 0.15 && roomForPerson()) { const s = newSurvivor(); G.idle.push(s); msg += ' - brought back ' + intro(s); }
          log(msg); continue;
        }
      }
      // they fight as they go; the dead that reach them bite
      for (const u of us) {
        if (zombies.length) fight(u, dt, fightOpts(u, false)); else u.st = 'idle';
        if (u.moving && u.st === 'idle') u.st = 'walk';
        u.alertT -= dt; if (u.alertT <= 0 && u.moving) { u.alertT = 0.8; alertNoise(u.px, u.py, 2.6, 3); }
      }
    }
  }

  function update(dt) {
    const list = bodies();
    const inCrew = new Set(); for (const c of G.crews) for (const s of c.members) inCrew.add(s.id);
    for (const u of list) {
      if (inCrew.has(u.s.id)) { u.hurt -= dt; if (u.stab > 0) u.stab -= dt; if (u.act > 0) u.act -= dt; if (u.sta < STAMINA.max && u.st === 'idle') u.sta = Math.min(STAMINA.max, u.sta + STAMINA.restRegen * dt * 0.4); u.s.hpNow = u.hp; }
      else updateBody(u, dt, false);
    }
    updateCrews(dt);
    for (const u of list) if (U.has(u.s.id) && hurtByZombies(u, dt)) killUnit(u, inCrew.has(u.s.id) ? 'killed on a scavenging run' : 'killed outside the walls');
    // defenders the survivors posted on their own come back off the wall once the danger has passed
    const a = alarm();
    for (const d of defenders.slice()) if (d.auto) { if (a) d.calm = 0; else if ((d.calm += dt) > 12) standDown(d); }
  }

  // for the renderer and the UI
  const all = () => [...U.values()].filter(u => G.idle.includes(u.s) || G.crews.some(c => c.members.includes(u.s)));
  const at = (wx, wy, r) => { let best = null, bd = (r || 0.75) ** 2; for (const u of all()) { const d = (u.px - wx) ** 2 + (u.py - 0.3 - wy) ** 2; if (d < bd) { bd = d; best = u; } } return best; };
  function statusOf(s) {
    if (defenders.some(d => d.s === s)) { const d = defenders.find(x => x.s === s); return 'on the wall' + (d.auto ? ' (self-posted)' : ''); }
    const c = G.crews.find(c => c.members.includes(s)); if (c) return { out: 'walking out', work: 'scavenging', back: 'coming home' }[c.phase || 'out'];
    const u = U.get(s.id); if (u && u.order) return { move: u.order.build ? 'heading to build' : u.order.train ? 'heading to train' : 'moving', post: 'heading to a post' }[u.order.kind] || 'busy';
    if (u.working) return 'building';
    if (u.tr) return { melee: 'training melee', shoot: 'training shooting', cap: 'needs a training yard', max: 'a master', noammo: 'training paused: low ammo' }[u.tr];
    return 'idle';
  }
  const pendingTiles = () => pending();
  const near = (x, y, r) => all().some(u => Math.hypot(u.px - x, u.py - y) < r);
  return { moveTo: (u, x, y) => orderMove(u, x, y, false), cancel, near, pendingTiles, of, get: s => U.get(s.id), busy, free: free_, post, standDown, standDownSelected, orderAt, selected, update, updateCrews, all, at, playerOrder, route, heading, workOf, statusOf, alarm, cancel };
})();
