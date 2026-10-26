'use strict';
/* titlefx.js - the title-screen scene: a burning skyline at dusk, drifting fog and embers, and a slow horde on the road.
   Pure canvas, runs only while a menu is up. */
const TitleFx = (() => {
  let cv, g, raf = 0, t0 = 0, W0 = 0, H0 = 0, layers = [], embers = [], horde = [], stars = [];
  const rnd = mulberry32(2024);
  function build() {
    layers = []; embers = []; horde = []; stars = [];
    for (let i = 0; i < 90; i++) stars.push({ x: rnd(), y: rnd() * 0.5, a: 0.2 + rnd() * 0.6, p: rnd() * 6 });
    const specs = [{ k: 0.22, h: 0.34, c: '#1a1218', speed: 2, win: 0.05 }, { k: 0.4, h: 0.26, c: '#120d12', speed: 4, win: 0.1 }, { k: 0.62, h: 0.2, c: '#0a070b', speed: 7, win: 0.16 }];
    for (const s of specs) {
      const b = []; let x = -40;
      while (x < W0 + 400) { const w = 40 + rnd() * 90, h = s.h * H0 * (0.35 + rnd() * 0.8); b.push({ x, w, h, w2: rnd() < 0.3 ? 6 + rnd() * 14 : 0, ant: rnd() < 0.25 }); x += w + rnd() * 18; }
      layers.push({ ...s, b, span: x });
    }
    for (let i = 0; i < 60; i++) embers.push({ x: rnd() * W0, y: rnd() * H0, vx: 6 + rnd() * 16, vy: -(8 + rnd() * 26), s: 1 + rnd() * 1.6, p: rnd() * 6, hot: rnd() });
    for (let i = 0; i < 26; i++) horde.push({ x: rnd() * (W0 + 200) - 100, s: 0.6 + rnd() * 0.5, p: rnd() * 6, h: 18 + rnd() * 10, dy: rnd() * 22 });
  }
  function frame(now) {
    if (!cv) return;
    if (cv.width !== innerWidth || cv.height !== innerHeight) { cv.width = innerWidth; cv.height = innerHeight; W0 = cv.width; H0 = cv.height; build(); }
    const t = (now - t0) / 1000, gnd = H0 * 0.86;
    // sky: bruised purple into a burning horizon
    const sky = g.createLinearGradient(0, 0, 0, gnd);
    sky.addColorStop(0, '#07050c'); sky.addColorStop(0.45, '#1a0d1a'); sky.addColorStop(0.8, '#5a1e1a'); sky.addColorStop(1, '#c4521e');
    g.fillStyle = sky; g.fillRect(0, 0, W0, H0);
    for (const s of stars) { g.globalAlpha = s.a * (0.6 + 0.4 * Math.sin(t * 1.5 + s.p)); g.fillStyle = '#ffe9d0'; g.fillRect(s.x * W0, s.y * H0, 1.5, 1.5); }
    g.globalAlpha = 1;
    const moon = g.createRadialGradient(W0 * 0.78, H0 * 0.2, 0, W0 * 0.78, H0 * 0.2, H0 * 0.24); moon.addColorStop(0, 'rgba(255,214,170,.5)'); moon.addColorStop(1, 'rgba(255,214,170,0)');
    g.fillStyle = moon; g.fillRect(0, 0, W0, H0);
    g.fillStyle = '#ffdcb0'; g.beginPath(); g.arc(W0 * 0.78, H0 * 0.2, H0 * 0.032, 0, 6.283); g.fill();
    // skyline layers drifting slowly, with lit windows and the odd fire
    for (const L of layers) {
      const off = (t * L.speed) % L.span;
      for (const rep of [-1, 0]) for (const b of L.b) {
        const x = b.x - off + rep * L.span, y = gnd - b.h;
        if (x > W0 || x + b.w < 0) continue;
        g.fillStyle = L.c; g.fillRect(x, y, b.w, b.h + 2);
        if (b.w2) g.fillRect(x + b.w * 0.2, y - 10, b.w2, 10);
        if (b.ant) { g.fillRect(x + b.w * 0.5, y - 26, 2, 26); g.fillStyle = (Math.sin(t * 2 + b.x) > 0.3) ? '#ff3a2a' : '#401010'; g.fillRect(x + b.w * 0.5 - 1, y - 28, 4, 3); g.fillStyle = L.c; }
        const rows = Math.floor(b.h / 14), cols = Math.floor(b.w / 12);
        for (let r = 1; r < rows; r++) for (let c = 0; c < cols; c++) {
          const h = (Math.sin(b.x * 12.9898 + r * 78.233 + c * 37.719 + L.k * 100) * 43758.5453) % 1;
          if (Math.abs(h) < L.win) { g.fillStyle = Math.abs(h) < L.win * 0.3 && Math.sin(t * 3 + h * 50) > 0.6 ? '#ffb85a' : '#7a4a22'; g.globalAlpha = 0.65; g.fillRect(x + 5 + c * 12, y + 6 + r * 14, 4, 6); g.globalAlpha = 1; }
        }
      }
    }
    // a burning building: flicker glow
    const fx = W0 * 0.28, fy = gnd - H0 * 0.12, fl = 0.7 + 0.3 * Math.sin(t * 9) + 0.15 * Math.sin(t * 23);
    const fire = g.createRadialGradient(fx, fy, 0, fx, fy, 120 * fl); fire.addColorStop(0, 'rgba(255,170,60,.55)'); fire.addColorStop(1, 'rgba(255,90,20,0)');
    g.fillStyle = fire; g.fillRect(fx - 160, fy - 160, 320, 320);
    // the road and the horde walking along it
    g.fillStyle = '#0a070a'; g.fillRect(0, gnd, W0, H0 - gnd);
    g.fillStyle = '#1b1218'; g.fillRect(0, gnd, W0, 3);
    for (const z of horde) {
      const x = ((z.x + t * 9 * z.s) % (W0 + 200)) - 100, y = gnd + 12 + z.dy * 0.35 + Math.abs(Math.sin(t * 2.4 * z.s + z.p)) * -2, sc = 0.8 + z.dy / 60;
      g.fillStyle = '#050305'; const hh = z.h * sc;
      g.fillRect(x - 3 * sc, y - hh, 6 * sc, hh * 0.62); g.fillRect(x - 2 * sc, y - hh - 5 * sc, 5 * sc, 5 * sc);                       // body, head
      g.fillRect(x + 3 * sc, y - hh + 2 * sc, 9 * sc, 2 * sc);                                                                          // arm reaching
      const sw = Math.sin(t * 2.4 * z.s + z.p) * 3 * sc; g.fillRect(x - 3 * sc + sw, y - hh * 0.38, 2 * sc, hh * 0.38); g.fillRect(x + 1 * sc - sw, y - hh * 0.38, 2 * sc, hh * 0.38);
      if (z.p > 4.6) { g.fillStyle = '#e83a2a'; g.fillRect(x + 1 * sc, y - hh - 3 * sc, 1.6, 1.6); }
    }
    // fog bands
    for (let i = 0; i < 3; i++) {
      const y = gnd - 30 - i * 46, x = ((t * (6 + i * 4) + i * 300) % (W0 + 600)) - 300, fg = g.createLinearGradient(0, y - 40, 0, y + 40);
      fg.addColorStop(0, 'rgba(120,70,60,0)'); fg.addColorStop(0.5, 'rgba(150,90,70,' + (0.1 - i * 0.02) + ')'); fg.addColorStop(1, 'rgba(120,70,60,0)');
      g.fillStyle = fg; g.fillRect(x - 300, y - 40, W0 + 600, 80);
    }
    // embers
    const dt = 1 / 60;
    for (const e of embers) {
      e.x += (e.vx + Math.sin(t + e.p) * 8) * dt; e.y += e.vy * dt;
      if (e.y < -10 || e.x > W0 + 10) { e.x = rnd() * W0 - 20; e.y = H0 + 10; }
      g.globalAlpha = 0.35 + 0.5 * Math.abs(Math.sin(t * 3 + e.p)); g.fillStyle = e.hot > 0.5 ? '#ffb040' : '#ff6a28'; g.fillRect(e.x, e.y, e.s, e.s);
    }
    g.globalAlpha = 1;
    const vg = g.createRadialGradient(W0 / 2, H0 / 2, H0 * 0.3, W0 / 2, H0 / 2, H0 * 0.9); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.72)');
    g.fillStyle = vg; g.fillRect(0, 0, W0, H0);
    raf = requestAnimationFrame(frame);
  }
  return {
    start(canvas) { if (raf) return; cv = canvas; g = cv.getContext('2d'); cv.width = 0; t0 = performance.now(); raf = requestAnimationFrame(frame); },
    stop() { if (raf) cancelAnimationFrame(raf); raf = 0; },
  };
})();
