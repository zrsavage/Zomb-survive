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
  dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
}
addEventListener('resize', resize);

const lightCv = document.createElement('canvas'), lg = lightCv.getContext('2d');
const LS = 3;                                                     // light buffer downscale

// ---- units ---------------------------------------------------------------
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
    return [set, 'idle', 0];
  }
  const set = Art.sprites[o.type === 'walker' ? 'z_walker' + o.v : 'z_' + o.type];
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
    if (b.looted) { ctx.fillStyle = 'rgba(0,0,0,0.36)'; ctx.fillRect(b.x * T, b.y * T, b.w * T, b.h * T - 9); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(b.x * T + b.w * T / 2 - 3, b.y * T + (b.h * T - 9) / 2 - 1, 6, 2); }
    if (b.crew) {
      const c = G.crews.find(c => buildings[c.bi] === b), f = c ? c.t / c.dur : 0;
      ctx.fillStyle = 'rgba(40,120,200,0.25)'; ctx.fillRect(b.x * T, b.y * T, b.w * T, b.h * T);
      ctx.fillStyle = '#000a'; ctx.fillRect(b.x * T + 2, b.y * T + 2, b.w * T - 4, 3);
      ctx.fillStyle = '#7fd0ff'; ctx.fillRect(b.x * T + 2, b.y * T + 2, (b.w * T - 4) * f, 3);
    }
  }

  // crates (with a beacon so they can be found)
  for (const c of crates) {
    const px = c.x * T, py = c.y * T, pulse = 0.5 + 0.5 * Math.sin(t * 4);
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

  // camp
  Art.drawCamp(ctx, t, G.level, Math.max(0, G.coreHp / LEVELS[G.level - 1].coreHp));

  // walls, towers, gates, lookouts (y order so taller things overlap correctly)
  for (let y = vy0; y <= vy1; y++) for (let x = vx0; x <= vx1; x++) {
    const i = y * W + x, k = wall[i];
    if (!k) continue;
    const open = k === K.GATE && Math.hypot(P.px - (x + 0.5), P.py - (y + 0.5)) < 1.7;
    Art.drawWall(ctx, x, y, k, wallHp[i] / maxHp(k), pile[i], t, open);
  }

  // units sorted by depth
  const items = [];
  for (const zb of zombies) {
    if (zb.x < vx0 - 1 || zb.x > vx1 + 2 || zb.y < vy0 - 1 || zb.y > vy1 + 2) continue;
    if (!vis[(zb.y | 0) * W + (zb.x | 0)]) continue;
    items.push(zb);
  }
  for (const d of defenders) items.push(d);
  items.push(P);
  items.sort((a, b) => (a.py !== undefined ? a.py : a.y) - (b.py !== undefined ? b.py : b.y));
  const crowd = items.length > 1800;
  for (const o of items) {
    if (o.py !== undefined) {
      shadow(o.px, o.py + 0.1, 10);
      drawUnit(o, o.px, o.py + 0.1, o.face, o.stab > 0 && o !== P ? -1 : 0);
      const mhp = o === P ? PLAYER.hp : 60;
      if (o.hp < mhp) { ctx.fillStyle = '#000a'; ctx.fillRect(o.px * T - 6, o.py * T - 26, 12, 2); ctx.fillStyle = '#e8524a'; ctx.fillRect(o.px * T - 6, o.py * T - 26, 12 * Math.max(0, o.hp) / mhp, 2); }
      if (o === P) {
        ctx.fillStyle = '#ffd27a'; ctx.fillRect(o.px * T - 1, o.py * T - 29, 3, 2); ctx.fillRect(o.px * T, o.py * T - 27, 1, 1);
        if (P.loot > 0) { ctx.fillStyle = '#000a'; ctx.fillRect(o.px * T - 8, o.py * T - 33, 16, 3); ctx.fillStyle = '#7fcf6a'; ctx.fillRect(o.px * T - 8, o.py * T - 33, 16 * P.loot / lootTime(), 3); }
      }
    } else {
      const big = o.type === 'brute' ? 16 : o.type === 'bloater' ? 14 : 10;
      if (!crowd) shadow(o.x, o.y + 0.1, big);
      drawUnit(o, o.x, o.y + 0.1, o.face, o.st === 2 ? -o.lift : Math.sin(o.anim * 2) * 0.6);
      if (o.hp < ZTYPES[o.type].hp && ZTYPES[o.type].hp > 30) { ctx.fillStyle = '#000a'; ctx.fillRect(o.x * T - 7, o.y * T - 32, 14, 2); ctx.fillStyle = '#e8524a'; ctx.fillRect(o.x * T - 7, o.y * T - 32, 14 * o.hp / ZTYPES[o.type].hp, 2); }
      if (o.rage > 0) { ctx.fillStyle = 'rgba(255,60,40,0.7)'; ctx.fillRect(o.x * T - 1, o.y * T - 24, 2, 2); }
    }
  }
  // idle survivors milling around the camp
  const shown = G.idle.slice(0, 8);
  shown.forEach((s, i) => {
    const px = CORE.x + 0.5 - 1.7 + i * 0.5 + Math.sin(t * 0.7 + i) * 0.1, py = CORE.y + 2.9 + (i % 2) * 0.4;
    const set = Art.sprites['def_' + s.role], img = set.idle[0];
    shadow(px, py, 10);
    ctx.drawImage(i % 2 ? set.fl.idle[0] : img, Math.round(px * T - (i % 2 ? img.width - set.ax : set.ax)), Math.round(py * T - set.ay + (s.sick > 0 ? 2 : 0)));
    if (s.sick > 0) { ctx.fillStyle = '#7fcf6a'; ctx.fillRect(px * T - 1, py * T - 26, 3, 3); }
  });
  if (G.trader) {
    const px = CORE.x + 0.5 + 3.4, py = CORE.y + 3.1;
    shadow(px, py, 10); const set = Art.sprites.trader; ctx.drawImage(set.idle[0], Math.round(px * T - set.ax), Math.round(py * T - set.ay));
    ctx.fillStyle = '#ffe27a'; ctx.fillRect(px * T - 2, py * T - 28 + Math.sin(t * 4) * 1.5, 4, 4);
  }

  // slashes, tracers, particles, popups
  for (let i = tracers.length - 1; i >= 0; i--) {
    const tr = tracers[i];
    if (tr.life <= 0) { tracers.splice(i, 1); continue; }
    ctx.strokeStyle = tr.slash ? '#ffffff' : '#ffe9a0'; ctx.lineWidth = tr.slash ? 1.4 : 0.9; ctx.globalAlpha = Math.min(1, tr.life * 12);
    ctx.beginPath(); ctx.moveTo(tr.x1 * T, tr.y1 * T); ctx.lineTo(tr.x2 * T, tr.y2 * T); ctx.stroke(); ctx.globalAlpha = 1;
  }
  for (const p of parts) {
    ctx.globalAlpha = clamp(p.life / p.max * 1.6, 0, 1);
    ctx.fillStyle = p.color; ctx.fillRect(p.x * T, p.y * T, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center';
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

  drawCursor();
}
function drawCursor() {
  if (G.hover && !G.over) {
    const { tx, ty } = G.hover, i = ty * W + tx, tool = G.tool;
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
  L.push({ x: CORE.x + 0.5, y: CORE.y + 1.6, r: (9 + G.level * 0.5) * fl, a: 0.95, c: [255, 160, 70], glow: 0.22 });
  L.push({ x: P.px, y: P.py - 0.4, r: 5.6, a: 0.8, c: [255, 235, 190], glow: 0.05 });
  for (const l of lamps) {
    if (!l.on || !explored[(l.y | 0) * W + (l.x | 0)]) continue;
    const flick = Math.sin(t * 30 + l.ph) > 0.93 ? 0.3 : 1;
    L.push({ x: l.x, y: l.y - 0.6, r: 4.6 * flick, a: 0.7 * flick, c: [255, 225, 150], glow: 0.14 });
  }
  for (const lk of G.lookouts) L.push({ x: lk.x, y: lk.y - 0.4, r: 4, a: 0.6, c: [120, 200, 255], glow: 0.18 });
  for (const d of defenders) L.push({ x: d.px, y: d.py - 0.4, r: 2.6, a: 0.4, c: [255, 220, 160], glow: 0.04 });
  for (const f of flashes) { f.life -= 0.016; if (f.life > 0) L.push({ x: f.x, y: f.y, r: 3.4, a: 1, c: [255, 220, 140], glow: 0.35 }); }
  flashes = flashes.filter(f => f.life > 0);
  for (const tr of traps) if (tr.type === 'barrel' && tr.fire > 0) L.push({ x: tr.x + 0.5, y: tr.y + 0.4, r: 6, a: 1, c: [255, 120, 40], glow: 0.35 });
  for (const c of crates) L.push({ x: c.x, y: c.y - 0.5, r: 3.2, a: 0.7, c: [255, 226, 122], glow: 0.2 });
  for (let i = 0; i < W * H && G.rescue !== null; i++) if (wall[i] === K.RADIO) L.push({ x: i % W + 0.5, y: ((i / W) | 0) - 1, r: 5, a: 0.7, c: [255, 80, 70], glow: 0.2 });
  return L;
}
function drawLighting(cam, cw, ch, z) {
  const lw = Math.ceil(cw / LS), lh = Math.ceil(ch / LS);
  if (lightCv.width !== lw || lightCv.height !== lh) { lightCv.width = lw; lightCv.height = lh; }
  const storm = G.storm > 0 ? 1 : 0, d = G.danger;
  const [ar, ag, ab] = LIGHT.ambient, [dr, dg, db] = LIGHT.dangerTint;
  const mix = d * 0.35;
  lg.globalCompositeOperation = 'source-over';
  lg.fillStyle = 'rgba(' + [lerp(ar, dr, mix), lerp(ag, dg, mix), lerp(ab, db, mix)].map(Math.round).join(',') + ',' + (storm ? LIGHT.stormAlpha : LIGHT.ambientAlpha) + ')';
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
  for (const [spd, a, off] of [[7, 0.05, 0], [-4, 0.04, 200]]) {
    ctx.globalAlpha = a * (G.storm > 0 ? 1.8 : 1);
    const ox = ((t * spd * dpr + off) % ts + ts) % ts - ts, oy = ((t * 2 * dpr + off) % ts + ts) % ts - ts;
    for (let x = ox; x < cw; x += ts) for (let y = oy; y < ch; y += ts) ctx.drawImage(tex, x, y, ts, ts);
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  // vignette
  const vg = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.55);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,' + (0.55 + G.danger * 0.15) + ')');
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
  for (let i = texts.length - 1; i >= 0; i--) { const t = texts[i]; t.life -= dt; t.y -= dt * 0.7; if (t.life <= 0) texts.splice(i, 1); }
  for (const d of defenders) if (d.stab > 0) d.stab -= dt;
  // camp fire smoke and embers
  G.smokeT = (G.smokeT || 0) - dt;
  if (G.smokeT <= 0) {
    G.smokeT = 0.09;
    parts.push({ x: CORE.x + 0.5 + (rng() - 0.5) * 0.3, y: CORE.y + 1.4, vx: 0.15 + rng() * 0.3, vy: -0.9 - rng() * 0.5, life: 1.6, max: 1.6, color: '#8a8a90', size: 2 + (rng() * 2 | 0), grav: 0 });
    if (rng() < 0.4) parts.push({ x: CORE.x + 0.5 + (rng() - 0.5) * 0.4, y: CORE.y + 1.5, vx: (rng() - 0.5) * 0.6, vy: -1.6 - rng(), life: 0.8, max: 0.8, color: '#ffb040', size: 1, grav: 0 });
  }
}

// ---- frame ---------------------------------------------------------------
function render(realDt) {
  updateFx(realDt);
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

function renderMini() {
  mctx.imageSmoothingEnabled = false;
  mctx.clearRect(0, 0, W, H);
  mctx.drawImage(Art.mini, 0, 0);
  mctx.drawImage(fogCanvas, 0, 0);
  for (let i = 0; i < W * H; i++) if (wall[i] && explored[i]) { mctx.fillStyle = wall[i] === K.LOOKOUT ? '#4fa3e8' : '#d9a85a'; mctx.fillRect(i % W, (i / W) | 0, 1, 1); }
  mctx.fillStyle = '#e84a3a';
  for (const z of zombies) if (vis[(z.y | 0) * W + (z.x | 0)]) mctx.fillRect(z.x | 0, z.y | 0, 1, 1);
  for (const h of hordes) if (h.seen && h.alive) { mctx.strokeStyle = '#ff5a50'; mctx.strokeRect((h.cx | 0) - 3, (h.cy | 0) - 3, 7, 7); }
  for (const c of crates) { mctx.fillStyle = (G.time * 3 | 0) % 2 ? '#ffe27a' : '#fff'; mctx.fillRect((c.x | 0) - 1, (c.y | 0) - 1, 3, 3); }
  mctx.fillStyle = '#7dd0ff'; mctx.fillRect(CORE.x - 1, CORE.y - 1, 3, 3);
  mctx.fillStyle = '#ffd27a'; mctx.fillRect((P.px | 0) - 1, (P.py | 0) - 1, 3, 3);
}
