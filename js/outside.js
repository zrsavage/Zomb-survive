'use strict';
/* ======================================================================
   outside.js - what happens beyond the walls: infestation nests that keep
   feeding the town with the dead, fire (Molotovs, burning crowds), and the
   dead rising from your fallen defenders.
   ====================================================================== */
const Outside = {
  update(dt) {
    G.molCd -= dt;
    this.nests(dt); this.fires(dt); this.turning(dt);
  },

  // ---- nests: infested buildings that spawn zombies until destroyed ---------------------------------------------------------------
  nests(dt) {
    G.nestT -= dt;
    if (G.nestT <= 0) {
      G.nestT = G.nests.length >= NEST.max ? 60 : (NEST.gapMin + rng() * (NEST.gapMax - NEST.gapMin)) * Director.eventGap() * (1 + 0.3 * G.nests.length);
      if (G.nests.length < NEST.max) this.spawnNest();
    }
    for (const n of G.nests) {
      const b = buildings[n.bi];
      n.t -= dt;
      if (n.t > 0) continue;
      n.t = NEST.spawnGap * (0.8 + rng() * 0.4);
      let near = 0; for (const z of zombies) if (z.mode === 0 && Math.abs(z.x - b.x - b.w / 2) < NEST.near && Math.abs(z.y - b.y - b.h / 2) < NEST.near) near++;
      if (near >= 10 || zombies.length >= Math.min(MAX_ZOMBIES, Q.maxZ)) continue;
      const x = b.x + b.w / 2 + (rng() - 0.5) * b.w, y = b.y + b.h + 0.8, i = (y | 0) * W + (x | 0);
      if (!inb(x | 0, y | 0) || bld[i] >= 0) continue;
      zombies.push(makeZombie(x, y, b.claimed ? 2 : 0, 0));          // inside our territory they go straight for the camp
      addBurst(x, y - 0.3, '#7a1c1c', 5, { grav: 3 });
      if (b.claimed && !n.warned) { n.warned = true; log('The infestation in your own territory is spawning zombies INSIDE the walls!'); }
    }
  },
  spawnNest() {
    const cands = buildings.map((b, i) => i).filter(i => { const b = buildings[i]; return !b.claimed && !b.nest && !b.crew && Math.hypot(b.x + b.w / 2 - CORE.x, b.y + b.h / 2 - CORE.y) >= 10; });
    if (!cands.length) return;
    const bi = pick(cands), b = buildings[bi];
    b.nest = true; G.nests.push({ bi, hp: NEST.hp, t: 4, warned: false });
    if (explored[((b.y + (b.h >> 1)) | 0) * W + ((b.x + (b.w >> 1)) | 0)])
      log('Infestation: the dead are nesting in the ' + BUILDING_TYPES[b.type].label.toLowerCase() + ' to the ' + compass(b.x - CORE.x, b.y - CORE.y) + '. Burn it out or send a crew.');
  },
  clearNest(b) {
    const i = G.nests.findIndex(n => buildings[n.bi] === b);
    if (i >= 0) G.nests.splice(i, 1);
    b.nest = false; moraleGain('crate');
    addBurst(b.x + b.w / 2, b.y + b.h / 2, '#ff8a22', 24, { spread: 6, grav: 2, size: 2 }); Snd.boom(b.x + b.w / 2, b.y + b.h / 2); shake(2);
  },

  // ---- fire ---------------------------------------------------------------
  throwMolotov(tx, ty) {
    const dx = tx + 0.5 - P.px, dy = ty + 0.5 - P.py;
    if (P.dead > 0) return;
    if (dx * dx + dy * dy > FIRE.range * FIRE.range) return warn('Too far to throw (range ' + FIRE.range + ')');
    if (G.molCd > 0) return;
    const cost = effCost('molotov');
    if (!canAfford(cost)) return warn('A Molotov needs ' + cost.m + ' materials and ' + cost.fuel + ' fuel');
    pay(cost); G.molCd = FIRE.cooldown;
    fires.push({ x: tx + 0.5, y: ty + 0.5, t: FIRE.t, r: FIRE.r });
    tracers.push({ x1: P.px, y1: P.py - 0.6, x2: tx + 0.5, y2: ty + 0.5, life: 0.2, fire: true });
    Snd.boom(tx + 0.5, ty + 0.5); shake(1);
    if (rings.length < 24) rings.push({ x: tx + 0.5, y: ty + 0.5, r: 6, t: 0, max: 0.6 });
  },
  fires(dt) {
    for (let k = fires.length - 1; k >= 0; k--) {
      const f = fires[k]; f.t -= dt;
      const r2 = f.r * f.r;
      for (const z of zombies) { const dx = z.x - f.x, dy = z.y - f.y; if (dx * dx + dy * dy < r2) { z.hp -= FIRE.dps * dt; z.burn = FIRE.burn; } }
      for (let ni = G.nests.length - 1; ni >= 0; ni--) {
        const n = G.nests[ni], b = buildings[n.bi];
        const ddx = Math.max(b.x - f.x, 0, f.x - (b.x + b.w)), ddy = Math.max(b.y - f.y, 0, f.y - (b.y + b.h));
        if (ddx * ddx + ddy * ddy < r2) { n.hp -= FIRE.nestDps * dt; if (n.hp <= 0) { log('The nest in the ' + BUILDING_TYPES[b.type].label.toLowerCase() + ' burns to the ground'); this.clearNest(b); } }
      }
      if (parts.length < Q.parts) for (let i = 0; i < 2; i++) parts.push({ x: f.x + (rng() - 0.5) * f.r * 1.4, y: f.y + (rng() - 0.5) * f.r * 0.8, vx: 0, vy: -1.5 - rng() * 1.5, life: 0.5, max: 0.5, color: rng() < 0.5 ? '#ff8a22' : '#ffd23a', size: 2, grav: 0 });
      if (f.t <= 0) fires.splice(k, 1);
    }
  },

  // ---- the dead rise ---------------------------------------------------------------
  turning(dt) {
    for (let i = turning.length - 1; i >= 0; i--) {
      const t = turning[i]; t.t -= dt;
      if (t.t > 0) continue;
      turning.splice(i, 1);
      const z = makeZombie(t.x, t.y, 2, 0, 'walker');
      z.rev = t.s; z.hp = 35; z.speed *= 1.1; zombies.push(z);
      G.morale = clamp(G.morale - 3, 0, 100);
      log(who(t.s) + ' has turned! Put them down.'); Snd.groan(t.x, t.y); shake(1.5);
      addBurst(t.x, t.y - 0.4, '#7a1c1c', 8, { grav: 3 });
    }
  },
};
