'use strict';
/* ======================================================================
   render.js - draws a frame: world, units, effects, fog of war, dynamic
   lighting, atmosphere (fog drift, rain, lightning, vignette) and the
   minimap. Reads simulation state, never changes game rules.
   ====================================================================== */
const canvas = $('c'), ctx = canvas.getContext('2d');
const mini = $('mini'), mctx = mini.getContext('2d');
let dpr = 1;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, Q.dprMax);
  canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
}
addEventListener('resize', resize);

const lightCv = document.createElement('canvas'), lg = lightCv.getContext('2d');

// ---- units ---------------------------------------------------------------
let mobMode = false;
function spriteFor(o) {
  if (o === P) {
    const set = Art.sprites.player;
    if (P.stab > 0) return [set, 'attack', (G.time * 12 | 0) % 2];
    if (P.moving) return [set, 'walk', (P.anim | 0) % 4];
    return [set, 'idle', 0];
  }
  if (o.s) {                                                      // posted survivor
    const set = Art.sprites['def_' + o.s.role] || Art.sprites.def_fighter;
    if (o.st === 'stab') return [set, 'attack', (G.time * 12 + o.anim | 0) % 2];
    if (o.st === 'walk') return [set, 'walk', (o.anim | 0) % 4];
    return [set, 'idle', 0];
  }
  const set = Art.sprites[o.type === 'walker' ? (mobMode ? 'z_mob' : 'z_walker' + o.v) : 'z_' + o.type];
  if (o.st === 1) return [set, 'attack', (o.anim * 0.8 | 0) % 2];
  if (o.st === 2) return [set, 'climb', (o.anim * 0.7 | 0) % 2];
  if (o.st === 3) return [set, 'idle', 0];
  return [set, 'walk', (o.anim | 0) % 4];
}
function drawUnit(o, x, y, face, lift) {
  const [set, list, idx] = spriteFor(o);
  const flip = face < 0, img = (flip ? set.fl : set)[list][idx];
  const ax = flip ? img.width - set.ax : set.ax;
  ctx.drawImage(img, Math.round(x * T - ax), Math.round(y * T - set.ay + (lift || 0)));
}
function shadow(x, y, w) {
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(Math.round(x * T - w / 2), Math.round(y * T - 2), w, 3);
  ctx.fillRect(Math.round(x * T - w / 2 + 1), Math.round(y * T - 3), w - 2, 1);
}

// ---- world ---------------------------------------------------------------
function drawWorld(cam, cw, ch, z) {
  const vx0 = clamp(((cam.x * T - cw / 2 / z) / T | 0) - 1, 0, W - 1), vx1 = clamp(((cam.x * T + cw / 2 / z) / T | 0) + 1, 0, W - 1);
  const vy0 = clamp(((cam.y * T - ch / 2 / z) / T | 0) - 1, 0, H - 1), vy1 = clamp(((cam.y * T + ch / 2 / z) / T | 0) + 1, 0, H - 1);
  const t = G.time;
  ctx.drawImage(Art.terrain, 0, 0);
  ctx.drawImage(Art.decals, 0, 0);
  ctx.drawImage(Art.claim, 0, 0);

  // scavenged / crewed buildings
  for (const b of buildings) {
    if (b.razed) continue;
    if (b.looted) { ctx.fillStyle = 'rgba(0,0,0,0.36)'; ctx.fillRect(b.x * T, b.y * T, b.w * T, b.h * T - 9); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(b.x * T + b.w * T / 2 - 3, b.y * T + (b.h * T - 9) / 2 - 1, 6, 2); }
    if (b.locked && !b.looted) { const lx = b.x * T + b.w * T / 2, ly = b.y * T + (b.h * T - 9) / 2; ctx.fillStyle = '#0008'; ctx.fillRect(lx - 5, ly - 5, 10, 12); ctx.fillStyle = '#e8c547'; ctx.fillRect(lx - 3, ly - 1, 6, 5); ctx.strokeStyle = '#e8c547'; ctx.lineWidth = 1; ctx.strokeRect(lx - 2.5, ly - 5.5, 5, 5); }
    if (b.crew) {
      const c = G.crews.find(c => buildings[c.bi] === b), f = c ? (c.prog !== undefined ? c.prog : c.t / c.dur) : 0;
      ctx.fillStyle = 'rgba(40,120,200,0.25)'; ctx.fillRect(b.x * T, b.y * T, b.w * T, b.h * T);
      ctx.fillStyle = '#000a'; ctx.fillRect(b.x * T + 2, b.y * T + 2, b.w * T - 4, 3);
      ctx.fillStyle = '#7fd0ff'; ctx.fillRect(b.x * T + 2, b.y * T + 2, (b.w * T - 4) * f, 3);
    }
  }

  Intro.drawGround(ctx);
  // crates (with a beacon so they can be found)
  for (const c of crates) {
    const px = c.x * T, py = c.y * T, pulse = 0.5 + 0.5 * Math.sin(t * 4);
    if (c.type === 'boss') {
      ctx.globalAlpha = 0.35 + pulse * 0.35; ctx.fillStyle = '#ff9a3a'; ctx.fillRect(px - 2, py - 80, 4, 76); ctx.globalAlpha = 1;
      shadow(c.x, c.y + 0.3, 14); ctx.fillStyle = '#3a2a1a'; ctx.fillRect(px - 8, py - 9, 16, 11); ctx.fillStyle = '#d8a030'; ctx.fillRect(px - 8, py - 9, 16, 2); ctx.fillStyle = '#ffd27a'; ctx.fillRect(px - 2, py - 6, 4, 5);
      continue;
    }
    if (c.type === 'airdrop') {                                          // a pallet under a parachute: tall green beacon
      ctx.globalAlpha = 0.3 + pulse * 0.35; ctx.fillStyle = '#7fe08a'; ctx.fillRect(px - 2, py - 90, 4, 86); ctx.globalAlpha = 1;
      shadow(c.x, c.y + 0.3, 14);
      ctx.fillStyle = '#2f4a2a'; ctx.fillRect(px - 8, py - 9, 16, 11); ctx.fillStyle = '#5a8a4a'; ctx.fillRect(px - 8, py - 9, 16, 2); ctx.fillStyle = '#e8e0c0'; ctx.fillRect(px - 2, py - 9, 4, 11); ctx.fillStyle = '#c8302a'; ctx.fillRect(px - 8, py - 4, 16, 2);
      ctx.fillStyle = '#e8e0c0'; ctx.fillRect(px - 10, py - 19, 20, 2); ctx.fillRect(px - 12, py - 17, 24, 1);
      ctx.strokeStyle = 'rgba(232,224,192,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px - 10, py - 17); ctx.lineTo(px - 6, py - 9); ctx.moveTo(px + 10, py - 17); ctx.lineTo(px + 6, py - 9); ctx.stroke();
      continue;
    }
    if (c.type === 'survivor') {
      ctx.globalAlpha = 0.3 + pulse * 0.3; ctx.fillStyle = '#7fd0ff'; ctx.fillRect(px - 1, py - 70, 2, 66); ctx.globalAlpha = 1;
      const set = Art.sprites.def_fighter; shadow(c.x, c.y + 0.3, 10); ctx.drawImage(set.idle[0], Math.round(px - set.ax), Math.round(py - set.ay));
      ctx.fillStyle = '#7fd0ff'; ctx.fillRect(px - 2, py - 28 + Math.sin(t * 5) * 2, 4, 4);
      continue;
    }
    ctx.globalAlpha = 0.25 + pulse * 0.25; ctx.fillStyle = '#ffe27a'; ctx.fillRect(px - 1, py - 60, 2, 56); ctx.globalAlpha = 1;
    shadow(c.x, c.y + 0.3, 12);
    ctx.fillStyle = '#6a4a2a'; ctx.fillRect(px - 6, py - 7, 12, 9); ctx.fillStyle = '#8c6a3a'; ctx.fillRect(px - 6, py - 7, 12, 2);
    ctx.fillStyle = '#c8302a'; ctx.fillRect(px - 1, py - 7, 2, 9); ctx.fillRect(px - 6, py - 3, 12, 2);
  }

  // traps
  for (const tr of traps) {
    const px = tr.x * T, py = tr.y * T;
    if (tr.type === 'spike') {
      ctx.fillStyle = '#4a4e54'; ctx.fillRect(px + 1, py + 3, 14, 11);
      ctx.fillStyle = '#c8ccd2';
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { ctx.fillRect(px + 2 + i * 3.5, py + 4 + j * 3.5, 1, 3); }
      ctx.fillStyle = '#e8ecf0'; for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) ctx.fillRect(px + 2 + i * 3.5, py + 4 + j * 3.5, 1, 1);
    } else {
      shadow(tr.x + 0.5, tr.y + 0.95, 11);
      ctx.fillStyle = '#9a2a22'; ctx.fillRect(px + 3, py + 2, 10, 13); ctx.fillStyle = '#c8402a'; ctx.fillRect(px + 3, py + 2, 10, 2);
      ctx.fillStyle = '#e8c020'; ctx.fillRect(px + 3, py + 7, 10, 2); ctx.fillStyle = '#222'; ctx.fillRect(px + 5, py + 7, 2, 2); ctx.fillRect(px + 9, py + 7, 2, 2);
      if (tr.fire > 0) {
        const fl = Math.sin(t * 20) * 2;
        ctx.fillStyle = '#e8561a'; ctx.fillRect(px + 1, py - 12 + fl, 14, 14); ctx.fillStyle = '#ffa22a'; ctx.fillRect(px + 3, py - 8 + fl, 10, 10); ctx.fillStyle = '#ffe27a'; ctx.fillRect(px + 5, py - 3 + fl, 6, 5);
      }
    }
  }

  // nests: infested buildings
  for (const n of G.nests) {
    const b = buildings[n.bi], pulse = 0.5 + 0.5 * Math.sin(t * 3 + n.bi);
    const bx = b.x * T, by = b.y * T, bw = b.w * T, bh = b.h * T;
    ctx.globalAlpha = 0.18 + pulse * 0.16; ctx.fillStyle = '#c0201a'; ctx.fillRect(bx, by, bw, bh); ctx.globalAlpha = 1;
    ctx.strokeStyle = '#e04a3a'; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    const cx = bx + bw / 2, cy = by + (bh - 9) / 2;                       // skull
    ctx.fillStyle = '#e8e0d0'; ctx.fillRect(cx - 4, cy - 4, 8, 7); ctx.fillRect(cx - 3, cy + 3, 6, 2); ctx.fillStyle = '#2a0a0a'; ctx.fillRect(cx - 3, cy - 2, 2, 2); ctx.fillRect(cx + 1, cy - 2, 2, 2);
    if (n.hp < NEST.hp) { ctx.fillStyle = '#000a'; ctx.fillRect(bx + 2, by + bh - 6, bw - 4, 3); ctx.fillStyle = '#ff8a22'; ctx.fillRect(bx + 2, by + bh - 6, (bw - 4) * Math.max(0, n.hp) / NEST.hp, 3); }
  }
  // facilities
  const NEWFAC = ['well', 'rain', 'latrine', 'turret', 'battery', 'garagebay', 'mine', 'solar', 'yard', 'bunkhouse', 'barracks'];
  for (const f of facilities) (NEWFAC.includes(f.type) ? Art.drawFacility2 : Art.drawFacility)(ctx, f, t);
  // sewer accesses you know about
  for (const s of sewers) {
    if (!s.found) continue;
    const px = s.x * T, py = s.y * T;
    if (s.sealed) { ctx.fillStyle = '#6a6e76'; ctx.fillRect(px + 3, py + 3, 10, 10); ctx.fillStyle = '#2a2d30'; for (let q = 0; q < 4; q++) ctx.fillRect(px + 4 + q * 2.5, py + 4, 1, 8); }
    else { ctx.globalAlpha = 0.4 + 0.3 * Math.sin(t * 5); ctx.strokeStyle = '#ff5a3a'; ctx.lineWidth = 1; ctx.strokeRect(px + 1.5, py + 1.5, 13, 13); ctx.globalAlpha = 1; }
  }
  // decoys
  for (const d of decoys) {
    const px = d.x * T, py = d.y * T;
    shadow(d.x, d.y + 0.3, 9);
    ctx.fillStyle = '#26282c'; ctx.fillRect(px - 5, py - 6, 10, 7); ctx.fillStyle = '#4a4e56'; ctx.fillRect(px - 5, py - 6, 10, 2);
    ctx.fillStyle = '#c8402a'; ctx.fillRect(px - 3, py - 3, 2, 2); ctx.fillStyle = '#26282c'; ctx.fillRect(px + 3, py - 12, 1, 6);
    if ((t * 4 | 0) % 2) { ctx.strokeStyle = 'rgba(255,226,122,0.8)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(px + 3, py - 12, 3, -2.4, -0.7); ctx.stroke(); ctx.beginPath(); ctx.arc(px + 3, py - 12, 5, -2.4, -0.7); ctx.stroke(); }
  }
  // camp
  Art.drawCamp(ctx, t, G.level, Math.max(0, G.coreHp / LEVELS[G.level - 1].coreHp), G.memorial.length);

  // walls, towers, gates, lookouts (y order so taller things overlap correctly)
  for (let y = vy0; y <= vy1; y++) for (let x = vx0; x <= vx1; x++) {
    const i = y * W + x, k = wall[i];
    if (!k) continue;
    const open = k === K.GATE && Math.hypot(P.px - (x + 0.5), P.py - (y + 0.5)) < 1.7;
    Art.drawWall(ctx, x, y, k, wallHp[i] / maxHp(k, i), pile[i], t, open, wallTier[i], elec[i], G.power.ratio > 0 && G.power.demand > 0);
  }

  // units sorted by depth
  const items = [];
  for (const zb of zombies) {
    if (zb.x < vx0 - 1 || zb.x > vx1 + 2 || zb.y < vy0 - 1 || zb.y > vy1 + 2) continue;
    if (!vis[(zb.y | 0) * W + (zb.x | 0)]) continue;
    items.push(zb);
  }
  for (const d of defenders) items.push(d);
  for (const u of Units.all()) items.push(u);
  if (P.dead <= 0) items.push(P);
  items.sort((a, b) => (a.py !== undefined ? a.py : a.y) - (b.py !== undefined ? b.py : b.y));
  const crowd = items.length > 1800 || !Q.shadows;
  mobMode = items.length - defenders.length > 60;                       // a real crowd on screen: uniform silhouettes
  for (const o of items) {
    if (o.py !== undefined) {
      shadow(o.px, o.py + 0.1, 10);
      if (o.act > 0) {                                                  // who just shot (gold) or stabbed (white)
        ctx.strokeStyle = o.actK === 'stab' ? '#ffffff' : '#ffd27a'; ctx.globalAlpha = Math.min(1, o.act * 5);
        ctx.beginPath(); ctx.ellipse(o.px * T, o.py * T, 7 + (0.25 - o.act) * 18, 3 + (0.25 - o.act) * 7, 0, 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1;
      }
      if (o.tired) { ctx.fillStyle = '#e8c547'; const zx = o.px * T + 5, zy = o.py * T - 27 - ((G.time * 6 | 0) % 2); ctx.fillRect(zx, zy, 3, 1); ctx.fillRect(zx + 2, zy + 1, 1, 1); ctx.fillRect(zx + 1, zy + 2, 1, 1); ctx.fillRect(zx, zy + 3, 3, 1); }
      drawUnit(o, o.px, o.py + 0.1, o.face, o.stab > 0 && o !== P ? -1 : 0);
      if (!crowd || o === P) Weapons.drawHeld(ctx, o);
      if (o.carry && o.carry.plan && o.carry.plan.length) { const cx2 = Math.round(o.px * T - 4 - (o.face || 1) * 3), cy2 = Math.round(o.py * T - 20 + Math.sin(o.anim * 0.8) * 0.6); ctx.fillStyle = '#5a3a1a'; ctx.fillRect(cx2, cy2, 9, 6); ctx.fillStyle = '#8a5a2a'; ctx.fillRect(cx2, cy2, 9, 2); ctx.fillStyle = '#c8b090'; ctx.fillRect(cx2 + 4, cy2, 1, 6); }
      const mhp = o === P ? PLAYER.hp : (o.maxHp || 60);
      if (o.hp < mhp) { ctx.fillStyle = '#000a'; ctx.fillRect(o.px * T - 6, o.py * T - 26, 12, 2); ctx.fillStyle = '#e8524a'; ctx.fillRect(o.px * T - 6, o.py * T - 26, 12 * Math.max(0, o.hp) / mhp, 2); }
      if (o.sta !== undefined && o.sta < STAMINA.max - 1) { ctx.fillStyle = '#000a'; ctx.fillRect(o.px * T - 6, o.py * T - 24, 12, 2); ctx.fillStyle = o.tired ? '#c9a23a' : '#6fb0e8'; ctx.fillRect(o.px * T - 6, o.py * T - 24, 12 * o.sta / STAMINA.max, 2); }
      if (o === P) {
        ctx.fillStyle = '#ffd27a'; ctx.fillRect(o.px * T - 1, o.py * T - 29, 3, 2); ctx.fillRect(o.px * T, o.py * T - 27, 1, 1);
        if (P.loot > 0) { ctx.fillStyle = '#000a'; ctx.fillRect(o.px * T - 8, o.py * T - 33, 16, 3); ctx.fillStyle = '#7fcf6a'; ctx.fillRect(o.px * T - 8, o.py * T - 33, 16 * Math.min(1, P.loot / (P.lootNeed || lootTime())), 3); }
      }
    } else {
      const big = o.type === 'brute' ? 16 : o.type === 'bloater' ? 14 : 10;
      if (!crowd) shadow(o.x, o.y + 0.1, big);
      drawUnit(o, o.x, o.y + 0.1, o.face, o.st === 2 ? -o.lift : Math.sin(o.anim * 2) * 0.6);
      if (o.hp < ZTYPES[o.type].hp && ZTYPES[o.type].hp > 30) { ctx.fillStyle = '#000a'; ctx.fillRect(o.x * T - 7, o.y * T - 32, 14, 2); ctx.fillStyle = '#e8524a'; ctx.fillRect(o.x * T - 7, o.y * T - 32, 14 * o.hp / ZTYPES[o.type].hp, 2); }
      if (o.rev) { ctx.fillStyle = '#ff3030'; ctx.fillRect(o.x * T - 1, o.y * T - 30, 2, 5); ctx.fillRect(o.x * T - 1, o.y * T - 23, 2, 2); }
      if (o.rage > 0) { ctx.fillStyle = 'rgba(255,60,40,0.7)'; ctx.fillRect(o.x * T - 1, o.y * T - 24, 2, 2); }
    }
  }
  // reach of the hovered or selected defender: gun range (gold) and spear reach (white)
  {
    const reachOf = d => {
      const wk = wall[d.y * W + d.x], tower = wk === K.TOWER || wk === K.OUTPOST, sn = d.s.role === 'sniper';
      const gun = (tower ? GUN.towerRange : GUN.range) * (sn ? SNIPER.range : 1) * tmul(d.s, 'range');
      ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,210,122,0.55)'; ctx.beginPath(); ctx.arc(d.px * T, d.py * T, gun * T, 0, 6.283); ctx.stroke();
      if (has('spears') || d.s.role === 'fighter') { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(d.px * T, d.py * T, SPEAR.reach * T, 0, 6.283); ctx.stroke(); }
      ctx.setLineDash([]);
    };
    const hv = G.hover && inb(G.hover.tx, G.hover.ty) ? defAt[G.hover.ty * W + G.hover.tx] : null;
    if (hv) reachOf(hv);
    for (const d of defenders) if (G.sel.includes(d.s.id) && d !== hv) reachOf(d);
  }
  // selection rings, standing orders and the flash where an order was given
  {
    const ring = (x, y, c) => { ctx.strokeStyle = c; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(x * T, y * T + 1, 8, 3.6, 0, 0, 6.283); ctx.stroke(); };
    const line = (x, y, gx, gy) => { ctx.strokeStyle = 'rgba(127,224,138,0.55)'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(x * T, y * T); ctx.lineTo(gx * T, gy * T); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#7fe08a'; ctx.fillRect(gx * T - 1, gy * T - 5, 2, 6); ctx.fillRect(gx * T, gy * T - 5, 4, 3); };
    for (const u of Units.all()) if (G.sel.includes(u.s.id)) { ring(u.px, u.py, '#7fe08a'); if (u.order) line(u.px, u.py, u.gx, u.gy); }
    for (const d of defenders) if (G.sel.includes(d.s.id)) ring(d.px, d.py, '#7fe08a');
    if (G.selP && P.dead <= 0) { ring(P.px, P.py, '#7fe08a'); if (P.order) line(P.px, P.py, P.gx, P.gy); }
    if (G.orderFx && G.orderFx.t > 0) { const f = G.orderFx; f.t -= 0.03; ctx.strokeStyle = 'rgba(127,224,138,' + f.t + ')'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(f.x * T, f.y * T, 4 + (1 - f.t) * 14, 0, 6.283); ctx.stroke(); }
  }
  if (G.trader) {
    const px = CORE.x + 0.5 + 3.4, py = CORE.y + 3.1;
    shadow(px, py, 10); const set = Art.sprites.trader; ctx.drawImage(set.idle[0], Math.round(px * T - set.ax), Math.round(py * T - set.ay));
    ctx.fillStyle = '#ffe27a'; ctx.fillRect(px * T - 2, py * T - 28 + Math.sin(t * 4) * 1.5, 4, 4);
  }

  // slashes, tracers, particles, popups
  for (let i = tracers.length - 1; i >= 0; i--) {
    const tr = tracers[i];
    if (tr.life <= 0) { tracers.splice(i, 1); continue; }
    ctx.strokeStyle = tr.slash ? '#ffffff' : tr.spear ? '#d8c8a0' : tr.acid ? '#9ad04a' : tr.fire || tr.inc ? '#ff8a22' : tr.ap ? '#8fd0ff' : '#ffe9a0'; ctx.lineWidth = tr.spear ? 1.8 : tr.slash ? 1.4 : tr.fire ? 1.6 : 0.9; ctx.globalAlpha = Math.min(1, tr.life * 12);
    ctx.beginPath(); ctx.moveTo(tr.x1 * T, tr.y1 * T); ctx.lineTo(tr.x2 * T, tr.y2 * T); ctx.stroke(); ctx.globalAlpha = 1;
  }
  for (const f of fires) {                                           // ground fire from Molotovs
    const k = Math.min(1, f.t / 1.5);
    ctx.globalAlpha = 0.28 * k; ctx.fillStyle = '#ff6a1a'; ctx.beginPath(); ctx.arc(f.x * T, f.y * T, f.r * T, 0, 6.3); ctx.fill();
    ctx.globalAlpha = 0.5 * k; ctx.fillStyle = '#ffb02a'; ctx.beginPath(); ctx.arc(f.x * T, f.y * T, f.r * T * 0.55, 0, 6.3); ctx.fill(); ctx.globalAlpha = 1;
  }
  for (const r of rings) {                                           // expanding rings show how far a noise carries
    const k = r.t / r.max;
    ctx.globalAlpha = (1 - k) * 0.32; ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(r.x * T, r.y * T, r.r * T * (0.15 + 0.85 * k), 0, 6.3); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const p of parts) {
    ctx.globalAlpha = clamp(p.life / p.max * 1.6, 0, 1);
    ctx.fillStyle = p.color; ctx.fillRect(p.x * T, p.y * T, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center';
  for (const d of defenders) {                                   // speech bubbles
    const sy = d.say; if (!sy || sy.delay > 0) continue;
    const w = ctx.measureText(sy.str).width + 8, bx = d.px * T - w / 2, by = d.py * T - 44;
    ctx.globalAlpha = clamp(sy.t * 2, 0, 1);
    ctx.fillStyle = '#f4efe2'; ctx.fillRect(bx, by, w, 11); ctx.fillRect(d.px * T - 2, by + 11, 4, 3);
    ctx.fillStyle = '#1a1612'; ctx.fillText(sy.str, d.px * T, by + 8);
  }
  ctx.globalAlpha = 1;
  for (const tx of texts) {
    ctx.globalAlpha = clamp(tx.life, 0, 1);
    ctx.fillStyle = '#000'; ctx.fillText(tx.str, tx.x * T + 0.7, tx.y * T + 0.7);
    ctx.fillStyle = tx.color; ctx.fillText(tx.str, tx.x * T, tx.y * T);
  }
  ctx.globalAlpha = 1;

  // fog of war (smoothed so the edges are soft)
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(fogCanvas, 0, 0, W * T, H * T);
  ctx.imageSmoothingEnabled = false;

  drawCursor(); Build.draw(ctx); Combat.draw(ctx); Weapons.drawSearchables(ctx); Loot.draw(ctx); Intro.draw(ctx);
}
function drawCursor() {
  if (G.hover && !G.over && !(G.tool === 'combat' && !AI.on)) {
    const { tx, ty } = G.hover, i = ty * W + tx, tool = G.tool;
    const who = inb(tx, ty) && defAt[i];                           // nameplate for a posted survivor
    if (who) {
      const label = who.s.name + ' - ' + ROLES[who.s.role].label + (who.s.traits && who.s.traits.length ? ' (' + traitText(who.s) + ')' : ''), x = who.px * T, y = who.py * T - 36;
      ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center';
      const w = ctx.measureText(label).width + 6;
      ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(x - w / 2, y - 7, w, 10);
      ctx.fillStyle = ROLES[who.s.role].color; ctx.fillText(label, x, y);
    }
    let ok = inb(tx, ty) && bld[i] < 0 && !isCoreTile(tx, ty) && inBuildRange(tx, ty) && explored[i];
    if (tool === 'crew') ok = inb(tx, ty) && bld[i] >= 0 && !buildings[bld[i]].looted && !buildings[bld[i]].crew;
    else if (ok && tool === 'def') ok = wall[i] > 0 && !defAt[i] && wall[i] !== K.GATE && wall[i] !== K.RADIO && selectedIdle().length > 0;
    else if (ok && tool === 'erase') ok = (wall[i] > 0 && wall[i] !== K.RADIO) || !!defAt[i] || !!trapAt[i];
    else if (ok && (tool === 'spike' || tool === 'barrel')) ok = !wall[i] && !trapAt[i];
    else if (ok && TOOL_KIND[tool]) ok = !wall[i] && !trapAt[i] || (wall[i] === K.WALL && tool === 'tower');
    if (tool === 'crew' && inb(tx, ty) && bld[i] >= 0) { const b = buildings[bld[i]]; ctx.fillStyle = ok ? 'rgba(120,255,140,0.25)' : 'rgba(255,90,80,0.25)'; ctx.fillRect(b.x * T, b.y * T, b.w * T, b.h * T); }
    else {
      ctx.fillStyle = ok ? 'rgba(120,255,140,0.28)' : 'rgba(255,90,80,0.28)'; ctx.fillRect(tx * T, ty * T, T, T);
      ctx.strokeStyle = ok ? '#7dff8c' : '#ff5a50'; ctx.lineWidth = 0.8; ctx.strokeRect(tx * T + 0.5, ty * T + 0.5, T - 1, T - 1);
    }
    ctx.setLineDash([3, 3]);
    if (tool === 'def' && ok) {
      const s = selectedIdle()[0], mul = s && s.role === 'sniper' ? SNIPER.range : 1;
      ctx.strokeStyle = 'rgba(255,230,120,0.5)';
      ctx.beginPath(); ctx.arc((tx + 0.5) * T, (ty + 0.5) * T, (wall[i] === K.TOWER ? GUN.towerRange : GUN.range) * mul * T, 0, 7); ctx.stroke();
    }
    if (tool === 'lookout') { ctx.strokeStyle = 'rgba(100,180,255,0.55)'; ctx.beginPath(); ctx.arc((tx + 0.5) * T, (ty + 0.5) * T, lookoutR() * T, 0, 7); ctx.stroke(); }
    if (tool === 'barrel') { ctx.strokeStyle = 'rgba(255,140,60,0.6)'; ctx.beginPath(); ctx.arc((tx + 0.5) * T, (ty + 0.5) * T, TRAP.barrelRadius * T, 0, 7); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  if (G.tool !== 'erase' && G.tool !== 'crew') {
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(P.px * T, P.py * T, BUILD_RANGE * T, 0, 7); ctx.stroke();
  }
}

// ---- lighting ---------------------------------------------------------------
function collectLights(cam) {
  const L = [], t = G.time;
  const fl = 1 + Math.sin(t * 13) * 0.06 + Math.sin(t * 7.1) * 0.05;
  if (G.fireLit === false) L.push({ x: CORE.x + 0.5, y: CORE.y + 1.6, r: 2.6, a: 0.35, c: [200, 90, 40], glow: 0.04 });         // a dead fire: a few embers
  else L.push({ x: CORE.x + 0.5, y: CORE.y + 1.6, r: (9 + G.level * 0.5) * fl, a: 0.95, c: [255, 160, 70], glow: 0.22 });
  if (P.dead <= 0) L.push({ x: P.px, y: P.py - 0.4, r: 11, a: 0.85, c: [255, 235, 190], glow: 0.05 });
  for (const l of lamps) {
    if (!l.on || !explored[(l.y | 0) * W + (l.x | 0)]) continue;
    const flick = Math.sin(t * 30 + l.ph) > 0.93 ? 0.3 : 1;
    L.push({ x: l.x, y: l.y - 0.6, r: 4.6 * flick, a: 0.7 * flick, c: [255, 225, 150], glow: 0.14 });
  }
  for (const lk of G.lookouts) L.push({ x: lk.x, y: lk.y - 0.4, r: 4, a: 0.6, c: [120, 200, 255], glow: 0.18 });
  for (const d of defenders) L.push({ x: d.px, y: d.py - 0.4, r: 5.5, a: 0.55, c: [255, 220, 160], glow: 0.04 });
  for (const f of flashes) { f.life -= 0.016; if (f.life > 0) L.push({ x: f.x, y: f.y, r: 3.4, a: 1, c: [255, 220, 140], glow: 0.35 }); }
  flashes = flashes.filter(f => f.life > 0);
  for (const tr of traps) if (tr.type === 'barrel' && tr.fire > 0) L.push({ x: tr.x + 0.5, y: tr.y + 0.4, r: 6, a: 1, c: [255, 120, 40], glow: 0.35 });
  for (const c of crates) L.push({ x: c.x, y: c.y - 0.5, r: 3.2, a: 0.7, c: [255, 226, 122], glow: 0.2 });
  for (const f of fires) L.push({ x: f.x, y: f.y, r: 5.5 * Math.min(1, f.t / 1.2 + 0.3), a: 1, c: [255, 130, 40], glow: 0.35 });
  for (const f of facilities) {
    if (f.type === 'floodlight' && f.on) L.push({ x: f.x + 0.5, y: f.y, r: 9, a: 0.95, c: [255, 250, 220], glow: 0.18 });
    else if (f.type === 'generator' && f.on) L.push({ x: f.x + 0.5, y: f.y + 0.5, r: 3, a: 0.5, c: [255, 160, 60], glow: 0.15 });
    else if (f.type === 'workshop' && f.on) L.push({ x: f.x + 0.5, y: f.y + 0.5, r: 3, a: 0.6, c: [255, 190, 90], glow: 0.18 });
    else if (f.type === 'clinic') L.push({ x: f.x + 0.5, y: f.y + 0.5, r: 3, a: 0.45, c: [200, 255, 220], glow: 0.1 });
  }
  for (let i = 0; i < W * H && G.rescue !== null; i++) if (wall[i] === K.RADIO) L.push({ x: i % W + 0.5, y: ((i / W) | 0) - 1, r: 5, a: 0.7, c: [255, 80, 70], glow: 0.2 });
  return L;
}
function drawLighting(cam, cw, ch, z) {
  const LS = Q.light, lw = Math.ceil(cw / LS), lh = Math.ceil(ch / LS);
  if (lightCv.width !== lw || lightCv.height !== lh) { lightCv.width = lw; lightCv.height = lh; }
  const storm = G.storm > 0 ? 1 : 0, d = G.danger;
  const [ar, ag, ab] = LIGHT.ambient, [dr, dg, db] = LIGHT.dangerTint;
  const mix = d * 0.35;
  lg.globalCompositeOperation = 'source-over';
  lg.fillStyle = 'rgba(' + [lerp(ar, dr, mix), lerp(ag, dg, mix), lerp(ab, db, mix)].map(Math.round).join(',') + ',' + (storm ? LIGHT.stormAlpha : G.fog > 0 ? LIGHT.fogAlpha : LIGHT.ambientAlpha) + ')';
  lg.fillRect(0, 0, lw, lh);
  lg.globalCompositeOperation = 'destination-out';
  const L = collectLights(cam), sc = z / LS;
  const vis2 = [];
  for (const l of L) {
    const sx = ((l.x - cam.x) * T * z + cw / 2) / LS, sy = ((l.y - cam.y) * T * z + ch / 2) / LS, r = l.r * T * sc;
    if (sx + r < 0 || sy + r < 0 || sx - r > lw || sy - r > lh) continue;
    const gr = lg.createRadialGradient(sx, sy, 0, sx, sy, r);
    gr.addColorStop(0, 'rgba(0,0,0,' + l.a + ')'); gr.addColorStop(0.55, 'rgba(0,0,0,' + l.a * 0.55 + ')'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    lg.fillStyle = gr; lg.beginPath(); lg.arc(sx, sy, r, 0, 6.3); lg.fill();
    vis2.push([sx * LS, sy * LS, r * LS, l]);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(lightCv, 0, 0, cw, ch);
  // warm additive glow on top of the lit areas
  ctx.globalCompositeOperation = 'lighter';
  for (const [sx, sy, r, l] of vis2) {
    if (!l.glow) continue;
    const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 0.85);
    gr.addColorStop(0, 'rgba(' + l.c.join(',') + ',' + l.glow + ')'); gr.addColorStop(1, 'rgba(' + l.c.join(',') + ',0)');
    ctx.fillStyle = gr; ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = false;
}
function drawAtmosphere(cw, ch) {
  const t = G.time;
  // drifting ground fog
  const tex = Art.fogTex, ts = 512 * dpr;
  ctx.globalCompositeOperation = 'screen';
  if (Q.fog) for (const [spd, a, off] of [[7, 0.05, 0], [-4, 0.04, 200]]) {
    ctx.globalAlpha = a * (G.storm > 0 ? 1.8 : 1);
    const ox = ((t * spd * dpr + off) % ts + ts) % ts - ts, oy = ((t * 2 * dpr + off) % ts + ts) % ts - ts;
    for (let x = ox; x < cw; x += ts) for (let y = oy; y < ch; y += ts) ctx.drawImage(tex, x, y, ts, ts);
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  // season tint, snow and fog
  const S = season();
  ctx.fillStyle = 'rgba(' + S.tint[0] + ',' + S.tint[1] + ',' + S.tint[2] + ',' + S.tint[3] + ')'; ctx.fillRect(0, 0, cw, ch);
  if (S.snow) {
    ctx.fillStyle = 'rgba(240,248,255,0.75)';
    for (let i = 0; i < (Q.fog ? 130 : 60); i++) { const x = (i * 83 + Math.sin(t * 0.7 + i) * 18 + t * 12 * dpr) % (cw + 20) - 10, y = (i * 47 + t * (40 + (i % 5) * 9) * dpr) % (ch + 10); ctx.fillRect(x, y, 2 * dpr, 2 * dpr); }
  }
  if (G.fog > 0) { const k = Math.min(1, G.fog / 6, (FOG.time - G.fog) / 6 + 0.3); ctx.fillStyle = 'rgba(205,214,224,' + 0.3 * k + ')'; ctx.fillRect(0, 0, cw, ch); }
  // ash and embers on the wind, thicker the louder the camp is
  if (Q.fog) {
    const n = 40 + (G.heat | 0) * 0.5;
    for (let i = 0; i < n; i++) {
      const x = (i * 131 + t * (14 + (i % 7) * 4) * dpr + Math.sin(t * 0.6 + i) * 20) % (cw + 20) - 10, y = ch - ((i * 53 + t * (10 + (i % 5) * 6) * dpr) % (ch + 20)) + 10;
      ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(t * 2 + i)); ctx.fillStyle = i % 4 === 0 ? '#ff9a40' : '#b8aea0'; ctx.fillRect(x, y, (1 + (i % 3 === 0)) * dpr, (1 + (i % 3 === 0)) * dpr);
    }
    ctx.globalAlpha = 1;
  }
  // the camp's noise tints the edges of the screen red-orange
  if (G.heat > 45) {
    const k = (G.heat - 45) / 55, hg = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.4, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.55);
    hg.addColorStop(0, 'rgba(255,90,30,0)'); hg.addColorStop(1, 'rgba(255,70,20,' + (0.22 * k * (0.75 + 0.25 * Math.sin(t * 4))) + ')');
    ctx.fillStyle = hg; ctx.fillRect(0, 0, cw, ch);
  }
  // vignette
  const vg = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.5, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.6);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,' + (0.32 + G.danger * 0.15) + ')');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, cw, ch);
  // rain
  if (G.storm > 0) {
    const k = Math.min(1, G.storm / 4, (EVENTS.storm - G.storm) / 3 + 0.3);
    ctx.strokeStyle = 'rgba(170,190,220,' + (0.28 * k) + ')'; ctx.lineWidth = Math.max(1, dpr);
    ctx.beginPath();
    for (let i = 0; i < 170; i++) {
      const x = (i * 97 + t * 260 * dpr) % (cw + 60) - 30, y = (i * 61 + t * 1100 * dpr) % (ch + 40) - 20;
      ctx.moveTo(x, y); ctx.lineTo(x - 5 * dpr, y + 15 * dpr);
    }
    ctx.stroke();
  }
  if (G.flash > 0) { ctx.fillStyle = 'rgba(210,225,255,' + G.flash * 0.45 + ')'; ctx.fillRect(0, 0, cw, ch); }
  if (P.hurt > 0.8) { ctx.fillStyle = 'rgba(200,0,0,' + Math.min(0.28, (P.hurt - 0.8) * 0.4) + ')'; ctx.fillRect(0, 0, cw, ch); }
}

// ---- particles update (frame-time based; no gameplay depends on them) ---------------------------------------------------------------
function updateFx(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life -= dt; p.vy += (p.grav || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.life <= 0) parts.splice(i, 1);
  }
  for (let i = tracers.length - 1; i >= 0; i--) tracers[i].life -= dt;
  for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt; if (rings[i].t > rings[i].max) rings.splice(i, 1); }
  for (let i = texts.length - 1; i >= 0; i--) { const t = texts[i]; t.life -= dt; t.y -= dt * 0.7; if (t.life <= 0) texts.splice(i, 1); }
  for (const d of defenders) if (d.stab > 0) d.stab -= dt;
  // camp fire smoke and embers
  G.smokeT = (G.smokeT || 0) - dt;
  if (G.smokeT <= 0 && G.fireLit !== false) {
    G.smokeT = 0.09;
    parts.push({ x: CORE.x + 0.5 + (rng() - 0.5) * 0.3, y: CORE.y + 1.4, vx: 0.15 + rng() * 0.3, vy: -0.9 - rng() * 0.5, life: 1.6, max: 1.6, color: '#8a8a90', size: 2 + (rng() * 2 | 0), grav: 0 });
    if (rng() < 0.4) parts.push({ x: CORE.x + 0.5 + (rng() - 0.5) * 0.4, y: CORE.y + 1.5, vx: (rng() - 0.5) * 0.6, vy: -1.6 - rng(), life: 0.8, max: 0.8, color: '#ffb040', size: 1, grav: 0 });
  }
}

// ---- frame ---------------------------------------------------------------
function render(realDt) {
  updateFx(realDt);
  if (P.inside && Interior.active()) { Interior.render(realDt); return; }
  const { cam } = G, z = cam.zoom * dpr;
  const cw = canvas.width, ch = canvas.height;
  const sh = G.shake > 0 ? G.shake : 0, ox = (Math.random() - 0.5) * sh, oy = (Math.random() - 0.5) * sh;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#05080a'; ctx.fillRect(0, 0, cw, ch);
  ctx.setTransform(z, 0, 0, z, cw / 2 - cam.x * T * z + ox * dpr, ch / 2 - cam.y * T * z + oy * dpr);
  ctx.imageSmoothingEnabled = false;
  drawWorld(cam, cw, ch, z);
  drawLighting(cam, cw, ch, z);
  drawAtmosphere(cw, ch);
}

const MS = 6;                                                 // minimap pixels per tile: drawn at full resolution, not scaled up from one pixel a tile
let miniBase = null, miniFor = null;
function renderMini() {
  const mw = W * MS, mh = H * MS;
  if (mini.width !== mw) { mini.width = mw; mini.height = mh; }
  if (miniFor !== Art.terrain) {                              // the town itself, scaled down smoothly once per town
    miniBase = document.createElement('canvas'); miniBase.width = mw; miniBase.height = mh;
    const bg = miniBase.getContext('2d'); bg.imageSmoothingEnabled = true; bg.imageSmoothingQuality = 'high';
    const tmp = document.createElement('canvas'); tmp.width = W * T / 2; tmp.height = H * T / 2;      // two gentle halvings look far better than one harsh one
    const tg = tmp.getContext('2d'); tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = 'high'; tg.drawImage(Art.terrain, 0, 0, tmp.width, tmp.height);
    bg.drawImage(tmp, 0, 0, mw, mh);
    miniFor = Art.terrain;
  }
  const g = mctx, S = MS, cx = x => x * S, dot = (x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x * S, y * S, r, 0, 6.283); g.fill(); };
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.clearRect(0, 0, mw, mh);
  g.drawImage(miniBase, 0, 0);
  g.globalAlpha = 0.97; g.drawImage(fogCanvas, 0, 0, mw, mh); g.globalAlpha = 1;
  // walls and posts
  for (let i = 0; i < W * H; i++) if (wall[i] && explored[i]) {
    const k = wall[i]; g.fillStyle = k === K.LOOKOUT ? '#4fa3e8' : k === K.TOWER || k === K.OUTPOST ? '#f0d08a' : k === K.GATE ? '#9aa0aa' : '#d9a85a';
    g.fillRect((i % W) * S, ((i / W) | 0) * S, S, S);
    if (defAt[i]) { g.fillStyle = '#7fe0ff'; g.fillRect((i % W) * S + 2, ((i / W) | 0) * S + 2, S - 4, S - 4); }
  }
  // buildings of interest
  const poiCol = { pharmacy: '#3ee07a', gas: '#e8884a', police: '#5a8aff', junkyard: '#b0a070', farmstead: '#d8e86a', bunker: '#c070ff' };
  for (const b of buildings) if (b.poi && !b.razed && explored[((b.y + (b.h >> 1)) | 0) * W + ((b.x + (b.w >> 1)) | 0)]) {
    const x = (b.x + b.w / 2) * S, y = (b.y + b.h / 2) * S;
    g.fillStyle = '#000a'; g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.closePath(); g.fill();
    g.fillStyle = poiCol[b.type] || '#fff'; g.beginPath(); g.moveTo(x, y - 4.5); g.lineTo(x + 4.5, y); g.lineTo(x, y + 4.5); g.lineTo(x - 4.5, y); g.closePath(); g.fill();
  }
  for (const n of G.nests) { const b = buildings[n.bi]; if (explored[((b.y + (b.h >> 1)) | 0) * W + ((b.x + (b.w >> 1)) | 0)]) { const p = 0.5 + 0.5 * Math.sin(G.time * 6); g.strokeStyle = 'rgba(255,60,40,' + (0.5 + p * 0.5) + ')'; g.lineWidth = 2; g.beginPath(); g.arc((b.x + b.w / 2) * S, (b.y + b.h / 2) * S, 7 + p * 2, 0, 6.283); g.stroke(); } }
  for (const s of sewers) if (s.found) { g.fillStyle = s.sealed ? '#8a8e96' : '#ff5a3a'; g.fillRect(s.x * S + 1, s.y * S + 1, S - 2, S - 2); }
  for (const c of crates) { const on = (G.time * 3 | 0) % 2; dot(c.x, c.y, 3.2, c.type === 'airdrop' ? (on ? '#7fe08a' : '#fff') : c.type === 'survivor' ? (on ? '#7fd0ff' : '#fff') : (on ? '#ffe27a' : '#fff')); }
  // the dead
  g.fillStyle = '#ff4a38';
  for (const z of zombies) if (vis[(z.y | 0) * W + (z.x | 0)]) { const big = z.type === 'brute' || z.type === 'tyrant' || z.type === 'bloater'; g.beginPath(); g.arc(z.x * S, z.y * S, big ? 2.6 : 1.5, 0, 6.283); g.fill(); }
  for (const h of hordes) if (h.seen && h.alive) { g.strokeStyle = '#ff5a50'; g.lineWidth = 2; g.setLineDash([4, 3]); g.beginPath(); g.arc(h.cx * S, h.cy * S, 16 + 2 * Math.sin(G.time * 5), 0, 6.283); g.stroke(); g.setLineDash([]); }
  for (const h of herds) if (h.seen) { g.strokeStyle = '#ffa23a'; g.lineWidth = 1.5; g.beginPath(); g.arc(h.cx * S, h.cy * S, 11, 0, 6.283); g.stroke(); }
  // survivors out and about
  for (const u of Units.all()) dot(u.px, u.py, 2.4, G.sel.includes(u.s.id) ? '#7fe08a' : '#cfe8ff');
  // the camp, the survivor you drive, and what the camera sees
  g.fillStyle = '#000b'; g.fillRect(CORE.x * S - 7, CORE.y * S - 7, 14, 14); g.fillStyle = '#7dd0ff'; g.fillRect(CORE.x * S - 5, CORE.y * S - 5, 10, 10);
  dot(P.px, P.py, 4.2, '#000b'); dot(P.px, P.py, 3, '#ffd27a');
  const vw = innerWidth / G.cam.zoom / T, vh = innerHeight / G.cam.zoom / T;
  g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.5; g.strokeRect((G.cam.x - vw / 2) * S, (G.cam.y - vh / 2) * S, vw * S, vh * S);
}
