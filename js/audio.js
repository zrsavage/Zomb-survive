'use strict';
/* ======================================================================
   audio.js - everything is synthesised with WebAudio, so there are no
   asset files. Sounds are positional (volume + pan from the camera), the
   horde rumble swells as one nears (a warning even without lookouts),
   and a drone adds tension as danger rises.
   ====================================================================== */
const Snd = {
  ctx: null, master: null, muted: false, vol: 0.6, noise: null, last: {}, hb: 0,
  wind: null, rumble: null, drone: null, droneGain: null, mix: { comp: null },

  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : this.vol;
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
      this.master.connect(comp); comp.connect(c.destination);
      const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      // ambience layers
      const loopNoise = (type, freq, q) => {
        const s = c.createBufferSource(); s.buffer = buf; s.loop = true;
        const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
        const g = c.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(this.master); s.start();
        return { g, f };
      };
      this.wind = loopNoise('bandpass', 420, 0.5);
      this.rumble = loopNoise('lowpass', 85, 0.7);
      const o1 = c.createOscillator(), o2 = c.createOscillator(), lp = c.createBiquadFilter();
      o1.type = o2.type = 'sawtooth'; o1.frequency.value = 55; o2.frequency.value = 55.8; lp.type = 'lowpass'; lp.frequency.value = 180;
      this.droneGain = c.createGain(); this.droneGain.gain.value = 0;
      o1.connect(lp); o2.connect(lp); lp.connect(this.droneGain); this.droneGain.connect(this.master); o1.start(); o2.start();
    } catch (e) { this.ctx = null; }
  },
  resume() { this.init(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = this.muted ? 0 : v; },
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : this.vol; return this.muted; },

  _gate(name, gap) { const t = performance.now(); if (this.last[name] && t - this.last[name] < gap) return false; this.last[name] = t; return true; },
  _pos(x, y) {                                   // volume + stereo pan relative to the camera
    if (x === undefined || !G) return { gain: 1, pan: 0 };
    const dx = x - G.cam.x, dy = y - G.cam.y, d = Math.hypot(dx, dy);
    return { gain: Math.pow(clamp(1 - d / 26, 0, 1), 1.6), pan: clamp(dx / 16, -1, 1) };
  },
  _out(gain, pan) {
    const c = this.ctx, g = c.createGain(); g.gain.value = gain;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.master); } else g.connect(this.master);
    return g;
  },
  burst(o) {                                      // filtered noise burst
    const c = this.ctx, { gain, pan } = this._pos(o.x, o.y), v = gain * (o.gain || 1);
    if (v < 0.01) return;
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = o.type || 'lowpass'; f.Q.value = o.q || 0.8;
    const t = c.currentTime; f.frequency.setValueAtTime(o.f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, o.f1 || o.f0), t + o.dur);
    const g = this._out(0, pan); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + o.dur);
    s.connect(f); f.connect(g); s.start(t, Math.random()); s.stop(t + o.dur + 0.05);
  },
  tone(o) {
    const c = this.ctx, { gain, pan } = this._pos(o.x, o.y), v = gain * (o.gain || 1);
    if (v < 0.01) return;
    const os = c.createOscillator(); os.type = o.type || 'sine';
    const t = c.currentTime; os.frequency.setValueAtTime(o.f0, t); os.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1 || o.f0), t + o.dur);
    if (o.vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = o.vib; lg.gain.value = o.f0 * 0.06; l.connect(lg); lg.connect(os.frequency); l.start(t); l.stop(t + o.dur + 0.05); }
    let node = os;
    if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; os.connect(f); node = f; }
    const g = this._out(0, pan); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + (o.attack || 0.005)); g.gain.exponentialRampToValueAtTime(0.001, t + o.dur);
    node.connect(g); os.start(t); os.stop(t + o.dur + 0.05);
  },

  // ---- effects ---------------------------------------------------------------
  shot(x, y, sniper) {
    if (!this.ctx || !this._gate('shot', 28)) return;
    this.burst({ x, y, type: 'lowpass', f0: sniper ? 2600 : 3800, f1: 300, dur: sniper ? 0.32 : 0.16, gain: 0.5, q: 0.6 });
    this.tone({ x, y, type: 'triangle', f0: sniper ? 130 : 170, f1: 45, dur: sniper ? 0.25 : 0.14, gain: 0.55 });
  },
  stab(x, y) { if (this.ctx && this._gate('stab', 45)) this.burst({ x, y, type: 'bandpass', f0: 1800, f1: 600, dur: 0.08, gain: 0.35, q: 1.2 }); },
  hit(x, y) { if (this.ctx && this._gate('hit', 60)) this.tone({ x, y, type: 'sine', f0: 110, f1: 60, dur: 0.09, gain: 0.25 }); },
  groan(x, y) {
    if (!this.ctx || !this._gate('groan', 160)) return;
    const f = 70 + Math.random() * 60;
    this.tone({ x, y, type: 'sawtooth', f0: f * 1.3, f1: f * 0.8, dur: 0.7 + Math.random() * 0.5, gain: 0.22, vib: 5 + Math.random() * 3, lp: 420, attack: 0.12 });
  },
  scream(x, y) {
    if (!this.ctx || !this._gate('scream', 400)) return;
    this.tone({ x, y, type: 'sawtooth', f0: 520, f1: 900, dur: 1.1, gain: 0.5, vib: 9, lp: 2400, attack: 0.05 });
    this.tone({ x, y, type: 'square', f0: 780, f1: 640, dur: 1.1, gain: 0.15, vib: 11, lp: 2000, attack: 0.05 });
  },
  boom(x, y) {
    if (!this.ctx || !this._gate('boom', 90)) return;
    this.burst({ x, y, type: 'lowpass', f0: 900, f1: 60, dur: 0.7, gain: 0.9, q: 0.5 });
    this.tone({ x, y, type: 'sine', f0: 90, f1: 30, dur: 0.6, gain: 0.8 });
  },
  hurt() { if (this.ctx && this._gate('hurt', 200)) this.tone({ type: 'sawtooth', f0: 240, f1: 120, dur: 0.22, gain: 0.35, lp: 900 }); },
  build() { if (this.ctx && this._gate('build', 50)) { this.burst({ type: 'bandpass', f0: 500, f1: 200, dur: 0.1, gain: 0.5, q: 2 }); this.tone({ type: 'square', f0: 140, f1: 90, dur: 0.07, gain: 0.2, lp: 700 }); } },
  demolish() { if (this.ctx && this._gate('demo', 60)) this.burst({ type: 'lowpass', f0: 700, f1: 100, dur: 0.18, gain: 0.5 }); },
  loot() { if (this.ctx) { this.tone({ type: 'triangle', f0: 520, f1: 760, dur: 0.12, gain: 0.35 }); setTimeout(() => this.tone({ type: 'triangle', f0: 760, f1: 1040, dur: 0.18, gain: 0.35 }), 90); } },
  tick() { if (this.ctx && this._gate('tick', 260)) this.burst({ type: 'bandpass', f0: 900, f1: 500, dur: 0.05, gain: 0.25, q: 3 }); },
  pickup() { if (this.ctx) { this.tone({ type: 'sine', f0: 660, f1: 990, dur: 0.15, gain: 0.35 }); setTimeout(() => this.tone({ type: 'sine', f0: 990, f1: 1320, dur: 0.2, gain: 0.3 }), 110); } },
  upgrade() { if (this.ctx) [392, 494, 587, 784].forEach((f, i) => setTimeout(() => this.tone({ type: 'triangle', f0: f, f1: f, dur: 0.3, gain: 0.35 }), i * 110)); },
  click() { if (this.ctx && this._gate('click', 40)) this.tone({ type: 'square', f0: 700, f1: 500, dur: 0.04, gain: 0.12, lp: 2000 }); },
  error() { if (this.ctx && this._gate('err', 200)) this.tone({ type: 'square', f0: 160, f1: 120, dur: 0.12, gain: 0.2, lp: 600 }); },
  horn() { if (this.ctx) { this.tone({ type: 'sawtooth', f0: 220, f1: 220, dur: 1.1, gain: 0.5, lp: 900, attack: 0.08 }); setTimeout(() => this.tone({ type: 'sawtooth', f0: 165, f1: 165, dur: 1.3, gain: 0.5, lp: 800, attack: 0.08 }), 650); } },
  thunder() { if (this.ctx) this.burst({ type: 'lowpass', f0: 500, f1: 40, dur: 2.2, gain: 0.8, q: 0.4 }); },
  drop() { if (this.ctx) { this.tone({ type: 'sine', f0: 900, f1: 200, dur: 0.8, gain: 0.3 }); setTimeout(() => this.boom(), 800); } },
  rescue() { if (this.ctx) for (let i = 0; i < 6; i++) setTimeout(() => this.tone({ type: 'triangle', f0: 330 + i * 70, f1: 330 + i * 70, dur: 0.25, gain: 0.35 }), i * 120); },

  // ---- continuous layers (called every frame) ---------------------------------------------------------------
  update(dt) {
    if (!this.ctx || !G) return;
    const t = this.ctx.currentTime, storm = G.storm > 0 ? 1 : 0;
    this.wind.g.gain.setTargetAtTime(0.05 + storm * 0.1 + 0.025 * Math.sin(t * 0.37), t, 0.5);
    this.wind.f.frequency.setTargetAtTime(380 + 160 * Math.sin(t * 0.21) + storm * 200, t, 0.5);
    this.rumble.g.gain.setTargetAtTime((G.rumble || 0) * 0.9, t, 0.4);
    this.droneGain.gain.setTargetAtTime(0.018 + (G.danger || 0) * 0.075, t, 1.2);
    if (P && P.hp < 35 && !G.over) {
      this.hb -= dt;
      if (this.hb <= 0) { this.hb = 0.75 - (35 - P.hp) * 0.008; this.tone({ type: 'sine', f0: 62, f1: 40, dur: 0.16, gain: 0.55 }); setTimeout(() => this.tone({ type: 'sine', f0: 55, f1: 38, dur: 0.14, gain: 0.4 }), 150); }
    }
  },
};
