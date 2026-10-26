'use strict';
/* ======================================================================
   campaign.js - several towns at once.

   Only the ACTIVE town is simulated in full and drawn. Its state lives in the
   global world variables. Every other town is a saved record that is advanced
   by a cheap, abstract background simulation (income, upkeep, morale, nests,
   hordes resolved by comparing your defence with the horde). When you travel,
   the records are swapped in and out of the globals.
   ====================================================================== */
const Campaign = {
  towns: [], active: null, t: 0, bgAcc: 0, nextId: 1,
  res: { done: {}, active: null }, memorial: [], flags: {}, sid: 1,
  story: 'cassandra', diff: 'normal', truck: null, convoys: [], alert: null,

  start(diffKey, seed, storyKey) {
    Object.assign(this, { towns: [], active: null, t: 0, bgAcc: 0, nextId: 1, res: { done: {}, active: null }, memorial: [], flags: {}, sid: 1,
      story: storyKey || 'cassandra', diff: diffKey || 'normal', truck: null, convoys: [], alert: null });
    buildTown(seed, 'Home Camp', { home: true });
    this.active = Towns.register('Home Camp', seed, { wealth: 1, ambient: 1 });
  },

  notify(msg, alert) {
    if (G) { G.log.unshift({ t: G.elapsed, msg }); if (G.log.length > 8) G.log.pop(); }
    if (alert) { this.alert = { text: msg, t: 14 }; Snd.horn(); } else toast(msg);
  },
  alive: () => Campaign.towns.filter(t => t.status === 'alive'),
  other: () => Campaign.towns.filter(t => t !== Campaign.active && t.status === 'alive'),

  // ---- moving between towns ---------------------------------------------------------------
  canTravel() {
    if (P.dead > 0) { warn('Wait until your survivor is back on their feet'); return false; }
    if (hordes.some(h => h.alive > 0 || h.left > 0)) { warn('You cannot leave while a horde is attacking'); return false; }
    return true;
  },
  moveTo(t) {
    const prev = G, keep = { tool: prev.tool, speed: prev.speed, paused: prev.paused, zoom: prev.cam.zoom };
    Towns.snapshot(this.active);
    Towns.load(t); this.active = t;
    G.tool = keep.tool; G.speed = keep.speed; G.paused = keep.paused; G.cam = { x: CORE.x + 0.5, y: CORE.y + 3, zoom: keep.zoom, free: false };
    P.px = CORE.x + 0.5; P.py = CORE.y + 2.8; P.dead = 0; P.hp = Math.max(P.hp, 40); P.travel = TRAVEL.arrive; P.loot = 0; P.moving = false;
    computePlayerField(); updateVision();
    if (t.pending) {                                    // a horde that was on its way in the background arrives for real
      const pd = t.pending; t.pending = null;
      hordes.push({ id: ++G.hordeId, n: pd.n, minor: false, boss: pd.boss, side: rng() * 4 | 0, pos: rng(), left: pd.size, total: pd.size, acc: 0, seen: false, heard: false, announced: false, alive: 0, near: Infinity, cx: 0, cy: 0 });
      log('A horde was heading for ' + t.name + ' and it is arriving now. Defend it yourself!');
    }
  },
  travel(id) {
    const t = this.towns.find(x => x.id === id);
    if (!t || t === this.active || t.status !== 'alive') return;
    if (!this.truck) return warn('You need a truck to travel between towns');
    if (!this.canTravel()) return;
    if (G.fuel < TRAVEL.fuel) return warn('The trip needs ' + TRAVEL.fuel + ' fuel');
    G.fuel -= TRAVEL.fuel;
    this.moveTo(t);
    log('You arrive in ' + t.name + '.'); Snd.upgrade();
  },
  campFell() {                                          // the active town's camp was overrun
    const cur = this.active;
    cur.status = 'lost';
    const other = this.alive()[0];
    if (!other) { endGame(false, 'The last camp has fallen'); return; }
    const name = cur.name;
    for (const s of allPeople()) memorialize(s, 'died when ' + name + ' fell', true);
    this.moveTo(other);
    other.G.morale = clamp(other.G.morale - 12, 0, 100);
    this.notify(name + ' has fallen. You fled to ' + other.name + '.', true);
  },

  // ---- founding a second town ---------------------------------------------------------------
  foundReqs() {
    const healthy = G.idle.filter(s => !s.sick).length;
    return [
      { ok: this.towns.length < MAX_TOWNS, text: 'Fewer than ' + MAX_TOWNS + ' towns' },
      { ok: has('expedition'), text: 'Research Expedition Planning' },
      { ok: !!this.truck, text: 'A truck (Garage bay, then build it)' },
      { ok: canAfford(FOUND.cost), text: 'Supplies: ' + costStr(FOUND.cost) },
      { ok: G.secured, text: 'This town is secured (sustainable and safe: press Y)' },
      { ok: healthy >= FOUND.minPeople, text: FOUND.minPeople + '+ healthy idle survivors (' + healthy + ')' },
    ];
  },
  found() {
    if (!this.foundReqs().every(r => r.ok)) return warn('You are not ready to found a town yet');
    if (!this.canTravel()) return;
    const chosen = G.idle.filter(s => !s.sick && G.sel.includes(s.id)), rest = G.idle.filter(s => !s.sick && !G.sel.includes(s.id));
    const founders = chosen.concat(rest).slice(0, Math.max(FOUND.minPeople, Math.min(6, chosen.length)));
    pay(FOUND.cost);
    for (const s of founders) G.idle.splice(G.idle.indexOf(s), 1);
    G.sel = G.sel.filter(id => !founders.some(f => f.id === id));
    const prev = G, keep = { tool: prev.tool, speed: prev.speed, zoom: prev.cam.zoom };
    Towns.snapshot(this.active);
    const used = this.towns.map(t => t.name), name = TOWN_NAMES.find(n => !used.includes(n)) || 'New Town';
    const seed = (Math.random() * 2 ** 31) | 0, profile = { wealth: 1.2 + rng() * 0.3, ambient: 1.1 };
    buildTown(seed, name, { wealth: profile.wealth, ambient: profile.ambient, safe: 19, grace: FOUND.grace, res: { mat: FOUND.cost.m, food: FOUND.cost.f, ammo: FOUND.cost.a, fuel: FOUND.cost.fuel - FOUND.tripFuel, water: FOUND.cost.water, med: 2 } });
    G.idle.push(...founders);
    G.tool = keep.tool; G.speed = keep.speed; G.cam.zoom = keep.zoom; P.travel = TRAVEL.arrive;
    const t = Towns.register(name, seed, profile); this.active = t;
    log('You founded ' + name + ' with ' + founders.length + ' survivors. It is a ruined camp: fortify it, and keep an eye on ' + this.towns[0].name + ' while you are away.');
    Snd.upgrade();
  },

  // ---- convoys: supplies and people between towns ---------------------------------------------------------------
  sendSupplies(toId, res) {
    const to = this.towns.find(x => x.id === toId); if (!to || to === this.active || to.status !== 'alive') return;
    if (!canAfford(res)) return warn('You do not have that to send');
    pay(res);
    this.convoys.push({ from: this.active.id, to: toId, res, ppl: [], t: CONVOY.time });
    log('Convoy to ' + to.name + ': ' + costStr(res) + (res.water ? ' ' + res.water + ' water' : '') + ' (' + CONVOY.time + 's, ' + Math.round((this.truck ? CONVOY.riskTruck : CONVOY.risk) * 100) + '% risk).'); Snd.click();
  },
  sendSurvivors(toId) {
    const to = this.towns.find(x => x.id === toId); if (!to || to === this.active || to.status !== 'alive') return;
    const ppl = G.idle.filter(s => !s.sick && G.sel.includes(s.id));
    if (!ppl.length) return warn('Select idle survivors in the list first (click them)');
    for (const s of ppl) G.idle.splice(G.idle.indexOf(s), 1);
    G.sel = G.sel.filter(id => !ppl.some(p => p.id === id));
    this.convoys.push({ from: this.active.id, to: toId, res: {}, ppl, t: CONVOY.time });
    log('Sent ' + ppl.map(who).join(', ') + ' to ' + to.name + '.'); Snd.click();
  },
  deliver(c) {
    const to = this.towns.find(x => x.id === c.to);
    if (!to || to.status !== 'alive') return;
    const hit = rng() < (this.truck ? CONVOY.riskTruck : CONVOY.risk);
    const live = to === this.active, g = live ? G : to.G;
    const cap = LEVELS[g.level - 1].store + 300 * Math.min(2, (live ? facilities : to.lists.facilities).filter(f => f.type === 'depot').length);
    const f = hit ? 0.5 : 1;
    for (const [k, field] of [['m', 'mat'], ['f', 'food'], ['a', 'ammo'], ['med', 'med'], ['fuel', 'fuel'], ['water', 'water']]) if (c.res[k]) g[field] = Math.min(cap, g[field] + Math.floor(c.res[k] * f));
    let lost = 0;
    for (const s of c.ppl) { if (hit && rng() < CONVOY.perSurvivorLoss) { lost++; memorialize(s, 'ambushed on the road to ' + to.name, true); } else g.idle.push(s); }
    const msg = 'The convoy reached ' + to.name + (hit ? ' after an ambush: half the supplies' + (lost ? ' and ' + lost + ' survivor' + (lost > 1 ? 's' : '') : '') + ' were lost.' : '.');
    this.notify(msg, hit);
  },

  checkWin() {
    const n = this.towns.filter(t => t.status === 'alive' && (t === this.active ? G.secured : t.G.secured)).length;
    if (n >= WIN_TOWNS && !G.over) endGame(true, 'Safe zone established');
  },
  // ---- per-frame ---------------------------------------------------------------
  update(dt) {
    this.t += dt;
    if (this.alert) { this.alert.t -= dt; if (this.alert.t <= 0) this.alert = null; }
    for (let i = this.convoys.length - 1; i >= 0; i--) { const c = this.convoys[i]; c.t -= dt; if (c.t <= 0) { this.deliver(c); this.convoys.splice(i, 1); } }
    this.bgAcc += dt;
    while (this.bgAcc >= 1) { this.bgAcc -= 1; for (const t of this.towns) if (t !== this.active && t.status === 'alive') Bg.tick(t, 1); }
  },
};

// ---- town records: swapping a town in and out of the world globals ---------------------------------------------------------------
const Towns = {
  snapshot(t) {
    t.mem = { ground: ground.slice(), bld: bld.slice(), wall: wall.slice(), wallHp: wallHp.slice(), wallTier: wallTier.slice(), elec: elec.slice(), claimed: claimed.slice(), explored: explored.slice() };
    t.lists = { buildings, lamps, sewers, herds, zombies, defenders, hordes, traps, crates, decoys, facilities, fires, turning };
    t.G = G; t.art = { terrain: Art.terrain, decals: Art.decals, claim: Art.claim, mini: Art.mini };
    t.camp = { px: P.px, py: P.py };
    for (const c of G.crews) c.t = c.dur * (c.prog || 0);               // while this town is in the background its parties are simulated abstractly
    Campaign.sid = G.sid;
  },
  load(t) {
    const m = t.mem;
    ground.set(m.ground); bld.set(m.bld); wall.set(m.wall); wallHp.set(m.wallHp); wallTier.set(m.wallTier); elec.set(m.elec); claimed.set(m.claimed); explored.set(m.explored);
    const L = t.lists;
    buildings = L.buildings; lamps = L.lamps; sewers = L.sewers; herds = L.herds; zombies = L.zombies; defenders = L.defenders; hordes = L.hordes;
    traps = L.traps; crates = L.crates; decoys = L.decoys; facilities = L.facilities; fires = L.fires; turning = L.turning;
    defAt = new Array(W * H).fill(null); for (const d of defenders) defAt[d.y * W + d.x] = d;
    trapAt = new Array(W * H).fill(null); for (const x of traps) trapAt[x.y * W + x.x] = x;
    facAt = new Array(W * H).fill(null); for (const f of facilities) facAt[f.y * W + f.x] = f;
    tracers = []; parts = []; texts = []; flashes = []; rings = [];
    G = t.G; G.res = Campaign.res; G.memorial = Campaign.memorial; G.flags = Campaign.flags; G.sid = Campaign.sid; G.story = Campaign.story; G.diff = Campaign.diff;
    Art.terrain = t.art.terrain; Art.decals = t.art.decals; Art.claim = t.art.claim; Art.mini = t.art.mini;
    pile.fill(0); pileNow.fill(0); vis.fill(0);
    computeBaseField(); G.fieldDirty = true; G.visT = 0; G.fieldTimer = 0;
  },
  register(name, seed, profile) {
    const t = { id: Campaign.nextId++, name, seed, profile, status: 'alive', pending: null, shopT: 0 };
    this.snapshot(t); Campaign.towns.push(t); return t;
  },
};

// ---- abstract simulation of towns you are not in ---------------------------------------------------------------
const Bg = {
  people(t) { const g = t.G; return [...g.idle, ...t.lists.defenders.map(d => d.s), ...g.crews.flatMap(c => c.members)]; },
  fac(t, type) { return t.lists.facilities.filter(f => f.type === type).length; },
  season(t) { return SEASONS[Math.floor(t.G.elapsed / SEASON_LEN) % SEASONS.length]; },
  cap(t) { return LEVELS[t.G.level - 1].store + Math.min(2, this.fac(t, 'depot')) * 300; },

  // how strong is this town's defence, as damage over the course of a horde?
  defense(t) {
    const g = t.G, L = t.lists, S = g.story || Campaign.story;
    let dps = 0;
    for (const d of L.defenders) {
      const s = d.s, sn = s.role === 'sniper';
      const dm = (sn ? SNIPER.dmg : 1) * tmul(s, 'dmg') * skillMul(s, 'shoot'), cd = GUN.cd * (sn ? SNIPER.cd : 1) * tmul(s, 'cd') * (1 - 0.03 * skillLv(s, 'shoot')) * (g.morale >= MORALE.slowAbove ? 0.92 : g.morale < MORALE.slowBelow ? 1.15 : 1);
      dps += GUN.dmg * dm / cd + 6;
    }
    const gens = this.fac(t, 'generator'), powered = gens > 0 && g.fuel > 0;
    if (powered) dps += this.fac(t, 'turret') * 20;
    let burst = L.traps.reduce((n, x) => n + (x.type === 'spike' ? 150 : 450), 0);
    let towers = 0, tiers = 0; for (let i = 0; i < W * H; i++) { const k = t.mem.wall[i]; if (k === K.TOWER || k === K.OUTPOST) towers++; tiers += t.mem.wallTier[i]; }
    let wallF = 1 + Math.min(0.5, towers * 0.03) + Math.min(0.3, tiers * 0.004);
    if (!g.sealed) wallF *= 0.6;
    return { dps, burst, wallF };
  },
  strength(t) { return t.lists.defenders.length * 2 + this.fac(t, 'turret') * 3 + t.G.level * 3; },

  tick(t, dt) {
    const g = t.G, L = t.lists;
    g.elapsed += dt;
    this.economy(t, dt); this.siege(t, dt); this.crews(t, dt); this.morale(t, dt); this.nests(t, dt);
    if (t.pending) {
      t.pending.eta -= dt;
      if (t.pending.eta <= 0) { const pd = t.pending; t.pending = null; this.resolve(t, pd); }
    } else {
      if (g.raidT === undefined) g.raidT = 700 + rng() * 700;         // a town you are not in still gets raided now and then
      g.raidT -= dt;
      if (g.raidT <= 0) this.launch(t);
    }
  },

  launch(t) {
    const g = t.G, D = DIFFICULTY[Campaign.diff], st = STORYTELLERS[Campaign.story] || STORYTELLERS.cassandra;
    const n = ++g.hordeN;
    const sMul = Campaign.story === 'randy' ? 0.6 + rng() * 1.1 : st.size * clamp(0.9 + this.strength(t) / 90, 0.9, st.adapt);
    const size = Math.max(6, Math.round(HORDE.base * Math.pow(HORDE.growth, n - 1) * (1 + 0.035 * townMins(g)) * (0.9 + rng() * 0.2) * D.size * sMul * (1 + NEST.hordeBonus * g.nests.length)));
    const gapMul = Campaign.story === 'randy' ? 0.4 + rng() * 1.8 : st.gap;
    g.raidT = (900 + rng() * 900) * D.gap * (gapMul || 1);
    t.pending = { size, n, eta: BG.eta, boss: n % BOSS_EVERY === 0 ? (n >= 10 ? 2 : 1) : 0 };
    if (g.lookouts && g.lookouts.length) Campaign.notify(t.name + ': lookouts report a horde of about ' + size + ', arriving in ~' + BG.eta + 's. Travel there to defend it yourself, or trust your garrison.', true);
  },

  // the horde reaches a town you are not in: compare the defence against it
  resolve(t, pd) {
    const g = t.G, L = t.lists, D = this.defense(t);
    const scale = 1 + HP_SCALE.per * Math.max(0, pd.n - HP_SCALE.from + 1);
    const threat = pd.size * 24 * scale * (1 + 0.04 * pd.n) + pd.boss * 700;
    let cap = (D.dps * BG.engage + D.burst) * D.wallF;
    const need = pd.size * 0.8, use = Math.min(g.ammo, need);
    if (L.defenders.length) cap *= 0.35 + 0.65 * (need ? use / need : 1);
    g.ammo = Math.max(0, g.ammo - use);
    const ratio = cap / threat;
    let deathP = 0, lossF = 0, wear = BG.wallWear * 0.5, fell = false, text;
    if (ratio >= 1.5) { deathP = 0.02; text = 'repelled a horde of ' + pd.size + ' without trouble'; }
    else if (ratio >= 1.0) { deathP = 0.08; wear = BG.wallWear; text = 'repelled a horde of ' + pd.size + ' with some casualties'; }
    else if (ratio >= 0.6) { deathP = 0.25; lossF = 0.25; wear = BG.wallWear * 2; g.morale = clamp(g.morale - 10, 0, 100); text = 'barely held against a horde of ' + pd.size + ' and took heavy losses'; }
    else if (ratio >= 0.3) { deathP = 0.5; lossF = 0.5; wear = BG.wallWear * 3; g.coreHp *= 0.5; g.morale = clamp(g.morale - 25, 0, 100); text = 'was breached by a horde of ' + pd.size + ': heavy losses, supplies looted'; }
    else { fell = true; text = 'was OVERRUN by a horde of ' + pd.size; }
    if (fell) { this.fall(t, text); return; }
    let dead = 0;
    for (const d of L.defenders.slice()) if (rng() < deathP) {
      L.defenders.splice(L.defenders.indexOf(d), 1); dead++;
      Campaign.memorial.push({ name: d.s.name, role: d.s.role, traits: (d.s.traits || []).slice(), cause: 'killed defending ' + t.name, time: g.elapsed, lived: g.elapsed - (d.s.joined || 0), kills: d.s.kills || 0 });
      g.morale = clamp(g.morale - MORALE.hits.defender * 0.8, 0, 100);
    }
    if (lossF) for (const k of ['mat', 'food', 'ammo', 'med', 'fuel', 'water']) g[k] = Math.floor(g[k] * (1 - lossF));
    const w = t.mem.wallHp; for (let i = 0; i < W * H; i++) if (t.mem.wall[i]) w[i] = Math.max(1, w[i] * (1 - wear));
    if (pd.n > g.hordesBeaten) g.hordesBeaten++;
    Campaign.notify(t.name + ' ' + text + (dead ? ' (' + dead + ' defender' + (dead > 1 ? 's' : '') + ' lost)' : '') + '.', ratio < 1);
  },
  fall(t, text) {
    t.status = 'lost';
    for (const s of this.people(t)) Campaign.memorial.push({ name: s.name, role: s.role, traits: (s.traits || []).slice(), cause: 'died when ' + t.name + ' fell', time: t.G.elapsed, lived: t.G.elapsed - (s.joined || 0), kills: s.kills || 0 });
    Campaign.notify(t.name + ' ' + text + ' and has fallen.', true);
  },

  // ---- economy, crews, morale, nests ---------------------------------------------------------------
  economy(t, dt) {
    const g = t.G, L = t.lists, S = this.season(t), cap = this.cap(t), people = this.people(t);
    const take = (b, f) => {
      const r = BUILDING_TYPES[b.type].rate;
      for (const k in r) { const have = b.stock ? b.stock[k] || 0 : 0; if (have <= 0) continue; const x = Math.min(have, r[k] * f * dt); b.stock[k] = have - x; g[FIELD[k]] = Math.min(cap, g[FIELD[k]] + x); }
    };
    const mult = (1 + 0.15 * (g.level - 1)) * (g.rules && g.rules.overtime ? 1.25 : 1);
    for (const b of L.buildings) if (b.claimed) take(b, mult);
    const base = 1 + 0.3 * (g.level - 1);
    g.ammo = Math.min(cap, g.ammo + 0.04 * base * dt); g.mat = Math.min(cap, g.mat + 0.1 * base * dt); g.food = Math.min(cap, g.food + 0.08 * base * dt);
    // facilities
    const gens = this.fac(t, 'generator'), shops = this.fac(t, 'workshop'), lights = this.fac(t, 'floodlight'), turrets = this.fac(t, 'turret');
    g.food = Math.min(cap, g.food + 0.35 * S.garden * this.fac(t, 'garden') * dt);
    g.water = Math.min(cap, g.water + (WATER.well * this.fac(t, 'well') + WATER.rain * S.rain * this.fac(t, 'rain')) * dt);
    g.med = Math.min(cap, g.med + 0.04 * this.fac(t, 'clinic') * dt);
    g.mat = Math.min(cap, g.mat + SECURE.mine * this.fac(t, 'mine') * dt);
    let elec = 0; for (let i = 0; i < W * H; i++) if (t.mem.elec[i] && t.mem.wall[i]) elec++;
    const demand = lights * POWER.flood + shops * POWER.shop + turrets * POWER.turret + elec * POWER.elec;
    const solarCap = this.fac(t, 'solar') * POWER.solar, powered = (gens > 0 && g.fuel > 0) || solarCap >= demand && demand > 0;
    if (gens > 0 && g.fuel > 0 && demand > solarCap) g.fuel = Math.max(0, g.fuel - gens * POWER.fuelBurn * S.fuel * Math.min(1, (demand - solarCap) / (gens * POWER.gen)) * dt);
    if (powered && shops) {                               // workshops keep crafting while powered
      const R = RECIPES[g.craft] || RECIPES.ammo; t.shopT += dt * shops;
      while (t.shopT >= R.time) {
        t.shopT -= R.time;
        if ((!R.in.m || g.mat >= R.in.m) && (!R.in.fuel || g.fuel >= R.in.fuel)) { g.mat -= R.in.m || 0; g.fuel -= R.in.fuel || 0; if (R.out.a) g.ammo = Math.min(cap, g.ammo + R.out.a); if (R.out.ap) g.ap += R.out.ap; if (R.out.inc) g.inc += R.out.inc; if (R.out.blade) g.blades += R.out.blade; } else break;
      }
    }
    // people eat and drink
    const eat = people.reduce((m, s) => m + tmul(s, 'eat'), 0);
    g.food = Math.max(0, g.food - 0.05 * eat * (g.rules && g.rules.ration ? 0.6 : 1) * S.upkeep * dt);
    g.water = Math.max(0, g.water - WATER.use * people.length * S.water * dt);
    g.hygiene = clamp(g.hygiene + (this.fac(t, 'latrine') * HYGIENE.latrine - HYGIENE.decay * people.length) * dt, 0, 100);
    // refugees
    if (g.sealed && g.territory >= 20 && g.food >= 20 && g.morale >= MORALE.noRefugeesBelow && people.length < popCap(g)) {
      g.refugeeT -= dt * (1 + Math.min(g.territory, 450) / 150);
      if (g.refugeeT <= 0) { g.refugeeT = REFUGEE_GAP; const s = newSurvivor(); g.idle.push(s); Campaign.notify(t.name + ': ' + who(s) + ' joined the camp.'); }
    }
    // the core repairs slowly
    if (g.coreHp < LEVELS[g.level - 1].coreHp) g.coreHp = Math.min(LEVELS[g.level - 1].coreHp, g.coreHp + 6 * dt * 0.5);
  },
  siege(t, dt) {                                          // the trickle still walks at a town you are not in
    const g = t.G, L = t.lists, press = pressureRate(g);
    const powered = this.fac(t, 'generator') > 0 && g.fuel > 0 || this.fac(t, 'solar') > 0;
    let cap = L.defenders.length * 0.14 + (powered ? this.fac(t, 'turret') * 0.3 : 0);
    if (g.ammo < 5) cap *= 0.5;
    const handled = Math.min(press, cap), leak = Math.max(0, press - cap);
    g.mat = Math.min(this.cap(t), g.mat + handled * SALVAGE.m * dt); g.ammo = Math.max(0, Math.min(this.cap(t), g.ammo + handled * (SALVAGE.a - 0.3) * dt));
    if (leak) {
      g.coreHp -= leak * 6 * dt;
      const w = t.mem.wallHp; for (let i = 0; i < W * H; i++) if (t.mem.wall[i]) w[i] = Math.max(1, w[i] - leak * 0.25 * dt);
      if (g.coreHp <= 0) this.fall(t, 'was worn down by the endless dead');
    }
  },
  crews(t, dt) {
    const g = t.G;
    for (let i = g.crews.length - 1; i >= 0; i--) {
      const c = g.crews[i]; c.t += dt;
      if (c.t < c.dur) continue;
      g.crews.splice(i, 1);
      const b = t.lists.buildings[c.bi]; b.crew = false; b.looted = true;
      const survivors = c.members.filter(s => rng() >= c.risk * tmul(s, 'risk'));
      for (const s of c.members) if (!survivors.includes(s)) Campaign.memorial.push({ name: s.name, role: s.role, traits: (s.traits || []).slice(), cause: 'lost on a scavenging run', time: g.elapsed, lived: g.elapsed - (s.joined || 0), kills: s.kills || 0 });
      const mul = CREW.lootMul + CREW.perMember * (c.members.length - 1);
      const want = survivors.length ? rollLoot(BUILDING_TYPES[b.type].loot, mul) : {}, cap = this.cap(t);
      for (const [k, , f] of LOOT_KEYS) { const r = Math.min(want[k] || 0, (b.stock && b.stock[k]) || 0); if (b.stock) b.stock[k] -= r; if (r) g[f] = Math.min(cap, g[f] + r); }
      for (const s of survivors) g.idle.push(s);
      if (b.nest && survivors.length) { b.nest = false; g.nests = g.nests.filter(n => t.lists.buildings[n.bi] !== b); }
    }
  },
  morale(t, dt) {
    const g = t.G; let target = 58;
    if (g.sealed) target += 8;
    if (g.food <= 0) target -= 30; else if (g.food < 10) target -= 10; else if (g.food > 40) target += 5;
    if (g.water <= 0) target += WATER.thirstMorale;
    if (g.hygiene < HYGIENE.crit) target -= 12; else if (g.hygiene < HYGIENE.low) target -= 6;
    if (g.coreHp < LEVELS[g.level - 1].coreHp * 0.5) target -= 10;
    for (const id in (g.rules || {})) target += (RULES[id] || {}).morale || 0;
    target += clamp(this.people(t).reduce((m, s) => m + tsum(s, 'cheer'), 0), -12, 12);
    target = clamp(target, 5, 95);
    g.moraleTarget = target;
    g.morale += clamp(target - g.morale, -MORALE.drift * dt, MORALE.drift * dt);
  },
  nests(t, dt) {
    const g = t.G; g.nestT -= dt;
    if (g.nestT > 0) return;
    g.nestT = g.nests.length >= NEST.max ? 60 : (NEST.gapMin + rng() * (NEST.gapMax - NEST.gapMin)) * (1 + 0.3 * g.nests.length);
    if (g.nests.length >= NEST.max) return;
    const B = t.lists.buildings, cands = B.map((b, i) => i).filter(i => !B[i].claimed && !B[i].nest && !B[i].crew && Math.hypot(B[i].x + B[i].w / 2 - CORE.x, B[i].y + B[i].h / 2 - CORE.y) >= 10);
    if (!cands.length) return;
    const bi = pick(cands); B[bi].nest = true; g.nests.push({ bi, hp: NEST.hp, t: 4, warned: false });
  },
};
