'use strict';
/* save.js - localStorage save/load. The town is regenerated from the seed, so
   only the changes (walls, people, zombies, timers...) are stored. */
const Save = (() => {
  const b64 = arr => { let s = ''; const u = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); };
  const unb64 = (str, Type) => { const s = atob(str), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new Type(u.buffer); };
  const r2 = v => Math.round(v * 100) / 100;
  const SCALARS = ['level', 'ammo', 'mat', 'food', 'coreHp', 'kills', 'elapsed', 'hordeN', 'hordesBeaten', 'nextHorde', 'hordeId', 'rescue',
    'sid', 'storm', 'eventT', 'trader', 'refugeeT', 'res', 'sel', 'diff', 'seed', 'morale', 'memorial', 'deaths',
    'story', 'rules', 'ruleCd', 'flags', 'radioT', 'radioMsg', 'rescueKind', 'stress', 'recentDeaths', 'med', 'fuel', 'nests', 'nestT'];

  function snapshot() {
    const d = { v: 1, scalars: {} };
    for (const k of SCALARS) d.scalars[k] = G[k];
    d.P = { px: r2(P.px), py: r2(P.py), hp: r2(P.hp) };
    d.wall = b64(wall); d.explored = b64(explored);
    const hp16 = new Uint16Array(W * H); for (let i = 0; i < W * H; i++) hp16[i] = Math.min(65535, Math.round(wallHp[i] * 8));
    d.wallHp = b64(hp16); d.tier = b64(wallTier); d.elec = b64(elec);
    d.facilities = facilities.map(f => ({ type: f.type, x: f.x, y: f.y }));
    d.buildings = buildings.map(b => (b.looted ? 1 : 0) | (b.crew ? 2 : 0));
    d.idle = G.idle; d.crews = G.crews.map(c => ({ bi: c.bi, members: c.members, t: c.t, dur: c.dur, risk: c.risk }));
    d.defenders = defenders.map(x => ({ x: x.x, y: x.y, hp: r2(x.hp), s: x.s }));
    d.traps = traps.map(t => ({ ...t }));
    d.crates = crates.map(c => ({ ...c }));
    d.hordes = hordes.map(h => ({ ...h }));
    d.zombies = zombies.map(z => [r2(z.x), r2(z.y), z.type, r2(z.hp), z.mode, z.h, z.v]);
    return d;
  }
  function save() {
    if (!G || G.over) return false;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot())); return true; } catch (e) { return false; }
  }
  const exists = () => { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } };
  function load() {
    let d;
    try { d = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return false; }
    if (!d || d.v !== 1) return false;
    newGame(d.scalars.diff, d.scalars.seed, d.scalars.story);
    Object.assign(G, d.scalars);
    if (typeof G.morale !== 'number') G.morale = MORALE.start;
    if (!G.memorial) G.memorial = [];
    G.deaths = G.deaths || 0; G.rules = G.rules || {}; G.flags = G.flags || {}; G.story = G.story || 'cassandra';
    P.px = d.P.px; P.py = d.P.py; P.hp = d.P.hp;
    wall.set(unb64(d.wall, Uint8Array)); explored.set(unb64(d.explored, Uint8Array));
    const hp16 = unb64(d.wallHp, Uint16Array); for (let i = 0; i < W * H; i++) wallHp[i] = hp16[i] / 8;
    if (d.tier) wallTier.set(unb64(d.tier, Uint8Array)); if (d.elec) elec.set(unb64(d.elec, Uint8Array));
    facilities = []; facAt = new Array(W * H).fill(null);
    for (const f of (d.facilities || [])) { const o = { type: f.type, x: f.x, y: f.y, t: 0, on: false }; facilities.push(o); facAt[f.y * W + f.x] = o; }
    G.nests = G.nests || []; for (const n of G.nests) if (buildings[n.bi]) buildings[n.bi].nest = true;
    G.med = G.med === undefined ? 4 : G.med; G.fuel = G.fuel || 0;
    d.buildings.forEach((f, i) => { if (buildings[i]) { buildings[i].looted = !!(f & 1); buildings[i].crew = !!(f & 2); } });
    G.idle = d.idle; G.crews = d.crews;
    defenders = []; defAt = new Array(W * H).fill(null);
    for (const x of d.defenders) { addDefender(x.x, x.y, x.s); const dd = defAt[x.y * W + x.x]; if (dd) dd.hp = x.hp; }
    traps = d.traps; trapAt = new Array(W * H).fill(null); for (const t of traps) trapAt[t.y * W + t.x] = t;
    crates = d.crates; hordes = d.hordes;
    zombies = d.zombies.map(a => {
      const z = makeZombie(a[0], a[1], a[4], a[5]);
      z.type = a[2]; z.hp = a[3]; z.v = a[6]; z.speed = ZTYPES[z.type].speed * (0.85 + rng() * 0.3);
      return z;
    });
    G.fieldDirty = true; G.visT = 0; G.fieldTimer = 0;
    computeBaseField(); computePlayerField(); computeTerritory(); updateVision();
    log('Game loaded');
    return true;
  }
  return { save, load, exists };
})();
