'use strict';
/* ======================================================================
   story.js - the storyteller director (what happens and when), camp rules
   (policies with trade-offs) and radio storylines (choices with outcomes).
   ====================================================================== */

// ---- storyteller director ---------------------------------------------------------------
const Director = {
  def() { return STORYTELLERS[G.story] || STORYTELLERS.cassandra; },
  rnd(a, b) { return a + rng() * (b - a); },
  strength() { return defenders.length * 2 + wall.reduce((n, k) => n + (k === K.TOWER ? 1 : 0), 0) + G.level * 3; },
  hordeSize() {                                   // hordes scale with how strong you are, within the teller's limits
    const d = this.def();
    if (G.story === 'randy') return this.rnd(0.6, 1.7) * (1 + NEST.hordeBonus * G.nests.length);
    return d.size * clamp(0.9 + this.strength() / 90, 0.9, d.adapt) * (1 + NEST.hordeBonus * G.nests.length);
  },
  hordeGap() { return G.story === 'randy' ? this.rnd(0.4, 2.2) : this.def().gap; },
  eventGap() { return G.story === 'randy' ? this.rnd(0.3, 2) : this.def().evGap; },
  breather() { return this.def().breather; },
  tension() { return clamp(G.stress, 0, 1); },
  addStress(v) { G.stress = clamp(G.stress + v, 0, 1); },
  tick(dt) {                                      // tension rises with trouble, decays when things are calm
    G.stressT -= dt; if (G.stressT > 0) return;
    G.stressT = 1;
    let up = 0;
    if (hordes.some(h => h.alive > 0)) up += 0.012;
    if (G.food < 10) up += 0.02;
    if (G.ammo < 20) up += 0.015;
    if (G.morale < MORALE.slowBelow) up += 0.015;
    if (G.coreHp < LEVELS[G.level - 1].coreHp * 0.7) up += 0.02;
    G.stress = clamp(G.stress * 0.98 + up, 0, 1);
  },
  pickEvent() {
    const t = this.tension(), calm = 1 - t, can = {
      drop: true, trader: !G.trader, storm: G.storm <= 0,
      stranger: roomForPerson() && G.morale >= 25,
      sick: G.idle.some(s => !s.sick), stragglers: G.elapsed > 200 && !hordes.length,
    };
    const w = {
      drop: 1.5 + 3 * t, trader: 1 + 2 * t, stranger: 0.8 + 2.2 * t, storm: 0.2 + 1.6 * calm,
      sick: (0.2 + calm) * ruleMul('sickness'), stragglers: calm > 0.3 ? 1.4 * calm : 0,
    };
    const keys = Object.keys(w).filter(k => can[k]);
    if (!keys.length) return null;
    if (G.story === 'randy') return pick(keys);
    let total = keys.reduce((a, k) => a + w[k], 0), x = rng() * total;
    for (const k of keys) { x -= w[k]; if (x <= 0) return k; }
    return keys[0];
  },
};

// ---- camp rules ---------------------------------------------------------------
const ruleOn = id => !!(G.rules && G.rules[id]);
function ruleMul(key) { let m = 1; for (const id in RULES) if (ruleOn(id) && RULES[id][key] !== undefined && typeof RULES[id][key] === 'number') m *= RULES[id][key]; return m; }
function ruleSum(key) { let m = 0; for (const id in RULES) if (ruleOn(id)) m += RULES[id][key] || 0; return m; }
const ruleFlag = key => Object.keys(RULES).some(id => ruleOn(id) && RULES[id][key]);
function toggleRule(id) {
  const r = RULES[id];
  if (G.ruleCd > 0) return warn('Policies can change again in ' + Math.ceil(G.ruleCd) + 's');
  if (G.level < r.level) return warn('Needs camp level ' + r.level);
  if (!ruleOn(id)) {
    const clash = (r.excl || []).find(ruleOn);
    if (clash) return warn('Conflicts with ' + RULES[clash].label);
  }
  G.rules[id] = !ruleOn(id); if (!G.rules[id]) delete G.rules[id];
  G.ruleCd = RULE_COOLDOWN;
  log((ruleOn(id) ? 'Decree: ' : 'Repealed: ') + r.label);
  Snd.click();
}

// ---- radio storylines ---------------------------------------------------------------
const seenCount = id => (G.flags.seen && G.flags.seen[id]) || 0;
function gainRes(c) { G.mat = Math.min(storeCap(), G.mat + (c.m || 0)); G.food = Math.min(storeCap(), G.food + (c.f || 0)); G.ammo = Math.min(storeCap(), G.ammo + (c.a || 0)); }
function dropCrate(type) {
  for (let t = 0; t < 60; t++) {
    const x = 2 + (rng() * (W - 4) | 0), y = 2 + (rng() * (H - 4) | 0), i = y * W + x, d = Math.hypot(x - CORE.x, y - CORE.y);
    if (bld[i] >= 0 || wall[i] || isCoreTile(x, y) || d < 8 || d > 28) continue;
    crates.push({ x: x + 0.5, y: y + 0.5, t: EVENTS.crateLife, type }); return crates[crates.length - 1];
  }
  return null;
}
function recruit(why) { if (!roomForPerson()) return null; const s = newSurvivor(); addRecruit(s, why); return s; }

const Radio = {
  DEFS: [
    { id: 'convoy_a', title: 'Convoy in trouble', max: 1, ok: () => G.level >= 2 && !G.flags.convoy,
      text: () => '"This is Sergeant Okoye. Our convoy is pinned down two miles east with empty magazines. We can carry survivors to a safe zone if we get out. Can you spare ammunition?"',
      choices: [
        { label: 'Send 40 ammo and keep the road open', cond: () => G.ammo >= 40, run() { G.ammo -= 40; G.flags.convoy = 1; G.flags.convoyT = G.elapsed; moraleGain('crate'); return 'The convoy thanks you. They will call back when the route is clear.'; } },
        { label: 'We cannot spare anything', run() { G.flags.convoy = -1; G.morale = clamp(G.morale - 2, 0, 100); return 'The line goes quiet.'; } },
      ] },
    { id: 'convoy_b', title: 'The convoy is coming', max: 9, ok: () => G.flags.convoy === 1 && !G.flags.convoyDone && G.rescue === null && G.elapsed - G.flags.convoyT > 150,
      text: () => '"Route is clear. We can reach your camp in four minutes and carry everyone to the safe zone. Hold your walls until we arrive."',
      choices: [
        { label: 'Bring them in - hold out until they arrive', run() { G.flags.convoyDone = 1; G.rescue = 200; G.rescueKind = 'convoy'; G.nextHorde = Math.min(G.nextHorde, 10); return 'The convoy is on its way. Hold the walls for ' + fmtTime(200) + '!'; } },
        { label: 'Not yet, we are not ready', run() { G.flags.convoyT = G.elapsed; return '"We will ask again soon."'; } },
      ] },
    { id: 'medic_plea', title: 'A plea for help', max: 3, ok: () => G.elapsed > 150,
      text: () => '"There are a few of us hiding in a basement. One is sick. We have nothing left. Please, any food?"',
      choices: [
        { label: 'Send 20 food', cond: () => G.food >= 20, run() { G.food -= 20; const a = recruit('came to thank you and stayed'); const b = recruit('followed them in'); moraleGain('refugee'); moraleGain('refugee'); return a || b ? 'They reach the camp, grateful.' : 'You send the food, but there is no room for them.'; } },
        { label: 'Take them in, no questions', run() { const a = recruit('was taken in'); if (a && rng() < 0.4) { a.sick = SICK.time; return 'One of them is already ill.'; } return a ? 'They are welcomed.' : 'No room for anyone else.'; } },
        { label: 'We cannot help', run() { G.morale = clamp(G.morale - 3, 0, 100); return 'You turn the radio down. It stays quiet in the camp.'; } },
      ] },
    { id: 'raiders', title: 'A threat', max: 4, ok: () => G.elapsed > 300,
      text: () => '"Hand over your ammo and nobody gets hurt. Thirty rounds. Or we send everything that follows us your way."',
      choices: [
        { label: 'Pay 30 ammo', cond: () => G.ammo >= 30, run() { G.ammo -= 30; return 'The voice laughs and disappears.'; } },
        { label: 'Refuse', run() { startHorde({ minor: true, mult: 0.35 }); return 'They keep their word. Something is coming.'; } },
        { label: 'Bluff: claim you have a hundred armed people', run() { if (rng() < 0.5) { moraleGain('crate'); return 'Static. The bluff worked.'; } startHorde({ minor: true, mult: 0.5 }); return 'They did not believe you. A horde is on its way.'; } },
      ] },
    { id: 'cache', title: 'Supply tip', max: 3, ok: () => G.elapsed > 200,
      text: () => '"I know where a cache of supplies is. I can give you the coordinates for twenty food."',
      choices: [
        { label: 'Pay 20 food', cond: () => G.food >= 20, run() { G.food -= 20; let n = 0; for (let i = 0; i < 3; i++) if (dropCrate()) n++; return n ? 'Coordinates received: ' + n + ' crates marked on the minimap.' : 'The coordinates turn out to be useless.'; } },
        { label: 'Decline', run() { return '"Your loss."'; } },
      ] },
    { id: 'lost_survivor', title: 'Someone on the line', max: 3, ok: () => roomForPerson() && G.elapsed > 120,
      text: () => '"Is anyone there? I am trapped in a building. Please. I can hold out for a couple of minutes."',
      choices: [
        { label: 'Hold on, we are coming', run() {
          const b = buildings.filter(b => !b.looted && !b.crew)[rng() * buildings.length | 0] || buildings[0];
          const c = { x: b.x + b.w / 2, y: b.y + b.h + 0.8, t: 150, type: 'survivor' }; crates.push(c);
          return 'A signal is marked on the minimap near the ' + BUILDING_TYPES[b.type].label.toLowerCase() + '. Get there fast.'; } },
        { label: 'We cannot risk it', run() { G.morale = clamp(G.morale - 2, 0, 100); return 'The voice fades.'; } },
      ] },
    { id: 'deserter', title: 'A familiar voice', max: 3, ok: () => G.memorial.some(m => m.s),
      text: () => { const m = G.memorial.slice().reverse().find(m => m.s); return '"It is ' + m.name + ' - the ' + ROLES[m.role].label.toLowerCase() + ' who left. I was wrong. Out here is worse. Can I come back?"'; },
      choices: [
        { label: 'Welcome them back', cond: () => roomForPerson(), run() {
          const i = G.memorial.map(m => !!m.s).lastIndexOf(true), m = G.memorial[i];
          const s = Object.assign({}, m.s, { sick: 0, cure: 0, grief: 0, friend: null, lover: null, rival: null, joined: G.elapsed });
          G.memorial.splice(i, 1); G.idle.push(s); moraleGain('refugee'); return who(s) + ' is back, humbled.'; } },
        { label: 'Refuse', run() { const i = G.memorial.map(m => !!m.s).lastIndexOf(true); if (i >= 0) delete G.memorial[i].s; return 'The radio goes silent.'; } },
      ] },
    { id: 'numbers', title: 'Strange broadcast', max: 2, ok: () => G.elapsed > 200,
      text: () => '"...seven... four... nine... two..." A numbers station you cannot place. Triangulating it could reveal a lot of the town, and might attract attention.',
      choices: [
        { label: 'Triangulate the signal', run() { const cx = 6 + rng() * (W - 12), cy = 6 + rng() * (H - 12); reveal(cx, cy, 13); G.visT = 0; startHorde({ minor: true, mult: 0.4 }); return 'A large part of the map is revealed, and the transmission draws company.'; } },
        { label: 'Ignore it', run() { return 'You switch it off.'; } },
      ] },
    { id: 'heli_flares', title: 'Helicopter pilot', max: 1, ok: () => G.rescue !== null && G.rescueKind === 'heli' && !G.flags.flares,
      text: () => '"Pilot here. The landing zone is dark. If you can light flares I will find you faster."',
      choices: [
        { label: 'Light flares (30 ammo)', cond: () => G.ammo >= 30, run() { G.ammo -= 30; G.flags.flares = 1; G.rescue = Math.max(10, G.rescue - 45); return 'Flares burn over the camp. The helicopter is 45 seconds closer.'; } },
        { label: 'Stay dark', run() { G.flags.flares = 1; return '"Understood. Keep your heads down."'; } },
      ] },
    { id: 'heli_hot', title: 'Helicopter pilot', max: 1, ok: () => G.rescue !== null && G.rescueKind === 'heli' && !G.flags.hot,
      text: () => '"I can come in a minute early if you keep the landing zone clear. It will be loud and the dead will hear it."',
      choices: [
        { label: 'Risk it', run() { G.flags.hot = 1; G.rescue = Math.max(10, G.rescue - 60); startHorde({ mult: 1.3 }); return 'The rotors thunder. The dead answer.'; } },
        { label: 'No, take the long way', run() { G.flags.hot = 1; return '"Copy that."'; } },
      ] },
  ],
  current() { return G.radioMsg ? this.DEFS.find(d => d.id === G.radioMsg.id) : null; },
  pick() {
    const ok = this.DEFS.filter(d => seenCount(d.id) < d.max && d.ok());
    return ok.length ? pick(ok) : null;
  },
  update(dt) {
    if (G.radioMsg || (!has('comms') && G.rescue === null)) return;
    G.radioT -= dt;
    if (G.radioT > 0) return;
    const m = this.pick();
    if (!m) { G.radioT = 45; return; }
    G.radioMsg = { id: m.id };
    G.radioT = (G.rescue !== null ? 50 : Director.rnd(150, 280)) * Director.eventGap();
    Snd.radio();
  },
  choose(i) {
    const m = this.current(); if (!m) return;
    const c = m.choices[i];
    if (c.cond && !c.cond()) return warn('Cannot do that right now');
    G.flags.seen = G.flags.seen || {}; G.flags.seen[m.id] = seenCount(m.id) + 1;
    G.radioMsg = null;
    const res = c.run();
    if (res) log(res);
    Snd.click();
  },
};
