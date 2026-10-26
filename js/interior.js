'use strict';
/* interior.js - buildings are places you go into. Each has rooms, furniture, containers that hold its stock, a few of the
   dead who stayed, and more than one way out. Walk to a door and press E; open things with E; leave by any door.
   If the dead crowd the front, use the back. The outside world keeps going while you are in there. */
const Interior = (() => {
  const I = { cur: null, exits: null, fade: 0, prompt: null };
  const OPEN = { store: 1, warehouse: 1, garage: 1, junkyard: 1, gas: 1, farmstead: 1 };
  const KINDS = {
    house: ['cabinet', 'fridge', 'drawer', 'wardrobe'], store: ['shelf', 'fridge', 'register'], garage: ['toolbox', 'cabinet', 'tires'],
    warehouse: ['crate', 'pallet', 'shelf'], pharmacy: ['medcab', 'shelf'], police: ['locker', 'safe'], bunker: ['crate', 'safe'],
    junkyard: ['scrap'], gas: ['shelf', 'toolbox'], farmstead: ['sack', 'crate'],
  };
  const AFF = {
    fridge: { f: 5, water: 4 }, cabinet: { f: 2, med: 2, m: 1, water: 1, a: 1 }, drawer: { m: 2, a: 2, med: 1 }, wardrobe: { m: 1 }, shelf: { f: 3, m: 2, water: 2, med: 1 },
    register: { m: 1, a: 1 }, toolbox: { m: 4, fuel: 4, a: 1 }, tires: { m: 2 }, crate: { m: 3, a: 3, f: 2, fuel: 1 }, pallet: { m: 4, a: 2, f: 1 }, medcab: { med: 6 },
    locker: { a: 5, m: 2, med: 1 }, safe: { a: 4, med: 2, m: 2, fuel: 1 }, scrap: { m: 6, fuel: 1 }, sack: { f: 5 },
  };
  const NAMEOF = { cabinet: 'cabinet', fridge: 'fridge', drawer: 'drawers', wardrobe: 'wardrobe', shelf: 'shelves', register: 'till', toolbox: 'toolbox', tires: 'tyre stack', crate: 'crate', pallet: 'pallet', medcab: 'medicine cabinet', locker: 'locker', safe: 'safe', scrap: 'scrap pile', sack: 'sacks' };
  const ZCOUNT = { house: [8, 14], store: [20, 28], garage: [10, 16], warehouse: [24, 30], pharmacy: [14, 20], gas: [10, 16], police: [22, 30], junkyard: [16, 24], bunker: [26, 30], farmstead: [10, 16] };
  const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const FL = 0, WALL = 1, FURN = 2, CONT = 3, DOOR = 4;

  // ---- layout: a building's inside, the same every time (seeded by the building) ----------------------------------------
  const outFree = (x, y) => inb(x | 0, y | 0) && bld[(y | 0) * W + (x | 0)] < 0 && !isCoreTile(x | 0, y | 0) && wall[(y | 0) * W + (x | 0)] !== K.RADIO;
  function layoutOf(b) {
    if (b._lay) return b._lay;
    const w = b.w * 3, h = b.h * 3, r = mulberry32(((b.seed | 0) ^ 0x9e3779b1) >>> 0);
    const t = new Uint8Array(w * h), at = (x, y) => y * w + x;
    for (let x = 0; x < w; x++) { t[at(x, 0)] = WALL; t[at(x, h - 1)] = WALL; }
    for (let y = 0; y < h; y++) { t[at(0, y)] = WALL; t[at(w - 1, y)] = WALL; }
    const gaps = [], open = !!OPEN[b.type];
    let px = -1;
    if (!open && w >= 9) {
      px = 3 + ((r() * (w - 6)) | 0); for (let y = 1; y < h - 1; y++) t[at(px, y)] = WALL;
      const gy = 2 + ((r() * (h - 5)) | 0); t[at(px, gy)] = FL; t[at(px, gy + 1)] = FL; gaps.push([px, gy], [px, gy + 1]);
      if (w >= 12 && h >= 9) {
        const left = r() < 0.5, x0 = left ? 1 : px + 1, x1 = left ? px : w - 1, py = 3 + ((r() * (h - 6)) | 0);
        for (let x = x0; x < x1; x++) t[at(x, py)] = WALL;
        const gx = x0 + 1 + ((r() * Math.max(1, x1 - x0 - 3)) | 0); t[at(gx, py)] = FL; t[at(Math.min(x1 - 1, gx + 1), py)] = FL; gaps.push([gx, py], [gx + 1, py]);
      }
    }
    // exits: the front always, a back door, and side doors on bigger buildings
    const ex = [];
    const mk = (side, x, y, dx, dy) => { for (let k = 0; k < 2; k++) t[at(x + dx * k, y + dy * k)] = DOOR; ex.push({ side, x, y, dx, dy, cx: x + dx, cy: y + dy, tiles: [[x, y], [x + dx, y + dy]] }); };
    mk('S', clamp((w * (0.25 + 0.5 * r())) | 0, 2, w - 4), h - 1, 1, 0);
    if (w >= 8) mk('N', clamp((w * (0.2 + 0.6 * r())) | 0, 2, w - 4), 0, 1, 0);
    if (w >= 12 && h >= 8) mk('W', 0, clamp((h * (0.3 + 0.4 * r())) | 0, 2, h - 4), 0, 1);
    if (w >= 15 && h >= 8) mk('E', w - 1, clamp((h * (0.3 + 0.4 * r())) | 0, 2, h - 4), 0, 1);
    for (const e of ex) {                                            // where each door lets out
      const fx = (e.cx + 0.5) / w, fy = (e.cy + 0.5) / h;
      let ox, oy;
      if (e.side === 'S') { ox = b.x + fx * b.w; oy = b.y + b.h + 0.6; } else if (e.side === 'N') { ox = b.x + fx * b.w; oy = b.y - 0.6; }
      else if (e.side === 'W') { ox = b.x - 0.6; oy = b.y + fy * b.h; } else { ox = b.x + b.w + 0.6; oy = b.y + fy * b.h; }
      let ok = outFree(ox, oy);
      for (let s = 1; s <= 3 && !ok; s++) for (const sg of [1, -1]) { const nx = ox + (e.side === 'S' || e.side === 'N' ? sg * s : 0), ny = oy + (e.side === 'W' || e.side === 'E' ? sg * s : 0); if (outFree(nx, ny)) { ox = nx; oy = ny; ok = true; break; } }
      e.out = { x: ox, y: oy }; e.ok = ok;
    }
    const exits = ex.filter((e, i) => e.ok || i === 0);
    for (const e of ex) if (!exits.includes(e)) for (const [x, y] of e.tiles) t[at(x, y)] = WALL;           // a door that opens onto a blocked street is bricked up
    const near = (x, y, list, d) => list.some(([a, c]) => Math.max(Math.abs(a - x), Math.abs(c - y)) <= d);
    const doorTiles = exits.flatMap(e => e.tiles), keepClear = [...doorTiles, ...gaps];
    const wallAdj = (x, y) => t[at(x - 1, y)] === WALL || t[at(x + 1, y)] === WALL || t[at(x, y - 1)] === WALL || t[at(x, y + 1)] === WALL;
    const kinds = KINDS[b.type] || ['crate'];
    const cont = [], furn = [];
    const place = (x, y, kind, solid) => { t[at(x, y)] = solid ? CONT : FURN; (solid ? cont : furn).push({ x, y, kind }); };
    if (open && (b.type === 'store' || b.type === 'warehouse' || b.type === 'garage' || b.type === 'gas')) {      // rows of shelving with aisles
      for (let y = 3; y < h - 3; y += 3) for (let x = 3; x < w - 3; x++) {
        if ((x % 5) === 0 || near(x, y, keepClear, 1)) continue;
        if (r() < 0.62) place(x, y, kinds[(r() * kinds.length) | 0], true); else if (r() < 0.5) place(x, y, 'shelf', false);
      }
    } else {
      const cands = []; for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (t[at(x, y)] === FL && wallAdj(x, y) && !near(x, y, keepClear, 2)) cands.push([x, y]);
      for (let i = cands.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [cands[i], cands[j]] = [cands[j], cands[i]]; }
      const nC = clamp(Math.round(b.w * b.h / 3.2) + 1 + ((r() * 2) | 0), 3, 14), nF = clamp(Math.round(b.w * b.h / 4), 2, 8);
      for (const [x, y] of cands) { if (t[at(x, y)] !== FL) continue; if (cont.length < nC) place(x, y, kinds[(r() * kinds.length) | 0], true); else if (furn.length < nF) place(x, y, r() < 0.5 ? 'bed' : 'table', false); else break; }
    }
    // everything must be reachable from the front door; anything walled off goes back to being floor
    const sx = exits[0].cx, sy = exits[0].side === 'S' ? h - 2 : 1, seen = new Uint8Array(w * h), q = [at(sx, sy)];
    if (t[q[0]] === FL) seen[q[0]] = 1;
    for (let k = 0; k < q.length; k++) { const i = q[k], x = i % w, y = (i / w) | 0; for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const ni = at(nx, ny); if (!seen[ni] && t[ni] === FL) { seen[ni] = 1; q.push(ni); } } }
    const reach = (x, y) => N4.some(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < w && ny < h && seen[at(nx, ny)]; });
    for (let i = cont.length - 1; i >= 0; i--) if (!reach(cont[i].x, cont[i].y)) { t[at(cont[i].x, cont[i].y)] = FL; cont.splice(i, 1); }
    for (let i = furn.length - 1; i >= 0; i--) if (!reach(furn[i].x, furn[i].y)) { t[at(furn[i].x, furn[i].y)] = FL; furn.splice(i, 1); }
    const floor = []; for (let i = 0; i < w * h; i++) if (seen[i]) floor.push(i);
    return (b._lay = { w, h, t, cont, furn, exits, floor, px, r: mulberry32(((b.seed | 0) ^ 0x51ed270b) >>> 0) });
  }
  I.exitsOf = b => layoutOf(b).exits;
  I.doorNear = (b, x, y) => {                                         // which door of b is the player standing at
    const ex = layoutOf(b).exits; let best = null, bd = 2.0;
    for (let i = 0; i < ex.length; i++) { const d = Math.hypot(ex[i].out.x - x, ex[i].out.y - y); if (d < bd) { bd = d; best = i; } }
    return best;
  };

  // ---- what is in the containers: the building's own stock, split between them ----------------------------------------
  function ensureCont(b) {
    if (b.cont) return;
    const lay = layoutOf(b), got = b.looted ? {} : takeLoot(b, has('scav') ? 1.35 : 1);
    b.cont = lay.cont.map(() => []);
    if (!lay.cont.length) return;
    for (const [k] of LOOT_KEYS) {
      let n = got[k] || 0; if (n <= 0) continue;
      const pool = lay.cont.map((c, i) => ({ i, w: (AFF[c.kind] || {})[k] || 0 })).filter(c => c.w > 0);
      const use = pool.length ? pool : lay.cont.map((c, i) => ({ i, w: 1 }));
      for (let s = 0, parts = Math.min(use.length, 1 + ((rng() * 3) | 0)); s < parts && n > 0; s++) {
        const tot = use.reduce((a, c) => a + c.w, 0); let rr = rng() * tot, pick = use[0];
        for (const c of use) { rr -= c.w; if (rr <= 0) { pick = c; break; } }
        const take = s === parts - 1 ? n : Math.max(1, Math.round(n * (0.35 + rng() * 0.4)));
        const ex = b.cont[pick.i].find(e => e.r === k); if (ex) ex.n += take; else b.cont[pick.i].push({ r: k, n: take });
        n -= take; use.splice(use.indexOf(pick), 1); if (!use.length) break;
      }
    }
    if (b.looted) return;
    for (let i = 0; i < lay.cont.length; i++) {                      // the odd find
      const kind = lay.cont[i].kind;
      if (rng() < 0.06) b.cont[i].push({ i: Items.roll(), n: 1 });
      if ((kind === 'locker' && rng() < 0.12) || (kind === 'safe' && rng() < 0.25)) { const g = Items.rollGun(); if (g) b.cont[i].push({ i: g, n: 1 }); }
      if (b.type === 'house' && kind === 'drawer' && rng() < KEYS.houseChance * 3) b.cont[i].push({ i: 'keycard', n: 1 });
    }
  }
  function spawnZombies(b, lay, ent) {
    if (b.zleft === undefined) { const [a, c] = ZCOUNT[b.type] || [0, 2]; b.zleft = a + ((rng() * (c - a + 1)) | 0); if (b.looted) b.zleft = Math.min(b.zleft, 2); }
    const zs = [], far = lay.floor.filter(i => { const x = i % lay.w, y = (i / lay.w) | 0; return Math.hypot(x - ent.x, y - ent.y) > 6; });
    let cx = 0, cy = 0;
    for (let k = 0; k < b.zleft && far.length; k++) {
      if (k % 4 === 0) { const i = far[(rng() * far.length) | 0]; cx = (i % lay.w) + 0.5; cy = ((i / lay.w) | 0) + 0.5; }      // they sleep in knots of four or so
      let x = cx + (rng() - 0.5) * 1.8, y = cy + (rng() - 0.5) * 1.8; if (solidAt(lay, x, y)) { x = cx; y = cy; }
      const z = makeZombie(x, y, 0, 0, pickType(Math.max(1, waveNow() - 1)));
      z.mode = 0; z.cd = 0; z.hit = 0; zs.push(z);
    }
    return zs;
  }

  // ---- going in and out -------------------------------------------------------------------------------------------------
  I.active = () => !!(P.inside && I.cur);
  const clearFx = () => { tracers.length = 0; parts.length = 0; texts.length = 0; flashes.length = 0; rings.length = 0; };
  I.enter = function (b, di) {
    const lay = layoutOf(b), e = lay.exits[di == null ? 0 : di];
    ensureCont(b);
    const sx = e.cx + 0.5 + (e.side === 'W' ? 1.3 : e.side === 'E' ? -1.3 : 0), sy = e.cy + 0.5 + (e.side === 'S' ? -1.3 : e.side === 'N' ? 1.3 : 0);
    I.cur = { b, lay, p: { x: sx, y: sy }, zs: spawnZombies(b, lay, { x: sx, y: sy }), field: new Float32Array(lay.w * lay.h), fT: 0, streamT: [], via: di, t: 0, opened: 0, streamed: 0 };
    P.inside = true; P.order = null; P.autoE = false; P.px = e.out.x; P.py = e.out.y; G.tool = 'combat';
    clearFx(); I.fade = 0.35; Snd.click && Snd.click(); G.cam.free = false;
    if (G.intro) G.intro.entered = true;
    log('You go into the ' + BUILDING_TYPES[b.type].label.toLowerCase() + '.');
  };
  I.exit = function (di, quiet) {
    const c = I.cur; if (!c) return;
    const e = c.lay.exits[di], b = c.b;
    // the ones right behind you follow you out
    let n = 0; for (const z of c.zs) { if (z.hp > 0 && z.mode === 1 && Math.hypot(z.x - c.p.x, z.y - c.p.y) < 4 && n < 3) { const o = makeZombie(e.out.x, e.out.y, 1, 0, z.type); o.hp = z.hp; o.mode = 1; zombies.push(o); z.hp = 0; b.zleft = Math.max(0, b.zleft - 1); n++; } }
    I.cur = null; P.inside = false; P.px = e.out.x; P.py = e.out.y; clearFx(); I.fade = 0.3; G.cam.x = P.px; G.cam.y = P.py;
    if (!quiet) { Snd.click && Snd.click(); if (n) log(n + ' followed you out!'); }
    if (b.cont && b.cont.every(a => !a.length) && !b.looted) { b.looted = true; }
  };
  I.forceOut = function () { if (!I.cur) { P.inside = false; return; } const e = I.cur.lay.exits[I.cur.via || 0]; I.cur = null; P.inside = false; P.px = e.out.x; P.py = e.out.y; clearFx(); };

  // ---- the world as combat sees it ---------------------------------------------------------------------------------------
  const solidAt = (lay, x, y) => { const tx = x | 0, ty = y | 0; if (tx < 0 || ty < 0 || tx >= lay.w || ty >= lay.h) return true; const v = lay.t[ty * lay.w + tx]; return v === WALL || v === FURN || v === CONT; };
  I.world = {
    pos: () => I.cur.p, zs: () => I.cur.zs,
    blocked: (x, y) => { const c = I.cur; const tx = x | 0, ty = y | 0; if (tx < 0 || ty < 0 || tx >= c.lay.w || ty >= c.lay.h) return true; const v = c.lay.t[ty * c.lay.w + tx]; return v === WALL || v === FURN; },
    noise: (r, sniper) => {
      const c = I.cur; for (const z of c.zs) if (z.hp > 0 && z.mode === 0 && Math.hypot(z.x - c.p.x, z.y - c.p.y) < r) { z.mode = 1; }
      const e = c.lay.exits[c.via || 0]; alertNoise(e.out.x, e.out.y, r * 0.55, 3);                           // the walls muffle it, but not entirely
    },
  };

  // ---- each frame inside --------------------------------------------------------------------------------------------------
  function bfs(c) {
    const { lay } = c, f = c.field; f.fill(1e9); const px = c.p.x | 0, py = c.p.y | 0, q = [py * lay.w + px]; f[q[0]] = 0;
    for (let k = 0; k < q.length; k++) { const i = q[k], x = i % lay.w, y = (i / lay.w) | 0; for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= lay.w || ny >= lay.h) continue; const ni = ny * lay.w + nx; const v = lay.t[ni]; if (f[ni] <= f[i] + 1 || v === WALL || v === FURN || v === CONT) continue; f[ni] = f[i] + 1; q.push(ni); } }
  }
  const prompt = (c) => {
    I.prompt = null; const { lay } = c;
    for (let i = 0; i < lay.exits.length; i++) { const e = lay.exits[i]; if (Math.hypot(e.cx + 0.5 - c.p.x, e.cy + 0.5 - c.p.y) < 1.7) return (I.prompt = { x: e.cx + 0.5, y: e.cy + 0.5, text: 'E  Leave by the ' + { S: 'front', N: 'back', W: 'west', E: 'east' }[e.side] + ' door', kind: 'exit', i }); }
    let best = null, bd = 1.6;
    for (let i = 0; i < lay.cont.length; i++) { const k = lay.cont[i], d = Math.hypot(k.x + 0.5 - c.p.x, k.y + 0.5 - c.p.y); if (d < bd) { bd = d; best = i; } }
    if (best !== null) { const k = lay.cont[best], items = c.b.cont[best]; I.prompt = { x: k.x + 0.5, y: k.y, text: items.length ? 'E  Search the ' + NAMEOF[k.kind] : 'The ' + NAMEOF[k.kind] + ' is empty', kind: items.length ? 'cont' : 'none', i: best }; }
  };
  I.update = function (dt) {
    const c = I.cur; if (!c) { P.inside = false; return; }
    c.t += dt; const { lay, b } = c;
    if (!FIGHT_OK.includes(G.tool)) G.tool = 'combat';
    // moving
    let mx = 0, my = 0;
    if (keys.w || keys.arrowup) my -= 1; if (keys.s || keys.arrowdown) my += 1; if (keys.a || keys.arrowleft) mx -= 1; if (keys.d || keys.arrowright) mx += 1;
    let mag = 1; const jl = Math.hypot(joy.x, joy.y); if (jl > 0.18) { mx = joy.x; my = joy.y; mag = Math.min(1, jl); }
    const moving = !!(mx || my); P.moving = moving;
    G.noticeR = 0.6;                                                  // nobody outside can see you
    if (moving) {
      const sp = PLAYER.speed * mag * (keys.shift ? PLAYER.sprint : 1) * dt / Math.hypot(mx, my), rr = 0.22;
      const free = (x, y) => !solidAt(lay, x - rr, y - rr) && !solidAt(lay, x + rr, y - rr) && !solidAt(lay, x - rr, y + rr) && !solidAt(lay, x + rr, y + rr);
      if (free(c.p.x + mx * sp, c.p.y)) c.p.x += mx * sp; if (free(c.p.x, c.p.y + my * sp)) c.p.y += my * sp;
      if (mx) P.face = mx > 0 ? 1 : -1; P.anim += dt * 9 * (keys.shift ? 1.4 : 1);
    }
    P.hurt -= dt; if (P.stab > 0) P.stab -= dt; if (P.safe > 0) P.safe -= dt;
    if (P.hurt <= 0) P.hp = Math.min(PLAYER.hp, P.hp + 0.3 * dt);
    Combat.update(dt); P.st = P.st === 'idle' && moving ? 'walk' : P.st;
    // zombies in here
    c.fT -= dt; if (c.fT <= 0) { c.fT = 0.3; bfs(c); }
    for (let k = c.zs.length - 1; k >= 0; k--) {
      const z = c.zs[k];
      if (z.hp <= 0) { c.zs.splice(k, 1); b.zleft = Math.max(0, (b.zleft || 0) - 1); G.kills++; addBurst(z.x, z.y - 0.3, '#7a1c1c', 4, { grav: 3 }); continue; }
      const d = Math.hypot(c.p.x - z.x, c.p.y - z.y); z.hit = Math.max(0, (z.hit || 0) - dt); z.anim += dt * 4;
      if (z.mode === 0) { if (d < 3.6 + (keys.shift ? 2 : 0) + (P.shot > 0 ? 5 : 0)) { z.mode = 1; for (const o of c.zs) if (o.mode === 0 && Math.hypot(o.x - z.x, o.y - z.y) < 1.6) o.wake = 0.4 + rng() * 0.8; } else if (z.wake > 0) { z.wake -= dt; if (z.wake <= 0) z.mode = 1; continue; } else continue; }
      const zt = ZTYPES[z.type], spd = zt.speed * 1.8;
      if (d < 0.75) { z.st = 1; P.hp -= zt.dmg * dt; P.hurt = 1.2; Snd.hurt && Snd.hurt(); if (P.hp <= 0) { killPlayer(); return; } continue; }
      z.st = 0;
      // step downhill on the distance field
      const tx = z.x | 0, ty = z.y | 0; let bi = -1, bv = c.field[ty * lay.w + tx];
      for (const [dx, dy] of N8) { const nx = tx + dx, ny = ty + dy; if (nx < 0 || ny < 0 || nx >= lay.w || ny >= lay.h) continue; const v = c.field[ny * lay.w + nx]; if (v < bv) { bv = v; bi = ny * lay.w + nx; } }
      let gx = c.p.x, gy = c.p.y; if (bi >= 0 && c.field[ty * lay.w + tx] > 1) { gx = (bi % lay.w) + 0.5; gy = ((bi / lay.w) | 0) + 0.5; }
      const dx = gx - z.x, dy = gy - z.y, dd = Math.hypot(dx, dy) || 1, s = spd * dt;
      const nx = z.x + dx / dd * s, ny = z.y + dy / dd * s;
      if (!solidAt(lay, nx, z.y)) z.x = nx; if (!solidAt(lay, z.x, ny)) z.y = ny; z.face = dx >= 0 ? 1 : -1;
      for (const o of c.zs) { if (o === z || o.hp <= 0) continue; const ox = z.x - o.x, oy = z.y - o.y, q = ox * ox + oy * oy; if (q < 0.16 && q > 0.0001) { const f = (0.4 - Math.sqrt(q)) * 2 * dt; const sx = z.x + ox * f, sy = z.y + oy * f; if (!solidAt(lay, sx, z.y)) z.x = sx; if (!solidAt(lay, z.x, sy)) z.y = sy; } }
    }
    // the crowd outside pours in through a door they are packed against
    c.sT = (c.sT || 0) - dt;
    if (c.sT <= 0) {
      c.sT = 2.5;
      for (let i = 0; i < lay.exits.length; i++) {
        const e = lay.exits[i]; let n = 0; for (const z of zombies) { if (z.hp > 0 && z.mode !== 0 && (z.x - e.out.x) ** 2 + (z.y - e.out.y) ** 2 < 6.5) { if (++n >= 3) break; } }
        if (n >= 3 && c.streamed < 8) { c.streamed++; const z = makeZombie(e.cx + 0.5, e.cy + 0.5, 1, 0, 'walker'); z.mode = 1; c.zs.push(z); if (c.streamed === 1) toast('The dead are coming in through the ' + { S: 'front', N: 'back', W: 'west', E: 'east' }[e.side] + ' door! Use another way out.'); }
      }
    }
    // interacting
    const ePress = keys.e && !P.ePrev; P.ePrev = !!keys.e;
    prompt(c);
    if (ePress && I.prompt && !Loot.isOpen()) {
      if (I.prompt.kind === 'exit') { I.exit(I.prompt.i); return; }
      if (I.prompt.kind === 'cont') {
        const idx = I.prompt.i, items = b.cont[idx], kind = lay.cont[idx].kind;
        c.opened++; if (G.intro) G.intro.opened = true;
        Loot.open('You search the ' + NAMEOF[kind], items.map(e => ({ ...e })), { keep: left => { b.cont[idx] = left; }, then: () => { b.cont[idx] = []; } });
        if (b.cont.every(a => !a.length)) b.looted = true;
        addHeat(0.2);
      }
    }
    if (b.cont && b.cont.every(a => !a.length) && !b.looted) b.looted = true;
  };
  const FIGHT_OK = ['combat', 'orders'];

  // ---- drawing ------------------------------------------------------------------------------------------------------------------
  const FLOOR = { house: ['#6a5238', '#76593c'], store: ['#5a5e60', '#646a6c'], garage: ['#4a4c50', '#54565a'], warehouse: ['#50504a', '#5a5a52'], police: ['#4a5260', '#545c6a'], pharmacy: ['#6a7478', '#747e82'], bunker: ['#3e4640', '#48504a'] };
  const CONTC = { cabinet: '#7a5a34', fridge: '#d8dcd8', drawer: '#8a6a40', wardrobe: '#6a4a2c', shelf: '#7a6a4a', register: '#4a5058', toolbox: '#b02a2a', tires: '#26262a', crate: '#8a6a3a', pallet: '#9a7a4a', medcab: '#e8ece8', locker: '#5a6a7a', safe: '#3a3e44', scrap: '#6a655a', sack: '#c8b88a' };
  I.render = function (realDt) {
    const c = I.cur; if (!c) return;
    const { lay, b } = c, z = G.cam.zoom * dpr, cw = canvas.width, ch = canvas.height;
    I.fade = Math.max(0, I.fade - realDt);
    // camera: the whole room if it fits, otherwise follow the player
    const vw = cw / z / T, vh = ch / z / T;
    G.cam.x = lay.w <= vw ? lay.w / 2 : clamp(c.p.x, vw / 2, lay.w - vw / 2); G.cam.y = lay.h <= vh ? lay.h / 2 : clamp(c.p.y, vh / 2, lay.h - vh / 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#05070a'; ctx.fillRect(0, 0, cw, ch);
    ctx.setTransform(z, 0, 0, z, cw / 2 - G.cam.x * T * z, ch / 2 - G.cam.y * T * z); ctx.imageSmoothingEnabled = false;
    const fl = FLOOR[b.type] || FLOOR.house, t0 = G.time || 0;
    for (let y = 0; y < lay.h; y++) for (let x = 0; x < lay.w; x++) {
      const v = lay.t[y * lay.w + x], px = x * T, py = y * T;
      if (v === WALL) { ctx.fillStyle = '#2a2622'; ctx.fillRect(px, py, T, T); ctx.fillStyle = '#4a443c'; ctx.fillRect(px, py, T, 4); ctx.fillStyle = '#1a1714'; ctx.fillRect(px, py + T - 3, T, 3); if ((x + y) % 3 === 0) { ctx.fillStyle = '#3a342c'; ctx.fillRect(px + 3, py + 6, 4, 3); } continue; }
      ctx.fillStyle = fl[(x + y) & 1]; ctx.fillRect(px, py, T, T);
      if (b.type === 'house' || b.type === 'police') { ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(px, py + 5, T, 1); ctx.fillRect(px, py + 11, T, 1); }
      if (v === DOOR) { ctx.fillStyle = '#3a2a18'; ctx.fillRect(px, py, T, T); ctx.fillStyle = '#e8c860'; ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t0 * 4); ctx.fillRect(px + 2, py + 2, T - 4, T - 4); ctx.globalAlpha = 1; }
    }
    for (const f of lay.furn) { const px = f.x * T, py = f.y * T; ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(px + 1, py + 11, T, 4); if (f.kind === 'bed') { ctx.fillStyle = '#4a5a7a'; ctx.fillRect(px + 1, py + 3, T - 2, 11); ctx.fillStyle = '#e8e0d0'; ctx.fillRect(px + 2, py + 4, 5, 4); } else if (f.kind === 'shelf') { ctx.fillStyle = '#5a4a30'; ctx.fillRect(px + 1, py + 2, T - 2, 12); ctx.fillStyle = '#8a7a58'; ctx.fillRect(px + 1, py + 2, T - 2, 2); } else { ctx.fillStyle = '#7a5a34'; ctx.fillRect(px + 1, py + 4, T - 2, 9); ctx.fillStyle = '#9a7444'; ctx.fillRect(px + 1, py + 4, T - 2, 2); } }
    for (let i = 0; i < lay.cont.length; i++) {
      const k = lay.cont[i], items = b.cont[i], px = k.x * T, py = k.y * T, col = CONTC[k.kind] || '#8a6a3a', has = items.length > 0;
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(px + 1, py + 11, T, 4);
      ctx.fillStyle = col; ctx.fillRect(px + 1, py + 2, T - 2, 12); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(px + 1, py + 2, T - 2, 2); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(px + 1, py + 13, T - 2, 1);
      if (has) { ctx.globalAlpha = 0.5 + 0.35 * Math.sin(t0 * 5 + i); ctx.fillStyle = '#ffe27a'; ctx.fillRect(px + 6, py + 5, 4, 4); ctx.globalAlpha = 1; } else { ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(px + 1, py + 2, T - 2, 12); }
    }
    // people and the dead, back to front
    const ents = [...c.zs.filter(q => q.hp > 0), P]; ents.sort((a, d) => (a === P ? c.p.y : a.y) - (d === P ? c.p.y : d.y));
    for (const o of ents) {
      if (o === P) {
        const sx = P.px, sy = P.py; P.px = c.p.x; P.py = c.p.y;
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(Math.round(P.px * T - 5), Math.round(P.py * T - 1), 10, 3);
        drawUnit(P, P.px, P.py + 0.1, P.face, 0); Weapons.drawHeld(ctx, P);
        if (P.hp < PLAYER.hp) { ctx.fillStyle = '#000a'; ctx.fillRect(P.px * T - 6, P.py * T - 26, 12, 2); ctx.fillStyle = '#e8524a'; ctx.fillRect(P.px * T - 6, P.py * T - 26, 12 * Math.max(0, P.hp) / PLAYER.hp, 2); }
        P.px = sx; P.py = sy;
      } else {
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(Math.round(o.x * T - 5), Math.round(o.y * T - 1), 10, 3);
        drawUnit(o, o.x, o.y + 0.1, o.face || 1, Math.sin(o.anim * 2) * 0.6);
        if (o.hit > 0) { ctx.globalAlpha = 0.5; ctx.fillStyle = '#fff'; ctx.fillRect(o.x * T - 4, o.y * T - 14, 8, 12); ctx.globalAlpha = 1; }
      }
    }
    // fire, effects
    for (const tr of tracers) { if (tr.life <= 0) continue; ctx.strokeStyle = tr.slash ? '#fff' : tr.ap ? '#8fd0ff' : '#ffe9a0'; ctx.lineWidth = tr.slash ? 1.4 : 1; ctx.globalAlpha = Math.min(1, tr.life * 12); ctx.beginPath(); ctx.moveTo(tr.x1 * T, tr.y1 * T); ctx.lineTo(tr.x2 * T, tr.y2 * T); ctx.stroke(); ctx.globalAlpha = 1; }
    for (const p of parts) { ctx.globalAlpha = clamp(p.life / p.max * 1.6, 0, 1); ctx.fillStyle = p.color; ctx.fillRect(p.x * T, p.y * T, p.size, p.size); }
    ctx.globalAlpha = 1;
    // darkness: only a pool of light round you
    const lx = c.p.x * T, ly = (c.p.y - 0.4) * T, g = ctx.createRadialGradient(lx, ly, T * 2, lx, ly, T * 9);
    g.addColorStop(0, 'rgba(4,6,10,0)'); g.addColorStop(1, 'rgba(4,6,10,0.92)'); ctx.fillStyle = g; ctx.fillRect(0, 0, lay.w * T, lay.h * T);
    for (const f of flashes) if (f.life > 0) { const fg = ctx.createRadialGradient(f.x * T, f.y * T, 0, f.x * T, f.y * T, T * 3.4); fg.addColorStop(0, 'rgba(255,220,140,.4)'); fg.addColorStop(1, 'rgba(255,220,140,0)'); ctx.fillStyle = fg; ctx.fillRect((f.x - 4) * T, (f.y - 4) * T, T * 8, T * 8); }
    for (let i = flashes.length - 1; i >= 0; i--) { flashes[i].life -= realDt; if (flashes[i].life <= 0) flashes.splice(i, 1); }
    // labels
    ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const tx of texts) { ctx.globalAlpha = clamp(tx.life, 0, 1); ctx.fillStyle = '#000'; ctx.fillText(tx.str, tx.x * T + 0.7, tx.y * T + 0.7); ctx.fillStyle = tx.color; ctx.fillText(tx.str, tx.x * T, tx.y * T); } ctx.globalAlpha = 1;
    for (const e of lay.exits) { ctx.fillStyle = 'rgba(255,230,160,.85)'; ctx.font = '6px monospace'; ctx.fillText({ S: 'FRONT', N: 'BACK', W: 'WEST', E: 'EAST' }[e.side], (e.cx + 0.5) * T, (e.cy + (e.side === 'N' ? 1.9 : e.side === 'S' ? -0.9 : 0.5)) * T); }
    if (I.prompt) { const p = I.prompt; ctx.font = '7px monospace'; const w = ctx.measureText(p.text).width + 8; ctx.fillStyle = '#000d'; ctx.fillRect(p.x * T - w / 2, p.y * T - 22, w, 11); ctx.strokeStyle = p.kind === 'none' ? '#8a8f98' : '#ffd27a'; ctx.lineWidth = 1; ctx.strokeRect(p.x * T - w / 2 + 0.5, p.y * T - 21.5, w - 1, 10); ctx.fillStyle = '#ffe9b0'; ctx.fillText(p.text, p.x * T, p.y * T - 16.5); }
    Combat.draw(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,' + (I.fade / 0.35) + ')'; ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = '12px monospace'; ctx.textAlign = 'left'; ctx.fillText(BUILDING_TYPES[b.type].label + (b.locked ? '' : '') + ' · ' + c.zs.filter(q => q.hp > 0).length + ' of the dead inside · ' + b.cont.filter(a => a.length).length + ' places left to search', 16, 70);
  };
  return I;
})();
