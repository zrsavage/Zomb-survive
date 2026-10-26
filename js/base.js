'use strict';
/* ======================================================================
   base.js - facilities inside your territory (gardens, wells, workshops,
   clinic, depot, turrets...) and the fuel-powered grid that runs floodlights,
   workshops, turrets and electrified walls. Generators are loud: the running
   grid draws the dead. Batteries smooth brownouts but make generators run full.
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
    if (type === 'garagebay' && facilities.some(f => f.type === 'garagebay')) return warn('One garage bay is enough');
    const cost = { m: Math.ceil(def.cost.m * buildMul()) };
    if (!canAfford(cost)) return warn('Not enough materials');
    pay(cost);
    const f = { type, x, y, t: 0, on: false };
    if (type === 'turret') Object.assign(f, { px: x + 0.5, py: y + 0.5, cd: 0, mcd: 0, shot: 0, noiseT: 0, face: 1 });
    facilities.push(f); facAt[i] = f; Snd.build();
    if (type === 'generator') toast('Generators burn fuel and make noise. Find fuel at garages, gas stations and junkyards.');
    if (type === 'garagebay') toast('Garage bay built. Open the world map (Tab) to build a Truck.');
  },
  remove(f) {
    facilities.splice(facilities.indexOf(f), 1); facAt[f.y * W + f.x] = null;
    G.mat += Math.floor(FACILITIES[f.type].cost.m * 0.5);
  },
  buildTruck() {
    if (Campaign.truck) return warn('You already have a truck');
    if (G.truckT > 0) return warn('The truck is still being built');
    if (!facilities.some(f => f.type === 'garagebay')) return warn('Build a Garage bay first');
    if (!canAfford(TRUCK.cost)) return warn('A truck needs ' + TRUCK.cost.m + ' materials and ' + TRUCK.cost.fuel + ' fuel');
    pay(TRUCK.cost); G.truckT = TRUCK.time; log('Work begins on a truck (' + TRUCK.time + 's).'); Snd.build();
  },

  update(dt) {
    const S = season();
    const gens = facilities.filter(f => f.type === 'generator'), shops = facilities.filter(f => f.type === 'workshop');
    const lights = facilities.filter(f => f.type === 'floodlight'), turrets = facilities.filter(f => f.type === 'turret'), batts = facilities.filter(f => f.type === 'battery');
    G.elecT = (G.elecT || 0) - dt;
    if (G.elecT <= 0) { G.elecT = 1; let n = 0; for (let i = 0; i < W * H; i++) if (elec[i] && wall[i]) n++; G.elecCount = n; }
    const solarCap = facilities.filter(f => f.type === 'solar').length * POWER.solar;
    const demand = lights.length * POWER.flood + shops.length * POWER.shop + turrets.length * POWER.turret + (G.elecCount || 0) * POWER.elec;
    const fuelOk = G.fuel > 0 && gens.length > 0, battMax = batts.length * POWER.battCap;
    const cap = fuelOk ? gens.length * POWER.gen : 0;
    const wantFull = battMax > 0 && G.batt < battMax && fuelOk;
    const net = Math.max(0, demand - solarCap);                 // solar covers what it can; generators burn fuel only for the rest
    const burnFrac = fuelOk ? (wantFull ? 1 : net > 0 ? Math.min(1, net / cap) : 0) : 0;
    const produced = cap * burnFrac + solarCap;
    let discharge = 0;
    if (produced >= demand) G.batt = Math.min(battMax, G.batt + (produced - demand) * dt);
    else if (G.batt > 0) { discharge = Math.min(demand - produced, POWER.battOut * batts.length, G.batt / Math.max(dt, 1e-3)); G.batt = Math.max(0, G.batt - discharge * dt); }
    if (!batts.length) G.batt = 0;
    const ratio = demand <= 0 ? 1 : Math.min(1, (produced + discharge) / demand);
    const burn = gens.length * POWER.fuelBurn * S.fuel * burnFrac;
    G.fuel = Math.max(0, G.fuel - burn * dt);
    G.power = { solar: solarCap, supply: cap + solarCap, demand, ratio: demand > 0 ? ratio : (gens.length ? 1 : 0), burn, batt: G.batt, battMax };
    for (const f of lights) f.on = ratio > 0 && demand > 0;
    for (const f of gens) {
      f.on = burn > 0; f.t -= dt;
      if (f.on && f.t <= 0) {                           // a running generator is loud
        f.t = POWER.noiseGap;
        investigate(f.x + 0.5, f.y + 0.5, POWER.noiseR, false);
        if (rings.length < 24) rings.push({ x: f.x + 0.5, y: f.y + 0.5, r: POWER.noiseR, t: 0, max: 1.1 });
      }
    }
    const store = storeCap(), rain = G.storm > 0 ? 2.5 : 1;
    for (const f of facilities) {
      switch (f.type) {
        case 'garden': G.food = Math.min(store, G.food + 0.35 * S.garden * (G.storm > 0 ? 0.5 : 1) * dt); break;
        case 'mine': G.mat = Math.min(store, G.mat + SECURE.mine * dt); break;
        case 'solar': break;
        case 'well': G.water = Math.min(store, G.water + WATER.well * dt); break;
        case 'rain': G.water = Math.min(store, G.water + WATER.rain * S.rain * rain * dt); break;
        case 'clinic': G.med = Math.min(store, G.med + 0.04 * dt); break;
        case 'workshop': {
          const R = RECIPES[G.craft] || RECIPES.ammo;
          f.on = ratio > 0 && demand > 0;
          if (f.on) {
            f.t += dt * ratio;
            if (f.t >= R.time) {
              if (canAfford(R.in)) { pay(R.in); const o = R.out; if (o.a) G.ammo = Math.min(store, G.ammo + o.a); if (o.ap) G.ap += o.ap; if (o.inc) G.inc += o.inc; if (o.blade) G.blades += o.blade; f.t = 0; }
              else f.t = R.time;
            }
          }
          break;
        }
        case 'turret':
          f.on = ratio > 0.25 && demand > 0;
          if (f.on) { fight(f, dt, { starving: false, noiseMode: 3, noMelee: true, range: GUN.range + 1, cd: GUN.cd * 1.15 }); }
          break;
      }
    }
    if (G.truckT > 0) { G.truckT -= dt; if (G.truckT <= 0) { G.truckT = 0; Campaign.truck = { built: true }; log('The truck is ready! Open the world map (Tab) to travel or found a new town.'); Snd.upgrade(); } }
  },
};
