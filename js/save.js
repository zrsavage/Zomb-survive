'use strict';
/* save.js - localStorage save/load (format v2: a campaign of several towns).
   Each town's terrain is regenerated from its seed, so only the changes are stored.
   v1 saves (a single town) are upgraded on load. */
const Save = (() => {
  const b64 = arr => { let s = ''; const u = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); };
  const unb64 = (str, Type) => { const s = atob(str), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new Type(u.buffer); };
  const r2 = v => Math.round(v * 100) / 100;
  const SCALARS = ['level', 'ammo', 'mat', 'food', 'coreHp', 'kills', 'elapsed', 'born', 'hordeN', 'hordesBeaten', 'nextHorde', 'hordeId', 'rescue', 'storm', 'eventT', 'trader',
    'refugeeT', 'sel', 'seed', 'morale', 'deaths', 'rules', 'ruleCd', 'radioT', 'radioMsg', 'rescueKind', 'stress', 'recentDeaths', 'med', 'fuel', 'heat', 'pressAcc', 'dropT', 'supCd', 'secured', 'safeT', 'coreHurtAt', 'nests', 'nestT',
    'water', 'hygiene', 'ap', 'inc', 'blades', 'keys', 'craft', 'fog', 'supplyLvl', 'herdT', 'herdId', 'batt', 'truckT', 'townName'];

  // a town's data, whether it is the live one (globals) or a stored record
  function viewOf(t) {
    if (t === Campaign.active) return { G, mem: { wall, explored, wallHp, wallTier, elec }, L: { buildings, sewers, facilities, defenders, traps, crates, hordes, zombies } };
    return { G: t.G, mem: t.mem, L: t.lists };
  }
  function serializeTown(t) {
    const v = viewOf(t), g = v.G, m = v.mem, L = v.L;
    const hp16 = new Uint16Array(W * H); for (let i = 0; i < W * H; i++) hp16[i] = Math.min(65535, Math.round(m.wallHp[i] * 8));
    const d = { id: t.id, name: t.name, seed: t.seed, profile: t.profile, status: t.status, pending: t.pending, shopT: t.shopT || 0, scalars: {} };
    for (const k of SCALARS) d.scalars[k] = g[k];
    d.wall = b64(m.wall); d.explored = b64(m.explored); d.wallHp = b64(hp16); d.tier = b64(m.wallTier); d.elec = b64(m.elec);
    d.facilities = L.facilities.map(f => ({ type: f.type, x: f.x, y: f.y }));
    d.buildings = L.buildings.map(b => (b.looted ? 1 : 0) | (b.crew ? 2 : 0));
    d.stock = L.buildings.map(b => b.stock); d.sewers = L.sewers.map(s => (s.found ? 1 : 0) | (s.sealed ? 2 : 0));
    d.idle = g.idle; d.crews = g.crews.map(c => ({ bi: c.bi, members: c.members, t: c.t, dur: c.dur, risk: c.risk, phase: c.phase || 'out', prog: c.prog || 0 }));
    d.defenders = L.defenders.map(x => ({ x: x.x, y: x.y, hp: r2(x.hp), s: x.s, blade: x.blade || null }));
    d.traps = L.traps.map(x => ({ ...x })); d.crates = L.crates.map(c => ({ ...c })); d.hordes = L.hordes.map(h => ({ ...h }));
    d.zombies = L.zombies.map(z => [r2(z.x), r2(z.y), z.type, r2(z.hp), z.mode === 4 ? 0 : z.mode, z.h, z.v]);
    return d;
  }
  function snapshot() {
    Towns.snapshot(Campaign.active);                       // refresh the live town's record (also writes back the id counter)
    const c = Campaign;
    return { v: 2, dims: [W, H], campaign: { t: c.t, res: c.res, memorial: c.memorial, flags: c.flags, sid: c.sid, story: c.story, diff: c.diff, truck: c.truck, convoys: c.convoys, nextId: c.nextId, activeId: c.active.id },
      P: { px: r2(P.px), py: r2(P.py), hp: r2(P.hp), inv: (P.inv || []).map(s => ({ ...s })) }, towns: c.towns.map(serializeTown) };
  }
  // where the save lives: the browser's storage, a copy in memory for this visit, and the private cloud copy
  let mem = null;
  const raw = () => store.get(SAVE_KEY) || mem;
  function adopt(str, t) { mem = str; store.set(SAVE_KEY, str); store.set('hf-save-t', String(t || Date.now())); }
  function save() {
    if (!live || !G || G.over) return false;          // never save the title-screen backdrop over a real game
    let str; try { str = JSON.stringify(snapshot()); } catch (e) { return false; }
    adopt(str, Date.now()); Cloud.push(str);
    return true;
  }
  const exists = () => !!raw();
  function clear() { mem = null; store.remove(SAVE_KEY); store.remove('hf-save-t'); Cloud.clear(); }
  let live = false;
  function status() { return (Cloud.state === 'ready' ? 'Saved to your private cloud and this browser.' : Cloud.state === 'connecting' ? 'Connecting your cloud save...' : 'Saved in this browser only (use Export to keep a copy).'); }

  // apply one town's saved data to the globals (which buildTown has just freshly generated)
  function applyTown(td) {
    Object.assign(G, td.scalars);
    if (typeof G.morale !== 'number') G.morale = MORALE.start;
    G.deaths = G.deaths || 0; G.rules = G.rules || {}; G.nests = G.nests || []; G.fuel = G.fuel || 0; G.med = G.med === undefined ? 4 : G.med;
    for (const k of ['water', 'hygiene']) if (typeof G[k] !== 'number') G[k] = k === 'water' ? WATER.start : HYGIENE.start;
    wall.set(unb64(td.wall, Uint8Array)); explored.set(unb64(td.explored, Uint8Array));
    const hp16 = unb64(td.wallHp, Uint16Array); for (let i = 0; i < W * H; i++) wallHp[i] = hp16[i] / 8;
    if (td.tier) wallTier.set(unb64(td.tier, Uint8Array)); if (td.elec) elec.set(unb64(td.elec, Uint8Array));
    facilities = []; facAt = new Array(W * H).fill(null);
    for (const f of (td.facilities || [])) { const o = { type: f.type, x: f.x, y: f.y, t: 0, on: false }; if (f.type === 'turret') Object.assign(o, { px: f.x + 0.5, py: f.y + 0.5, cd: 0, mcd: 0, shot: 0, noiseT: 0, face: 1 }); facilities.push(o); facAt[f.y * W + f.x] = o; }
    for (const n of G.nests) if (buildings[n.bi]) buildings[n.bi].nest = true;
    if (td.stock) td.stock.forEach((st, i) => { if (buildings[i] && st) buildings[i].stock = st; });
    if (td.sewers) td.sewers.forEach((f, i) => { if (sewers[i]) { sewers[i].found = !!(f & 1); sewers[i].sealed = !!(f & 2); } });
    td.buildings.forEach((f, i) => { if (buildings[i]) { buildings[i].looted = !!(f & 1); buildings[i].crew = !!(f & 2); } });
    G.idle = td.idle; G.crews = td.crews;
    defenders = []; defAt = new Array(W * H).fill(null);
    for (const x of td.defenders) { addDefender(x.x, x.y, x.s); const dd = defAt[x.y * W + x.x]; if (dd) { dd.hp = x.hp; dd.blade = x.blade || null; } }
    traps = td.traps; trapAt = new Array(W * H).fill(null); for (const t of traps) trapAt[t.y * W + t.x] = t;
    crates = td.crates; hordes = td.hordes;
    zombies = td.zombies.map(a => { const z = makeZombie(a[0], a[1], a[4], a[5]); z.type = ZTYPES[a[2]] ? a[2] : 'walker'; z.hx = z.x; z.hy = z.y; z.hp = a[3]; z.v = a[6]; z.speed = ZTYPES[z.type].speed * (0.92 + rng() * 0.16); return z; });
    G.fieldDirty = true; G.visT = 0; G.fieldTimer = 0;
    computeBaseField(); computeTerritory(); Survival.refreshIncome();
  }
  function upgradeV1(d) {                                    // a v1 save is a one-town campaign
    const s = d.scalars, shared = ['res', 'memorial', 'flags', 'sid', 'story', 'diff'];
    const td = Object.assign({}, d, { id: 1, name: 'Home Camp', seed: s.seed, profile: { wealth: 1, ambient: 1 }, status: 'alive', pending: null, shopT: 0, scalars: {} });
    for (const k in s) if (!shared.includes(k)) td.scalars[k] = s[k];
    td.scalars.townName = 'Home Camp';
    return { v: 2, campaign: { t: s.elapsed || 0, res: s.res, memorial: s.memorial || [], flags: s.flags || {}, sid: s.sid || 1, story: s.story, diff: s.diff, truck: d.truck || null, convoys: [], nextId: 2, activeId: 1 }, P: d.P, towns: [td] };
  }
  function load(text) {
    let d;
    try { d = JSON.parse(text || raw()); } catch (e) { return false; }
    if (!d) return false;
    if (d.v === 1) d = upgradeV1(d);
    if (d.v !== 2) return false;
    if (d.dims && (d.dims[0] !== W || d.dims[1] !== H)) return false;
    if (!d.dims) return false;                             // saves from before the larger towns cannot be loaded
    const c = d.campaign;
    rng = mulberry32((Math.random() * 2 ** 31) | 0);
    Object.assign(Campaign, { towns: [], active: null, t: c.t || 0, bgAcc: 0, nextId: c.nextId || 2, res: c.res || { done: {}, active: null }, memorial: c.memorial || [], flags: c.flags || {}, sid: c.sid || 1,
      story: c.story || 'cassandra', diff: c.diff || 'normal', truck: c.truck || null, convoys: c.convoys || [], alert: null });
    let activeT = null;
    for (const td of d.towns) {
      buildTown(td.seed, td.name, { wealth: (td.profile || {}).wealth, ambient: (td.profile || {}).ambient });
      applyTown(td);
      const t = Towns.register(td.name, td.seed, td.profile || { wealth: 1, ambient: 1 });
      t.id = td.id; t.status = td.status || 'alive'; t.pending = td.pending || null; t.shopT = td.shopT || 0;
      if (td.id === c.activeId) activeT = t;
    }
    Campaign.nextId = c.nextId || (Math.max(...Campaign.towns.map(t => t.id)) + 1);
    activeT = activeT || Campaign.towns[0];
    Towns.load(activeT); Campaign.active = activeT;
    P.px = d.P.px; P.py = d.P.py; P.hp = d.P.hp; P.travel = 0; P.inv = d.P.inv || [];
    computePlayerField(); updateVision();
    log('Game loaded');
    return true;
  }
  return { save, load, exists, clear, raw, adopt, status, setLive(v) { live = v; } };
})();
