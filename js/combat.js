'use strict';
/* combat.js - the survivor you drive fights by hand. Aim with the mouse, hold the left button to fire, R to reload,
   right-click (or F) to swing at whatever is close. Every shot is a real shot: it can miss, it makes noise, and the
   magazine runs dry. The posted defenders still shoot for themselves. */
const Combat = (() => {
  const C = { mouse: { x: 0, y: 0 }, down: false, aimX: 0, aimY: 0, over: null, ptype: 'mouse' };
  const GP = { mag: 12, reload: 1.5, cd: 0.27, spread: 0.028, moveSpread: 0.06, bloomPer: 0.016, range: 10, headR: 0.15 };
  const MEL = { reach: 1.95, arc: 0.75, cd: 0.42, sta: 9, shove: 0.45 };

  const manual = () => !AI.on && G.tool === 'combat' && !UI.menuOpen();
  C.manual = manual;
  function aim() {                                                  // the mouse, in tiles
    const z = G.cam.zoom;
    C.aimX = (C.mouse.x - innerWidth / 2) / z / T + G.cam.x; C.aimY = (C.mouse.y - innerHeight / 2) / z / T + G.cam.y;
    const dx = C.aimX - P.px, dy = C.aimY - P.py, d = Math.hypot(dx, dy) || 1;
    return { dx: dx / d, dy: dy / d, d };
  }
  const radiusOf = z => z.type === 'brute' || z.type === 'tyrant' ? 0.72 : z.type === 'bloater' ? 0.62 : 0.4;

  function startReload() {
    if (P.reloadT > 0 || P.mag >= GP.mag || G.ammo < 1) return;
    P.reloadT = GP.reload; Snd.click && Snd.click();
  }
  C.reload = startReload;
  function finishReload() { const take = Math.min(GP.mag - P.mag, Math.floor(G.ammo)); G.ammo -= take; P.mag += take; }

  function shoot(a) {
    if (P.mag < 1) { if (G.ammo >= 1) startReload(); else if (P.emptyT <= 0) { P.emptyT = 0.5; floatText(P.px, P.py - 1.2, 'NO AMMO', '#e8524a'); Snd.error && Snd.error(); } return; }
    P.cd = GP.cd; P.mag--;
    const sp = GP.spread + (P.moving ? GP.moveSpread : 0) + P.bloom;
    P.bloom = Math.min(0.09, P.bloom + GP.bloomPer);
    const ang = Math.atan2(a.dy, a.dx) + (rng() + rng() - 1) * sp, dx = Math.cos(ang), dy = Math.sin(ang);
    const ox = P.px + dx * 0.35, oy = P.py + dy * 0.35;
    // how far the round flies: stops at buildings
    let reach = GP.range;
    for (let s = 0.4; s < GP.range; s += 0.3) { const x = ox + dx * s, y = oy + dy * s; if (!inb(x | 0, y | 0)) { reach = s; break; } const b = bld[(y | 0) * W + (x | 0)]; if (b >= 0 || isCoreTile(x | 0, y | 0)) { reach = s; break; } }
    let best = null, bt = reach, bp = 1;
    for (const z of zombies) {
      if (z.hp <= 0) continue;
      const rx = z.x - ox, ry = z.y - oy, t = rx * dx + ry * dy;
      if (t < 0 || t > bt) continue;
      const perp = Math.abs(rx * dy - ry * dx);
      if (perp < radiusOf(z)) { best = z; bt = t; bp = perp; }
    }
    const ex = ox + dx * bt, ey = oy + dy * bt;
    tracers.push({ x1: P.px + dx * 0.5, y1: P.py - 0.5, x2: ex, y2: ey - 0.4, life: 0.09, ap: false });
    if (flashes.length < 40) flashes.push({ x: P.px + dx * 0.6, y: P.py - 0.5, life: 0.09 });
    Snd.shot(P.px, P.py, false); addHeat(HEAT.gun); shake(0.5);
    P.face = dx >= 0 ? 1 : -1; P.st = 'shoot'; P.aimA = ang; P.aimT = 0.7; P.shot = 0.09;
    if (parts.length < Q.parts) parts.push({ x: P.px, y: P.py - 0.5, vx: -P.face * (0.8 + rng()), vy: -2 - rng(), life: 0.7, max: 0.7, color: '#d8b860', size: 1, grav: 9 });
    if (best) {
      const head = bp < GP.headR && ZTYPES[best.type].boss !== true;
      const dm = GUN.dmg * (has('ap') ? 1.3 : 1) * armorF(best) * (head ? 1.9 : 1);
      best.hp -= dm; best.hit = 0.1; best.by = null; if (best.mode === 0 || best.mode === 3) { best.mode = 1; best.lose = 0; }
      addBurst(best.x, best.y - 0.4, head ? '#e8d870' : '#a02020', head ? 5 : 3, { grav: 3 });
      if (head) floatText(best.x, best.y - 1.1, 'HEADSHOT', '#ffe27a');
      Snd.hit && Snd.hit(best.x, best.y);
    }
    P.noiseT -= 0; if (P.noiseT <= 0) { P.noiseT = 0.6; alertNoise(P.px, P.py, gunRadius(false), 3); if (rings.length < 24) rings.push({ x: P.px, y: P.py, r: gunRadius(false), t: 0, max: NOISE.ring }); }
  }

  function melee(a) {
    if (P.mcd > 0 || P.dead > 0) return;
    a = a || aim();
    P.mcd = MEL.cd * (P.tired ? STAMINA.tiredCd : 1); P.stab = 0.2; P.face = a.dx >= 0 ? 1 : -1; P.aimA = Math.atan2(a.dy, a.dx); P.aimT = 0.4;
    P.sta = Math.max(0, P.sta - MEL.sta); if (P.sta <= 0) P.tired = true;
    const ang = Math.atan2(a.dy, a.dx); let hit = 0;
    const dm = MELEE.dmg * 1.15 * (P.tired ? STAMINA.tiredDmg : 1) * (has('hands') ? 1.35 : 1);
    for (const z of zombies) {
      if (z.hp <= 0 || hit >= 3) continue;
      const rx = z.x - P.px, ry = z.y - P.py, d = Math.hypot(rx, ry);
      if (d > MEL.reach + radiusOf(z) * 0.5) continue;
      let da = Math.atan2(ry, rx) - ang; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > MEL.arc) continue;
      z.hp -= dm; z.hit = 0.12; z.by = null; hit++;
      if (z.mode === 0 || z.mode === 3) { z.mode = 1; z.lose = 0; }
      const kx = z.x + rx / (d || 1) * MEL.shove, ky = z.y + ry / (d || 1) * MEL.shove; if (free2(kx, ky)) { z.x = kx; z.y = ky; }            // a shove that buys a moment
      addBurst(z.x, z.y - 0.3, '#9ad06a', 3); tracers.push({ x1: z.x - 0.25, y1: z.y - 0.5, x2: z.x + 0.25, y2: z.y - 0.1, life: 0.12, slash: true });
    }
    Snd.stab(P.px + a.dx, P.py + a.dy); if (!hit) tracers.push({ x1: P.px + a.dx * 0.5, y1: P.py - 0.5 + a.dy * 0.3, x2: P.px + a.dx * 1.8, y2: P.py - 0.5 + a.dy * 1.2, life: 0.1, slash: true });
  }
  const free2 = (x, y) => inb(x | 0, y | 0) && bld[(y | 0) * W + (x | 0)] < 0 && !isCoreTile(x | 0, y | 0);
  C.melee = melee;

  C.update = function (dt) {
    if (P.mag === undefined) { P.mag = GP.mag; P.reloadT = 0; P.bloom = 0; P.sta = STAMINA.max; P.tired = false; P.emptyT = 0; P.mcd = 0; }
    P.cd -= dt; P.mcd -= dt; P.emptyT -= dt; P.shot -= dt; if (P.aimT > 0) P.aimT -= dt; P.bloom = Math.max(0, P.bloom - dt * 0.12);
    if (P.reloadT > 0) { P.reloadT -= dt; if (P.reloadT <= 0) finishReload(); }
    P.sta = Math.min(STAMINA.max, P.sta + (P.mcd > -0.5 ? 6 : 16) * dt); if (P.tired && P.sta >= STAMINA.recover) P.tired = false;
    if (P.dead > 0 || P.travel > 0) return;
    if (!manual()) return;
    const a = aim();
    if (P.stab <= 0) P.face = a.dx >= 0 ? 1 : -1;
    C.over = null; for (const z of zombies) if (z.hp > 0 && (z.x - C.aimX) ** 2 + (z.y - C.aimY) ** 2 < 0.5) { C.over = z; break; }
    if (C.down && P.cd <= 0 && P.reloadT <= 0) shoot(a);
  };

  C.draw = function (ctx) {                                         // the sight, drawn in the world
    if (!G || !manual() || P.dead > 0) return;
    const a = aim(), sp = GP.spread + (P.moving ? GP.moveSpread : 0) + (P.bloom || 0), dist = Math.min(a.d, GP.range), r = Math.max(3, Math.tan(sp) * dist * T);
    const px = P.px * T, py = (P.py - 0.45) * T, ax = C.aimX * T, ay = C.aimY * T, hot = !!C.over;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + a.dx * dist * T, py + a.dy * dist * T); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = hot ? '#ff5a48' : '#ffffffcc'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(ax, ay, r + 2, 0, 6.283); ctx.stroke();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.beginPath(); ctx.moveTo(ax + dx * (r + 2), ay + dy * (r + 2)); ctx.lineTo(ax + dx * (r + 6), ay + dy * (r + 6)); ctx.stroke(); }
    ctx.fillStyle = hot ? '#ff5a48' : '#fff'; ctx.fillRect(ax - 0.5, ay - 0.5, 1.5, 1.5);
    // magazine, reload ring and what the sight is on
    ctx.font = '7px monospace'; ctx.textBaseline = 'middle';
    const lowMag = P.mag <= 3;
    if (P.reloadT > 0) { ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ax, ay, r + 9, -1.57, -1.57 + 6.283 * (1 - P.reloadT / GP.reload)); ctx.stroke(); ctx.fillStyle = '#ffd27a'; ctx.fillText('RELOAD', ax + r + 12, ay); }
    else { ctx.fillStyle = P.mag < 1 ? '#ff5a48' : lowMag ? '#ffd27a' : '#e8efe4'; ctx.fillText(P.mag + ' / ' + (G.ammo | 0), ax + r + 10, ay - 9); if (P.mag < 1) ctx.fillText(G.ammo >= 1 ? 'R to reload' : 'out of ammo', ax + r + 10, ay); }
    if (hot) { Weapons.drawTarget(ctx, C.over); const z = C.over; ctx.fillStyle = '#ffd7d0'; ctx.fillText(ZTYPES[z.type].label + ' ' + Math.ceil(z.hp), ax + r + 10, ay + (P.mag < 1 ? 10 : 5)); }
    ctx.restore();
  };
  return C;
})();
