'use strict';
/* ======================================================================
   base.js - facilities inside your territory (gardens, workshops, clinic,
   depot) and the fuel-powered grid that runs floodlights, workshops and
   electrified walls. Generators are loud: the running grid draws the dead.
   ====================================================================== */
const Base = {
  depotBonus() { return Math.min(2, facilities.filter(f => f.type === 'depot').length) * 300; },
  hasClinic() { return facilities.some(f => f.type === 'clinic'); },
  floodMul(d) {                                     // defenders near a powered floodlight shoot faster
    for (const f of facilities) if (f.type === 'floodlight' && f.on && (f.x + 0.5 - d.px) ** 2 + (f.y + 0.5 - d.py) ** 2 < 64) return 0.88;
    return 1;
  },

  place(type, x, y) {
    const def = FACILITIES[type], i = y * W + x;
    if (G.level < def.level) return warn(def.label + ' needs camp level ' + def.level);
    if (!claimed[i]) return warn('Build facilities inside your territory');
    if (bld[i] >= 0 || wall[i] || trapAt[i] || facAt[i] || isCoreTile(x, y)) return;
    if (type === 'depot' && facilities.filter(f => f.type === 'depot').length >= 2) return warn('You can only keep 2 depots');
    const cost = { m: Math.ceil(def.cost.m * buildMul()) };
    if (!canAfford(cost)) return warn('Not enough materials');
    pay(cost);
    const f = { type, x, y, t: 0, on: false };
    facilities.push(f); facAt[i] = f; Snd.build();
    if (type === 'generator') toast('Generators burn fuel and make noise. Find fuel at garages, gas stations and junkyards.');
  },
  remove(f) {
    facilities.splice(facilities.indexOf(f), 1); facAt[f.y * W + f.x] = null;
    G.mat += Math.floor(FACILITIES[f.type].cost.m * 0.5);
  },

  update(dt) {
    const gens = facilities.filter(f => f.type === 'generator');
    G.elecT = (G.elecT || 0) - dt;
    if (G.elecT <= 0) { G.elecT = 1; let n = 0; for (let i = 0; i < W * H; i++) if (elec[i] && wall[i]) n++; G.elecCount = n; }
    const shops = facilities.filter(f => f.type === 'workshop'), lights = facilities.filter(f => f.type === 'floodlight');
    const demand = lights.length * POWER.flood + shops.length * POWER.shop + (G.elecCount || 0) * POWER.elec;
    const fuelOk = G.fuel > 0 && gens.length > 0;
    const supply = fuelOk ? gens.length * POWER.gen : 0;
    const ratio = demand <= 0 ? 1 : Math.min(1, supply / demand);
    const burn = demand > 0 && fuelOk ? gens.length * POWER.fuelBurn * Math.min(1, demand / supply) : 0;
    G.fuel = Math.max(0, G.fuel - burn * dt);
    G.power = { supply, demand, ratio: demand > 0 ? ratio : (gens.length ? 1 : 0), burn };
    for (const f of lights) f.on = ratio > 0 && demand > 0;
    for (const f of gens) {
      f.on = burn > 0; f.t -= dt;
      if (f.on && f.t <= 0) {                           // a running generator is loud
        f.t = POWER.noiseGap;
        investigate(f.x + 0.5, f.y + 0.5, POWER.noiseR, false);
        if (rings.length < 24) rings.push({ x: f.x + 0.5, y: f.y + 0.5, r: POWER.noiseR, t: 0, max: 1.1 });
      }
    }
    const cap = storeCap();
    for (const f of facilities) {
      if (f.type === 'garden') G.food = Math.min(cap, G.food + 0.35 * (G.storm > 0 ? 0.5 : 1) * dt);
      else if (f.type === 'clinic') G.med = Math.min(cap, G.med + 0.04 * dt);
      else if (f.type === 'workshop') {
        f.on = ratio > 0 && demand > 0;
        if (f.on) { f.t += dt * ratio; if (f.t >= 5) { if (G.mat >= 2) { G.mat -= 2; G.ammo = Math.min(cap, G.ammo + 1); f.t = 0; } else f.t = 5; } }
      }
    }
  },
};
