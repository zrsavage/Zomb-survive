/* Offline cache: the whole game is static files. */
const CACHE = 'zomb-survive-v9';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png',
  'js/config.js', 'js/util.js', 'js/cloud.js', 'js/world.js', 'js/art.js', 'js/audio.js', 'js/sim.js', 'js/story.js', 'js/outside.js', 'js/base.js', 'js/survival.js', 'js/campaign.js', 'js/ai.js', 'js/units.js', 'js/combat.js', 'js/items.js', 'js/icons.js', 'js/build.js', 'js/interior.js', 'js/weapons.js', 'js/hints.js', 'js/intro.js', 'js/quick.js', 'js/apps.js', 'js/titlefx.js', 'js/render.js', 'js/save.js', 'js/ui.js', 'js/debug.js', 'js/main.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(ch => ch.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
