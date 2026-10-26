'use strict';
/* ai.js - the Governor: plays a camp by itself.
   It drives the survivor through the same inputs a person uses (joy/keys) and makes the camp's decisions
   through the same build/research/crew calls the UI uses, so whatever it can do, a rival town could do too.
   Call AI.update(dt) every simulation step while AI.on is true. */
const AI = (() => {
  const A = {
    on: false, job: null, planT: 0, stuckT: 0, lx: 0, ly: 0, ban: new Map(), want: null, log: [],
    D: new Float64Array(W * H), N: new Int32Array(W * H), goal: -1, think: 0,
  };
  A.ring = [6, 7, 9, 11, 13];
  const home = () => [CORE.x + 0.5, CORE.y + 3.4];
  const near2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
  const hordeOn = () => {
    if (hordes.some(h => !h.minor)) return true;
    let n = 0; for (const z of zombies) if (z.mode === 2 && near2(z.x, z.y, CORE.x, CORE.y) < 144 && (++n >= 12 || (defenders.length < 3 && near2(z.x, z.y, CORE.x, CORE.y) < 49))) return true;      // a crowd, or anything at an undefended core
    return false;
  };

  function setGoal(x, y) { Units.route(A, x, y); }                                  // flow field that routes around the camp core
  function steer(sprint) {
    const ti = (P.py | 0) * W + (P.px | 0);
    let tx = A.gx, ty = A.gy;
    if (A.D[ti] !== Infinity && A.N[ti] >= 0) { const ni = A.N[ti]; tx = ni % W + 0.5; ty = ((ni / W) | 0) + 0.5; }
    const dx = tx - P.px, dy = ty - P.py, d = Math.hypot(dx, dy) || 1;
    joy.x = dx / d; joy.y = dy / d; keys.shift = !!sprint;
  }
  const stop = () => { joy.x = joy.y = 0; keys.shift = false; keys.e = false; };

  // ---- choosing work -------------------------------------------------------------------------
  const centre = b => [b.x + b.w / 2, b.y + b.h + 0.7];
  function zNear(x, y, r) { let n = 0; const r2 = r * r; for (const z of zombies) if (near2(z.x, z.y, x, y) < r2) n++; return n; }
  function lootScore(b) {
    const [cx, cy] = centre(b), t = BUILDING_TYPES[b.type];
    const d = Math.hypot(cx - P.px, cy - P.py), dHome = Math.hypot(cx - CORE.x, cy - CORE.y);
    let bonus = 0;
    const need = { m: G.mat < 150 ? 1.5 : 0.4, f: G.food < 100 ? 1.4 : 0.2, a: G.ammo < 90 ? 1.8 : 0.3, med: G.med < 8 ? 1 : 0, fuel: G.fuel < 10 ? 0.6 : 0.1, water: G.water < 100 ? 0.5 : 0 };
    for (const k in t.loot) bonus += (t.loot[k] || 0) * (need[k] || 0);
    const danger = zNear(cx, cy, 8) * 2.2 * (people() < 3 ? 1.4 : 1);
    return d * 1.0 + dHome * 0.35 + danger - bonus * 0.55;
  }
  function pickLoot() {
    let best = null, bs = 1e9;
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (b.looted || b.crew || b.nest || b.claimed && b.looted) continue;
      if ((A.ban.get(b) || 0) > G.elapsed) continue;
      if (b.locked && G.keys < 1 && G.fuel < KEYS.breachFuel) continue;
      if (!explored[((b.y + (b.h >> 1)) | 0) * W + ((b.x + (b.w >> 1)) | 0)]) continue;
      const s = lootScore(b); if (s < bs) { bs = s; best = b; }
    }
    return best;
  }
  function pickScout() {
    let best = null, bd = 1e9;
    for (let k = 0; k < 140; k++) {
      const x = 3 + (rng() * (W - 6) | 0), y = 3 + (rng() * (H - 6) | 0), i = y * W + x;
      if (explored[i] || bld[i] >= 0) continue;
      const d = Math.hypot(x - P.px, y - P.py) + Math.hypot(x - CORE.x, y - CORE.y) * 0.3 + zNear(x, y, 7) * 2;
      if (d < bd) { bd = d; best = [x, y]; }
    }
    return best;
  }
  function startJob(kind, extra) {
    A.job = Object.assign({ kind, t: 0 }, extra || {});
    stop(); A.stuckT = 0; A.lx = P.px; A.ly = P.py;
    if (extra && extra.gx !== undefined) setGoal(extra.gx, extra.gy);
  }
  function chooseJob() {
    if (hordeOn()) { const [hx, hy] = home(); return startJob('guard', { gx: hx, gy: hy }); }
    const cr = crates.filter(c => c.type !== 'survivor' && Math.hypot(c.x - P.px, c.y - P.py) < 40).sort((a, b) => Math.hypot(a.x - P.px, a.y - P.py) - Math.hypot(b.x - P.px, b.y - P.py))[0];
    if (cr && cr.type === 'airdrop' && zNear(cr.x, cr.y, 5) < 6) return startJob('scout', { gx: cr.x, gy: cr.y });
    if (A.want) { const w = A.want; A.want = null; return startJob('build', { gx: w[0], gy: w[1] }); }
    const lowSupplies = G.mat < 260 || G.food < 90 || G.ammo < 100 || G.water < 70 || G.fuel < 15 || G.med < 6 || !G.sealed || G.idle.length < 3;
    { const L = (G.blue || []).slice().sort((p, q) => q.prio - p.prio || Math.hypot(p.x - P.px, p.y - P.py) - Math.hypot(q.x - P.px, q.y - P.py)); if (L.length && (!G.sealed || !lowSupplies || rng() < 0.4)) { const b = L[0]; return startJob('work', { gx: b.x + 0.5, gy: b.y + 0.5, bx: b.x, by: b.y }); } }
    if (lowSupplies || rng() < 0.3) {
      const b = pickLoot();
      if (b) { const [cx, cy] = centre(b); return startJob('loot', { b, gx: cx, gy: cy }); }
      if (lowSupplies && G.nextHorde > 90) { const s = pickScout(); if (s) return startJob('scout', { gx: s[0], gy: s[1] }); }
    }
    const [hx, hy] = home(); startJob('rest', { gx: hx, gy: hy });
  }

  // ---- doing the job -------------------------------------------------------------------------
  function runJob(dt) {
    const j = A.job; j.t += dt;
    const chasers = zombies.filter(z => z.mode === 1 && near2(z.x, z.y, P.px, P.py) < 16).length;
    if (chasers >= 6 && j.kind !== 'flee' && j.kind !== 'guard' && defenders.length < 3 && !hordeOn()) {      // a train of the dead and nobody on the wall yet: shake them off, do not lead them home
      let cx = 0, cy = 0, n = 0; for (const z of zombies) if (z.mode === 1 && near2(z.x, z.y, P.px, P.py) < 100) { cx += z.x; cy += z.y; n++; }
      if (n) {
        cx /= n; cy /= n; let best = null, bs = -1e9;
        for (let k = 0; k < 40; k++) {
          const x = 3 + (rng() * (W - 6) | 0), y = 3 + (rng() * (H - 6) | 0), i = y * W + x;
          if (bld[i] >= 0 || ground[i] === undefined) continue;
          const s2 = Math.hypot(x - cx, y - cy) * 1.2 + Math.hypot(x - CORE.x, y - CORE.y) * 0.5 - Math.hypot(x - P.px, y - P.py) * 0.4;
          if (s2 > bs) { bs = s2; best = [x, y]; }
        }
        if (best) return startJob('flee', { gx: best[0], gy: best[1] });
      }
    }
    if (j.kind !== 'guard' && j.kind !== 'rest' && j.kind !== 'retreat' && j.kind !== 'flee' && (P.hp < 40 || (chasers >= 4 && P.hp < 70))) {
      if (j.kind === 'loot') A.ban.set(j.b, G.elapsed + 45);
      const [hx, hy] = home(); return startJob('retreat', { gx: hx, gy: hy });
    }
    if (hordeOn() && j.kind !== 'guard' && j.kind !== 'retreat') { const [hx, hy] = home(); return startJob('guard', { gx: hx, gy: hy }); }
    const dist = Math.hypot(A.gx - P.px, A.gy - P.py);
    if (j.kind === 'loot') {
      if (j.b.looted || j.b.crew || j.b.nest) { stop(); A.job = null; return; }
      if (dist > 0.7) {
        steer(dist > 8 && chasers === 0);
        if (j.t > 90) { A.ban.set(j.b, G.elapsed + 120); stop(); A.job = null; }
      } else { joy.x = joy.y = 0; keys.shift = false; keys.e = true; if (j.t > 140) { A.ban.set(j.b, G.elapsed + 120); stop(); A.job = null; } }
    } else if (j.kind === 'work') {                              // stand at the blueprint and build it
      const bp = Build.at(j.bx, j.by);
      if (!bp || j.t > 45) { stop(); A.job = null; } else if (dist < 1.4) { joy.x = joy.y = 0; keys.shift = false; } else steer(dist > 8 && chasers === 0);
    } else if (j.kind === 'scout' || j.kind === 'build') {
      if (dist < 1.2 || j.t > 60) { stop(); A.job = null; } else steer(dist > 8);
    } else if (j.kind === 'flee') {
      if (dist < 1.5 || j.t > 30 || chasers < 3) { stop(); A.job = null; } else steer(true);
    } else if (j.kind === 'retreat') {
      if (dist > 1.5) steer(true); else { stop(); if (P.hp >= PLAYER.hp * 0.85) A.job = null; }
    } else if (j.kind === 'guard') {
      if (dist > 1.5) steer(true); else stop();
      if (!hordeOn() && j.t > 8) A.job = null;
    } else {                                                      // rest at camp briefly, then pick new work
      if (dist > 1.5) steer(false); else stop();
      if (j.t > 4) A.job = null;
    }
    // stuck detection: no progress while a path exists -> give the target up for a while
    if (j.kind !== 'guard' && j.kind !== 'rest' && j.kind !== 'flee' && (joy.x || joy.y)) {
      if (Math.hypot(P.px - A.lx, P.py - A.ly) < 0.15 * dt * 8) { A.stuckT += dt; if (A.stuckT > 3) { if (j.b) A.ban.set(j.b, G.elapsed + 180); stop(); A.job = null; A.stuckT = 0; } }
      else A.stuckT = 0;
      A.lx = P.px; A.ly = P.py;
    }
  }

  // ---- the camp's decisions ------------------------------------------------------------------
  function ringTiles(r) {
    const o = [], cx = CORE.x, cy = CORE.y;
    for (let d = -r; d <= r; d++) o.push([cx + d, cy - r], [cx + d, cy + r]);
    for (let d = -r + 1; d <= r - 1; d++) o.push([cx - r, cy + d], [cx + r, cy + d]);
    return o.filter(([x, y]) => inb(x, y) && bld[y * W + x] < 0 && !isCoreTile(x, y));
  }
  // The camp's territory floods outward from the core until it hits walls, buildings or its size cap. Walling the open tiles on its
  // edge seals exactly what is claimed - and every building the territory touches comes along as part of the perimeter.
  function frontier() {
    const out = [], seen = new Set();
    for (let i = 0; i < W * H; i++) {
      if (!claimed[i]) continue;
      const x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of N4) {
        const nx = x + dx, ny = y + dy; if (!inb(nx, ny)) continue;
        const ni = ny * W + nx;
        if (claimed[ni] || wall[ni] || bld[ni] >= 0 || isCoreTile(nx, ny) || seen.has(ni)) continue;
        seen.add(ni); out.push([nx, ny]);
      }
    }
    return out;
  }
  function edgeWalls() {
    const out = [];
    for (let i = 0; i < W * H; i++) {
      if (wall[i] !== K.WALL || defAt[i]) continue;
      const x = i % W, y = (i / W) | 0;
      if (N4.some(([dx, dy]) => inb(x + dx, y + dy) && claimed[(y + dy) * W + x + dx])) out.push([x, y]);
    }
    return out;
  }
  function place(tool, x, y) {
    if (!inBuildRange(x, y) || !explored[y * W + x]) { if (!A.want) { const dx = CORE.x - x, dy = CORE.y - y, d = Math.hypot(dx, dy) || 1; A.want = [x + dx / d * 3, y + dy / d * 3]; } return false; }
    G.tool = tool; const before = G.mat; tryBuild(x, y); return G.mat < before || true;
  }
  const spend = () => buildMul();
  function freeSpots() {
    const out = [];
    for (let y = CORE.y - 10; y <= CORE.y + 10; y++) for (let x = CORE.x - 10; x <= CORE.x + 10; x++) {
      const i = y * W + x;
      if (inb(x, y) && claimed[i] && !wall[i] && bld[i] < 0 && !facAt[i] && !trapAt[i] && !isCoreTile(x, y) && Math.hypot(x - CORE.x, y - CORE.y) > 3.5) out.push([x, y]);
    }
    return out.sort((a, b) => Math.hypot(a[0] - CORE.x, a[1] - CORE.y) - Math.hypot(b[0] - CORE.x, b[1] - CORE.y));
  }
  function buildFacility(type, max) {
    if (G.level < FACILITIES[type].level || have(type) >= (max || 1)) return false;
    if (G.mat < FACILITIES[type].cost.m + 25) return false;
    const spots = freeSpots(); if (!spots.length) return false;
    G.tool = type; const before = have(type);
    for (let k = 0; k < Math.min(spots.length, 24); k++) {          // some spots are refused (power rules, room): keep trying the next one
      const [x, y] = spots[(k * 5 + facilities.length * 3) % spots.length];
      if (!inBuildRange(x, y)) continue;
      tryBuild(x, y); if (have(type) > before) return true;
    }
    return false;
  }
  const have = t => facilities.filter(f => f.type === t).length + (G.blue || []).filter(b => b.tool === t).length;       // planned ones count
  function plan() {
    const lvl = G.level, L = LEVELS[lvl - 1], r = A.ring[lvl - 1];
    const sealed = G.sealed;
    // 1. seal the claimed ground first: it brings recruits and keeps the dead off the core
    let built = 0;
    const fr = frontier().sort((p, q) => Math.hypot(p[0] - P.px, p[1] - P.py) - Math.hypot(q[0] - P.px, q[1] - P.py));
    for (const [x, y] of fr) {
      if (G.mat < COST.wall.m * spend() + 4) break;
      if (!place('wall', x, y)) { if (A.want) break; continue; }
      if (++built > 40) break;
    }
    // 2. put everyone healthy on the wall, spread out, with towers where there is room for one
    const keep = Math.min(2, Math.floor(Build.workLeft() / 25));             // while there is a lot to build, a couple of people stay off the wall as builders
    if (Units.free().length > keep && defenders.length + [...Units.pendingTiles()].length < popCap()) {
      const pend = Units.pendingTiles(), all = edgeWalls().filter(([x, y]) => !pend.has(y * W + x)), wt = all.filter(([x, y]) => inBuildRange(x, y) && zNear(x + 0.5, y + 0.5, 6) <= 3);      // recruits are people: do not post them into a crowd
      if (!wt.length && all.length && !A.want) { const w = all[0]; A.want = [CORE.x + (w[0] - CORE.x) * 0.6, CORE.y + (w[1] - CORE.y) * 0.6]; }
      let n = 0;
      while (Units.free().length > keep && wt.length && n < 6) {
        let best = null, bd = -1;
        for (const [x, y] of wt) { const dm = defenders.reduce((m, d) => Math.min(m, Math.hypot(d.x - x, d.y - y)), 99); if (dm > bd) { bd = dm; best = [x, y]; } }
        if (!best) break;
        wt.splice(wt.findIndex(t => t[0] === best[0] && t[1] === best[1]), 1);
        if (G.level >= 2 && G.mat >= COST.tower.m * spend() + 60 && bd > 4) place('tower', best[0], best[1]);
        place('def', best[0], best[1]); n++;
      }
    }
    // spike traps in the strip the dead pile up in, just outside the wall
    if (defenders.length >= 3 && sealed && traps.length < 14 && G.mat > 45 + (L.up ? 40 : 0)) {
      const spots = [];
      for (const [x, y] of edgeWalls()) for (const [dx, dy] of N4) {
        const nx = x + dx, ny = y + dy, ni = ny * W + nx;
        if (inb(nx, ny) && !claimed[ni] && !wall[ni] && bld[ni] < 0 && !trapAt[ni] && !isCoreTile(nx, ny) && ground[ni] !== undefined && inBuildRange(nx, ny)) spots.push([nx, ny]);
      }
      if (spots.length) {
        let best = null, bd = -1;
        for (const [x, y] of spots.slice(0, 80)) { const dm = traps.reduce((m, t) => Math.min(m, Math.hypot(t.x - x, t.y - y)), 99); if (dm > bd) { bd = dm; best = [x, y]; } }
        if (best && bd > 3) place('spike', best[0], best[1]);
      }
    }
    // keep a cash reserve for the next step up instead of buying luxuries
    const saving = L.up && defenders.length >= 3 && sealed;
    if (L.up && canAfford(L.up) && G.mat > L.up.m + 20 && sealed) upgradeCore();
    if (!G.res.active) {
      const order = ['spears', 'walls', 'scav', 'rapid', 'comms', 'hands', 'ap', 'silencers', 'medicine', 'watch', 'concrete', 'expedition'];
      const next = order.find(id => !G.res.done[id]);
      if (next) { const r0 = RESEARCH.find(x => x.id === next); if (canAfford(r0.cost) && G.mat > r0.cost.m + 50 + (saving ? L.up.m : 0)) startResearch(next); }
    }
    // a town that can look after itself: water, hygiene and food first, then mines, solar power and a workshop
    if (sealed) {
      const ppl = people(), avgG = SEASONS.reduce((a, q) => a + q.garden, 0) / SEASONS.length, avgUp = SEASONS.reduce((a, q) => a + q.upkeep, 0) / SEASONS.length;
      const needGardens = Math.ceil(0.05 * ppl * avgUp * 1.35 / (0.35 * avgG)), needWells = Math.max(1, Math.ceil(0.03 * ppl * 1.3 / WATER.well));
      if (buildFacility('well', needWells) || buildFacility('latrine', 1) || buildFacility('garden', Math.max(1, needGardens))) { /* one at a time */ }
      else if (G.level >= 2 && (!saving || G.mat > L.up.m * 0.5)) {
        if (buildFacility('mine', 1) || buildFacility('solar', Math.min(3, 1 + Math.floor(defenders.length / 12))) || buildFacility('workshop', 1)) { /* one at a time */ }
      }
    }
    if (G.lookouts.length < 2 && G.mat > 110 && sealed && (!saving || G.lookouts.length < 1)) { const dx = G.lookouts.length ? 1 : -1; place('lookout', CORE.x + dx * (r + 4), CORE.y + 2); }
    // burn out nests when there is fuel
    if (G.nests.length && G.fuel >= 1 && !A.job?.b) {
      const n = G.nests[0], b = buildings[n.bi];
      if (b && inBuildRange(b.x + b.w / 2 | 0, b.y + b.h / 2 | 0)) { G.tool = 'molotov'; tryBuild((b.x + b.w / 2) | 0, (b.y + b.h / 2) | 0); }
    }
    // scavenger crews for the buildings the survivor has already seen (but keep ammo for the horde)
    const hc = G.idle.filter(s => !s.sick);
    if (hc.length >= 3 && G.ammo > (G.nextHorde < 150 ? 55 : 20) && G.crews.length < 2) {
      const cand = buildings.filter(b => !b.looted && !b.crew && !b.nest && !b.locked && explored[((b.y + (b.h >> 1)) | 0) * W + ((b.x + (b.w >> 1)) | 0)]).sort((a, b) => Math.hypot(a.x - CORE.x, a.y - CORE.y) - Math.hypot(b.x - CORE.x, b.y - CORE.y))[0];
      if (cand) { G.sel = [hc[0].id, hc[1].id]; G.tool = 'crew'; sendCrew(cand); }
    }
    // a call for supplies: build the radio once there is slack, and call again when the camp runs thin
    const radioUp = wall.includes(K.RADIO);
    if (G.level >= RADIO_LEVEL && !radioUp && sealed && defenders.length >= 8 && canAfford(COST.radio) && G.mat > COST.radio.m + 60) {
      for (const [x, y] of freeSpots().slice(0, 30)) { if (!inBuildRange(x, y)) continue; G.tool = 'radio'; tryBuild(x, y); if (wall.includes(K.RADIO)) break; }
    } else if (radioUp && G.rescue === null && G.supCd <= 0 && (G.food < 160 || G.ammo < 160 || G.mat < 200) && canAfford(BROADCAST.again)) {
      const i = wall.indexOf(K.RADIO), x = i % W, y = (i / W) | 0;
      if (inBuildRange(x, y)) { G.tool = 'radio'; tryBuild(x, y); }
      else if (!A.want) A.want = [x + (CORE.x - x) * 0.4, y + (CORE.y - y) * 0.4];
    }
    // once this town can stand alone, move on: garage, truck, expedition research, then found the next town
    if (G.secured && Campaign.towns.length < WIN_TOWNS && Campaign.towns.length < MAX_TOWNS) expand();
    // the trader: spend spare materials on whatever the camp is short of
    if (G.trader) for (let k = 0; k < 4; k++) {
      if (G.food < 70 && G.mat >= 40) doTrade(1);
      else if (G.ammo < 70 && G.mat >= 40) doTrade(0);
      else break;
    }
  }
  function expand() {
    if (!has('expedition') && !G.res.active && canAfford(RESEARCH.find(x => x.id === 'expedition').cost)) startResearch('expedition');
    buildFacility('garagebay', 1);
    if (facilities.some(f => f.type === 'garagebay') && !Campaign.truck && G.truckT <= 0 && canAfford(TRUCK.cost)) Base.buildTruck();
    // keep a few people back from the walls to send with the founders
    const idle = Units.free().length;
    if (Campaign.truck && has('expedition') && canAfford(FOUND.cost) && idle < FOUND.minPeople + 1 && defenders.length > 10) { const d = defenders.find(x => x.auto !== true); if (d) Units.standDown(d); }
    if (Campaign.truck && has('expedition') && Campaign.foundReqs().every(x => x.ok)) {
      A.log.push('found at ' + (G.elapsed | 0)); G.sel = G.idle.filter(x => !x.sick).slice(0, 4).map(x => x.id); Campaign.found();
    }
  }
  function radio() {
    const m = Radio.current(); if (!m) return;
    let i = m.choices.findIndex(c => !c.cond || c.cond());
    if (m.id === 'raiders') i = m.choices.findIndex((c, k) => k === 0 && (!c.cond || c.cond()));
    Radio.choose(i < 0 ? m.choices.length - 1 : i);
  }

  A.update = function (dt) {
    if (!A.on || !G || G.over) return;
    if (A.curG !== G) { A.curG = G; A.job = null; A.goal = -1; A.want = null; A.ban.clear(); stop(); }
    if (G.radioMsg) radio();
    A.planT -= dt;
    if (A.planT <= 0) { A.planT = 1.5; try { plan(); } catch (e) { A.err = String(e.stack || e).split('\n').slice(0, 3).join(' | '); } }
    if (P.dead > 0 || P.travel > 0) { stop(); A.job = null; return; }
    if (!A.job) chooseJob();
    if (A.job) runJob(dt);
    // gunfire wakes everything nearby: out in the open the survivor stabs quietly, and only opens fire when cornered or at the wall
    const chased = zombies.filter(z => z.mode === 1 && near2(z.x, z.y, P.px, P.py) < 25).length;
    const atWall = Math.hypot(P.px - CORE.x, P.py - CORE.y) < 9 && (hordeOn() || defenders.length > 2);
    G.holdFire = !(atWall || chased >= 3 || P.hp < 45);
  };
  A._fac = buildFacility; A._spots = freeSpots; A._edge = edgeWalls;
  A.toggle = function (on) { A.on = on === undefined ? !A.on : on; A.job = null; A.goal = -1; if (!A.on) stop(); log('Autopilot ' + (A.on ? 'on' : 'off')); };
  return A;
})();
