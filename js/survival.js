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
    G.incT -= dt; if (G.incT <= 0) { G.incT = 3; this.refreshIncome(); this.warnSupply(); }
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
  sewerShare() { return G.hordeN >= SEWER.from ? Math.min(SEWER.max, SEWER.base + SEWER.per * (G.hordeN - SEWER.from)) : 0; },
};
