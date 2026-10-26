'use strict';
/* items.js - what the dead and the ruins give up. Bulk goods (wood and scrap, food, ammo...) go to the camp stockpile;
   odd finds (a bandage, a medkit, a keycard) go in the pack you carry. Nothing is picked up by walking over it:
   you stand next to it, press E, and a window shows exactly what is there. */
const Items = (() => {
  const RES = {
    m:     { name: 'Wood & scrap', short: 'Materials', field: 'mat',   use: 'Walls, towers, gates, repairs and traps' },
    f:     { name: 'Food',         short: 'Food',      field: 'food',  use: 'Everyone eats; starving people stop fighting' },
    a:     { name: 'Ammo',         short: 'Ammo',      field: 'ammo',  use: 'Your rounds and every shooter at camp' },
    med:   { name: 'Medicine',     short: 'Medicine',  field: 'med',   use: 'Treats the sick and wounded' },
    fuel:  { name: 'Fuel',         short: 'Fuel',      field: 'fuel',  use: 'Generators, Molotovs, cutting through locked doors' },
    water: { name: 'Water',        short: 'Water',     field: 'water', use: 'Everyone drinks; wells and rain collectors make more' },
  };
  const ITEMS = {
    bandage:  { name: 'Bandage',       desc: 'Heals you 35 now, or adds 1 medicine at camp.', use: p => heal(35), stash: { med: 1 }, w: 30 },
    medkit:   { name: 'Medkit',        desc: 'Heals you fully, or adds 4 medicine at camp.', use: p => heal(100), stash: { med: 4 }, w: 8 },
    canned:   { name: 'Canned food',   desc: 'Eat it for 12 health, or add 14 food at camp.', use: p => heal(12), stash: { f: 14 }, w: 30 },
    ammo_box: { name: 'Ammo box',      desc: 'Stash at camp for 30 rounds.', stash: { a: 30 }, w: 22 },
    scrap:    { name: 'Scrap bundle',  desc: 'Stash at camp for 25 wood & scrap.', stash: { m: 25 }, w: 24 },
    planks:   { name: 'Plank stack',   desc: 'Stash at camp for 20 wood & scrap.', stash: { m: 20 }, w: 24 },
    fuel_can: { name: 'Fuel can',      desc: 'Stash at camp for 8 fuel.', stash: { fuel: 8 }, w: 12 },
    jug:      { name: 'Water jug',     desc: 'Stash at camp for 10 water.', stash: { water: 10 }, w: 14 },
    keycard:  { name: 'Keycard',       desc: 'Opens one locked building without cutting.', special: true, w: 4 },
    gun_smg:     { name: 'Machine pistol', desc: 'A military full-auto pistol. Sprays fast, drinks ammo. Switch guns with Q.', special: true, weapon: 'smg', w: 1.2 },
    gun_assault: { name: 'Assault rifle',  desc: 'A military rifle: fast, accurate, a long clip. Switch guns with Q.', special: true, weapon: 'assault', w: 1 },
    gun_marksman:{ name: 'Marksman rifle', desc: 'A scoped rifle: twice the reach, punches through three of the dead. Switch guns with Q.', special: true, weapon: 'rifle', w: 0.8 },
    blueprint:{ name: 'Blueprint',     desc: 'Unlocks a piece of research.', special: true, w: 0 },
  };
  const PACK = { slots: 10, stack: 9, campR: 9 };
  const heal = n => { P.hp = Math.min(PLAYER.hp, P.hp + n); floatText(P.px, P.py - 1.2, '+' + n + ' hp', '#7fe08a'); Snd.pickup && Snd.pickup(); };
  const DROP = { chance: 0.001, mult: { brute: 8, bloater: 4, screamer: 3, leaper: 3, tyrant: 1000 }, life: 300 };

  // ---- pixel icons: [colour, x, y, w, h] on a 12x12 grid, drawn once and cached ------------------------
  const R = (c, x, y, w, h) => [c, x, y, w, h];
  const ART = {
    m: [R('#000a', 1, 10, 10, 1), R('#8a5a2a', 1, 8, 10, 2), R('#b07a3c', 1, 8, 10, 1), R('#8a5a2a', 2, 5, 9, 2), R('#b07a3c', 2, 5, 9, 1), R('#6a6f78', 7, 1, 4, 3), R('#a8b0b8', 7, 1, 4, 1), R('#e8e0c0', 3, 6, 1, 1), R('#e8e0c0', 8, 9, 1, 1)],
    f: [R('#000a', 2, 10, 8, 1), R('#9aa0a8', 2, 2, 8, 8), R('#c8302a', 2, 4, 8, 4), R('#e8e0c0', 4, 5, 4, 2), R('#c8d0d8', 2, 2, 8, 1), R('#6a6f78', 2, 9, 8, 1)],
    a: [R('#000a', 1, 10, 10, 1), R('#d8a030', 2, 3, 3, 7), R('#d8a030', 6, 3, 3, 7), R('#b87820', 2, 6, 3, 1), R('#b87820', 6, 6, 3, 1), R('#b0b8c0', 2, 1, 3, 2), R('#b0b8c0', 6, 1, 3, 2), R('#6a4a18', 2, 9, 3, 1), R('#6a4a18', 6, 9, 3, 1)],
    med: [R('#000a', 1, 10, 10, 1), R('#e8e8e0', 1, 2, 10, 8), R('#c8302a', 5, 3, 2, 6), R('#c8302a', 3, 5, 6, 2), R('#a8a8a0', 1, 9, 10, 1)],
    fuel: [R('#000a', 2, 10, 8, 1), R('#c8402a', 2, 3, 8, 7), R('#e8603a', 2, 3, 8, 1), R('#8a2a1a', 2, 9, 8, 1), R('#c8402a', 3, 1, 3, 2), R('#2a2a2a', 4, 1, 1, 1), R('#f0d070', 4, 5, 4, 3), R('#8a2a1a', 5, 6, 2, 1)],
    water: [R('#000a', 2, 10, 8, 1), R('#3a8ad0', 5, 1, 2, 2), R('#4fb0e8', 4, 3, 4, 2), R('#4fb0e8', 3, 5, 6, 3), R('#4fb0e8', 4, 8, 4, 2), R('#bfe8ff', 4, 5, 1, 2), R('#2a6aa8', 5, 9, 3, 1)],
    bandage: [R('#000a', 1, 10, 10, 1), R('#e8e0c8', 2, 3, 8, 6), R('#f4f0e0', 2, 3, 8, 1), R('#b8b098', 2, 8, 8, 1), R('#c8302a', 5, 4, 2, 4), R('#c8302a', 4, 5, 4, 2)],
    medkit: [R('#000a', 1, 10, 10, 1), R('#3a8a4a', 1, 3, 10, 7), R('#5aba6a', 1, 3, 10, 1), R('#2a6a3a', 1, 9, 10, 1), R('#e8e8e0', 5, 4, 2, 5), R('#e8e8e0', 3, 6, 6, 1), R('#6a6f78', 4, 2, 4, 1)],
    canned: [R('#000a', 2, 10, 8, 1), R('#9aa0a8', 2, 2, 8, 8), R('#d8a030', 2, 4, 8, 4), R('#e8e0c0', 4, 5, 4, 2), R('#c8d0d8', 2, 2, 8, 1), R('#6a6f78', 2, 9, 8, 1)],
    ammo_box: [R('#000a', 1, 10, 10, 1), R('#5a6a3a', 1, 4, 10, 6), R('#7a8a52', 1, 4, 10, 1), R('#3a4a24', 1, 9, 10, 1), R('#d8a030', 3, 2, 2, 3), R('#d8a030', 6, 2, 2, 3), R('#e8e0c0', 4, 6, 4, 2)],
    scrap: [R('#000a', 1, 10, 10, 1), R('#6a6f78', 1, 6, 6, 4), R('#a8b0b8', 1, 6, 6, 1), R('#8a8f98', 5, 3, 6, 6), R('#c8d0d8', 5, 3, 6, 1), R('#3a3f48', 3, 8, 1, 1), R('#3a3f48', 8, 6, 1, 1), R('#8a5a2a', 2, 3, 3, 2)],
    planks: [R('#000a', 1, 10, 10, 1), R('#8a5a2a', 1, 7, 10, 3), R('#b07a3c', 1, 7, 10, 1), R('#8a5a2a', 2, 4, 9, 3), R('#c08a4c', 2, 4, 9, 1), R('#6a4018', 1, 9, 10, 1), R('#e8e0c0', 3, 5, 1, 1), R('#e8e0c0', 9, 8, 1, 1)],
    fuel_can: null, jug: [R('#000a', 2, 10, 8, 1), R('#bfe8ff', 2, 3, 8, 7), R('#4fb0e8', 2, 5, 8, 5), R('#8fd0ff', 2, 3, 8, 1), R('#2a6aa8', 2, 9, 8, 1), R('#c8d0d8', 4, 1, 4, 2)],
    keycard: [R('#000a', 1, 10, 10, 1), R('#2a3a5a', 1, 3, 10, 6), R('#4a6a9a', 1, 3, 10, 1), R('#e8d070', 2, 4, 3, 2), R('#101820', 1, 7, 10, 1), R('#7fd0ff', 6, 5, 3, 1)],
    gun_smg: [R('#000a', 1, 10, 10, 1), R('#1a1c20', 1, 4, 9, 3), R('#4a4f58', 1, 4, 9, 1), R('#101114', 9, 4, 2, 2), R('#2a2d33', 4, 7, 2, 3), R('#5a3a1a', 1, 7, 3, 2), R('#8a909a', 5, 3, 3, 1)],
    gun_assault: [R('#000a', 1, 10, 10, 1), R('#3a3a34', 0, 4, 4, 4), R('#1a1c20', 3, 4, 8, 2), R('#4a4f58', 3, 4, 8, 1), R('#101114', 10, 4, 2, 1), R('#2a2d33', 5, 6, 2, 4), R('#8a909a', 6, 3, 3, 1), R('#7a8a3a', 7, 7, 1, 3)],
    gun_marksman: [R('#000a', 1, 10, 10, 1), R('#7a5226', 0, 5, 4, 3), R('#9a7040', 0, 5, 4, 1), R('#1a1c20', 3, 5, 9, 2), R('#4a4f58', 3, 5, 9, 1), R('#2a8ad0', 5, 3, 3, 2), R('#8a909a', 9, 5, 3, 1), R('#2a2d33', 4, 7, 2, 2)],
    blueprint: [R('#000a', 1, 10, 10, 1), R('#2a5aa8', 1, 2, 10, 8), R('#5a8ad8', 1, 2, 10, 1), R('#bfe0ff', 3, 4, 6, 1), R('#bfe0ff', 3, 6, 4, 1), R('#bfe0ff', 3, 8, 6, 1), R('#bfe0ff', 3, 4, 1, 5)],
  };
  ART.fuel_can = ART.fuel;
  const cache = {};
  function canvas(id) {
    if (cache[id]) return cache[id];
    const cv = document.createElement('canvas'); cv.width = cv.height = 12; const g = cv.getContext('2d');
    for (const [c, x, y, w, h] of ART[id] || []) { g.fillStyle = c; g.fillRect(x, y, w, h); }
    return (cache[id] = cv);
  }
  const url = id => { const c = canvas(id); if (!c._u) c._u = c.toDataURL(); return c._u; };
  const nameOf = id => (RES[id] ? RES[id].name : ITEMS[id] ? ITEMS[id].name : id);
  const img = (id, s) => '<img src="' + url(id) + '" width="' + (s || 24) + '" height="' + (s || 24) + '" style="image-rendering:pixelated;vertical-align:middle">';

  // ---- the pack -------------------------------------------------------------------------------------
  const pack = () => (P.inv || (P.inv = []));
  const packCount = () => pack().reduce((a, s) => a + s.n, 0);
  function packAdd(id, n) {                                      // returns how many did not fit
    const inv = pack(); n = n || 1;
    for (const s of inv) if (s.id === id && n > 0) { const t = Math.min(n, PACK.stack - s.n); s.n += t; n -= t; }
    while (n > 0 && inv.length < PACK.slots) { const t = Math.min(n, PACK.stack); inv.push({ id, n: t }); n -= t; }
    return n;
  }
  const atCamp = () => Math.hypot(P.px - (CORE.x + 0.5), P.py - (CORE.y + 0.5)) <= PACK.campR;
  function stashOne(id) {
    const d = ITEMS[id], s = pack().find(x => x.id === id); if (!d || !d.stash || !s) return false;
    if (!atCamp()) { warn('Stash things at camp: walk back to the fire'); return false; }
    addRes(d.stash); s.n--; if (s.n <= 0) pack().splice(pack().indexOf(s), 1);
    floatText(P.px, P.py - 1.2, lootText(d.stash, true), '#ffe27a'); Snd.pickup && Snd.pickup(); return true;
  }
  function stashAll() { let n = 0; for (const s of pack().slice()) if (ITEMS[s.id].stash) while (pack().includes(s) && stashOne(s.id)) n++; if (n) log('Stashed ' + n + ' item' + (n > 1 ? 's' : '') + ' at camp'); return n; }
  function useOne(id) {
    const d = ITEMS[id], s = pack().find(x => x.id === id); if (!d || !d.use || !s) return false;
    if (P.hp >= PLAYER.hp) { warn('You are not hurt'); return false; }
    d.use(P); s.n--; if (s.n <= 0) pack().splice(pack().indexOf(s), 1); return true;
  }
  function dropOne(id) {
    const s = pack().find(x => x.id === id); if (!s) return;
    s.n--; if (s.n <= 0) pack().splice(pack().indexOf(s), 1);
    crates.push({ x: P.px + 0.6, y: P.py, t: DROP.life, type: 'pile', items: [{ i: id, n: 1 }] });
  }
  function roll(chanceMul) {
    const ids = Object.keys(ITEMS).filter(k => ITEMS[k].w > 0), tot = ids.reduce((a, k) => a + ITEMS[k].w, 0);
    let r = rng() * tot, pick = ids[0]; for (const k of ids) { r -= ITEMS[k].w; if (r <= 0) { pick = k; break; } }
    return ITEMS[pick].weapon && P.guns && P.guns[ITEMS[pick].weapon] ? 'ammo_box' : pick;       // you only ever find a gun you do not have yet
  }
  // a gun you do not own yet, or null: the found-only military weapons
  function rollGun() {
    const left = Object.keys(ITEMS).filter(k => ITEMS[k].weapon && !(P.guns && P.guns[ITEMS[k].weapon]));
    return left.length ? pick(left) : null;
  }
  function zombieDrop(z) {
    const p = DROP.chance * (DROP.mult[z.type] || 1) * (G.flags && G.flags.scav ? 1 : 1);
    if (rng() >= p) return;
    const id = roll();
    crates.push({ x: z.x, y: z.y, t: DROP.life, type: 'pile', items: [{ i: id, n: 1 }] });
  }
  return { rollGun, RES, ITEMS, PACK, DROP, canvas, url, img, nameOf, pack, packCount, packAdd, stashOne, stashAll, useOne, dropOne, zombieDrop, roll, atCamp };
})();

/* The loot window. open() is the one door every kind of looting goes through. */
const ITEMS_W = id => !!(Items.ITEMS[id] && Items.ITEMS[id].weapon);
const Loot = (() => {
  const L = { cur: null, cd: 0 };
  let el = null;
  const isOpen = () => !!L.cur;
  const entryName = e => e.r ? Items.RES[e.r].name : Items.nameOf(e.i);
  const entryKey = e => e.r || e.i;
  function giveEntry(e) {                                         // returns how many were taken
    if (e.r) {
      const f = Items.RES[e.r].field, room = Math.max(0, Math.floor(storeCap() - G[f])), t = Math.min(e.n, room);
      if (t > 0) G[f] += t; return t;
    }
    if (ITEMS_W(e.i)) { const g = Items.ITEMS[e.i].weapon; P.guns = P.guns || {}; if (P.guns[g]) return 0; P.guns[g] = 1; log('You found a ' + Items.nameOf(e.i).toLowerCase() + '. Press Q to switch to it.'); floatText(P.px, P.py - 1.6, Items.nameOf(e.i).toUpperCase(), '#ffe27a'); Snd.upgrade && Snd.upgrade(); return e.n; }
    if (e.i === 'keycard') { G.keys++; return e.n; }
    if (e.i === 'blueprint') {
      const left = RESEARCH.filter(r => !G.res.done[r.id]);
      if (left.length) { const r = pick(left); G.res.done[r.id] = true; if (G.res.active && G.res.active.id === r.id) G.res.active = null; log('Blueprint: ' + r.name); }
      return e.n;
    }
    return e.n - Items.packAdd(e.i, e.n);
  }
  function open(title, entries, o) {
    entries = entries.filter(e => e.n > 0);
    if (!entries.length) return;
    o = o || {};
    if (AI.on || o.auto) { for (const e of entries) giveEntry(e); Snd.loot && Snd.loot(); return; }       // the bot and the crews just take it
    L.cur = { title, entries, o }; L.cd = 0.25; keys.e = false; P.loot = 0; P.lootB = -1;
    Snd.loot && Snd.loot(); render();
  }
  function leave() {
    const c = L.cur; if (!c) return;
    const left = c.entries.filter(e => e.n > 0);
    if (c.o.crate) { const i = crates.indexOf(c.o.crate); if (left.length) c.o.crate.items = left; else if (i >= 0) crates.splice(i, 1); }
    else if (left.length && c.o.x !== undefined) crates.push({ x: c.o.x, y: c.o.y, t: Items.DROP.life, type: 'pile', items: left });   // what you leave stays on the ground
    L.cur = null; L.cd = 0.3; keys.e = false;
    el.classList.remove('show');
  }
  function takeIdx(i) {
    const c = L.cur; if (!c) return;
    const e = c.entries[i]; if (!e || e.n <= 0) return;
    const got = giveEntry(e);
    if (got <= 0) { warn(e.r ? 'The stockpile is full of ' + Items.RES[e.r].name.toLowerCase() : 'Your pack is full'); Snd.error && Snd.error(); }
    else { e.n -= got; Snd.pickup && Snd.pickup(); floatText(P.px, P.py - 1.3, '+' + got + ' ' + entryName(e), '#ffe27a'); }
    if (c.entries.every(x => x.n <= 0)) { if (c.o.then) c.o.then(); close(); } else render();
  }
  function takeAll() { const c = L.cur; if (!c) return; for (let i = 0; i < c.entries.length; i++) if (c.entries[i].n > 0) { const e = c.entries[i], got = giveEntry(e); e.n -= got; } Snd.pickup && Snd.pickup(); if (c.entries.every(x => x.n <= 0)) { if (c.o.then) c.o.then(); close(); } else { warn('Some things would not fit'); render(); } }
  function close() { const c = L.cur; L.cur = null; L.cd = 0.3; keys.e = false; el.classList.remove('show'); if (c && c.o.crate) { const i = crates.indexOf(c.o.crate); if (i >= 0) crates.splice(i, 1); } }
  function render() {
    const c = L.cur; if (!c) return;
    el.classList.add('show');
    el.innerHTML = '<div class="row"><h3>' + c.title + '</h3></div><div style="color:var(--dim);margin-bottom:6px">Take what you want. Whatever you leave stays on the ground.</div>' +
      c.entries.map((e, i) => e.n > 0 ? '<div class="lootrow">' + Items.img(entryKey(e), 28) + '<span class="ln"><b>' + entryName(e) + '</b> <span class="lq">x' + e.n + '</span><br><small>' + (e.r ? Items.RES[e.r].use : Items.ITEMS[e.i].desc) + '</small></span><button data-t="' + i + '">Take</button></div>' : '').join('') +
      '<div class="row" style="margin-top:8px"><button id="lootAll">Take all <kbd>E</kbd></button><button id="lootLeave">Leave <kbd>Esc</kbd></button></div>';
    el.querySelectorAll('button[data-t]').forEach(b => b.onclick = () => takeIdx(+b.dataset.t));
    el.querySelector('#lootAll').onclick = takeAll; el.querySelector('#lootLeave').onclick = leave;
  }
  function init() { el = document.getElementById('loot'); }
  // the crate within reach of the player, if any (survivors are handled separately)
  function nearest() {
    let best = null, bd = 1.6;
    for (const c of crates) { if (c.type === 'survivor') continue; const d = Math.hypot(c.x - P.px, c.y - P.py); if (d < bd) { bd = d; best = c; } }
    return best;
  }
  function entriesOf(c) {
    if (c.items) return c.items;
    let e = [];
    if (c.type === 'boss') { e = [{ r: 'm', n: 150 }, { r: 'f', n: 60 }, { r: 'a', n: 80 }, { r: 'med', n: 20 }, { r: 'fuel', n: 20 }, { r: 'water', n: 30 }, { i: 'keycard', n: 1 }, { i: 'blueprint', n: 1 }]; const gg = Items.rollGun(); if (gg) e.push({ i: gg, n: 1 }); }
    else if (c.type === 'airdrop') { const rl = v => Math.round(v * (0.9 + rng() * 0.2) * (c.mult || 1)); for (const k in BROADCAST.drop) e.push({ r: k, n: rl(BROADCAST.drop[k]) }); if (rng() < 0.08) { const gg = Items.rollGun(); if (gg) e.push({ i: gg, n: 1 }); } }
    else { const L2 = EVENTS.crateLoot, rl = v => Math.round(v * (0.8 + rng() * 0.5)); e = [{ r: 'm', n: rl(L2.m) }, { r: 'f', n: rl(L2.f) }, { r: 'a', n: rl(L2.a) }]; if (rng() < 0.35) e.push({ i: Items.roll(), n: 1 }); }
    return (c.items = e);
  }
  const titleOf = c => c.title ? c.title : c.type === 'boss' ? 'The Tyrant’s cache' : c.type === 'airdrop' ? 'Supply drop' : c.type === 'pile' ? (c.items && c.items.length === 1 ? 'Found: ' + entryName(c.items[0]) : 'Items on the ground') : 'Supply crate';
  // per-frame: open the window when the player presses E beside something
  L.update = function (dt) {
    L.cd -= dt; if (L.cur) return;
    const c = nearest(); L.near = c;
    if (!c || P.dead > 0 || L.cd > 0) return;
    if (keys.e || AI.on) {
      const ent = entriesOf(c);
      if (c.type === 'boss') { moraleGain('horde'); shake(1); } else if (c.type !== 'pile') moraleGain('crate');
      c.opening = true;
      open(titleOf(c), ent.map(e => ({ ...e })), { x: c.x, y: c.y, crate: c });
      if (AI.on) { const i = crates.indexOf(c); if (i >= 0) crates.splice(i, 1); }
    }
  };
  L.draw = function (ctx) {
    if (!G) return;
    const t = G.time || 0;
    for (const c of crates) {
      if (c.type !== 'pile') continue;
      const px = c.x * T, py = c.y * T, bob = Math.sin(t * 3 + c.x) * 1.5, id = c.items && c.items[0] ? (c.items[0].r || c.items[0].i) : 'm';
      ctx.fillStyle = '#0006'; ctx.beginPath(); ctx.ellipse(px, py + 2, 6, 2.4, 0, 0, 6.283); ctx.fill();
      ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 4); ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.arc(px, py - 5, 9, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = false; ctx.drawImage(Items.canvas(id), px - 8, py - 15 + bob, 16, 16);
    }
    const n = L.near;
    if (n && !L.cur && !AI.on) {
      const px = n.x * T, py = n.y * T - (n.type === 'pile' ? 24 : 26), label = 'E  ' + (n.type === 'pile' ? 'Pick up' : 'Open') + ': ' + titleOf(n).replace('Found: ', '');
      ctx.font = '7px monospace'; const w = ctx.measureText(label).width + 8;
      ctx.fillStyle = '#000c'; ctx.fillRect(px - w / 2, py - 7, w, 12); ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 1; ctx.strokeRect(px - w / 2 + 0.5, py - 6.5, w - 1, 11);
      ctx.fillStyle = '#ffe9b0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, px, py - 0.5); ctx.textAlign = 'left';
    }
  };
  Object.assign(L, { isOpen, open, leave, takeAll, init, render });
  return L;
})();
