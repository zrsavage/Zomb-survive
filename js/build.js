'use strict';
/* build.js - nothing is built the instant you click. Every wall, tower, trap and facility is a blueprint: its supplies are
   set aside the moment you place it, and then it waits for hands. You (standing beside it), and any survivor who is free
   and has Build switched on, work it from a queue, highest priority first. There are always more things you want than
   hands to make them, so the order you put them in is the strategy. */
const Build = (() => {
  const B = {};
  const REACH = 2.4, PER = 2;                                        // how close a worker must be; most workers on one blueprint
  const TIME = { wall: 3.5, tower: 9, gate: 5, lookout: 8, radio: 24, outpost: 18, electrify: 4, reinforce: 6, spike: 2.5, barrel: 4 };
  const COLORS = { demolish: '#e0603a', wall: '#b58a52', tower: '#c8ccd2', gate: '#c8a050', lookout: '#8ad0a8', radio: '#e8e070', outpost: '#c89a62', electrify: '#7fd0ff', reinforce: '#a8a8a8', spike: '#d0d0d0', barrel: '#e8884a' };
  const PRIO = ['', 'Low', 'Normal', 'Urgent'];
  const list = () => G.blue || (G.blue = []);
  const labelOf = tool => { const t = TOOLS.find(x => x.id === tool); return t ? t.label : tool; };
  const timeOf = (tool, i) => TIME[tool] ? TIME[tool] + (tool === 'reinforce' ? 3 * wallTier[i] : 0) : FACILITIES[tool] ? clamp(FACILITIES[tool].cost.m / 7, 8, 32) : 6;
  const NAMES = { m: 'wood & scrap', f: 'food', a: 'ammo', med: 'medicine', fuel: 'fuel', water: 'water' };
  const costText = c => Object.keys(c).filter(k => c[k]).map(k => c[k] + ' ' + (NAMES[k] || k)).join(', ') || 'free';
  B.at = (x, y) => list().find(b => b.x === x && b.y === y);
  B.has = () => list().length > 0;
  B.costText = costText; B.label = labelOf; B.PRIO = PRIO;
  B.shortText = c => {                                               // exactly what is missing
    const miss = []; for (const k in c) { const have = G[Items.RES[k].field] | 0; if (c[k] && have < c[k]) miss.push((c[k] - have) + ' more ' + NAMES[k] + ' (needs ' + c[k] + ', have ' + have + ')'); }
    return 'Not enough supplies: ' + (miss.join(', ') || costText(c));
  };

  // called by tryBuild once the supplies are paid: set the job down instead of building it
  B.defer = (tool, x, y, cost) => {
    if (G.completing) return false;
    const bp = { id: (G.blueId = (G.blueId || 0) + 1), tool, x, y, cost: { ...cost }, work: timeOf(tool, y * W + x), prog: 0, prio: 2 };
    list().push(bp); Snd.click();
    B.pop = B.pop || { n: 0, cost: {}, t: 0 }; B.pop.n++; B.pop.t = 0.4; B.pop.x = x + 0.5; B.pop.y = y - 0.3;
    for (const k in cost) B.pop.cost[k] = (B.pop.cost[k] || 0) + cost[k];
    return true;
  };
  // pulling a building down: it takes time, leaves rubble and a pile of salvage, and the ground is free for walls, fields and beds
  B.demolish = b => {
    if (b.razed) return; if (b.nest) return warn('Clear the nest first'); if (b.crew) return warn('A crew is working there');
    if (B.at(b.x, b.y)) return warn('Already marked for demolition. Erase it to cancel.');
    const bp = { id: (G.blueId = (G.blueId || 0) + 1), tool: 'demolish', x: b.x, y: b.y, fw: b.w, fh: b.h, bi: buildings.indexOf(b), cost: {}, work: 5 + b.w * b.h * 0.9, prog: 0, prio: 2 };
    list().push(bp); Snd.click();
    floatText(b.x + b.w / 2, b.y - 0.3, 'demolish: ' + Math.ceil(bp.work) + 's of work', '#e8c070');
    if (G.sealed && b.claimed) toast('Careful: this building is part of your wall. Replace it with walls or the camp opens up.');
    if (!b.looted) toast('Unsearched: tearing it down still recovers part of what is inside.');
  };
  function razeDo(bp) {
    const b = buildings[bp.bi]; if (!b || b.razed) return;
    const ent = [{ r: 'm', n: Math.round(b.w * b.h * 2.4 * (0.8 + rng() * 0.4)) }];
    if (!b.looted) { const got = takeLoot(b, 0.7); for (const [k] of LOOT_KEYS) if (got[k]) ent.push({ r: k, n: got[k] }); }
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (inb(x, y) && bld[y * W + x] === bp.bi) bld[y * W + x] = -1;
    b.razed = true; b.looted = true; b.crew = false; b.locked = false;
    { const m = {}; for (const e of ent) if (e.r) m[e.r] = (m[e.r] || 0) + e.n; ent.length = 0; for (const k in m) ent.push({ r: k, n: m[k] }); }
    crates.push({ x: b.x + b.w / 2, y: b.y + b.h + 0.4, t: 900, type: 'pile', title: 'Salvage from the ' + BUILDING_TYPES[b.type].label.toLowerCase(), items: ent });
    Art.rebakeTerrain(); G.fieldDirty = true; computeBaseField(); computePlayerField(); computeTerritory();
    addBurst(b.x + b.w / 2, b.y + b.h / 2, '#8a8070', 26, { spread: 5, grav: 2, size: 2 }); Snd.demolish && Snd.demolish(); Snd.boom && Snd.boom(b.x + b.w / 2, b.y + b.h / 2); shake(1.2);
    investigate(b.x + b.w / 2, b.y + b.h / 2, NOISE.build * 2, false);
    log('The ' + BUILDING_TYPES[b.type].label.toLowerCase() + ' is down. The ground is clear and there is salvage in the rubble.');
  }
  B.cancel = bp => {
    const L = list(), k = L.indexOf(bp); if (k < 0) return;
    L.splice(k, 1);
    const f = 1 - bp.prog / bp.work, back = {};                      // you get back what was not yet worked into it
    for (const key in bp.cost) back[key] = Math.floor(bp.cost[key] * f);
    addRes(back); Snd.demolish && Snd.demolish();
    floatText(bp.x + 0.5, bp.y - 0.3, 'cancelled, +' + costText(back), '#9ab');
  };
  B.setPrio = (bp, p) => { bp.prio = clamp(p, 1, 3); };
  const built = bp => {
    if (bp.tool === 'demolish') return !!(buildings[bp.bi] && buildings[bp.bi].razed);
    const i = bp.y * W + bp.x;
    if (TOOL_KIND[bp.tool]) return wall[i] === TOOL_KIND[bp.tool];
    if (bp.tool === 'electrify') return !!elec[i];
    if (bp.tool === 'reinforce') return wallTier[i] > 0;
    if (bp.tool === 'spike' || bp.tool === 'barrel') return !!trapAt[i];
    return !!facAt[i];
  };
  function finish(bp) {
    list().splice(list().indexOf(bp), 1);
    if (bp.tool === 'demolish') razeDo(bp);
    else { const tool = G.tool; G.completing = true; G.tool = bp.tool;
      try { tryBuild(bp.x, bp.y); } finally { G.completing = false; G.tool = tool; } }
    if (built(bp)) {
      G.fieldDirty = true; G.visT = 0; Snd.build(); floatText(bp.x + (bp.fw || 1) / 2, bp.y - 0.3, bp.tool === 'demolish' ? 'cleared' : labelOf(bp.tool) + ' done', '#9be09a');
      if (rings.length < 24) rings.push({ x: bp.x + 0.5, y: bp.y + 0.5, r: NOISE.build, t: 0, max: 0.6 });
    } else { addRes(bp.cost); log('Could not build the ' + labelOf(bp.tool).toLowerCase() + ' at ' + bp.x + ',' + bp.y + ': the spot was taken. Supplies returned.'); }
  }
  const dist = (bp, px, py) => {                                       // distance to the blueprint; a building being pulled down is a whole footprint
    if (bp.fw) { const dx = Math.max(bp.x - px, 0, px - (bp.x + bp.fw)), dy = Math.max(bp.y - py, 0, py - (bp.y + bp.fh)); return Math.hypot(dx, dy); }
    return Math.hypot(bp.x + 0.5 - px, bp.y + 0.5 - py);
  };
  const standAt = bp => bp.fw ? [bp.x + bp.fw / 2, bp.y + bp.fh + 0.7] : [bp.x + 0.5, bp.y + 0.5];
  const order = (a, b) => b.prio - a.prio || a.id - b.id;

  B.update = dt => {
    if (B.pop && B.pop.n && (B.pop.t -= dt) <= 0) { floatText(B.pop.x, B.pop.y, '-' + costText(B.pop.cost) + (B.pop.n > 1 ? ' (' + B.pop.n + ' planned)' : ''), '#e8c070'); B.pop = { n: 0, cost: {}, t: 0 }; }
    const L = list(); if (!L.length) { B.idle = 0; return; }
    const crew = new Set(); for (const c of G.crews) for (const s of c.members) crew.add(s.id);
    const work = new Map(); let hands = 0, busy = 0;
    const add = (bp, r) => { work.set(bp, (work.get(bp) || 0) + r); };
    // you: stand beside it and keep still (the bot may keep walking)
    B.you = null;
    if (P.dead <= 0 && !P.travel && (AI.on ? true : (!P.moving && !Combat.down))) {
      const near = L.filter(b => dist(b, P.px, P.py) <= REACH).sort((a, b) => order(a, b) || dist(a, P.px, P.py) - dist(b, P.px, P.py))[0];
      if (near) { add(near, 1); B.you = near; P.stab = Math.max(P.stab || 0, 0.12); P.face = near.x + 0.5 >= P.px ? 1 : -1; }
    }
    // everyone else who is free and willing
    const alarm = Units.alarm(), counts = new Map();
    for (const u of Units.all()) {
      const s = u.s; u.working = false; if (crew.has(s.id) || !G.idle.includes(s)) continue;
      const w = Units.workOf(s); hands++;
      let bp = u.bpId && L.find(b => b.id === u.bpId);
      if (!w.build || alarm || s.sick > 0 || u.manual > 0 || u.order && !u.order.build) { u.bpId = 0; if (u.order && u.order.build) Units.cancel(u); continue; }
      if (!bp || (counts.get(bp) || 0) >= PER) {
        bp = null; let bs = -1e9;
        for (const b of L) { if ((counts.get(b) || 0) >= PER) continue; const sc = b.prio * 100 - dist(b, u.px, u.py); if (sc > bs) { bs = sc; bp = b; } }
        u.bpId = bp ? bp.id : 0;
      }
      if (!bp) continue;
      counts.set(bp, (counts.get(bp) || 0) + 1);
      if (dist(bp, u.px, u.py) <= REACH - 0.5) { add(bp, (s.role === 'builder' ? 1.6 : 0.8) * skillMul(s, 'build')); busy++; u.st = 'stab'; u.stab = 0.12; u.working = true; u.face = bp.x + 0.5 >= u.px ? 1 : -1; u.moving = false; }
      else if (!u.order) { const [sx, sy] = standAt(bp); Units.moveTo(u, sx, sy); u.order.build = true; }
    }
    B.hands = hands + 1; B.busy = busy + (B.you ? 1 : 0);
    if (!AI.on && !G.intro) { B.idle = (B.idle || 0) + (B.busy ? -B.idle : dt); if (B.idle > 14) { B.idle = -30; toast('Planned builds are waiting for hands. Stand next to them and hold still (J: build queue).'); } }
    for (const [bp, r] of work) {
      bp.prog += r * dt; bp.w = r; bp.tick = (bp.tick || 0) - dt;
      if (bp.tick <= 0) { bp.tick = 1.1; Snd.tick(); investigate(bp.x + 0.5, bp.y + 0.5, NOISE.build, false); }
      if (bp.prog >= bp.work) finish(bp);
    }
    for (const b of L) if (!work.has(b)) b.w = 0;
  };

  B.draw = ctx => {
    const L = list(); if (!L.length || !G) return;
    const t = G.time || 0;
    for (const bp of L) {
      const bw = (bp.fw || 1) * T, bh = (bp.fh || 1) * T, px = bp.x * T, py = bp.y * T, k = bp.prog / bp.work, col = COLORS[bp.tool] || '#cfd4d8';
      ctx.globalAlpha = 0.28; ctx.fillStyle = col; ctx.fillRect(px, py, bw, bh);
      ctx.globalAlpha = 0.55 + 0.2 * k; ctx.fillRect(px, py + bh * (1 - k), bw, bh * k); ctx.globalAlpha = 1;      // fills from the ground up as it is worked
      ctx.strokeStyle = bp.w ? '#fff' : col; ctx.lineWidth = 1; ctx.setLineDash([3, 2]); ctx.lineDashOffset = -t * 6; ctx.strokeRect(px + 0.5, py + 0.5, bw - 1, bh - 1); ctx.setLineDash([]);
      ctx.fillStyle = '#000b'; ctx.fillRect(px - 1, py + bh + 1, bw + 2, 3); ctx.fillStyle = bp.w ? '#ffe27a' : '#8a8f98'; ctx.fillRect(px, py + bh + 2, bw * k, 1);
      if (bp.prio !== 2) { ctx.fillStyle = bp.prio === 3 ? '#ff6a4a' : '#8ab0d8'; ctx.font = '8px monospace'; ctx.fillText(bp.prio === 3 ? '!!' : 'v', px + 2, py - 2); }
      if (bp.w && (t * 8 | 0) % 3 === 0) { ctx.fillStyle = '#ffe9a0'; ctx.fillRect(px + 4 + (t * 37 % 8), py + 2 + (t * 23 % 6), 1.5, 1.5); }
    }
    if (G.hover) {                                                    // name what you are pointing at
      const bp = B.at(G.hover.tx, G.hover.ty);
      if (bp) {
        const s = labelOf(bp.tool) + ' · ' + PRIO[bp.prio] + ' · ' + Math.round(bp.prog / bp.work * 100) + '%' + (bp.w ? '' : ' · needs a builder'), px = (bp.x + 0.5) * T, py = bp.y * T - 8;
        ctx.font = '6px monospace'; const w = ctx.measureText(s).width + 8; ctx.fillStyle = '#000d'; ctx.fillRect(px - w / 2, py - 5, w, 9); ctx.fillStyle = '#ffe9b0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s, px, py - 0.5); ctx.textAlign = 'left';
      }
    }
  };
  B.workLeft = () => list().reduce((a, b) => a + (b.work - b.prog), 0);
  return B;
})();
