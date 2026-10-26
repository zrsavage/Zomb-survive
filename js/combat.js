'use strict';
/* combat.js - the survivor you drive fights by hand. Aim with the mouse, hold the left button to fire, R to reload,
   right-click (or F) to swing at whatever is close. Every shot is a real shot: it can miss, it makes noise, and the
   magazine runs dry. The posted defenders still shoot for themselves. */
const Combat = (() => {
  const C = { mouse: { x: 0, y: 0 }, down: false, aimX: 0, aimY: 0, over: null, ptype: 'mouse' };
  // Pistol: yours from the start. Homemade: built at camp (research), decent but crude. Machine pistol, assault rifle and
  // marksman rifle are real military guns: they can only be FOUND, never built.
  const owns = id => !!(P.guns && P.guns[id]);
  const WEAPONS = {
    pistol:  { label: 'Pistol',           mag: 12, reload: 1.5, cd: 0.27,  spread: 0.028, move: 0.06, bloom: 0.016, bloomMax: 0.09, range: 10, dmg: 1,    pen: 1, heat: 1,   sniper: false, headR: 0.15, headX: 1.9, have: () => true },
    carbine: { label: 'Homemade carbine', mag: 8,  reload: 2.0, cd: 0.45,  spread: 0.024, move: 0.07, bloom: 0.02,  bloomMax: 0.1,  range: 12, dmg: 1.7,  pen: 1, heat: 1,   sniper: false, headR: 0.16, headX: 1.7, have: () => has('homemade') },
    hauto:   { label: 'Homemade auto',    mag: 16, reload: 2.4, cd: 0.16,  spread: 0.06,  move: 0.11, bloom: 0.016, bloomMax: 0.15, range: 8,  dmg: 0.7,  pen: 1, heat: 0.8, sniper: false, headR: 0.12, headX: 1.4, have: () => has('homemade2') },
    smg:     { label: 'Machine pistol',   mag: 24, reload: 2.0, cd: 0.085, spread: 0.05,  move: 0.1,  bloom: 0.012, bloomMax: 0.14, range: 9,  dmg: 0.5,  pen: 1, heat: 0.6, sniper: false, headR: 0.12, headX: 1.5, have: () => owns('smg') },
    assault: { label: 'Assault rifle',    mag: 30, reload: 2.2, cd: 0.115, spread: 0.022, move: 0.07, bloom: 0.012, bloomMax: 0.09, range: 14, dmg: 0.82, pen: 1, heat: 0.75, sniper: false, headR: 0.14, headX: 1.8, have: () => owns('assault') },
    rifle:   { label: 'Marksman rifle',   mag: 6,  reload: 2.3, cd: 0.7,   spread: 0.006, move: 0.05, bloom: 0.02,  bloomMax: 0.06, range: 20, dmg: 2.7,  pen: 3, heat: 1,   sniper: true,  headR: 0.2,  headX: 2.2, have: () => owns('rifle') },
  };
  const unlocked = () => Object.keys(WEAPONS).filter(k => WEAPONS[k].have());
  const wid = () => (P.weapon && unlocked().includes(P.weapon)) ? P.weapon : 'pistol';
  const WP = () => WEAPONS[wid()];
  C.weapon = wid; C.unlocked = unlocked; C.WP = WP;
  C.swap = function () {
    const u = unlocked(); if (u.length < 2) { toast('Only a pistol so far. Better guns are found out in the ruins, or built crudely (research).'); return; }
    P.mags = P.mags || {}; P.mags[wid()] = P.mag;
    P.weapon = u[(u.indexOf(wid()) + 1) % u.length]; P.reloadT = 0;
    P.mag = P.mags[P.weapon] !== undefined ? P.mags[P.weapon] : WP().mag;
    toast(WP().label + ' (' + P.mag + ' loaded)'); Snd.click && Snd.click();
  };
  const BODY = 0.5, ZB = 0.45;                                       // guns and the dead are judged at chest height, not at the feet
  const MEL = { reach: 1.95, arc: 0.75, cd: 0.42, sta: 9, shove: 0.45 };

  // where the fight is happening: the street, or the inside of a building
  const OUT = {
    pos: () => ({ x: P.px, y: P.py }), zs: () => zombies,
    blocked: (x, y) => !inb(x | 0, y | 0) || bld[(y | 0) * W + (x | 0)] >= 0 || isCoreTile(x | 0, y | 0),
    noise: (r, sniper) => { alertNoise(P.px, P.py, r, 3); if (rings.length < 24) rings.push({ x: P.px, y: P.py, r, t: 0, max: NOISE.ring }); },
  };
  const WLD = () => (P.inside && Interior.active()) ? Interior.world : OUT;
  const manual = () => !AI.on && G.tool === 'combat' && !UI.menuOpen();
  C.manual = manual;
  function aim() {                                                  // the mouse, in tiles
    const pp = WLD().pos();
    const z = G.cam.zoom;
    C.aimX = (C.mouse.x - innerWidth / 2) / z / T + G.cam.x; C.aimY = (C.mouse.y - innerHeight / 2) / z / T + G.cam.y;
    const dx = C.aimX - pp.x, dy = C.aimY - (pp.y - BODY), d = Math.hypot(dx, dy) || 1;
    return { dx: dx / d, dy: dy / d, d };
  }
  const mdir = () => { aim(); const pp = WLD().pos(), dx = C.aimX - pp.x, dy = C.aimY + BODY - pp.y, d = Math.hypot(dx, dy) || 1; return { dx: dx / d, dy: dy / d, d }; };
  const radiusOf = z => z.type === 'brute' || z.type === 'tyrant' ? 0.72 : z.type === 'bloater' ? 0.62 : 0.4;

  function startReload() {
    if (P.reloadT > 0 || P.mag >= WP().mag || G.ammo < 1) return;
    P.reloadT = WP().reload; Snd.click && Snd.click();
  }
  C.reload = startReload;
  function finishReload() { const take = Math.min(WP().mag - P.mag, Math.floor(G.ammo)); G.ammo -= take; P.mag += take; }

  function shoot(a) {
    const pp = WLD().pos(), zs = WLD().zs(), wd = WLD();
    const w = WP();
    if (P.mag < 1) { if (G.ammo >= 1) startReload(); else if (P.emptyT <= 0) { P.emptyT = 0.5; floatText(pp.x, pp.y - 1.2, 'NO AMMO', '#e8524a'); Snd.error && Snd.error(); } return; }
    P.cd = w.cd * (has('rapid') ? 0.85 : 1); P.mag--;
    const sp = w.spread + (P.moving ? w.move : 0) + P.bloom;
    P.bloom = Math.min(w.bloomMax, P.bloom + w.bloom);
    let ang0 = Math.atan2(a.dy, a.dx);
    {                                                                // a little help: a round that would pass close to a body is drawn toward it
      const cx0 = pp.x, cy0 = pp.y - BODY; let best = 0.95, diff = null;
      for (const z of zs) {
        if (z.hp <= 0) continue; const rx = z.x - cx0, ry = (z.y - ZB) - cy0, t = rx * Math.cos(ang0) + ry * Math.sin(ang0);
        if (t < 0.3 || t > w.range) continue; const perp = rx * Math.sin(ang0) - ry * Math.cos(ang0);
        if (Math.abs(perp) < best) { best = Math.abs(perp); diff = Math.atan2(ry, rx) - ang0; }
      }
      if (diff !== null) { diff = Math.atan2(Math.sin(diff), Math.cos(diff)); ang0 += diff * 0.6; }
    }
    const ang = ang0 + (rng() + rng() - 1) * sp, dx = Math.cos(ang), dy = Math.sin(ang);
    const ox = pp.x + dx * 0.35, oy = (pp.y - BODY) + dy * 0.35;
    // how far the round flies: stops at buildings
    let reach = w.range;
    for (let s = 0.4; s < w.range; s += 0.3) { const x = ox + dx * s, y = oy + dy * s; if (wd.blocked(x, y + BODY)) { reach = s; break; } }
    const hits = [];
    for (const z of zs) {
      if (z.hp <= 0) continue;
      const rx = z.x - ox, ry = (z.y - ZB) - oy, t = rx * dx + ry * dy;
      if (t < 0 || t > reach) continue;
      const perp = Math.abs(rx * dy - ry * dx);
      if (perp < radiusOf(z)) hits.push({ z, t, perp });
    }
    hits.sort((p, q) => p.t - q.t);
    const n = Math.min(w.pen, hits.length), bt = n === w.pen ? hits[n - 1].t : reach;
    const ex = ox + dx * bt, ey = oy + dy * bt;
    tracers.push({ x1: pp.x + dx * 0.5, y1: pp.y - 0.5, x2: ex, y2: ey, life: w.sniper ? 0.16 : 0.09, ap: w.sniper });
    if (flashes.length < 40) flashes.push({ x: pp.x + dx * 0.6, y: pp.y - 0.5, life: 0.09 });
    Snd.shot(pp.x, pp.y, w.sniper); addHeat(HEAT.gun * w.heat); shake(w.sniper ? 1 : 0.5 * Math.min(1, w.heat + 0.3));
    P.face = dx >= 0 ? 1 : -1; P.st = 'shoot'; P.aimA = ang; P.aimT = 0.7; P.shot = 0.09;
    if (parts.length < Q.parts) parts.push({ x: pp.x, y: pp.y - 0.5, vx: -P.face * (0.8 + rng()), vy: -2 - rng(), life: 0.7, max: 0.7, color: '#d8b860', size: 1, grav: 9 });
    for (let k = 0; k < n; k++) {
      const { z, perp } = hits[k];
      const head = perp < w.headR && ZTYPES[z.type].boss !== true;
      const dm = GUN.dmg * w.dmg * (1 - 0.28 * k) * (has('ap') ? 1.3 : 1) * armorF(z) * (head ? w.headX : 1);
      z.hp -= dm; z.hit = 0.1; z.by = null; if (z.mode === 0 || z.mode === 3) { z.mode = 1; z.lose = 0; }
      addBurst(z.x, z.y - 0.4, head ? '#e8d870' : '#a02020', head ? 5 : 3, { grav: 3 });
      if (head) floatText(z.x, z.y - 1.1, 'HEADSHOT', '#ffe27a');
      Snd.hit && Snd.hit(z.x, z.y);
    }
    P.noiseT -= 0; if (P.noiseT <= 0) { P.noiseT = 0.6; wd.noise(gunRadius(w.sniper), w.sniper); }
  }

  function melee(a) {
    const pp = WLD().pos(), zs = WLD().zs();
    if (P.mcd > 0 || P.dead > 0) return;
    a = a || mdir();
    const wp = MW[P.mw && MW[P.mw] ? P.mw : 'knife'], reach = Math.max(MEL.reach, wp.reach + 0.35), cap = wp.pierce >= 2 ? 4 : 3;
    P.mcd = MEL.cd * wp.cd * (P.tired ? STAMINA.tiredCd : 1); P.stab = 0.2; P.face = a.dx >= 0 ? 1 : -1; P.aimA = Math.atan2(a.dy, a.dx); P.aimT = 0.4;
    P.sta = Math.max(0, P.sta - MEL.sta * wp.sta); if (P.sta <= 0) P.tired = true;
    const ang = Math.atan2(a.dy, a.dx); let hit = 0;
    const dm = MELEE.dmg * 1.15 * wp.dmg * (P.tired ? STAMINA.tiredDmg : 1) * (has('hands') ? 1.35 : 1);
    for (const z of zs) {
      if (z.hp <= 0 || hit >= cap) continue;
      const rx = z.x - pp.x, ry = z.y - pp.y, d = Math.hypot(rx, ry);
      if (d > reach + radiusOf(z) * 0.5) continue;
      let da = Math.atan2(ry, rx) - ang; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > (wp.reach >= 2.5 ? 0.35 : MEL.arc)) continue;
      z.hp -= dm; z.hit = 0.12; z.by = null; hit++;
      if (z.mode === 0 || z.mode === 3) { z.mode = 1; z.lose = 0; }
      const kx = z.x + rx / (d || 1) * MEL.shove, ky = z.y + ry / (d || 1) * MEL.shove; if (free2(kx, ky)) { z.x = kx; z.y = ky; }            // a shove that buys a moment
      addBurst(z.x, z.y - 0.3, '#9ad06a', 3); tracers.push({ x1: z.x - 0.25, y1: z.y - 0.5, x2: z.x + 0.25, y2: z.y - 0.1, life: 0.12, slash: true });
    }
    Snd.stab(pp.x + a.dx, pp.y + a.dy); if (!hit) tracers.push({ x1: pp.x + a.dx * 0.5, y1: pp.y - 0.5 + a.dy * 0.3, x2: pp.x + a.dx * (wp.reach + 0.2), y2: pp.y - 0.5 + a.dy * 1.2, life: 0.1, slash: true });
  }
  const free2 = (x, y) => !WLD().blocked(x, y);
  C.melee = function (a) { if (P.mcd > 0 || P.dead > 0) return; C.swings = (C.swings || 0) + 1; melee(a); };

  C.update = function (dt) {
    if (P.mag === undefined) { P.mag = WP().mag; P.reloadT = 0; P.bloom = 0; P.sta = STAMINA.max; P.tired = false; P.emptyT = 0; P.mcd = 0; }
    P.cd -= dt; P.mcd -= dt; P.emptyT -= dt; P.shot -= dt; if (P.aimT > 0) P.aimT -= dt; P.bloom = Math.max(0, P.bloom - dt * 0.12);
    if (P.reloadT > 0) { P.reloadT -= dt; if (P.reloadT <= 0) finishReload(); }
    P.sta = Math.min(STAMINA.max, P.sta + (P.mcd > -0.5 ? 6 : 16) * dt); if (P.tired && P.sta >= STAMINA.recover) P.tired = false;
    if (P.dead > 0 || P.travel > 0) return;
    if (!manual()) return;
    const a = aim();
    if (P.stab <= 0) P.face = a.dx >= 0 ? 1 : -1;
    C.over = null; for (const z of WLD().zs()) if (z.hp > 0 && (z.x - C.aimX) ** 2 + ((z.y - ZB) - C.aimY) ** 2 < 0.55) { C.over = z; break; }
    C.near = null; { const pp = WLD().pos(); for (const z of WLD().zs()) if (z.hp > 0 && (z.x - pp.x) ** 2 + (z.y - pp.y) ** 2 < 5.8) { C.near = z; break; } }
    if ((C.mdown || keys.f) && P.mcd <= 0 && P.dead <= 0) C.melee();
    if (C.down && P.cd <= 0 && P.reloadT <= 0) shoot(a);
  };

  C.draw = function (ctx) {                                         // the sight, drawn in the world
    const pp = WLD().pos();
    if (!G || !manual() || P.dead > 0) return;
    const w = WP(), a = aim(), sp = w.spread + (P.moving ? w.move : 0) + (P.bloom || 0), dist = Math.min(a.d, w.range), r = Math.max(3, Math.tan(sp) * dist * T);
    const px = pp.x * T, py = (pp.y - 0.45) * T, ax = C.aimX * T, ay = C.aimY * T, hot = !!C.over;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + a.dx * dist * T, py + a.dy * dist * T); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = hot ? '#ff5a48' : '#ffffffcc'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(ax, ay, r + 2, 0, 6.283); ctx.stroke();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.beginPath(); ctx.moveTo(ax + dx * (r + 2), ay + dy * (r + 2)); ctx.lineTo(ax + dx * (r + 6), ay + dy * (r + 6)); ctx.stroke(); }
    ctx.fillStyle = hot ? '#ff5a48' : '#fff'; ctx.fillRect(ax - 0.5, ay - 0.5, 1.5, 1.5);
    // magazine, reload ring and what the sight is on
    ctx.font = '7px monospace'; ctx.textBaseline = 'middle';
    const lowMag = P.mag <= 3;
    if (P.reloadT > 0) { ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ax, ay, r + 9, -1.57, -1.57 + 6.283 * (1 - P.reloadT / w.reload)); ctx.stroke(); ctx.fillStyle = '#ffd27a'; ctx.fillText('RELOAD', ax + r + 12, ay); }
    else { ctx.fillStyle = P.mag < 1 ? '#ff5a48' : lowMag ? '#ffd27a' : '#e8efe4'; ctx.fillText(w.label + ' ' + P.mag + ' / ' + (G.ammo | 0), ax + r + 10, ay - 9); if (P.mag < 1) ctx.fillText(G.ammo >= 1 ? 'R to reload' : 'out of ammo', ax + r + 10, ay); }
    if (unlocked().length > 1) { ctx.fillStyle = '#8fa890'; ctx.fillText('Q: switch gun', ax + r + 10, ay + 15); }
    if (hot) { Weapons.drawTarget(ctx, C.over); const z = C.over; ctx.fillStyle = '#ffd7d0'; ctx.fillText(ZTYPES[z.type].label + ' ' + Math.ceil(z.hp), ax + r + 10, ay + (P.mag < 1 ? 10 : 5)); }
    if (C.near && (C.swings || 0) < 4 && P.mcd <= 0) {                                   // a dead one is close: say how to hit it
      const t = 'RIGHT-CLICK or F: swing at it', px2 = pp.x * T, py2 = (pp.y - 1.8) * T; ctx.font = '7px monospace'; const ww = ctx.measureText(t).width + 8;
      ctx.fillStyle = '#000d'; ctx.fillRect(px2 - ww / 2, py2 - 6, ww, 11); ctx.strokeStyle = '#ffe9b0'; ctx.lineWidth = 1; ctx.strokeRect(px2 - ww / 2 + 0.5, py2 - 5.5, ww - 1, 10);
      ctx.fillStyle = '#ffe9b0'; ctx.textAlign = 'center'; ctx.fillText(t, px2, py2 - 0.5); ctx.textAlign = 'left';
    }
    ctx.restore();
  };
  return C;
})();
