function runAI(cfg) {
  const R = { cfg, samples: [], events: [], marks: {}, errors: [], done: false, deathsP: 0 };
  newGame(cfg.diff, cfg.seed, cfg.story); UI.hideMenu(); G.paused = false; AI.on = true; if (cfg.ring) AI.ring = cfg.ring;
  const _log = log; log = function (m) { if (R.events.length < 600) R.events.push([G.elapsed | 0, String(m).slice(0, 120)]); _log(m); };
  const _kp = killPlayer; killPlayer = function () { const n3 = zombies.filter(z => Math.hypot(z.x - P.px, z.y - P.py) < 3), n8 = zombies.filter(z => Math.hypot(z.x - P.px, z.y - P.py) < 8); R.deaths = R.deaths || []; R.deaths.push({ t: G.elapsed | 0, job: AI.job && AI.job.kind, x: P.px | 0, y: P.py | 0, r3: n3.length, r8: n8.length, modes: n8.map(z => z.mode).join(''), types: [...new Set(n3.map(z => z.type))].join(','), safe: claimed[(P.py | 0) * W + (P.px | 0)] }); return _kp(); };
  R.warns = {}; const _warn = warn; warn = function (m) { R.warns[m] = (R.warns[m] || 0) + 1; };
  const mark = n => { if (R.marks[n] === undefined) R.marks[n] = G.elapsed | 0; };
  const SEC = 30; let ticks = 0, t0 = G.elapsed;
  const bad = () => { for (const k of ['mat', 'food', 'ammo', 'med', 'fuel', 'water', 'hygiene', 'morale']) { const v = G[k]; if (!isFinite(v)) return k + '=' + v; if (v < -0.01) return k + '<0 (' + v + ')'; } if (!isFinite(P.px) || !isFinite(P.py)) return 'P nan'; return null; };
  while (!G.over && G.elapsed - t0 < cfg.maxTime) {
    try { simulate(1 / SEC); } catch (e) { R.errors.push(String(e.stack || e).split('\n').slice(0, 3).join(' | ')); break; }
    ticks++;
    if (cfg.cheat && ticks % SEC === 0) { if (cfg.cheat.ammo) G.ammo = Math.max(G.ammo, cfg.cheat.ammo); if (cfg.cheat.mat) G.mat = Math.max(G.mat, cfg.cheat.mat); if (cfg.cheat.noammo) G.ammo = 0; }
    if (cfg.trace && ticks % 60 === 0 && G.elapsed < cfg.trace) { R.trace = R.trace || []; R.trace.push([G.elapsed | 0, AI.job ? AI.job.kind : '-', P.px.toFixed(0) + ',' + P.py.toFixed(0), P.hp | 0, G.ammo | 0, zombies.filter(z => z.mode === 1).length + '/' + zombies.filter(z => z.mode === 3).length + '/' + zombies.filter(z => Math.hypot(z.x - P.px, z.y - P.py) < 8).length].join(' ')); }
    if (ticks % SEC === 0) {
      if (G.sealed) mark('sealed'); if (defenders.length) mark('firstDefender'); if (G.level >= 2) mark('level2'); if (G.level >= 3) mark('level3'); if (G.level >= 4) mark('level4'); if (G.hordeN >= 1) mark('horde1'); if (G.hordesBeaten >= 1) mark('beat1'); if (G.hordesBeaten >= 3) mark('beat3'); if (people() >= 6) mark('people6'); if (people() >= 12) mark('people12');
      const b = bad(); if (b && R.errors.length < 5) R.errors.push('INVARIANT ' + b + ' at ' + (G.elapsed | 0));
      if (AI.err && R.errors.length < 5) { R.errors.push('AI ' + AI.err); AI.err = null; }
    }
    if (ticks % (SEC * 30) === 0) R.samples.push({ t: G.elapsed | 0, mat: G.mat | 0, food: G.food | 0, ammo: G.ammo | 0, water: G.water | 0, fuel: G.fuel | 0, med: G.med | 0, ppl: people(), idle: G.idle.length, def: defenders.length, morale: G.morale | 0, lvl: G.level, sealed: G.sealed, z: zombies.length, hordeN: G.hordeN, beaten: G.hordesBeaten, hp: P.hp | 0, job: AI.job ? AI.job.kind : '-', core: G.coreHp | 0 });
  }
  R.diag = { total: buildings.length, looted: buildings.filter(b => b.looted).length, crew: buildings.filter(b => b.crew).length, nest: buildings.filter(b => b.nest).length, locked: buildings.filter(b => b.locked && !b.looted).length, unexplored: buildings.filter(b => !b.looted && !explored[((b.y + (b.h >> 1)) | 0) * W + ((b.x + (b.w >> 1)) | 0)]).length, banned: buildings.filter(b => (AI.ban.get(b) || 0) > G.elapsed).length, explored: explored.reduce((a, v) => a + (v ? 1 : 0), 0) / explored.length, claimedB: buildings.filter(b => b.claimed).length, keys: G.keys, fuel: G.fuel, fac: facilities.map(f => f.type).join(","), towers: defenders.length, traps: traps.length, spots: 0 };
  R.over = G.over; R.why = G.endWhy; R.t = G.elapsed | 0; R.won = G.won; R.hordes = G.hordeN; R.beaten = G.hordesBeaten; R.kills = G.kills; R.level = G.level; R.people = people(); R.memorial = G.memorial.length; R.deathsP = G.deaths;
  R.towns = Campaign.towns.map(t => t.name + ':' + t.status + ':' + (t.G.level));
  return R;
}
