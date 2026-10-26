'use strict';
/* util.js - small shared helpers. */

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
let rng = Math.random;                       // gameplay randomness
const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const isCoreTile = (x, y) => Math.abs(x - CORE.x) <= 1 && Math.abs(y - CORE.y) <= 1;
const COMPASS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
const compass = (dx, dy) => COMPASS[Math.round(Math.atan2(dy, dx) / (Math.PI / 4) + 8) % 8];
const fmtTime = s => (s / 60 | 0) + ':' + String(s % 60 | 0).padStart(2, '0');
const pick = (arr, r = rng) => arr[r() * arr.length | 0];
function weighted(table, key, r = rng) {      // table: { name: {weight} }
  let total = 0; for (const k in table) total += table[k][key];
  let x = r() * total;
  for (const k in table) { x -= table[k][key]; if (x <= 0) return k; }
  return Object.keys(table)[0];
}
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, n >> 8 & 255, n & 255]; }
// storage can be missing or blocked (private windows, sandboxed pages): never let it stop the game
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  remove(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
};
function shade(hex, f) {                      // f<1 darker, f>1 lighter
  const [r, g, b] = hexToRgb(hex);
  const c = v => clamp(Math.round(v * f), 0, 255);
  return '#' + [c(r), c(g), c(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}
