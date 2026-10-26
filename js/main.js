'use strict';
/* main.js - boot and the frame loop. */
let last = performance.now(), miniT = 0;

function frame(now) {
  const real = Math.min(0.05, (now - last) / 1000); last = now;
  if (G) {
    const playing = !G.paused && !G.over && !UI.menuOpen();
    if (playing) {
      for (let s = 0; s < G.speed; s++) simulate(real);
      G.saveT -= real; if (G.saveT <= 0) { G.saveT = 30; Save.save(); }
    }
    if (!G.cam.free) { const f = Math.min(1, real * 6); G.cam.x += (P.px - G.cam.x) * f; G.cam.y += (P.py - G.cam.y) * f; }
    G.hudT -= real;
    if (G.hudT <= 0) { G.hudT = 0.1; UI.update(); }
    miniT -= real; if (miniT <= 0) { miniT = 0.2; renderMini(); }
    render(real);
    if (playing) Snd.update(real);
  }
  requestAnimationFrame(frame);
}

setQuality('high');
buildSprites();
resize();
UI.init();
UI.bindInput();
newGame(store.get('zomb-diff') || 'normal');       // a live backdrop behind the title menu
UI.showMenu('title');
Cloud.init();                                   // finds the private cloud save (if any) a moment after the title appears
requestAnimationFrame(frame);

// exposed for debugging / tests
window.__game = {
  get G() { return G; }, get P() { return P; }, zombies: () => zombies, defenders: () => defenders, hordes: () => hordes,
  traps: () => traps, crates: () => crates, buildings: () => buildings, tryBuild, startHorde, simulate, keys, newGame, Save, UI, Snd, Art,
};

// offline / installable (needs http(s); ignored on file://)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
