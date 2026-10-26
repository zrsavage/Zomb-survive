'use strict';
/* intro.js - the way into the game: a short opening, a camp that is cold and ruined, and a chain of small jobs that teach
   the whole loop (walk, search, light the fire, fight, loot, plan a wall, build it, check supplies). While it runs the
   dead stay away so nobody is punished for reading. */
const Intro = (() => {
  const I = {};
  const SLIDES = [
    ['DAY 31', 'The city fell in nine days.', 'You have been walking for twenty-two.'],
    ['What you have left', 'A pistol with a few rounds.', 'A road out of the dead, and nobody behind you.'],
    ['Ahead', 'A camp someone abandoned in a hurry.', 'The fire is cold. The tents are torn.', 'It will have to be enough.'],
  ];
  const ring = r => { const o = []; for (let a = 0; a < 6.283; a += 0.35) o.push([Math.cos(a) * r, Math.sin(a) * r]); return o; };
  let el = null, card = null, slide = 0, typing = 0;

  const STEPS = [
    { id: 'move',   title: 'Get your bearings', text: 'Move with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or the arrow keys. Hold <kbd>Shift</kbd> to run (running is louder). Walk a few steps.',
      prog: () => Math.min(1, I.walked / 8), done: () => I.walked >= 8 },
    { id: 'cache',  title: 'Find your gear', text: 'A cache is half-buried by the ashes. Walk up to it and press <kbd>E</kbd>: a window shows what is inside. Take what you need.',
      target: () => I.cache, done: () => !crates.includes(I.cache) },
    { id: 'fire',   title: 'Light the fire', text: 'Stand at the cold fire in the middle of camp and hold <kbd>E</kbd>. A lit fire is light, warmth, and a place for people to come to.',
      target: () => ({ x: CORE.x + 0.5, y: CORE.y + 1.2 }), prog: () => I.fireP, done: () => G.fireLit !== false },
    { id: 'fight',  title: 'They followed you', text: 'Walkers are coming up the road. <b>Aim with the mouse</b> and hold the <b>left button</b> to fire. <kbd>R</kbd> reloads. <kbd>F</kbd> or right-click swings at anything close. Every shot is heard. Put down 3.',
      prog: () => Math.min(1, (G.kills - I.k0) / 3), done: () => G.kills - I.k0 >= 3, start() { I.k0 = G.kills; spawnWalkers(3); } },
    { id: 'search', title: 'Search a building', text: 'The marked house may still hold food, ammo and scrap. Walk to its door and hold <kbd>E</kbd>. A window will show what you found.',
      target: () => { const b = I.house; return b ? { x: b.x + b.w / 2, y: b.y + b.h + 0.4 } : null; }, done: () => !I.house || I.house.looted, start() { I.house = pickHouse(); } },
    { id: 'wall',   title: 'Plan a wall', text: 'Press <kbd>1</kbd> (Wall) and click the ground just outside camp, or drag to draw a line. Walls are <b>planned</b>, not built: the wood &amp; scrap is set aside and they wait for hands.',
      prog: () => Math.min(1, (wallCount() + (G.blue || []).length) / 4), done: () => wallCount() + (G.blue || []).length >= 4 },
    { id: 'build',  title: 'Build it', text: 'Stand next to the blueprints and hold still. Each piece takes time, and you only have one pair of hands. <kbd>J</kbd> opens the build queue where you can set what comes first.',
      prog: () => Math.min(1, wallCount() / 4), done: () => wallCount() >= 4 && !(G.blue || []).length },
    { id: 'pack',   title: 'Know what you have', text: 'Press <kbd>I</kbd>. Your pack and the camp stockpile are listed with what each resource is for. Wood &amp; scrap builds, food and water keep people alive, ammo is everything.',
      done: () => I.packSeen },
  ];
  const wallCount = () => { let n = 0; for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) { const x = CORE.x + dx, y = CORE.y + dy; if (inb(x, y) && wall[y * W + x] === K.WALL) n++; } return n; };
  function pickHouse() {
    let best = null, bd = 1e9;                                               // near camp, and away from the dead
    for (const b of buildings) {
      if (b.looted || b.locked || b.nest || b.crew || b.type !== 'house') continue;
      const dx = b.x + b.w / 2, dy = b.y + b.h, d = Math.hypot(dx - CORE.x, dy - CORE.y); if (d <= 6) continue;
      let n = 0; for (const z of zombies) if (Math.hypot(z.x - dx, z.y - dy) < 8) n++;
      const sc = d + n * 1.5; if (sc < bd) { bd = sc; best = b; }
    }
    if (best) {                                                              // quietly thin out the dead around the door and along the way, so the first trip is a lesson, not a funeral
      const ex = best.x + best.w / 2, ey = best.y + best.h, sx = CORE.x + 0.5, sy = CORE.y + 0.5, L2 = (ex - sx) ** 2 + (ey - sy) ** 2 || 1;
      for (let k = zombies.length - 1; k >= 0; k--) {
        const z = zombies[k]; if (z.mode !== 0 && z.mode !== 3) continue;
        const t = clamp(((z.x - sx) * (ex - sx) + (z.y - sy) * (ey - sy)) / L2, 0, 1), px = sx + (ex - sx) * t, py = sy + (ey - sy) * t;
        if (Math.hypot(z.x - ex, z.y - ey) < 9 || Math.hypot(z.x - px, z.y - py) < 4) zombies.splice(k, 1);
      }
    }
    return best;
  }
  function spawnWalkers(n) {
    for (let k = 0, tries = 0; k < n && tries < 80; tries++) {
      const a = rng() * 6.283, r = 15 + rng() * 4, x = CORE.x + 0.5 + Math.cos(a) * r, y = CORE.y + 0.5 + Math.sin(a) * r;
      if (!inb(x | 0, y | 0) || bld[(y | 0) * W + (x | 0)] >= 0 || wall[(y | 0) * W + (x | 0)] || dist[(y | 0) * W + (x | 0)] === Infinity) continue;
      const z = makeZombie(x, y, 1, 0, 'walker'); zombies.push(z); k++;
    }
  }

  // ---- the opening --------------------------------------------------------------------------------
  I.begin = function () {
    G.intro = { step: 0 }; G.introHold = true; G.fireLit = false; G.ruins = true;
    G.ammo = 10; G.food = 12; G.nextHorde = Math.max(G.nextHorde, 900); G.eventT = 900; G.refugeeT = 900;
    P.mag = 5; P.inv = [];
    I.cache = { x: CORE.x + 0.5 - 2.6, y: CORE.y + 2.6, t: 1e9, type: 'pile', title: 'A buried cache', items: [{ r: 'a', n: 35 }, { r: 'f', n: 18 }, { i: 'bandage', n: 1 }] };
    crates.push(I.cache);
    I.walked = 0; I.lx = P.px; I.ly = P.py; I.fireP = 0; I.packSeen = false; I.stepStarted = -1;
    G.paused = true; slide = 0; showSlide();
  };
  function showSlide() {
    card = card || document.getElementById('introCard');
    card.classList.add('show');
    const s = SLIDES[slide];
    card.innerHTML = '<div class="ic"><div class="ik">' + s[0] + '</div>' + s.slice(1).map((l, i) => '<p style="animation-delay:' + (0.6 + i * 1.1) + 's">' + l + '</p>').join('') +
      '<div class="ih">' + (slide < SLIDES.length - 1 ? 'Click or press Space' : 'Click or press Space to begin') + ' &nbsp;·&nbsp; <a href="#" id="icSkip">skip intro</a></div></div>';
    document.getElementById('icSkip').onclick = e => { e.preventDefault(); e.stopPropagation(); finishSlides(); };
    typing = performance.now();
  }
  function advance() { if (!card || !card.classList.contains('show')) return false; if (performance.now() - typing < 500) return true; slide++; if (slide >= SLIDES.length) finishSlides(); else showSlide(); return true; }
  function finishSlides() { card.classList.remove('show'); G.paused = false; render_hint(); }
  const render_hint = () => { if (G.intro) toast('Look around. You are not alone out here.'); };
  I.slidesOpen = () => !!(card && card.classList.contains('show'));
  I.onKey = k => { if (!I.slidesOpen()) return false; if (k === ' ' || k === 'enter' || k === 'e') advance(); else if (k === 'escape') finishSlides(); return true; };
  I.onClick = () => advance();

  // ---- the guided jobs ------------------------------------------------------------------------------
  function panel() { return el || (el = document.getElementById('obj')); }
  let shown = '';
  function paint() {
    const g = G.intro, p = panel(); if (!g) { p.classList.remove('show'); return; }
    const s = STEPS[g.step];
    const pr = s.prog ? Math.round(s.prog() * 100) : -1, key = g.step + ':' + pr;
    if (key === shown) return; shown = key;
    p.classList.add('show');
    p.innerHTML = '<div class="oh"><span>FIRST HOURS ' + (g.step + 1) + '/' + STEPS.length + '</span><a href="#" id="obSkip">skip tutorial</a></div><b>' + s.title + '</b><div class="ot">' + s.text + '</div>' +
      (pr >= 0 ? '<div class="obar"><i style="width:' + pr + '%"></i></div>' : '');
    document.getElementById('obSkip').onclick = e => { e.preventDefault(); end(true); };
  }
  function end(skipped) {
    if (!G.intro) return;
    G.intro = null; G.introHold = false; G.fireLit = true; shown = ''; panel().classList.remove('show');
    G.nextHorde = Math.max(G.nextHorde, 420); G.eventT = 150; G.refugeeT = 240;
    if (skipped && I.cache && crates.includes(I.cache)) {                  // skipping should not leave the starting cache lying in the dirt
      crates.splice(crates.indexOf(I.cache), 1); Loot.open('', (I.cache.items || []).map(e => ({ ...e })), { auto: true }); log('You took the buried cache with you.');
    }
    I.cache = null;
    if (!skipped) { floatText(P.px, P.py - 1.6, 'THE CAMP STANDS', '#ffe27a'); log('The camp stands. Hold it. Others will come, and so will the dead.'); }
    toast(skipped ? 'Tutorial skipped. Press J (build queue), I (pack), K (work) any time.' : 'You are on your own now. Hold the line.');
  }
  I.update = function (dt) {
    const g = G.intro; if (!g || I.slidesOpen()) return;
    if (!I.cache) I.cache = crates.find(c => c.type === 'pile') || null;     // after loading a save
    const s = STEPS[g.step];
    if (I.stepStarted !== g.step) { I.stepStarted = g.step; if (s.start) s.start(); }
    I.walked += Math.hypot(P.px - I.lx, P.py - I.ly); I.lx = P.px; I.ly = P.py;
    if (g.step === 2 && !Loot.isOpen()) {                                 // holding E at the fire
      if (keys.e && Math.hypot(P.px - CORE.x - 0.5, P.py - CORE.y - 1.2) < 3.4) { I.fireP = Math.min(1, I.fireP + dt / 1.6); Snd.tick(); if (I.fireP >= 1) { G.fireLit = true; shake(0.6); Snd.build(); floatText(CORE.x + 0.5, CORE.y, 'THE FIRE IS LIT', '#ffb04a'); } }
      else I.fireP = Math.max(0, I.fireP - dt * 0.8);
    }
    if (g.step === 7 && $pack().classList.contains('show')) I.packSeen = true;
    if (s.done()) { g.step++; Snd.pickup && Snd.pickup(); shown = ''; if (g.step >= STEPS.length) end(false); else toast('Done: ' + s.title); }
    paint();
  };
  const $pack = () => document.getElementById('pack');

  // ---- what you see ---------------------------------------------------------------------------------
  I.drawGround = function (ctx) {                                         // the ruins around the cold fire
    if (!G || !G.ruins) return;
    const cx = (CORE.x + 0.5) * T, cy = (CORE.y + 1.4) * T;
    ctx.fillStyle = '#0e0b09'; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.ellipse(cx, cy + 2, 30, 17, 0, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = '#2a2420'; for (const [dx, dy, r] of [[-6, 0, 3], [6, 1, 3], [-3, 5, 2.5], [4, -4, 2.5], [0, -6, 2]]) { ctx.beginPath(); ctx.arc(cx + dx * 3, cy + dy * 2.5, r * 2, 0, 6.283); ctx.fill(); }
    // a torn tent, a toppled cot, scattered tins and a dark stain
    ctx.fillStyle = '#4a4a38'; ctx.beginPath(); ctx.moveTo(cx - 64, cy - 6); ctx.lineTo(cx - 46, cy - 26); ctx.lineTo(cx - 28, cy - 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#35352a'; ctx.beginPath(); ctx.moveTo(cx - 46, cy - 26); ctx.lineTo(cx - 28, cy - 6); ctx.lineTo(cx - 40, cy - 4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#1a1a14'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - 52, cy - 8); ctx.lineTo(cx - 46, cy - 18); ctx.lineTo(cx - 40, cy - 8); ctx.stroke();
    ctx.fillStyle = '#5a4a32'; ctx.fillRect(cx + 34, cy - 4, 22, 7); ctx.fillStyle = '#3a2f20'; ctx.fillRect(cx + 34, cy + 2, 22, 2); ctx.fillRect(cx + 36, cy + 3, 2, 5); ctx.fillRect(cx + 52, cy + 3, 2, 3);
    ctx.fillStyle = '#7a1c1c'; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.ellipse(cx + 20, cy + 16, 9, 4, 0.2, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = '#8a8f98'; for (const [dx, dy] of [[-14, 14], [-2, 20], [40, 14], [-30, 6], [22, -12]]) ctx.fillRect(cx + dx, cy + dy, 3, 4);
    ctx.fillStyle = '#c8302a'; ctx.fillRect(cx - 14, cy + 15, 3, 1);
    if (G.fireLit === false) {                                              // the dead fire: black logs, a thread of smoke
      ctx.fillStyle = '#17120e'; ctx.fillRect(cx - 8, cy - 3, 16, 5); ctx.fillStyle = '#2c241c'; ctx.fillRect(cx - 7, cy - 5, 14, 2); ctx.fillRect(cx - 5, cy - 7, 10, 2);
      const t = (G.time || 0); ctx.fillStyle = '#3a3a3a'; ctx.globalAlpha = 0.4; for (let k = 0; k < 4; k++) ctx.fillRect(cx - 1 + Math.sin(t + k) * 2, cy - 9 - k * 4, 2, 2); ctx.globalAlpha = 1;
    }
  };
  I.draw = function (ctx) {                                               // the objective marker
    const g = G && G.intro; if (!g || I.slidesOpen()) return;
    const s = STEPS[g.step], t = s.target && s.target(); if (!t) return;
    const tx = t.x * T, ty = t.y * T, t0 = G.time || 0, d = Math.hypot(t.x - P.px, t.y - P.py), bob = Math.sin(t0 * 5) * 3;
    ctx.fillStyle = '#ffe27a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(tx, ty - 22 + bob); ctx.lineTo(tx - 6, ty - 32 + bob); ctx.lineTo(tx + 6, ty - 32 + bob); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (d > 5) {                                                          // an arrow beside you pointing the way
      const a = Math.atan2(t.y - P.py, t.x - P.px), ax = P.px * T + Math.cos(a) * 30, ay = (P.py - 0.5) * T + Math.sin(a) * 30;
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(a); ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-4, -5); ctx.lineTo(-2, 0); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      ctx.font = '7px monospace'; ctx.fillStyle = '#ffe9b0'; ctx.fillText(Math.round(d) + 'm', ax + Math.cos(a) * 12 - 8, ay + Math.sin(a) * 12 + 3);
    }
  };
  return I;
})();
