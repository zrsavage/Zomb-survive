// People who want to join the camp wait here until the player says yes (or no).
const Apps = (() => {
  const A = {}, WAIT = 120, MAX = 8;
  let el = null, shown = '';
  const list = () => G.apps || (G.apps = []);
  A.add = function (s, why) {
    if (typeof AI !== 'undefined' && AI.on) { if (roomForPerson()) { G.idle.push(s); log(intro(s) + ' ' + why.replace(/ asks? .*/, ' and joined')); moraleGain('refugee'); } return; }
    const L = list(); if (L.length >= MAX) L.shift();
    L.push({ s, why, t: WAIT }); Snd.pickup(); toast(who(s) + ' ' + why + '. Accept? (Y / N)');
  };
  function accept() {
    const a = list()[0]; if (!a) return;
    if (!roomForPerson()) { warn('No room in the camp: build housing or wall in more ground first'); return; }
    list().shift(); G.idle.push(a.s); log(intro(a.s) + ' joined the camp.'); moraleGain('refugee'); Snd.upgrade && Snd.upgrade();
  }
  function decline() { const a = list().shift(); if (a) log(who(a.s) + ' was turned away.'); }
  A.accept = accept; A.decline = decline;
  A.onKey = (k, building) => {
    if (!G || !list().length || G.paused || G.over) return false;
    if (k === 'y') { accept(); return true; }
    if (k === 'n' && !building) { decline(); return true; }
    return false;
  };
  A.tick = function (dt) {
    const L = list();
    for (let i = L.length - 1; i >= 0; i--) if ((L[i].t -= dt) <= 0) { log(who(L[i].s) + ' gave up waiting and moved on.'); L.splice(i, 1); }
    el = el || document.getElementById('appl'); if (!el) return;
    const a = L[0], key = a ? a.s.id + ':' + L.length + ':' + roomForPerson() : '';
    if (key === shown) return; shown = key;
    if (!a) { el.classList.remove('show'); return; }
    const s = a.s;
    el.innerHTML = '<div class="at">SOMEONE AT THE GATE' + (L.length > 1 ? ' (+' + (L.length - 1) + ' more)' : '') + '</div><div class="an">' + intro(s) + '</div><div class="as">' + (s.story || '') + ' - ' + (ROLES[s.role] ? ROLES[s.role].desc : '') + '<br>' + (roomForPerson() ? '' : 'No room right now: build housing first. ') + 'Camp holds ' + people() + ' / ' + popCap() + '.</div>' +
      '<button id="apY">Let them in (Y)</button><button id="apN" class="alt">Turn away (N)</button>';
    el.classList.add('show');
    document.getElementById('apY').onclick = () => { Snd.click(); accept(); };
    document.getElementById('apN').onclick = () => { Snd.click(); decline(); };
  };
  return A;
})();
