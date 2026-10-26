'use strict';
/* ======================================================================
   survival.js - the slow pressures: a finite town (every building holds a
   limited stock), water and sanitation, the four seasons, sewers.
   ====================================================================== */
const gameTime = () => G.elapsed;
const season = () => SEASONS[Math.floor(gameTime() / SEASON_LEN) % SEASONS.length];
const FIELD = { m: 'mat', f: 'food', a: 'ammo', med: 'med', fuel: 'fuel', water: 'water' };

const Survival = {
  // ---- finite stock ---------------------------------------------------------------
  refreshIncome() {                                   // display rates, and how much of the town is left
    const inc = { m: 0, f: 0, a: 0, med: 0, fuel: 0, water: 0 };
    const mult = 1 + 0.15 * (G.level - 1);
    let held = 0, depleted = 0, remain = 0, total = 0;
    for (const b of buildings) {
      total += b.s0 || 0;
      for (const k of STOCK_KEYS) remain += (b.stock && b.stock[k]) || 0;
      if (!b.claimed) continue;
      held++;
      const r = BUILDING_TYPES[b.type].rate; let live = false;
      for (const k in r) if (b.stock && (b.stock[k] || 0) > 0.5) { inc[k] += r[k] * mult; live = true; }
      if (!live) depleted++;
    }
    G.income = inc; G.held = held; G.depleted = depleted; G.supply = total ? remain / total : 0;
  },
  extract(dt) {                                       // passive production drains the building's stock
    const cap = storeCap(), im = ruleMul('income'), mult = (1 + 0.15 * (G.level - 1)) * im;
    const take = (b, f) => {
      const r = BUILDING_TYPES[b.type].rate;
      for (const k in r) {
        const have = b.stock ? b.stock[k] || 0 : 0; if (have <= 0) continue;
        const t = Math.min(have, r[k] * f * dt); b.stock[k] = have - t;
        G[FIELD[k]] = Math.min(cap, G[FIELD[k]] + t);
      }
    };
    for (const b of buildings) if (b.claimed) take(b, mult);
    for (const o of G.outposts) {                     // a garrisoned outpost works the buildings around it
      if (!defAt[o.i]) continue;
      for (const b of buildings) if (!b.claimed && Math.hypot(b.x + b.w / 2 - o.x, b.y + b.h / 2 - o.y) < OUTPOST.range) take(b, OUTPOST.yield);
    }
  },
  warnSupply() {
    const s = G.supply;
    if (s < STOCK.crit && G.supplyLvl < 2) { G.supplyLvl = 2; log('This town is picked clean. Without a new source you will slowly starve. Build a Truck and find another town.'); }
    else if (s < STOCK.warn && G.supplyLvl < 1) { G.supplyLvl = 1; log('Only ' + Math.round(s * 100) + '% of this town\'s supplies remain. Start planning to move on.'); }
  },

  // ---- water, sanitation, seasons ---------------------------------------------------------------
  update(dt) {
    const S = season(), ppl = people();
    G.water = Math.max(0, G.water - WATER.use * ppl * S.water * dt);
    if (G.water <= 0 && ppl > 0) {
      G.thirstT -= dt;
      if (G.thirstT <= 0) {
        G.thirstT = WATER.thirstGap;
        const s = G.idle.filter(x => !x.sick)[rng() * G.idle.length | 0];
        if (s) { s.sick = SICK.time; s.cure = 0; log(who(s) + ' is sick from thirst. Find water!'); }
      }
    }
    const lat = facilities.filter(f => f.type === 'latrine').length;
    G.hygiene = clamp(G.hygiene + (lat * HYGIENE.latrine - HYGIENE.decay * ppl) * dt, 0, 100);
    G.incT -= dt; if (G.incT <= 0) { G.incT = 3; this.refreshIncome(); this.warnSupply(); this.secureTick(); }
    const idx = Math.floor(gameTime() / SEASON_LEN) % SEASONS.length;
    if (idx !== G.seasonIdx) {
      if (G.seasonIdx !== undefined) log('The season turns to ' + SEASONS[idx].name.toLowerCase() + (SEASONS[idx].snow ? '. Food and fuel run short in the cold; gardens stop growing.' : '.'));
      G.seasonIdx = idx;
    }
    this.sewers(dt);
  },

  // ---- sewers ---------------------------------------------------------------
  sewers(dt) {
    for (const s of sewers) {
      if (!s.found && !s.sealed && Math.hypot(s.x + 0.5 - P.px, s.y + 0.5 - P.py) < SEWER.found) {
        s.found = true; log('You spot a sewer access. Zombies could come up through it: seal it with a grate.');
      }
    }
  },
  sealSewer(tx, ty) {
    const s = sewers.find(x => x.x === tx && x.y === ty); if (!s) return false;
    if (s.sealed) { warn('Already sealed'); return true; }
    const cost = effCost('grate'); if (!canAfford(cost)) { warn('A grate needs ' + cost.m + ' materials'); return true; }
    pay(cost); s.sealed = true; s.found = true; Snd.build(); log('Sewer sealed.'); return true;
  },
  // ---- sustainability: can this town look after itself? --------------------------------------------
  assess() {
    const avg = k => SEASONS.reduce((a, q) => a + q[k], 0) / SEASONS.length, ppl = people(), fac = t => facilities.filter(f => f.type === t).length;      // judged over the whole year, not just this season
    const upkeep = 0.05 * allPeople().reduce((m, s) => m + tmul(s, 'eat'), 0) * ruleMul('upkeep') * avg('upkeep');
    const foodMake = 0.35 * avg('garden') * fac('garden'), waterUse = WATER.use * ppl * avg('water'), waterMake = WATER.well * fac('well') + WATER.rain * avg('rain') * fac('rain');
    const matMake = SECURE.mine * fac('mine'), solar = (G.power && G.power.solar) || 0, demand = (G.power && G.power.demand) || 0;
    const shopOn = facilities.some(f => f.type === 'workshop' && f.on);
    let wsum = 0, wn = 0;
    for (let i = 0; i < W * H; i++) if (wall[i] && wall[i] !== K.RADIO && N4.some(([dx, dy]) => inb((i % W) + dx, ((i / W) | 0) + dy) && claimed[((i / W | 0) + dy) * W + (i % W) + dx])) { wsum += wallHp[i] / maxHp(wall[i], i); wn++; }
    const wallAvg = wn ? wsum / wn : 0, L = LEVELS[G.level - 1], need = Math.max(6, Math.round(L.defs * SECURE.garrison));
    const f2 = v => v.toFixed(2);
    return [
      { id: 'food', ok: foodMake >= upkeep && G.food >= 30, text: 'Food: farms grow ' + f2(foodMake) + '/s, people eat ' + f2(upkeep) + '/s' },
      { id: 'water', ok: waterMake >= waterUse && G.water >= 30, text: 'Water: wells and rain give ' + f2(waterMake) + '/s, people drink ' + f2(waterUse) + '/s' },
      { id: 'mat', ok: matMake >= SECURE.matMin && G.mat >= 60, text: 'Raw materials: mines dig ' + f2(matMake) + '/s (need ' + SECURE.matMin + ')' },
      { id: 'power', ok: shopOn && solar >= demand && demand > 0, text: 'Weapons: a workshop running on solar power (' + f2(solar) + ' of ' + f2(demand) + ' power)' },
      { id: 'ammo', ok: G.ammo >= SECURE.ammoMin, text: 'Ammunition in stock: ' + (G.ammo | 0) + ' / ' + SECURE.ammoMin },
      { id: 'walls', ok: G.sealed && wallAvg >= SECURE.wallMin && G.coreHp >= L.coreHp * 0.9, text: 'Walls: sealed, ' + Math.round(wallAvg * 100) + '% intact (need ' + SECURE.wallMin * 100 + '%), core at ' + Math.round(G.coreHp / L.coreHp * 100) + '%' },
      { id: 'garrison', ok: defenders.length >= need, text: 'Garrison: ' + defenders.length + ' on the walls (need ' + need + ')' },
      { id: 'calm', ok: G.elapsed - G.coreHurtAt > SECURE.calmFor && G.morale >= 50 && G.hygiene >= HYGIENE.low, text: 'Calm: core untouched for ' + SECURE.calmFor + 's, morale 50+, clean camp' },
    ];
  },
  secureTick() {
    G.assess = this.assess();
    const all = G.assess.every(c => c.ok);
    if (all) G.safeT += 3; else G.safeT = Math.max(0, G.safeT - 6);
    if (!G.secured && G.safeT >= SECURE.time) {
      G.secured = true; moraleGain('upgrade'); Snd.upgrade();
      log(G.townName + ' is SECURED: it feeds, arms and defends itself. It is safe to move on.');
      Campaign.notify(G.townName + ' is secured. ' + Campaign.towns.filter(t => t === Campaign.active ? G.secured : t.G.secured).length + ' of ' + WIN_TOWNS + ' towns secured.', false);
      Campaign.checkWin();
    }
  },
  sewerShare() { const w = waveNow(); return w >= SEWER.from ? Math.min(SEWER.max, SEWER.base + SEWER.per * (w - SEWER.from)) : 0; },
};
