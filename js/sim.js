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
const storeCap = () => LEVELS[G.level - 1].store + Base.depotBonus();
const crewMembers = () => G.crews.reduce((n, c) => n + c.members.length, 0);
const people = () => G.idle.length + defenders.length + crewMembers();
const countRole = role => G.idle.filter(s => s.role === role && !s.sick).length + defenders.filter(d => d.s.role === role).length;
const maxHp = (k, i) => WALL_HP[k] * (1 + 0.25 * (G.level - 1)) * (has('walls') ? 1.35 : 1) * (i === undefined ? 1 : TIER.hp[wallTier[i]]);
const buildMul = () => 1 - Math.min(BUILDER.maxDiscount, BUILDER.discount * countRole('builder'));
function effCost(name) {
  const c = COST[name], o = {};
  for (const k in c) o[k] = k === 'm' && name !== 'radio' ? Math.ceil(c[k] * buildMul()) : c[k];
  return o;
}
const canAfford = c => (!c.m || G.mat >= c.m) && (!c.f || G.food >= c.f) && (!c.a || G.ammo >= c.a) && (!c.med || G.med >= c.med) && (!c.fuel || G.fuel >= c.fuel) && (!c.water || G.water >= c.water);
function pay(c) { G.mat -= c.m || 0; G.food -= c.f || 0; G.ammo -= c.a || 0; G.med -= c.med || 0; G.fuel -= c.fuel || 0; G.water -= c.water || 0; }
const LOOT_KEYS = [['m', 'materials', 'mat'], ['f', 'food', 'food'], ['a', 'ammo', 'ammo'], ['med', 'medicine', 'med'], ['fuel', 'fuel', 'fuel'], ['water', 'water', 'water']];
function rollLoot(loot, mul) { const o = {}; for (const [k] of LOOT_KEYS) o[k] = loot[k] ? Math.round(loot[k] * mul * (0.7 + rng() * 0.6)) : 0; return o; }
function addRes(o) { const cap = storeCap(); for (const [k, , f] of LOOT_KEYS) if (o[k]) G[f] = Math.min(cap, G[f] + o[k]); }
function takeLoot(b, mul) {                         // loot is taken out of the building's finite stock
  const want = rollLoot(BUILDING_TYPES[b.type].loot, mul), got = {};
  for (const [k] of LOOT_KEYS) { const r = Math.min(want[k] || 0, (b.stock && b.stock[k]) || 0); got[k] = r; if (b.stock) b.stock[k] -= r; }
  return got;
}
const hasTruck = () => !!(typeof Campaign !== 'undefined' && Campaign.truck);
const lootText = (o, short) => LOOT_KEYS.filter(([k]) => o[k]).map(([k, n]) => '+' + o[k] + (short ? k : ' ' + n)).join(short ? ' ' : ', ');
const armorF = z => 1 - (ZTYPES[z.type].armor || 0) * (has('ap') ? 0.5 : 1);
function log(msg) { G.log.unshift({ t: G.elapsed, msg }); if (G.log.length > 8) G.log.pop(); toast(msg); }
// Survivors are named people with a class. They are expendable, but you feel it when they go.
const who = s => s.name + ' (' + ROLES[s.role].label + ')';
const allPeople = () => [...G.idle, ...defenders.map(d => d.s), ...G.crews.flatMap(c => c.members)];
const tmul = (s, key) => (s.traits || []).reduce((m, t) => m * ((TRAITS[t].mod[key]) || 1), 1);
const tsum = (s, key) => (s.traits || []).reduce((m, t) => m + ((TRAITS[t].mod[key]) || 0), 0);
const traitText = s => (s.traits || []).map(t => TRAITS[t].label).join(', ');
const intro = s => who(s) + (s.traits && s.traits.length ? ' - ' + traitText(s) : '');
function rollTraits() {
  const n = rng() < 0.4 ? 1 : 2, out = [], keys = Object.keys(TRAITS);
  for (let tries = 0; out.length < n && tries < 30; tries++) {
    const t = pick(keys);
    if (out.includes(t) || TRAIT_CONFLICTS.some(([a, b]) => (a === t && out.includes(b)) || (b === t && out.includes(a)))) continue;
    out.push(t);
  }
  return out;
}
function newSurvivor(role) {
  role = role || weighted(ROLES, 'weight');
  const taken = new Set([...G.idle, ...defenders.map(d => d.s), ...G.crews.flatMap(c => c.members)].map(s => s.name));
  let name; for (let t = 0; t < 12; t++) { name = pick(NAMES) + ' ' + pick(SURNAMES); if (!taken.has(name)) break; }
  const xp = { shoot: 0, melee: 0, med: 0, build: 0, scav: 0 };
  for (const k in xp) if (rng() < 0.25) xp[k] = (SKILL_XP[1] * rng()) | 0;
  xp[ROLE_SKILL[role]] = SKILL_XP[1] + ((SKILL_XP[2] - SKILL_XP[1]) * rng() | 0);          // a class starts trained in its own skill
  const s = { id: G.sid++, name, role, sick: 0, cure: 0, traits: rollTraits(), story: pick(BACKSTORY[role]), friend: null, lover: null, rival: null, xp, kills: 0, grief: 0, joined: G.elapsed };
  if (rng() < 0.25) { const f = pick(allPeople().concat([null])); if (f && !f.friend) { s.friend = f.id; f.friend = s.id; } }   // old friends arrive together
  return s;
}
const findSurvivor = id => allPeople().find(s => s.id === id);
// ---- skills (level up with use) ---------------------------------------------------------------
function skillLv(s, k) { const x = (s.xp && s.xp[k]) || 0; let l = 0; for (let i = 1; i < SKILL_XP.length; i++) if (x >= SKILL_XP[i]) l = i; return l; }
const skillMul = (s, k) => { const l = skillLv(s, k); return 1 + 0.05 * l + (l >= 5 ? 0.1 : 0); };
function addXp(s, k, n) {
  if (!s.xp) s.xp = {};
  const before = skillLv(s, k); s.xp[k] = (s.xp[k] || 0) + n; const after = skillLv(s, k);
  if (after > before) { log(who(s) + ' reached ' + SKILLS[k].label + ' ' + after + (after >= 5 ? ' - ' + SKILLS[k].title + '!' : '')); Snd.pickup(); }
}
const skillText = s => Object.keys(SKILLS).map(k => [k, skillLv(s, k)]).filter(([k, l]) => l > 0).map(([k, l]) => SKILLS[k].label + ' ' + '\u2605'.repeat(l)).join(', ');

// ---- morale and the fallen ---------------------------------------------------------------
function memorialize(s, cause, keep) {
  if (!keep) { G.recentDeaths++; Director.addStress(0.25); }
  G.memorial.push({ name: s.name, role: s.role, traits: (s.traits || []).slice(), cause, time: G.elapsed, lived: G.elapsed - (s.joined || 0), kills: s.kills || 0, s: keep ? JSON.parse(JSON.stringify(s)) : undefined });
  if (G.memorial.length > MORALE.memorialMax) G.memorial.shift();
  Snd.toll();
}
function moraleHit(kind, s) {                       // brave people absorb loss better, cowards worse
  const others = allPeople().filter(x => x !== s);
  const avg = others.length ? others.reduce((m, x) => m + tmul(x, 'moraleLoss'), 0) / others.length : 1;
  G.morale = clamp(G.morale - MORALE.hits[kind] * avg, 0, 100);
  const lover = s && allPeople().find(x => x.lover === s.id);
  if (lover) {
    lover.lover = null; lover.grief = REL.loverGrief;
    G.morale = clamp(G.morale - REL.loverHit * tmul(lover, 'moraleLoss'), 0, 100);
    log(lover.name + ' is devastated by the loss of ' + s.name);
  }
  const rival = s && allPeople().find(x => x.rival === s.id); if (rival) rival.rival = null;
  const friend = s && allPeople().find(x => x.friend === s.id);
  if (friend) {
    friend.friend = null; friend.grief = MORALE.grief;
    G.morale = clamp(G.morale - MORALE.hits.friend * tmul(friend, 'moraleLoss'), 0, 100);
    log(friend.name + ' is grieving for ' + s.name);
  }
}
const moraleGain = kind => { G.morale = clamp(G.morale + MORALE.gains[kind], 0, 100); };
const moraleLabel = m => m < 15 ? 'Despair' : m < 35 ? 'Low' : m < 65 ? 'Steady' : m < 85 ? 'Good' : 'High';
const moraleCd = () => G.morale >= MORALE.slowAbove ? 0.92 : G.morale < MORALE.slowerBelow ? 1.25 : G.morale < MORALE.slowBelow ? 1.1 : 1;
function updateRelationships(dt) {
  G.relT -= dt; if (G.relT > 0) return;
  G.relT = REL.checkGap;
  const ppl = allPeople(); if (ppl.length < 2 || G.morale < MORALE.desertBelow) return;
  const a = pick(ppl), b = pick(ppl); if (a === b) return;
  const bond = (k) => { a[k] = b.id; b[k] = a.id; };
  if (a.lover === b.id) return;
  if (a.friend === b.id) {
    if (!a.lover && !b.lover && rng() < REL.lover) { a.friend = b.friend = null; bond('lover'); log(who(a) + ' and ' + who(b) + ' have fallen in love'); }
    return;
  }
  if (a.rival === b.id) { if (rng() < REL.reconcile) { a.rival = b.rival = null; bond('friend'); log(who(a) + ' and ' + who(b) + ' made peace and became friends'); } return; }
  const sour = [a, b].reduce((n, s) => n + ((s.traits || []).includes('bloodthirsty') || (s.traits || []).includes('gloomy') ? 0.08 : 0), 0);
  const r = rng();
  if (!a.friend && !b.friend && r < REL.friend) { bond('friend'); log(who(a) + ' and ' + who(b) + ' have become friends'); }
  else if (!a.rival && !b.rival && r < REL.friend + REL.rival + sour) { bond('rival'); log(who(a) + ' and ' + who(b) + ' have developed a rivalry'); }
}
function updateMorale(dt) {
  let target = 58;
  if (G.sealed) target += 8;
  if (G.food <= 0) target -= 30; else if (G.food < 10) target -= 10; else if (G.food > 40) target += 5;
  if (G.coreHp < LEVELS[G.level - 1].coreHp * 0.5) target -= 10;
  if (G.lookouts.length) target += 3;
  const ppl = allPeople();
  target += clamp(ppl.reduce((m, s) => m + tsum(s, 'cheer'), 0), -12, 12);
  target += ruleSum('morale');
  if (G.water <= 0) target += WATER.thirstMorale;
  if (G.hygiene < HYGIENE.crit) target -= 12; else if (G.hygiene < HYGIENE.low) target -= 6;
  target += ppl.filter(s => s.lover && s.id < s.lover).length * REL.loverMorale + ppl.filter(s => s.rival && s.id < s.rival).length * REL.rivalMorale;
  target = clamp(target, 5, 95);
  G.moraleTarget = target;
  G.morale += clamp(target - G.morale, -MORALE.drift * dt, MORALE.drift * dt);
  for (const s of allPeople()) if (s.grief > 0) s.grief -= dt;
  if (G.morale < MORALE.desertBelow && !ruleFlag('noDesert')) {            // people start walking out on a hopeless camp
    G.desertT -= dt;
    if (G.desertT <= 0) {
      G.desertT = MORALE.desertGap;
      const s = G.idle.filter(x => !x.sick)[rng() * G.idle.length | 0];
      if (s && rng() < 0.6) { G.idle.splice(G.idle.indexOf(s), 1); G.sel = G.sel.filter(id => id !== s.id); memorialize(s, 'left the camp in despair', true); log(who(s) + ' gave up on the camp and left'); moraleHit('desert', s); }
    }
  } else G.desertT = MORALE.desertGap;
}
function addRecruit(s, why) {
  G.idle.push(s);
  log(intro(s) + ' ' + why);
}
const roomForPerson = () => people() < LEVELS[G.level - 1].defs;

// ---- effects helpers ---------------------------------------------------------------
function addBurst(x, y, color, n, o = {}) {
  if (parts.length > Q.parts) return;
  for (let i = 0; i < n; i++) parts.push({
    x, y, vx: (rng() - 0.5) * (o.spread || 3), vy: (rng() - 0.5) * (o.spread || 3) + (o.up || -0.5),
    life: 0.25 + rng() * 0.25, max: 0.5, color, size: o.size || 1.5, grav: o.grav || 0,
  });
}
function floatText(x, y, str, color) { if (texts.length < 30) texts.push({ x, y, str, color: color || '#fff', life: 1.6 }); }
function shake(a) { G.shake = Math.max(G.shake, a); }

// ---- game setup ---------------------------------------------------------------
function buildTown(seed, name, opts) {
  opts = opts || {};
  const diffKey = Campaign.diff, storyKey = Campaign.story;
  genTown(seed, opts.wealth);
  wall.fill(0); wallHp.fill(0); wallTier.fill(0); elec.fill(0); explored.fill(0); vis.fill(0);
  facilities = []; fires = []; turning = []; herds = []; facAt = new Array(W * H).fill(null);
  defAt = new Array(W * H).fill(null); trapAt = new Array(W * H).fill(null);
  zombies = []; defenders = []; hordes = []; traps = []; crates = []; decoys = []; rings = []; tracers = []; parts = []; texts = []; flashes = [];
  const D = DIFFICULTY[diffKey] || DIFFICULTY.normal;
  G = {
    seed, diff: diffKey || 'normal', townName: name, level: 1, ammo: 40, mat: 45, food: 30, med: 4, fuel: 0, water: WATER.start, hygiene: HYGIENE.start, ap: 0, inc: 0, blades: 0, keys: 0, craft: 'ammo',
    fog: 0, thirstT: WATER.thirstGap, incT: 0, supply: 1, supplyLvl: 0, depleted: 0, outposts: [], herdT: 700, herdScan: 0, herdId: 0, herdMsg: null, batt: 0, truckT: 0, idle: [], crews: [], sel: [], sid: Campaign.sid,
    nests: [], nestT: 140, molCd: 0, power: { supply: 0, demand: 0, ratio: 1, burn: 0 },
    coreHp: LEVELS[0].coreHp, kills: 0, elapsed: Campaign.t, born: Campaign.t,
    hordeN: 0, hordesBeaten: 0, nextHorde: 1e9, heat: 0, pressAcc: 0, pressAlive: 0, pulse: 1, pulseT: 0, hordeId: 0, rescue: null, dropT: 0, supCd: 0, secured: false, safeT: 0, coreHurtAt: -999,
    over: false, won: false, paused: false, speed: 1, tool: 'combat', selP: false,
    territory: 0, sealed: false, income: { m: 0, f: 0, a: 0, med: 0, fuel: 0 }, held: 0, lookouts: [],
    fieldDirty: true, fieldTimer: 0, pfTimer: 0, repairT: 0, hudT: 0, visT: 0, scanT: 0, refugeeT: REFUGEE_GAP,
    ambientT: 0, visibleZ: 0, saveT: 30,
    cam: { x: CORE.x + 0.5, y: CORE.y + 3, zoom: document.body.classList.contains('compact') ? 1.7 : 2.4, free: false },
    net: { a: 0, m: 0, f: 0 }, hordeMsg: null,
    res: Campaign.res, storm: 0, thunderT: 8, flash: 0, trader: null,
    eventT: EVENTS.firstAt, log: [], shake: 0, rumble: 0, danger: 0, dangerT: 0,
    time: 0, hover: null, deaths: 0, morale: MORALE.start, moraleTarget: MORALE.start, desertT: MORALE.desertGap, memorial: Campaign.memorial,
    story: storyKey || 'cassandra', rules: {}, ruleCd: 0, flags: Campaign.flags, radioT: 200, radioMsg: null, rescueKind: 'heli', stress: 0, stressT: 1, recentDeaths: 0, relT: REL.checkGap, noticeR: AMBIENT.notice, nfT: 0,
  };
  P = { dead: 0, px: CORE.x + 0.5, py: CORE.y + 2.8, hp: PLAYER.hp, cd: 0, mcd: 0, face: 1, shot: 0, stab: 0, loot: 0, lootB: -1, hurt: 0, noiseT: 0, moving: false, st: 'idle', anim: 0, mag: 12, reloadT: 0, bloom: 0, sta: 100, tired: false, emptyT: 0, mcd: 0 };
  Art.renderTerrain();
  computeBaseField(); computePlayerField(); computeTerritory(); Survival.refreshIncome();
  seedAmbient(D.ambient * (opts.ambient || 1), opts.safe);
  updateVision();
  if (opts.res) Object.assign(G, opts.res);
  if (opts.home) log('You are alone. Scavenge buildings (hold E), scout, and fortify. The dead are already on their way.');
}

function newGame(diffKey, seed, storyKey) {
  seed = seed || ((Math.random() * 2 ** 31) | 0);
  rng = mulberry32(seed ^ 0x9e3779b9);
  Campaign.start(diffKey, seed, storyKey);
}

// ---- zombies: spawning ---------------------------------------------------------------
// a new town starts fresh: its pressure counts its own age plus a share of how far the campaign has come
const townMins = g => (g.elapsed - (g.born || 0) + 0.3 * (g.born || 0)) / 60;
const waveNow = () => Math.max(G.hordeN, 1 + Math.floor(townMins(G) / PRESSURE.tierMin));      // zombie variety and toughness follow time as well as hordes
function pickType(n) {
  const r = rng(); let acc = 0;
  for (const m of HORDE_MIX) {
    if (n < m.from) continue;
    acc += Math.min(m.max, m.base + m.perWave * (n - m.from + 1));
    if (r < acc) return m.type;
  }
  return 'walker';
}
function makeZombie(x, y, mode, h, forceType) {
  const type = forceType || (mode === 2 ? pickType(waveNow()) : (rng() < 0.05 ? 'runner' : 'walker'));
  const zt = ZTYPES[type];
  const tough = mode === 2 ? 1 + HP_SCALE.per * Math.max(0, waveNow() - HP_SCALE.from + 1) : 1;      // later hordes are tougher
  return {
    hx: x, hy: y, burn: 0, hd: null, spT: 1 + rng() * 2, x, y, type, hp: zt.hp * tough, mode, h: h || 0, lose: 0, wt: 0, wx: 0, wy: 0, rage: 0, scr: SCREAM.gap * rng(),
    speed: zt.speed * (0.92 + rng() * 0.16), climb: 0, lift: 0, anim: rng() * 6, face: 1, st: 0, v: rng() * 6 | 0,
  };
}
function seedAmbient(mult, safe) {
  safe = safe || 13;
  let made = 0;
  const want = Math.round(AMBIENT.start * mult);
  for (let c = 0; c < 500 && made < want; c++) {
    const cx = rng() * W | 0, cy = rng() * H | 0;
    if (Math.max(Math.abs(cx - CORE.x), Math.abs(cy - CORE.y)) < safe) continue;
    const n = 6 + (rng() * 8 | 0);
    for (let k = 0; k < n; k++) {
      const x = cx + (rng() - 0.5) * 6, y = cy + (rng() - 0.5) * 6;
      if (!inb(x | 0, y | 0)) continue;
      const i = (y | 0) * W + (x | 0);
      if (bld[i] >= 0 || dist[i] === Infinity) continue;
      zombies.push(makeZombie(x, y, 0)); made++;
    }
  }
  for (const b of buildings) if (b.poi) {                       // points of interest are guarded
    const n = 10 + (rng() * 6 | 0);
    for (let k = 0, tries = 0; k < n && tries < 80; tries++) {
      const x = b.x + b.w / 2 + (rng() - 0.5) * (b.w + 5), y = b.y + b.h / 2 + (rng() - 0.5) * (b.h + 5);
      if (!inb(x | 0, y | 0)) continue;
      const i = (y | 0) * W + (x | 0);
      if (bld[i] >= 0 || dist[i] === Infinity) continue;
      const r = rng();
      zombies.push(makeZombie(x, y, 0, 0, r < 0.2 ? 'armored' : r < 0.3 ? 'spitter' : r < 0.36 ? 'brute' : null)); k++;
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
function startHorde(opts = {}) {
  const minor = !!opts.minor, D = DIFFICULTY[G.diff];
  const n = minor ? Math.max(1, G.hordeN) : ++G.hordeN;
  const mins = townMins(G);
  const size = Math.max(6, Math.round(HORDE.base * Math.pow(HORDE.growth, n - 1) * (1 + 0.035 * mins) * (0.9 + rng() * 0.2) * D.size * Director.hordeSize() * (opts.mult || 1)));
  hordes.push({ id: ++G.hordeId, n, minor, boss: !minor && n % BOSS_EVERY === 0 ? (n >= 9 ? 2 : 1) : 0, side: rng() * 4 | 0, pos: rng(), left: size, total: size, acc: 0, seen: false, heard: false, announced: false, alive: 0, near: Infinity, cx: 0, cy: 0 });
  if (minor) return;
  G.recentDeaths = 0;
  G.nextHorde = 1e9;                                       // hordes only come when drawn
}

// ---- the siege: a constant trickle of the dead, and the noise that can draw a real horde ---------------------------------------------------
function pressureRate(g) {                                  // zombies per second heading for the camp
  g = g || G;
  const age = g.elapsed - (g.born || 0), mins = Math.max(0, age - PRESSURE.start) / 60 + 0.3 * (g.born || 0) / 60, D = DIFFICULTY[Campaign.diff || g.diff];      // a few quiet minutes to find your feet
  let r = Math.min(PRESSURE.max, (age < PRESSURE.start ? 0 : PRESSURE.base * Math.min(1, mins / 4)) + PRESSURE.ramp * mins);
  r *= 1 + PRESSURE.levelMul * (g.level - 1);
  r *= D.press * Director.pressureMul() * (1 + 0.8 * g.heat / HEAT.max) * (g.rescue !== null ? BROADCAST.pressure : 1);
  return r / 60;
}
function spawnPressureZombie() {
  if (zombies.length >= Math.min(MAX_ZOMBIES, Q.maxZ)) return false;
  const open = sewers.filter(s => !s.sealed);
  if (open.length && rng() < Survival.sewerShare()) {
    const s = pick(open);
    if (!s.found) { s.found = true; log('Zombies are climbing out of a manhole ' + compass(s.x - CORE.x, s.y - CORE.y) + ' of camp! Seal sewer accesses with a grate.'); }
    zombies.push(makeZombie(s.x + 0.5, s.y + 0.5, 2, 0)); return true;
  }
  for (let t = 0; t < 14; t++) {
    const side = rng() * 4 | 0, along = rng();
    const x = side === 0 ? 0 : side === 1 ? W - 1 : (along * W | 0), y = side === 2 ? 0 : side === 3 ? H - 1 : (along * H | 0), i = y * W + x;
    if (bld[i] >= 0 || wall[i] || dist[i] === Infinity) continue;
    zombies.push(makeZombie(x + 0.3 + rng() * 0.4, y + 0.3 + rng() * 0.4, 2, 0)); return true;
  }
  return false;
}
function addHeat(v) { G.heat = clamp(G.heat + v, 0, HEAT.max); }
function lureHorde(why) {
  startHorde({ mult: 1.15, lure: true }); G.heat = HEAT.after;
  log(why === 'siren' ? 'The siren wails across the town. They are coming.' : 'All that noise has drawn a horde. They are coming.');
  Snd.horn && Snd.horn(); shake(2);
}
function updatePressure(dt) {
  // heat: loud things you choose to run fill it, quiet decays it; full means a real horde
  let gain = 0;
  for (const f of facilities) { if (f.type === 'generator' && f.on) gain += HEAT.gen; else if (f.type === 'floodlight' && f.on) gain += HEAT.flood; else if (f.type === 'workshop' && f.on) gain += HEAT.shop; else if (f.type === 'mine') gain += HEAT.mine; }
  if (G.rescue !== null) gain += HEAT.radio;
  G.heat = clamp(G.heat + (gain - HEAT.decay) * dt, 0, HEAT.max);
  if (G.heat >= HEAT.max && !hordes.some(h => !h.minor)) lureHorde('noise');
  // the trickle
  G.pulseT -= dt; if (G.pulseT <= 0) { G.pulseT = 40 + rng() * 80; G.pulse = 0.3 + rng() * 1.9; }
  const cap = PRESSURE.cap + PRESSURE.capPerLevel * (G.level - 1);
  G.pressAcc += pressureRate() * dt;
  while (G.pressAcc >= 1) {
    if (G.pressAlive >= cap) { G.pressAcc = Math.min(G.pressAcc, 1.5); break; }
    const n = Math.min(Math.floor(G.pressAcc), 1 + (rng() * PRESSURE.group | 0));
    let made = 0; for (let k = 0; k < n; k++) if (spawnPressureZombie()) made++;
    G.pressAcc -= Math.max(1, n); G.pressAlive += made;
    if (!made) break;
  }
}
function spawnHordeZombie(h, forceType) {
  if (zombies.length >= Math.min(MAX_ZOMBIES, Q.maxZ)) return false;
  if (!forceType && !h.minor && sewers.length && rng() < Survival.sewerShare()) {         // some come up through the sewers
    const open = sewers.filter(s => !s.sealed);
    if (open.length) {
      const s = pick(open);
      if (!s.found) { s.found = true; log('Zombies are climbing out of a manhole ' + compass(s.x - CORE.x, s.y - CORE.y) + ' of camp! Seal sewer accesses with a grate.'); }
      zombies.push(makeZombie(s.x + 0.5, s.y + 0.5, 2, h.id)); return true;
    }
  }
  for (let t = 0; t < 12; t++) {
    const along = (h.pos + (rng() - 0.5) * 0.18 + 1) % 1;
    const s = h.side;
    const x = s === 0 ? 0 : s === 1 ? W - 1 : (along * W | 0);
    const y = s === 2 ? 0 : s === 3 ? H - 1 : (along * H | 0);
    const i = y * W + x;
    if (bld[i] >= 0 || wall[i] || dist[i] === Infinity) continue;
    zombies.push(makeZombie(x + 0.3 + rng() * 0.4, y + 0.3 + rng() * 0.4, 2, h.id, forceType)); return true;
  }
  return false;
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
    if (z.burn > 0) {                                           // burning zombies panic, take damage and set their neighbours alight
      z.burn -= dt; z.hp -= FIRE.burnDps * dt;
      if (rng() < dt * 10) parts.push({ x: z.x + (rng() - 0.5) * 0.3, y: z.y - 0.5, vx: 0, vy: -1.4, life: 0.4, max: 0.4, color: rng() < 0.5 ? '#ff8a22' : '#ffd23a', size: 1.5, grav: 0 });
      stepMove(z, (rng() - 0.5) * 2.2 * dt, (rng() - 0.5) * 2.2 * dt, false);
      for (let j = cellHead[ti]; j >= 0; j = cellNext[j]) { const o = zombies[j]; if (o && o !== z && !(o.burn > 0) && rng() < FIRE.spread * dt) o.burn = FIRE.burn; }
    }
    if (vis[ti]) { seen++; if (rng() < 0.0012) Snd.groan(z.x, z.y); }

    // bite the survivor
    const pdx = P.px - z.x, pdy = P.py - z.y;
    if (P.dead <= 0 && !(P.safe > 0) && pdx * pdx + pdy * pdy < 0.5) {
      P.hp -= zt.dmg * dt; P.hurt = 1.5; z.face = pdx > 0 ? 1 : -1; z.st = 1; Snd.hurt();
      if (P.hp <= 0) killPlayer();
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
    if (z.mode === 2 && Math.hypot(z.x - cx, z.y - cy) < 2.2) {
      G.coreHp -= zt.dmg * dt * 0.45; G.coreHurtAt = G.elapsed; z.face = cx > z.x ? 1 : -1; z.st = 1;
      if (G.coreHp <= 0 && !G.over) Campaign.campFell();
      continue;
    }

    // spitters stop to spray acid at anyone on the wall within range
    if (z.type === 'spitter' && z.mode !== 0 && defenders.length) {
      let tgt = null, bd = SPIT.range * SPIT.range;
      for (const d of defenders) { const dx = d.px - z.x, dy = d.py - z.y, q = dx * dx + dy * dy; if (q < bd) { bd = q; tgt = d; } }
      if (tgt) {
        z.st = 1; z.face = tgt.px > z.x ? 1 : -1; z.spT -= dt;
        if (z.spT <= 0) {
          z.spT = SPIT.cd; tgt.hp -= SPIT.dmg; tgt.hurt = 0.3; wallHp[tgt.y * W + tgt.x] = Math.max(1, wallHp[tgt.y * W + tgt.x] - SPIT.wallDmg);
          tracers.push({ x1: z.x, y1: z.y - 0.5, x2: tgt.px, y2: tgt.py - 0.4, life: 0.18, acid: true }); addBurst(tgt.px, tgt.py - 0.3, '#9ad04a', 4, { grav: 3 }); Snd.hit(z.x, z.y);
          if (tgt.hp <= 0) killDefender(tgt);
        }
        continue;
      }
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
      if (pdx * pdx + pdy * pdy < G.noticeR * G.noticeR) { z.mode = 1; z.lose = 0; continue; }
      z.wt -= dt;
      if (z.wt <= 0) { z.wt = 1.5 + rng() * 3; let a = rng() * 6.283; const hx = z.hx - z.x, hy = z.hy - z.y; if (hx * hx + hy * hy > 16 && rng() < 0.75) a = Math.atan2(hy, hx) + (rng() - 0.5) * 0.8;      // drift back toward where they were standing
        z.wx = Math.cos(a); z.wy = Math.sin(a); if (rng() < 0.4) { z.wx = 0; z.wy = 0; } }
      if (z.wx || z.wy) z.st = 0;
      stepMove(z, z.wx * 0.35 * dt, z.wy * 0.35 * dt, false);
      if (z.wx) z.face = z.wx > 0 ? 1 : -1;
      continue;
    }
    let D = dist, N = nextTile;
    if (z.mode === 1) {
      D = pdist; N = pnext;
      if (pdx * pdx + pdy * pdy > AMBIENT.forget * AMBIENT.forget) { z.lose += dt; if (z.lose > AMBIENT.lose) { z.mode = 0; continue; } } else z.lose = 0;
    } else if (z.mode === 4) {                                  // part of a roaming herd, following its waypoint
      if (pdx * pdx + pdy * pdy < G.noticeR * G.noticeR) { z.mode = 1; z.hd = null; z.lose = 0; continue; }
      if (!z.hd || !herds.includes(z.hd) || z.hd.D[ti] === Infinity) { z.mode = 0; z.hd = null; continue; }
      D = z.hd.D; N = z.hd.N;
      if (D[ti] < 2 || N[ti] < 0) { stepMove(z, (rng() - 0.5) * 0.7 * dt, (rng() - 0.5) * 0.7 * dt, false); z.st = 3; continue; }
    } else if (z.mode === 3) {                                  // investigating a noise
      if (z.nf) { D = z.nf.D; N = z.nf.N; } else { D = ndist; N = nnext; }
      if (D[ti] === Infinity) { z.mode = z.prev === 2 ? 2 : 0; continue; }
      if (D[ti] < 1.6 || N[ti] < 0) { z.st = 3; z.look += dt; if (z.look > NOISE.look) { z.mode = z.prev === 2 ? 2 : 0; z.look = 0; } continue; }
    }
    if (D[ti] === Infinity) { if (z.mode === 1 || z.mode === 3) z.mode = 0; else { zombies[k] = zombies[zombies.length - 1]; zombies.pop(); } continue; }

    let tcx, tcy, ni = -1;
    if (N[ti] < 0) { tcx = P.px; tcy = P.py; }                // standing on the target tile
    else { ni = N[ti]; tcx = ni % W + 0.5; tcy = ((ni / W) | 0) + 0.5; }
    const dx = tcx - z.x, dy = tcy - z.y, dd = Math.hypot(dx, dy) || 1;
    const onWall = wall[ti] > 0;

    if (ni >= 0 && wall[ni] && !onWall && Math.max(Math.abs(dx), Math.abs(dy)) <= 0.9) {
      // queue at the wall and climb over the pile
      const p = pile[ni];
      pileNow[ni]++;
      if (elec[ni] && G.power.ratio > 0) { z.hp -= POWER.zap * G.power.ratio * dt; if (rng() < dt * 8) addBurst(tcx, tcy - 0.5, '#7fd0ff', 1); }
      z.st = 2; z.lift = Math.min(15, 1 + p * 0.55 + (z.v & 3));
      wallHp[ni] -= PILE_PRESSURE * p * dt * TIER.press[wallTier[ni]];
      if (wallHp[ni] <= 1) wallHp[ni] = 1;                    // walls hold
      z.face = dx > 0 ? 1 : -1;
      z.climb += dt * Math.min(PILE_MAX_SPEEDUP, 1 + p * PILE_SPEEDUP);
      if (z.climb >= zt.climb) { z.climb = 0; z.lift = 0; z.x = tcx + (rng() - 0.5) * 0.3; z.y = tcy + (rng() - 0.5) * 0.3; }
      separate(k, z, dt);
      continue;
    }
    const sp = z.speed * (z.rage > 0 ? SCREAM.rageSpeed : 1) * season().zspeed * dt;
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
  if (z.by) z.by.kills++;
  Items.zombieDrop(z);
  if (z.rev) log(z.rev.name + ' has been put to rest');
  if (z.type === 'tyrant') { crates.push({ x: z.x, y: z.y, t: 300, type: 'boss' }); log('The Tyrant is down. It dropped something - go and take it.'); shake(3); Snd.boom(z.x, z.y); }
  // salvage: the dead carry scrap and the odd round, so a big fight pays for itself (bigger zombies carry more)
  const sv = Math.min(6, ZTYPES[z.type].hp / 26);
  G.salvM = (G.salvM || 0) + SALVAGE.m * sv; G.salvA = (G.salvA || 0) + SALVAGE.a * sv;
  if (G.salvM >= 1) { const n = G.salvM | 0; G.salvM -= n; G.mat = Math.min(storeCap(), G.mat + n); }
  if (G.salvA >= 1) { const n = G.salvA | 0; G.salvA -= n; G.ammo = Math.min(storeCap(), G.ammo + n); }
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
  { const dx = P.px - x, dy = P.py - y; if (P.dead <= 0 && dx * dx + dy * dy < r2) { P.hp -= BLOAT.playerDmg; P.hurt = 1.5; if (P.hp <= 0) killPlayer(); } }
  for (const z of zombies) { const dx = z.x - x, dy = z.y - y; if (dx * dx + dy * dy < r2) z.hp -= BLOAT.zombieDmg; }
}
function killDefender(d) {
  removeDefender(d);
  addBurst(d.px, d.py, '#e8524a', 8);
  memorialize(d.s, 'killed on the wall'); moraleHit('defender', d.s);
  log(who(d.s) + ' was killed on the wall');
  const medic = allPeople().some(s => s.role === 'medic');
  if (rng() < TURN.chance * (medic ? TURN.medicMul : 1)) { turning.push({ x: d.px, y: d.py, t: TURN.delay, s: d.s }); log('The body is already stirring...'); }
}
const gunRadius = sn => (sn ? NOISE.sniper : NOISE.gun) * (has('silencers') ? NOISE.silencer : 1);
function investigate(x, y, r, horde) {            // draw idle zombies (and, for decoys, part of a horde) toward a point
  const r2 = r * r, hit = [];
  for (const z of zombies) {
    if (!(z.mode === 0 || (horde && z.mode === 2 && z.h && rng() < 0.6))) continue;
    const dx = z.x - x, dy = z.y - y;
    if (dx * dx + dy * dy < r2) { z.prev = z.mode; z.mode = 3; z.look = 0; hit.push(z); }
  }
  if (hit.length) { const f = noiseField(x, y); for (const z of hit) z.nf = f; }
}
// each noise has its own flow field (a few are kept), so a zombie walks to the sound that woke it, not to the latest one
const noiseFields = [];
function noiseField(x, y) {
  let f = noiseFields.find(o => (o.x - x) ** 2 + (o.y - y) ** 2 < 6);
  if (!f) {
    if (noiseFields.length < 8) { f = { x, y, D: new Float64Array(W * H), N: new Int32Array(W * H), t: 0 }; noiseFields.push(f); }
    else { f = noiseFields.reduce((m, o) => o.t < m.t ? o : m); f.x = x; f.y = y; }
    computeField([clamp(y | 0, 0, H - 1) * W + clamp(x | 0, 0, W - 1)], f.D, f.N);
  }
  f.t = G.elapsed; return f;
}
function updateDecoys(dt) {
  for (let i = decoys.length - 1; i >= 0; i--) {
    const d = decoys[i]; d.t -= dt; d.e -= dt;
    if (d.e <= 0) { d.e = NOISE.decoyGap; investigate(d.x, d.y, NOISE.decoy, true); if (rings.length < 24) rings.push({ x: d.x, y: d.y, r: NOISE.decoy, t: 0, max: 1.2 }); Snd.beep(d.x, d.y); }
    if (d.t <= 0) decoys.splice(i, 1);
  }
}
function alertNoise(x, y, r, mode) {           // gunfire draws idle zombies in
  const r2 = r * r;
  const hit = [];
  for (const z of zombies) {
    if (z.mode !== 0) continue;
    const dx = z.x - x, dy = z.y - y;
    if (dx * dx + dy * dy < r2) { z.mode = mode; z.lose = 0; z.look = 0; z.prev = 0; hit.push(z); }
  }
  if (hit.length && mode === 3) { const f = noiseField(x, y); for (const z of hit) z.nf = f; }
}

// ---- fighting (shared by defenders and the survivor) ---------------------------------------------------------------
function fight(e, dt, o) {
  e.cd -= dt; e.mcd -= dt; e.shot -= dt; e.noiseT -= dt;
  e.st = 'idle';
  if (!zombies.length) return;
  const spear = !!o.spear, reach = (spear ? SPEAR.reach : MELEE.range), hasSta = e.sta !== undefined;
  let near = null, second = null, nd = reach * reach, sd = nd;
  for (let j = 0; j < zombies.length; j++) {
    const z = zombies[j], dx = z.x - e.px, dy = z.y - e.py, q = dx * dx + dy * dy;
    if (z.hp <= 0 || q >= sd) continue;
    if (q < nd) { second = near; sd = near ? nd : sd; nd = q; near = z; }
    else { second = z; sd = q; }
  }
  const melee = near && !o.noMelee && !(e.tired && G.ammo >= 1);       // a spent defender backs off the stabbing and shoots while there is ammo
  if (hasSta) {                                                    // stamina: swinging drains it, standing easy refills it
    if (!melee) e.sta = Math.min(STAMINA.max, e.sta + STAMINA.restRegen * dt * (G.food > 0 ? 1 : 0.5));
    if (e.sta <= 0 && !e.tired) e.tired = true;
    else if (e.tired && e.sta >= STAMINA.recover) e.tired = false;
  }
  if (melee) {
    if (hasSta && e.sta < STAMINA.max) e.sta = Math.min(STAMINA.max, e.sta + STAMINA.fightRegen * (1 + 0.12 * (e.s ? skillLv(e.s, 'melee') : 0)) * dt);
    e.face = near.x >= e.px ? 1 : -1; e.st = 'stab';
    if (e.mcd <= 0) {
      e.mcd = MELEE.cd * (has('hands') ? 0.85 : 1) * (o.starving ? 1.7 : 1) * (e.tired ? STAMINA.tiredCd : 1);
      let bl = 1; if (e.blade && e.blade.dur > 0) { bl = BLADE.dmg; if (--e.blade.dur <= 0) { e.blade = null; if (e.s) log(who(e.s) + '\'s blade snapped'); } }
      const dm = MELEE.dmg * (has('hands') ? 1.35 : 1) * (o.meleeMul || 1) * bl * (spear ? SPEAR.dmg : 1) * (e.tired ? STAMINA.tiredDmg : 1);
      if (hasSta) e.sta = Math.max(0, e.sta - (spear ? STAMINA.spearSwing : STAMINA.swing) / (o.meleeMul > 0 ? Math.max(0.6, o.meleeMul) : 1));
      const hit = spear && second ? [near, second] : [near];
      for (const t of hit) {
        t.hp -= dm; t.by = e.s || null;
        addBurst(t.x, t.y - 0.3, '#9ad06a', 2);
        if (t.mode === 0 && !o.noWake) { t.mode = o.noiseMode === 3 ? 2 : o.noiseMode; t.lose = 0; }
      }
      e.stab = 0.18; e.act = 0.25; e.actK = 'stab';
      if (spear) tracers.push({ x1: e.px, y1: e.py - 0.4, x2: near.x, y2: near.y - 0.4, life: 0.1, spear: true });
      else tracers.push({ x1: near.x - 0.25, y1: near.y - 0.5, x2: near.x + 0.25, y2: near.y - 0.1, life: 0.12, slash: true });
      Snd.stab(near.x, near.y);
      if (e.s) addXp(e.s, 'melee', 1.2);
    }
    return;
  }
  if (e.cd > 0 || (G.ammo < 1 && G.ap < 1 && G.inc < 1) || (G.holdFire && e === P)) return;
  const range = o.range * (o.rangeMul || 1);
  let best = null, bd = range * range;
  for (let j = 0; j < zombies.length; j++) {
    const z = zombies[j]; if (z.hp <= 0) continue;
    const dx = z.x - e.px, dy = z.y - e.py, q = dx * dx + dy * dy;
    if (o.noiseMode === 1 && z.mode !== 1 && q > 9) continue;      // the survivor does not waste rounds on idle dead that haven't noticed them
    if (o.noiseMode !== 1 && G.ammo < 30 && (z.mode === 0 || z.mode === 3) && q > 6) continue;
    if (q < bd) { bd = q; best = z; }
  }
  if (best) {
    // pick the round: AP against armour, incendiary into a crowd, otherwise plain ammo
    let kind = 'a', af = armorF(best);
    if ((ZTYPES[best.type].armor || 0) > 0 && G.ap >= 1) kind = 'ap';
    else if (G.inc >= 1) { let n = 0; for (const z of zombies) { if ((z.x - best.x) ** 2 + (z.y - best.y) ** 2 < 2 && ++n >= 4) break; } if (n >= 4) kind = 'inc'; }
    if (kind === 'a' && G.ammo < 1) kind = G.ap >= 1 ? 'ap' : 'inc';
    let dm = (o.dmgMul || 1) * (has('ap') ? 1.3 : 1);
    if (kind === 'ap') { G.ap -= 1; af = 1; dm *= 1.15; }
    else if (kind === 'inc') { G.inc -= 1; dm *= 0.7; for (const z of zombies) if ((z.x - best.x) ** 2 + (z.y - best.y) ** 2 < 1.6) z.burn = FIRE.burn; }
    else G.ammo = Math.max(0, G.ammo - (o.ammoCost || 1));
    addHeat(HEAT.gun); best.hp -= GUN.dmg * dm * af; best.by = e.s || null; e.shot = 0.09; e.st = 'shoot'; e.act = 0.22; e.actK = 'shoot';
    e.cd = o.cd * (o.cdMul || 1) * (has('rapid') ? 0.8 : 1) * (o.starving ? 1.8 : 1) * (0.9 + rng() * 0.2);
    e.face = best.x >= e.px ? 1 : -1;
    tracers.push({ x1: e.px + e.face * 0.5, y1: e.py - 0.5, x2: best.x, y2: best.y - 0.4, life: 0.1, ap: kind === 'ap', inc: kind === 'inc' });
    if (flashes.length < 40) flashes.push({ x: e.px + e.face * 0.5, y: e.py - 0.5, life: 0.09 });
    if (parts.length < Q.parts) parts.push({ x: e.px, y: e.py - 0.4, vx: -e.face * (0.8 + rng()), vy: -2 - rng(), life: 0.7, max: 0.7, color: '#d8b860', size: 1, grav: 9 });
    addBurst(best.x, best.y - 0.4, '#a02020', 2, { grav: 3 });
    Snd.shot(e.px, e.py, !!o.sniper);
    if (e.s) addXp(e.s, 'shoot', 1);
    if (e.noiseT <= 0) { e.noiseT = 0.6; const gr = gunRadius(o.sniper); alertNoise(e.px, e.py, gr, o.noiseMode === 1 ? 3 : o.noiseMode); /* gunfire makes the dead come and look, it does not lock them onto the shooter */ if (rings.length < 24) rings.push({ x: e.px, y: e.py, r: gr, t: 0, max: NOISE.ring }); }
  }
}
function updateDefenders(dt) {
  const starving = G.food <= 0;
  for (let k = defenders.length - 1; k >= 0; k--) {
    const d = defenders[k];
    if (d.hurt) d.hurt -= dt;
    if (d.act > 0) d.act -= dt;
    const wk = wall[d.y * W + d.x], tower = wk === K.TOWER || wk === K.OUTPOST, sn = d.s.role === 'sniper';
    if (!d.blade && G.blades > 0) { G.blades--; d.blade = { dur: BLADE.dur }; }
    const rel = { dmg: 1, cd: 1 };                                 // lovers fight harder side by side, rivals bicker
    if (d.s.lover) { const l = defenders.find(o => o.s.id === d.s.lover); if (l && (l.px - d.px) ** 2 + (l.py - d.py) ** 2 < 49) { rel.dmg = REL.loverDmg; rel.cd = 0.95; } }
    if (d.s.rival) { const r = defenders.find(o => o.s.id === d.s.rival); if (r && (r.px - d.px) ** 2 + (r.py - d.py) ** 2 < 25) rel.cd *= REL.rivalCd; }
    fight(d, dt, {
      starving, noiseMode: 3, range: tower ? GUN.towerRange : GUN.range, cd: tower ? GUN.towerCd : GUN.cd,
      rangeMul: (sn ? SNIPER.range : 1) * tmul(d.s, 'range'), dmgMul: (sn ? SNIPER.dmg : 1) * tmul(d.s, 'dmg') * skillMul(d.s, 'shoot') * rel.dmg,
      cdMul: (sn ? SNIPER.cd : 1) * tmul(d.s, 'cd') * moraleCd() * (d.s.grief > 0 ? 1.25 : 1) * (1 - 0.03 * skillLv(d.s, 'shoot')) * ruleMul('fire') * rel.cd * Base.floodMul(d),
      meleeMul: tmul(d.s, 'melee') * skillMul(d.s, 'melee'), spear: has('spears') || d.s.role === 'fighter', ammoCost: tmul(d.s, 'ammo'), sniper: sn,
    });
    if (d.s.role === 'medic') {                // medics patch up the people around them
      const r2 = MEDIC.radius ** 2, heal = MEDIC.heal * (has('medicine') ? 2 : 1) * (1 + 0.15 * skillLv(d.s, 'med')) * (G.med > 0 ? 1 : 0.5) * dt;
      let healed = false;
      for (const o of defenders) if (o !== d && o.hp < o.maxHp && (o.px - d.px) ** 2 + (o.py - d.py) ** 2 < r2) { o.hp = Math.min(o.maxHp, o.hp + heal); healed = true; }
      if (healed) { addXp(d.s, 'med', 2 * dt); G.med = Math.max(0, G.med - 0.015 * dt); }
    }
  }
}
function removeDefender(d) { defAt[d.y * W + d.x] = null; defenders.splice(defenders.indexOf(d), 1); }
function addDefender(x, y, s) {
  const i = y * W + x;
  const k = wall[i];
  if ((k !== K.WALL && k !== K.TOWER && k !== K.LOOKOUT && k !== K.OUTPOST) || defAt[i]) return false;
  const maxHp = Math.round(60 * tmul(s, 'hp'));
  const d = { x, y, px: x + 0.5, py: y + 0.5, hp: maxHp, maxHp, sta: STAMINA.max, tired: false, cd: 0, mcd: 0, face: 1, shot: 0, noiseT: 0, s, st: 'idle', anim: rng() * 6 };
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
            if ((z.x - cx) ** 2 + (z.y - cy) ** 2 < r2) { z.hp -= TRAP.barrelDps * dt; z.burn = FIRE.burn; }
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
// Your survivor is expendable: only the camp falling ends the run.
function killPlayer() {
  if (P.dead > 0) return;
  P.dead = PLAYER.respawn; P.hp = 0; P.loot = 0; P.moving = false; G.deaths++;
  for (const z of zombies) if (z.mode === 1 || z.mode === 3) { z.mode = 0; z.lose = 0; }     // the pack that killed you loses the trail
  P.px = CORE.x + 0.5; P.py = CORE.y + 2.8;                 // chasers lose the trail and head for the walls
  G.mat = Math.floor(G.mat * (1 - PLAYER.deathPenalty)); G.ammo = Math.floor(G.ammo * (1 - PLAYER.deathPenalty)); G.food = Math.floor(G.food * (1 - PLAYER.deathPenalty));
  shake(4); Snd.error();
  log('Your survivor fell. Another takes over in ' + PLAYER.respawn + 's (-' + Math.round(PLAYER.deathPenalty * 100) + '% supplies).');
}
const joy = { x: 0, y: 0 };                                  // virtual stick for touch controls
function updatePlayer(dt) {
  if (P.travel > 0) { P.travel -= dt; P.moving = false; P.st = 'idle'; G.noticeR = AMBIENT.notice * NOISE.still; return; }
  if (P.dead > 0) {
    G.noticeR = AMBIENT.notice * NOISE.still;
    P.dead -= dt; P.moving = false; P.st = 'idle';
    if (P.dead <= 0) { P.dead = 0; P.hp = PLAYER.hp * 0.6; P.hurt = 0; P.safe = 4; log('A new survivor takes the field.'); }
    return;
  }
  let mx = 0, my = 0;
  if (keys.w || keys.arrowup) my -= 1;
  if (keys.s || keys.arrowdown) my += 1;
  if (keys.a || keys.arrowleft) mx -= 1;
  if (keys.d || keys.arrowright) mx += 1;
  let mag = 1;
  const jl = Math.hypot(joy.x, joy.y);
  if (jl > 0.18) { mx = joy.x; my = joy.y; mag = Math.min(1, jl); }
  if (mx || my) { P.order = null; P.autoE = false; }                    // taking the controls cancels a standing order
  else { const hd = Units.playerOrder(dt); if (hd) { mx = hd[0]; my = hd[1]; } }
  const moving = !!(mx || my);
  P.moving = moving;
  G.noticeR = AMBIENT.notice * (moving ? (keys.shift ? NOISE.sprint : 1) : NOISE.still) * (G.fog > 0 ? FOG.notice : 1);
  if (moving) {
    G.cam.free = false;
    const k = wall[(P.py | 0) * W + (P.px | 0)];
    const sp = PLAYER.speed * mag * (keys.shift ? PLAYER.sprint : 1) * (k && k !== K.GATE ? PLAYER.wallSlow : 1) * dt / Math.hypot(mx, my);
    if (playerFree(P.px + mx * sp, P.py)) P.px += mx * sp;
    if (playerFree(P.px, P.py + my * sp)) P.py += my * sp;
    if (mx) P.face = mx > 0 ? 1 : -1;
    P.anim += dt * 9 * (keys.shift ? 1.4 : 1);
  }
  P.hurt -= dt; if (P.stab > 0) P.stab -= dt; if (P.safe > 0) P.safe -= dt;
  const safe = claimed[(P.py | 0) * W + (P.px | 0)] || Math.hypot(P.px - CORE.x, P.py - CORE.y) < 6;
  if (P.hurt <= 0) {
    const medic = safe && G.idle.some(s => s.role === 'medic' && !s.sick) ? MEDIC.playerBonus : 0;
    P.hp = Math.min(PLAYER.hp, P.hp + ((safe ? 2.5 : 0.3) + medic) * (has('medicine') ? 2 : 1) * dt);
  }

  // scavenging: hold E beside a building
  const b = nearBuilding();
  if ((keys.e || P.autoE) && b && !b.looted && !b.crew && !b.nest && !moving && !Loot.near && !Loot.isOpen()) {
    const bi = buildings.indexOf(b);
    let need = { t: lootTime() };                                         // locked buildings need a keycard or a cutting torch (fuel)
    if (b.locked) need = G.keys >= 1 ? { t: lootTime() * KEYS.keyTime, key: 1 } : G.fuel >= KEYS.breachFuel ? { t: KEYS.breachTime, fuel: KEYS.breachFuel } : null;
    if (!need) { warn('Locked. You need a keycard or ' + KEYS.breachFuel + ' fuel to cut through.'); P.loot = 0; P.lootB = -1; }
    else {
      if (P.lootB !== bi) { P.lootB = bi; P.loot = 0; }
      P.loot += dt; P.lootNeed = need.t;
      Snd.tick();
      if (P.loot >= need.t) { if (need.key) G.keys--; if (need.fuel) { G.fuel -= need.fuel; addHeat(HEAT.breach); } if (b.type === 'bunker') addHeat(HEAT.vault); scavenge(b); P.loot = 0; P.lootB = -1; }
    }
  } else { P.loot = 0; P.lootB = -1; }

  // supply crates and things on the ground: you stand beside them and press E
  Loot.update(dt);
  for (let i = crates.length - 1; i >= 0; i--) {
    const c = crates[i]; c.t -= dt;
    if (c.type === 'survivor' && Math.hypot(c.x - P.px, c.y - P.py) < 1.6) {
      crates.splice(i, 1);
      const s = recruit('was found alive and follows you home'); if (!s) log('You found someone, but there is no room in the camp');
      if (rng() < 0.5) { for (let k = 0; k < 8; k++) zombies.push(Object.assign(makeZombie(c.x + (rng() - 0.5) * 6, c.y + (rng() - 0.5) * 6, 1, 0), { mode: 1 })); log('The noise drew company!'); }
      Snd.pickup(); continue;
    }
    if (c.type === 'airdrop' && Units.near(c.x, c.y, 1.4)) {          // a worker reaches it first: they haul it in without ceremony
      crates.splice(i, 1);
      const roll = v => Math.round(v * (0.9 + rng() * 0.2) * c.mult), got = {};
      for (const k in BROADCAST.drop) got[k] = roll(BROADCAST.drop[k]);
      addRes(got); moraleGain('crate'); Snd.pickup();
      floatText(c.x, c.y - 1, 'SUPPLY DROP', '#ffd27a'); log('Supply drop hauled in: ' + lootText(got));
      continue;
    }
    if (c.t <= 0) crates.splice(i, 1);
  }

  const tile = wall[(P.py | 0) * W + (P.px | 0)];
  if (!AI.on) Combat.update(dt);                                          // you fire and swing yourself
  else fight(P, dt, { starving: false, noiseMode: 1, ammoCost: PLAYER.ammoCost, range: (tile === K.TOWER || tile === K.OUTPOST) ? GUN.towerRange : GUN.range, cd: GUN.cd * 0.75 });
  P.st = P.st === 'idle' && moving ? 'walk' : P.st;
}
function scavenge(b) {
  b.looted = true;
  const t = BUILDING_TYPES[b.type];
  const got = takeLoot(b, has('scav') ? 1.35 : 1), ent = [];
  for (const [k] of LOOT_KEYS) if (got[k]) ent.push({ r: k, n: got[k] });
  if (b.type === 'house' && rng() < KEYS.houseChance) ent.push({ i: 'keycard', n: 1 });
  if (rng() < 0.08) ent.push({ i: Items.roll(), n: 1 });
  Loot.open('Searched the ' + t.label.toLowerCase(), ent, { x: b.x + b.w / 2, y: b.y + b.h + 0.6 });
  let msg = t.label + ': ' + lootText(got);
  if (rng() < SURVIVOR_CHANCE && roomForPerson()) { const s = newSurvivor(); G.idle.push(s); msg += ' - ' + intro(s) + ' was hiding inside and follows you back!'; }
  log(msg);
}

// ---- survivors: crews, sickness ---------------------------------------------------------------
function selectedIdle() {
  const ok = G.idle.filter(s => !s.sick && !Units.busy(s));
  const chosen = ok.filter(s => G.sel.includes(s.id));
  return chosen.length ? chosen : ok.slice(0, 1);
}
function sendCrew(b, picked) {
  if (!b || b.looted || b.crew) return warn('That building is not available');
  if (b.locked) return warn('Locked: open it yourself (keycard or fuel)');
  const crewPool = picked || selectedIdle();
  if (b.nest && !crewPool.some(s => s.role === 'fighter' || s.role === 'sniper')) return warn('Clearing a nest needs a Fighter or Sniper in the crew');
  if (!explored[(b.y + (b.h >> 1)) * W + b.x + (b.w >> 1)]) return warn('Scout that building first');
  const members = crewPool.slice(0, 3);
  if (!members.length) return warn('No healthy idle survivors to send');
  if (G.ammo < CREW.ammoCost) return warn('A crew needs ' + CREW.ammoCost + ' ammo');
  G.ammo -= CREW.ammoCost;
  const d = Math.hypot(b.x + b.w / 2 - CORE.x, b.y + b.h / 2 - CORE.y);
  const dur = (CREW.baseTime + d * CREW.perTile) * (has('scav') ? 0.8 : 1) * ruleMul('crewTime') * (hasTruck() ? TRUCK.crewTime : 1) * (members.reduce((m, s) => m + tmul(s, 'crewTime'), 0) / members.length);
  let near = 0; for (const z of zombies) if (z.mode === 0 && Math.hypot(z.x - (b.x + b.w / 2), z.y - (b.y + b.h / 2)) < 9) near++;
  const fighters = members.filter(s => s.role === 'fighter' || s.role === 'sniper').length;
  const risk = clamp(CREW.baseRisk + d * CREW.perTileRisk + Math.min(0.18, near * 0.012) - 0.04 * fighters + (b.nest ? NEST.crewRisk : 0) + (b.poi ? 0.08 : 0), 0.04, 0.7);
  for (const s of members) { G.idle.splice(G.idle.indexOf(s), 1); G.sel = G.sel.filter(id => id !== s.id); }
  b.crew = true;
  for (const s of members) { const u = Units.get(s); if (u) Units.cancel(u); }
  G.crews.push({ bi: buildings.indexOf(b), members, t: 0, dur, risk, phase: 'out', prog: 0 });
  log('Sent ' + members.map(who).join(', ') + ' to the ' + BUILDING_TYPES[b.type].label + ' (' + Math.round(risk * 100) + '% risk each)');
  Snd.click();
}
function updateSurvivors(dt) {
  const medic = G.idle.some(s => s.role === 'medic' && !s.sick) || defenders.some(d => d.s.role === 'medic') || Base.hasClinic();
  for (let i = G.idle.length - 1; i >= 0; i--) {
    const s = G.idle[i];
    if (s.sick <= 0) continue;
    if (medic) { s.cure += dt * (has('medicine') ? 2 : 1) * (Base.hasClinic() ? 2 : 1); if (s.cure >= MEDIC.cure) { s.sick = 0; s.cure = 0; log(who(s) + ' recovered thanks to the medic'); } }
    else { s.sick -= dt; if (s.sick <= 0) { G.idle.splice(i, 1); memorialize(s, 'died of sickness'); moraleHit('sick', s); log(who(s) + ' died of sickness. A medic or ' + SICK.treatCost + ' food could have saved them'); } }
  }
}
function treatSick(id) {
  const s = G.idle.find(x => x.id === id);
  if (!s || s.sick <= 0) return;
  if (G.med >= 3) G.med -= 3; else if (G.food >= SICK.treatCost) G.food -= SICK.treatCost; else return warn('Need 3 medicine or ' + SICK.treatCost + ' food');
  s.sick = 0; s.cure = 0; log(who(s) + ' was treated'); Snd.pickup();
}

// ---- economy ---------------------------------------------------------------
function updateEconomy(dt) {
  const mouths = people();
  const upkeep = 0.05 * allPeople().reduce((m, s) => m + tmul(s, 'eat'), 0) * ruleMul('upkeep') * season().upkeep;
  const base = 1 + 0.3 * (G.level - 1);
  const im = ruleMul('income');
  const ra = 0.1 * base, rm = 0.18 * base, rf = 0.08 * base - upkeep;                       // the camp's own trickle; buildings are handled by extract()
  G.net = { a: ra + G.income.a * im, m: rm + G.income.m * im, f: rf + G.income.f * im, med: G.income.med * im, fuel: G.income.fuel * im - G.power.burn, water: G.income.water * im };
  const cap = storeCap();
  Survival.extract(dt);
  G.ammo = clamp(G.ammo + ra * dt, 0, cap);
  G.mat = clamp(G.mat + rm * dt, 0, cap);
  G.food = clamp(G.food + rf * dt, 0, cap);
  if (G.ammo < 60 && G.mat > 20) {                                  // before a workshop exists, someone hand-loads rounds from scrap so the camp never runs completely dry
    G.handT = (G.handT || 0) + dt;
    if (G.handT >= (G.mat > 150 ? 2 : 4)) { G.handT = 0; G.mat -= 2; G.ammo += 1; }
  }

  G.repairT -= dt;
  if (G.repairT <= 0) {
    G.repairT = 0.5;
    const builders = countRole('builder') + allPeople().reduce((m, s) => m + tsum(s, 'repair'), 0);
    let left = 6 + 4 * builders;
    const bl = allPeople().filter(s => s.role === 'builder'), blv = bl.reduce((m, s) => m + skillLv(s, 'build'), 0);
    const gain = 25 * (1 + BUILDER.repairBonus * Math.min(builders, 2)) * (1 + 0.08 * Math.min(blv, 8)) * ruleMul('repair'), cost = builders ? 0.5 : 1;
    let repaired = 0;
    for (let i = 0; i < W * H && left > 0 && G.mat >= 1; i++) {
      if (!wall[i]) continue;
      const m = maxHp(wall[i], i);
      if (wallHp[i] < m) { wallHp[i] = Math.min(m, wallHp[i] + gain); G.mat -= cost; left--; repaired++; }
    }
    if (repaired) for (const s of bl) addXp(s, 'build', repaired * 0.5);
    const L = LEVELS[G.level - 1];
    if (G.coreHp < L.coreHp) G.coreHp = Math.min(L.coreHp, G.coreHp + 6);
  }

  // a sealed, fed camp draws refugees
  if (G.sealed && G.territory >= 20 && G.food >= 20 && G.morale >= MORALE.noRefugeesBelow && roomForPerson()) {
    G.refugeeT -= dt * (1 + G.territory / 150) * ruleMul('refugee');
    if (G.refugeeT <= 0) { G.refugeeT = REFUGEE_GAP; addRecruit(newSurvivor(), 'saw your walls and joined the camp'); moraleGain('refugee'); Snd.pickup(); }
  }
}

// ---- hordes: schedule, detection, warnings ---------------------------------------------------------------
function updateHordes(dt) {
  updatePressure(dt);
  G.nextHorde -= dt;
  if (G.nextHorde <= 0) startHorde();
  for (const h of hordes) {
    if (h.left > 0) {
      h.acc += dt * h.total / HORDE.spawnSecs;
      while (h.acc >= 1 && h.left > 0) {
        h.acc -= 1; h.left--; spawnHordeZombie(h);
        if (h.boss > 0 && h.left <= h.total * 0.5 && spawnHordeZombie(h, 'tyrant')) { h.boss--; shake(3); if (h.seen) log('Lookout: a TYRANT walks with the horde!'); else toast('The ground shakes. Something huge is coming.'); Snd.scream(CORE.x, CORE.y); }
      }
    }
  }
  G.scanT -= dt;
  if (G.scanT > 0) return;
  G.scanT = 0.5;
  const R2 = lookoutR() ** 2, byId = {};
  for (const h of hordes) { h.alive = 0; h.near = Infinity; h.cx = h.cy = 0; byId[h.id] = h; }
  G.pressAlive = 0;
  for (const z of zombies) {
    if (z.mode === 2 && !z.h) G.pressAlive++;
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
      hordes.splice(i, 1);
      if (!h.minor) { G.hordesBeaten++; moraleGain('horde'); if (G.recentDeaths >= 2 && G.rescue === null) { G.nextHorde += Director.breather(); log('A lull settles over the town. Catch your breath.'); } }
      if (h.seen || h.heard) log(h.minor ? 'The stragglers are dead' : 'The horde has been destroyed');
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
  G.storm = Math.max(0, G.storm - dt); G.fog = Math.max(0, G.fog - dt);
  if (G.storm > 0) {
    G.thunderT -= dt;
    if (G.thunderT <= 0) { G.thunderT = 6 + rng() * 9; G.flash = 1; setTimeout(() => Snd.thunder(), 400 + rng() * 900); }
  }
  G.flash = Math.max(0, G.flash - dt * 2.5);
  if (G.trader) { G.trader.t -= dt; if (G.trader.t <= 0) { G.trader = null; log('The trader packed up and left'); } }
  G.eventT -= dt;
  if (G.eventT <= 0) { G.eventT = (EVENTS.gapMin + rng() * (EVENTS.gapMax - EVENTS.gapMin)) * Director.eventGap(); fireEvent(); }
}
function fireEvent() {
  const kind = Director.pickEvent();
  if (!kind) return;
  if (kind === 'fog') { G.fog = FOG.time; log('A thick fog rolls in. You cannot see far, and neither can they.'); return; }
  if (kind === 'stranger') { const s = newSurvivor(); addRecruit(s, 'wandered in and asked to stay'); moraleGain('refugee'); Snd.pickup(); return; }
  if (kind === 'stragglers') { if (!defenders.length) { G.fog = FOG.time; log('A thick fog rolls in. You cannot see far, and neither can they.'); return; } startHorde({ minor: true, mult: 0.3 }); return; }          // no warning: a few dozen drift in
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
    log(who(s) + ' fell ill. Treat them for ' + SICK.treatCost + ' food, or a medic will cure them.');
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
    G.res.done[a.id] = true; G.res.active = null; moraleGain('research');
    const r = RESEARCH.find(x => x.id === a.id);
    log('Research complete: ' + r.name);
    if (a.id === 'walls') for (let i = 0; i < W * H; i++) if (wall[i]) wallHp[i] = Math.min(maxHp(wall[i], i), wallHp[i] * 1.35);
    Snd.upgrade();
  }
}
function startBroadcast(again) {
  if (G.rescue !== null) return warn('The radio is already broadcasting');
  if (again) {
    if (G.supCd > 0) return warn('The radio needs ' + fmtTime(G.supCd) + ' to cool before it can call again');
    if (!canAfford(BROADCAST.again)) return warn('Calling again costs ' + BROADCAST.again.m + ' materials and ' + BROADCAST.again.fuel + ' fuel');
    pay(BROADCAST.again);
  }
  G.rescue = BROADCAST.time; G.rescueKind = 'heli'; G.dropT = 10;
  log('The radio is broadcasting a call for supplies. Drops will land in the camp for ' + fmtTime(BROADCAST.time) + ' - but the noise carries.');
  Snd.horn();
}
function airdrop(mult) {                                    // a crate of food and supplies lands inside the camp
  let x = CORE.x + 0.5, y = CORE.y + 3.5;
  for (let t = 0; t < 40; t++) {
    const cx = (CORE.x + (rng() - 0.5) * 18) | 0, cy = (CORE.y + (rng() - 0.5) * 14) | 0, i = cy * W + cx;
    if (!inb(cx, cy) || bld[i] >= 0 || wall[i] || isCoreTile(cx, cy) || !claimed[i] || Math.hypot(cx - CORE.x, cy - CORE.y) < 3) continue;
    x = cx + 0.5; y = cy + 0.5; break;
  }
  crates.push({ x, y, t: 240, type: 'airdrop', mult: (mult || 1) * (G.flags.flares ? 1.5 : 1) });
  log('A supply drop lands ' + compass(x - CORE.x, y - CORE.y) + ' inside the camp. Send someone to collect it!'); Snd.drop && Snd.drop(); toast('Supply drop incoming');
}
function updateRescue(dt) {
  if (G.supCd > 0) G.supCd -= dt;
  if (G.rescue === null) return;
  G.rescue -= dt; G.dropT -= dt;
  if (G.dropT <= 0 && G.rescue > 5) { G.dropT = BROADCAST.gap; airdrop(1); }
  if (G.rescue <= 0) {
    G.rescue = null; G.supCd = BROADCAST.cooldown;
    if (G.rescueKind === 'convoy') {
      let n = 0; for (let k = 0; k < 4 && roomForPerson(); k++) { G.idle.push(newSurvivor()); n++; }
      airdrop(1.4); log('The convoy arrives: ' + n + ' survivors join you and they leave a supply drop.'); moraleGain('refugee');
    } else log('The broadcast ends. Call again once the radio has cooled (' + fmtTime(BROADCAST.cooldown) + ').');
  }
}

// ---- build actions ---------------------------------------------------------------
let warnT = 0;
function warn(msg) { if (performance.now() > warnT) { toast(msg); warnT = performance.now() + 1500; Snd.error(); } }
function inBuildRange(tx, ty) { return Math.hypot(tx + 0.5 - P.px, ty + 0.5 - P.py) <= BUILD_RANGE; }
const TOOL_KIND = { wall: K.WALL, tower: K.TOWER, lookout: K.LOOKOUT, gate: K.GATE, radio: K.RADIO, outpost: K.OUTPOST };
function refund(name) { return Math.floor(((COST[name].m || 0) * 0.5)); }
function tryBuild(tx, ty) {
  if (G.over || !inb(tx, ty)) return;
  const i = ty * W + tx, tool = G.tool;
  if (tool === 'siren') {                                                  // deliberately draw a horde: click the camp core
    if (!isCoreTile(tx, ty)) return warn('Click the camp core to sound the siren');
    if (hordes.some(h => !h.minor)) return warn('A horde is already on its way');
    if (!canAfford(HEAT.siren)) return warn('The siren needs ' + HEAT.siren.m + ' materials and ' + HEAT.siren.fuel + ' fuel');
    pay(HEAT.siren); lureHorde('siren'); return;
  }
  if (tool === 'molotov') return Outside.throwMolotov(tx, ty);              // can be thrown at buildings (nests)
  if (bld[i] >= 0 || isCoreTile(tx, ty)) { if (tool === 'crew' && bld[i] >= 0) sendCrew(buildings[bld[i]]); return; }
  if (tool === 'crew') return;
  if (!inBuildRange(tx, ty)) return warn('Too far - walk closer to build there');
  if (!explored[i]) return;
  if (TOOL_KIND[tool]) {
    const kind = TOOL_KIND[tool];
    if (tool === 'radio' && wall[i] === K.RADIO) return startBroadcast(true);                // click the tower again to call again
    if (wall[i] === kind) return;
    if (wall[i] && !(wall[i] === K.WALL && kind === K.TOWER)) return;                 // only wall -> tower upgrades
    if (trapAt[i]) return;
    if (tool === 'radio') {
      if (G.level < RADIO_LEVEL) return warn('The radio tower needs camp level ' + RADIO_LEVEL);
      if (!claimed[i]) return warn('Build the radio inside your territory');
    }
    if (tool === 'outpost') {
      if (claimed[i]) return warn('Outposts go outside your territory');
      if (!buildings.some(b => !b.claimed && Math.hypot(b.x + b.w / 2 - tx, b.y + b.h / 2 - ty) < OUTPOST.buildRange)) return warn('Build an outpost within ' + OUTPOST.buildRange + ' tiles of a building you want to work');
    }
    const base = effCost(tool), cost = wall[i] === K.WALL && kind === K.TOWER ? { m: Math.max(0, base.m - effCost('wall').m) } : base;
    if (!canAfford(cost)) return warn(cost.f || cost.a ? 'Not enough supplies' : 'Not enough materials');
    pay(cost);
    if (!wall[i]) { wallTier[i] = 0; elec[i] = 0; }
    wall[i] = kind; wallHp[i] = maxHp(kind, i);
    G.fieldDirty = true; G.visT = 0; Snd.build();
    if (G.nfT <= 0) { G.nfT = 0.4; investigate(tx + 0.5, ty + 0.5, NOISE.build, false); if (rings.length < 24) rings.push({ x: tx + 0.5, y: ty + 0.5, r: NOISE.build, t: 0, max: 0.6 }); }   // hammering is noisy
    if (tool === 'radio') {
      startBroadcast(false);
    }
  } else if (FACILITIES[tool]) {
    Base.place(tool, tx, ty);
  } else if (tool === 'electrify') {
    if (!wall[i] || wall[i] === K.RADIO || wall[i] === K.LOOKOUT || elec[i]) return;
    const cost = effCost('electrify'); if (!canAfford(cost)) return warn('Not enough materials');
    pay(cost); elec[i] = 1; Snd.build();
    if (!facilities.some(f => f.type === 'generator')) toast('Electrified. It needs a powered generator to work.');
  } else if (tool === 'reinforce') {
    if (!wall[i] || wall[i] === K.RADIO) return;
    const t = wallTier[i]; if (t >= 2) return warn('Already concrete');
    if (t === 1 && !has('concrete')) return warn('Research Concrete Mixing first');
    const cost = { m: Math.ceil(TIER.cost[t + 1] * buildMul()) }; if (!canAfford(cost)) return warn('Not enough materials');
    pay(cost); wallTier[i] = t + 1; wallHp[i] = maxHp(wall[i], i); Snd.build();
  } else if (false) {
  } else if (tool === 'grate') {
    if (!Survival.sealSewer(tx, ty)) warn('Click a sewer access to seal it');
  } else if (tool === 'decoy') {
    if (wall[i] || trapAt[i]) return;
    const cost = effCost('decoy');
    if (!canAfford(cost)) return warn('Needs ' + cost.m + ' materials and ' + cost.a + ' ammo');
    pay(cost); decoys.push({ x: tx + 0.5, y: ty + 0.5, t: NOISE.decoyTime, e: 0 }); addHeat(HEAT.decoy); Snd.build();
    log('Decoy set: it will draw the dead for ' + NOISE.decoyTime + 's');
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
    Units.post(s, tx, ty, false); Snd.click();
  } else if (tool === 'erase') {
    if (defAt[i]) { Units.standDown(defAt[i]); return; }
    if (trapAt[i]) { const t = trapAt[i]; traps.splice(traps.indexOf(t), 1); trapAt[i] = null; G.mat += refund(t.type); Snd.demolish(); return; }
    if (facAt[i]) { Base.remove(facAt[i]); Snd.demolish(); return; }
    if (wall[i] && wall[i] !== K.RADIO) {
      const nm = { 1: 'wall', 2: 'tower', 3: 'lookout', 4: 'gate', 6: 'outpost' }[wall[i]];
      G.mat += refund(nm);
      wall[i] = 0; wallHp[i] = 0; wallTier[i] = 0; elec[i] = 0; G.fieldDirty = true; G.visT = 0; Snd.demolish();
    }
  }
}
function upgradeCore() {
  const L = LEVELS[G.level - 1];
  if (!L.up) return warn('Camp is at max level');
  if (!canAfford(L.up)) return warn('Need ' + L.up.m + ' materials and ' + L.up.f + ' food');
  pay(L.up); G.level++; moraleGain('upgrade');
  G.coreHp = LEVELS[G.level - 1].coreHp;
  for (let i = 0; i < W * H; i++) if (wall[i]) wallHp[i] = Math.max(wallHp[i], maxHp(wall[i], i) * 0.8);
  G.fieldDirty = true;
  log('Camp upgraded to level ' + G.level + ' - territory limit ' + LEVELS[G.level - 1].cap);
  Snd.upgrade();
}

// ---- end of game ---------------------------------------------------------------
function endGame(won, why) {
  if (G.over) return;
  G.over = true; G.won = won; G.endWhy = why;
  if (won) Snd.rescue();
  Save.clear();
  UI.showEnd();
}

// ---- main step ---------------------------------------------------------------
function simulate(dt) {
  Campaign.update(dt);
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
  if (AI.on) AI.update(dt);
  updatePlayer(dt);
  updateHordes(dt);
  updateZombies(dt);
  updateTraps(dt);
  Outside.update(dt); Base.update(dt); Survival.update(dt);
  updateDefenders(dt);
  Units.update(dt);
  updateSurvivors(dt);
  updateEconomy(dt);
  Director.tick(dt); Radio.update(dt); G.ruleCd = Math.max(0, G.ruleCd - dt); G.nfT -= dt;
  updateRelationships(dt); updateDecoys(dt);
  updateMorale(dt);
  updateEvents(dt);
  updateResearch(dt);
  updateRescue(dt);
}
