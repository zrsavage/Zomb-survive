'use strict';
/* weapons.js - what people are holding. Pistol, rifle, knife and spear are small pixel sprites drawn in the hand and turned
   toward whatever they are aiming at, with a muzzle flash and a visible swing, so you can read who is shooting what.
   Also the markers that make loot and targets obvious. */
const Weapons = (() => {
  const W_ = {};
  const cache = {};
  function mk(name, w, h, rows) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
    for (const [c, x, y, ww, hh] of rows) { g.fillStyle = c; g.fillRect(x, y, ww, hh); }
    return (cache[name] = cv);
  }
  const R = (c, x, y, w, h) => [c, x, y, w, h];
  const SPR = {
    pistol: () => mk('pistol', 9, 6, [R('#1a1c20', 0, 1, 7, 2), R('#3a3f48', 0, 1, 7, 1), R('#8a909a', 1, 1, 5, 1), R('#1a1c20', 5, 3, 3, 3), R('#2a2d33', 5, 3, 2, 2), R('#101114', 7, 1, 2, 1), R('#5a3a1a', 4, 3, 2, 3)]),
    rifle: () => mk('rifle', 17, 5, [R('#1a1c20', 3, 1, 14, 2), R('#4a4f58', 3, 1, 14, 1), R('#5a3a1a', 0, 1, 5, 3), R('#7a5226', 0, 1, 5, 1), R('#101114', 9, 3, 2, 2), R('#2a8ad0', 7, 0, 3, 1), R('#8a909a', 12, 1, 5, 1)]),
    knife: () => mk('knife', 8, 3, [R('#3a2a1a', 0, 1, 3, 2), R('#d8dde2', 3, 0, 5, 2), R('#fff', 3, 0, 5, 1), R('#8a909a', 6, 1, 2, 1)]),
    spear: () => mk('spear', 22, 3, [R('#6a4a22', 0, 1, 17, 1), R('#8a6a3a', 0, 1, 17, 0), R('#c8ccd2', 17, 0, 5, 3), R('#fff', 17, 0, 5, 1), R('#e8e0c0', 15, 0, 2, 3)]),
    flash: () => mk('flash', 11, 9, [R('#fff6c0', 0, 4, 11, 1), R('#ffe27a', 1, 3, 9, 3), R('#ffb040', 3, 2, 5, 5), R('#fff', 4, 3, 3, 3), R('#ffe27a', 5, 0, 1, 9), R('#ff8a22', 2, 1, 1, 1), R('#ff8a22', 8, 7, 1, 1)]),
  };
  const spr = n => cache[n] || SPR[n]();

  // which weapon is this person using right now
  function kindOf(o) {
    if (o === P) return 'pistol';
    const r = o.s && o.s.role;
    return r === 'sniper' ? 'rifle' : 'pistol';
  }
  // draw a weapon in the hand of o (o.px,o.py are its feet)
  W_.drawHeld = function (ctx, o) {
    if (o.hp !== undefined && o.hp <= 0) return;
    const face = o.face || 1, hx = o.px * T + face * 2, hy = o.py * T - 9;
    const swinging = o.stab > 0, reloading = o === P && P.reloadT > 0;
    let a, kind = kindOf(o), recoil = 0;
    if (swinging) {
      kind = (o.s && o.s.role === 'fighter') || has('spears') ? 'spear' : 'knife';
      const k = o.stab / 0.2, base = o.aimA !== undefined && o.aimT > 0 ? o.aimA : (face > 0 ? 0 : Math.PI);
      a = base + (kind === 'spear' ? 0 : (k - 0.5) * 2.2 * (face > 0 ? -1 : 1));
      recoil = kind === 'spear' ? (1 - k) * 5 : 0;
    } else if (reloading) { a = face > 0 ? 1.1 : Math.PI - 1.1; }
    else if (o.aimT > 0 && o.aimA !== undefined) { a = o.aimA; recoil = o.shot > 0 ? -2 : 0; }
    else if (o === P && Combat.manual() && P.dead <= 0) { const z = G.cam.zoom, ax = (Combat.mouse.x - innerWidth / 2) / z / T + G.cam.x, ay = (Combat.mouse.y - innerHeight / 2) / z / T + G.cam.y; a = Math.atan2(ay - (P.py - 0.55), ax - P.px); recoil = P.shot > 0 ? -2 : 0; }
    else a = face > 0 ? 0.55 : Math.PI - 0.55;                           // held low
    ctx.save(); ctx.translate(Math.round(hx), Math.round(hy)); ctx.rotate(a);
    if (Math.cos(a) < 0) ctx.scale(1, -1);
    ctx.imageSmoothingEnabled = false;
    const s = spr(kind); ctx.drawImage(s, Math.round(1 + recoil), -Math.floor(s.height / 2));
    if (o.shot > 0 && !swinging) { const f = spr('flash'); ctx.drawImage(f, s.width + 1 + recoil, -4); }
    ctx.restore();
    ctx.fillStyle = o.hurt > 0 ? '#e8c0a0' : '#d8a888'; ctx.fillRect(Math.round(hx + Math.cos(a) * 2) - 1, Math.round(hy + Math.sin(a) * 2) - 1, 2, 2);        // the hand on the grip
  };

  // a red bracket and name tag on whatever the sight is on
  W_.drawTarget = function (ctx, z) {
    const x = z.x * T, y = z.y * T - 11, r = (z.type === 'brute' || z.type === 'tyrant' ? 13 : z.type === 'bloater' ? 11 : 9), pulse = 0.7 + 0.3 * Math.sin((G.time || 0) * 12);
    ctx.strokeStyle = 'rgba(255,90,72,' + pulse + ')'; ctx.lineWidth = 1.2;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.beginPath(); ctx.moveTo(x + sx * r, y + sy * (r - 4)); ctx.lineTo(x + sx * r, y + sy * r); ctx.lineTo(x + sx * (r - 4), y + sy * r); ctx.stroke(); }
    const mhp = ZTYPES[z.type].hp, f = Math.max(0, z.hp) / mhp;
    ctx.fillStyle = '#000b'; ctx.fillRect(x - 9, y + r + 3, 18, 3); ctx.fillStyle = f > 0.5 ? '#e8524a' : '#ff9a3a'; ctx.fillRect(x - 9, y + r + 3, 18 * f, 3);
  };

  // markers over buildings that can still be searched
  W_.drawSearchables = function (ctx) {
    if (!G || AI.on) return;
    const t = G.time || 0;
    for (const b of buildings) {
      if (b.looted || b.nest || b.crew) continue;
      const cx = b.x + b.w / 2, cy = b.y + b.h, d = Math.hypot(cx - P.px, cy - P.py);
      if (d > 14 || !explored[((b.y + (b.h >> 1)) | 0) * W + ((b.x + (b.w >> 1)) | 0)]) continue;
      const px = cx * T, py = cy * T - 3, near = d < 2.6;
      ctx.globalAlpha = near ? 1 : Math.max(0.35, 1 - d / 16);
      if (b.locked) { ctx.drawImage(Items.canvas('keycard'), Math.round(px - 6), Math.round(py - 12), 12, 12); }
      else ctx.drawImage(Items.canvas('scrap'), Math.round(px - 6), Math.round(py - 12 + Math.sin(t * 3 + b.x) * 1.2), 12, 12);
      ctx.globalAlpha = 1;
      if (near) {
        const lab = (b.locked ? 'Locked: keycard or fuel' : 'Hold E: search the ' + BUILDING_TYPES[b.type].label.toLowerCase()); ctx.font = '8px monospace';
        const w = ctx.measureText(lab).width + 8; ctx.fillStyle = '#000d'; ctx.fillRect(px - w / 2, py - 29, w, 12); ctx.strokeStyle = b.locked ? '#e8c547' : '#7fcf6a'; ctx.lineWidth = 1; ctx.strokeRect(px - w / 2 + 0.5, py - 28.5, w - 1, 11);
        ctx.fillStyle = '#ffe9b0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(lab, px, py - 22.5); ctx.textAlign = 'left';
      }
    }
  };
  return W_;
})();
