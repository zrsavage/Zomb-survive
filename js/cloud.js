'use strict';
/* cloud.js - keeps the save somewhere that survives: the viewer's private database when the page runs as an artifact
   (nothing to sign in to, nothing to set up), mirrored beside the browser's own storage. Also packs a save into a text
   string you can copy out and paste back in. All of it fails quietly: the game never depends on any of it. */
const Cloud = (() => {
  const C = { state: 'off', t: 0 };            // off | connecting | ready | error
  let db = null, uid = null, busy = false, pending = null;
  const CHUNK = 150000;

  async function pack(str) {                   // text -> gzip -> base64 (falls back to plain text when the browser cannot compress)
    try {
      if (typeof CompressionStream === 'undefined') throw new Error('nogz');
      const cs = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
      const buf = new Uint8Array(await new Response(cs).arrayBuffer());
      let s = ''; for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));
      return 'HF1:' + btoa(s);
    } catch (e) { return 'HF0:' + btoa(unescape(encodeURIComponent(str))); }
  }
  async function unpack(txt) {
    txt = (txt || '').trim();
    if (txt.startsWith('HF0:')) return decodeURIComponent(escape(atob(txt.slice(4))));
    if (!txt.startsWith('HF1:')) throw new Error('That does not look like a save');
    const s = atob(txt.slice(4)), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    const ds = new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(ds).text();
  }
  C.pack = pack; C.unpack = unpack;

  C.init = async function () {
    try {
      if (!window.claude || !window.claude.use) return;
      C.state = 'connecting';
      db = await claude.use('db'); const user = await claude.use('user');
      uid = user && user.id ? await user.id() : null;
      if (!db || !uid) { db = null; C.state = 'off'; return; }
      const meta = await db.doc('data/users/' + uid + '/hf_meta').get();
      C.state = 'ready';
      if (meta.exists && meta.data().n > 0) {
        const m = meta.data(), local = +(store.get('hf-save-t') || 0);
        if (!Save.raw() || (m.t || 0) > local) { const txt = await C.pull(m); if (txt) { Save.adopt(txt, m.t || Date.now()); if (typeof UI !== 'undefined' && UI.refreshTitle) UI.refreshTitle(); } }
      } else if (Save.raw() && !(meta.exists && meta.data().n === 0)) C.push(Save.raw());                         // first run with a browser save already: mirror it
    } catch (e) { C.state = 'error'; }
  };
  C.pull = async function (m) {
    try {
      let packed = '';
      for (let i = 0; i < m.n; i++) { const d = await db.doc('data/users/' + uid + '/hf_' + i).get(); if (!d.exists) return null; packed += d.data().d; }
      return await unpack(packed);
    } catch (e) { return null; }
  };
  C.clear = function () {                      // a finished run leaves no save behind
    if (!db || !uid) return;
    pending = null; db.doc('data/users/' + uid + '/hf_meta').set({ n: 0, t: Date.now(), v: 1 }).catch(() => {});
  };
  C.push = function (jsonStr) {                // fire and forget; only the newest save waits its turn
    if (!db || !uid) return; pending = jsonStr; if (busy) return;
    busy = true;
    (async () => {
      while (pending) {
        const cur = pending; pending = null;
        try {
          const packed = await pack(cur), n = Math.ceil(packed.length / CHUNK), t = Date.now();
          for (let i = 0; i < n; i++) await db.doc('data/users/' + uid + '/hf_' + i).set({ d: packed.slice(i * CHUNK, (i + 1) * CHUNK) });
          await db.doc('data/users/' + uid + '/hf_meta').set({ n, t, v: 1 });
          store.set('hf-save-t', String(t)); C.t = t; C.state = 'ready';
        } catch (e) { C.state = 'error'; }
      }
      busy = false;
    })();
  };
  return C;
})();
