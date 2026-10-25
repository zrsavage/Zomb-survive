'use strict';
/* ui.js - HUD, panels, menus and input. Talks to the sim only through its
   public functions (tryBuild, upgradeCore, startResearch, ...). */
let toastTimer = 0;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 4600);
}

const TOOLS = [
  { id: 'wall',    key: '1', label: 'Wall',          cost: () => effCost('wall'),    tip: 'Free-form barricade. Zombies pile up and climb it.' },
  { id: 'tower',   key: '2', label: 'Tower',         cost: () => effCost('tower'),   tip: 'Sturdy; survivors shoot farther from it. Upgrades a wall.' },
  { id: 'gate',    key: '3', label: 'Gate',          cost: () => effCost('gate'),    tip: 'You walk through freely. Zombies treat it as a wall.' },
  { id: 'lookout', key: '4', label: 'Lookout',       cost: () => effCost('lookout'), tip: 'Spots hordes early and reveals the map. Place anywhere.' },
  { id: 'spike',   key: '5', label: 'Spike trap',    cost: () => effCost('spike'),   tip: 'Cuts down zombies that walk over it. Wears out.' },
  { id: 'barrel',  key: '6', label: 'Fire barrel',   cost: () => effCost('barrel'),  tip: 'Ignites when a crowd gathers. One use.' },
  { id: 'def',     key: '7', label: 'Post survivor', cost: () => ({}),               tip: 'Put the selected idle survivor on a wall/tower/lookout.' },
  { id: 'crew',    key: '8', label: 'Send crew',     cost: () => ({ a: CREW.ammoCost }), tip: 'Click a scouted building. Risky but pays more.' },
  { id: 'erase',   key: '9', label: 'Demolish',      cost: () => ({}),               tip: 'Refunds half. Also unposts survivors.' },
  { id: 'radio',   key: 'B', label: 'Radio tower',   cost: () => COST.radio,         tip: 'Call for rescue. Camp level ' + RADIO_LEVEL + '. Then hold out!', hidden: () => G.level < RADIO_LEVEL && G.rescue === null },
];
const costStr = c => [c.m && c.m + 'm', c.f && c.f + 'f', c.a && c.a + 'a'].filter(Boolean).join(' ');
const fmtRate = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '/s';

const UI = (() => {
  let menuMode = null, lastPeople = '', lastRes = '', lastCrews = null, lastLog = '';

  // ---- build the static parts -------------------------------------------------------------
  function init() {
    const list = $('toolList');
    for (const t of TOOLS) {
      const b = document.createElement('button');
      b.className = 'tool'; b.dataset.tool = t.id; b.title = t.tip;
      b.innerHTML = '<span class="nm"><kbd>' + t.key + '</kbd>' + t.label + '</span><span class="cost"></span>';
      b.addEventListener('click', () => { G.tool = t.id; Snd.click(); });
      list.appendChild(b);
    }
    document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => {
      const s = +b.dataset.speed; if (s === 0) G.paused = !G.paused; else { G.paused = false; G.speed = s; }
    }));
    $('btnUp').addEventListener('click', upgradeCore);
    $('btnRes').addEventListener('click', toggleResearch);
  }

  // ---- HUD ---------------------------------------------------------------
  function update() {
    const L = LEVELS[G.level - 1];
    $('rAmmo').textContent = G.ammo | 0; $('dAmmo').textContent = fmtRate(G.net.a);
    $('rMat').textContent = G.mat | 0; $('dMat').textContent = fmtRate(G.net.m);
    $('rFood').textContent = G.food | 0; $('dFood').textContent = fmtRate(G.net.f);
    $('rFood').style.color = G.food <= 0 ? 'var(--bad)' : '';
    $('rAmmo').style.color = G.ammo < 1 ? 'var(--bad)' : '';
    $('pHp').textContent = Math.max(0, P.hp | 0); $('pHp').style.color = P.hp < 35 ? 'var(--bad)' : '';
    $('zCount').textContent = G.visibleZ;
    const hd = $('horde');
    if (G.hordeMsg) { hd.className = 'panel ' + G.hordeMsg.cls; hd.textContent = G.hordeMsg.text; }
    else { hd.className = 'panel'; hd.textContent = G.lookouts.length ? 'Lookouts watching - no horde sighted' : 'No lookouts - you will get almost no warning'; }
    const rs = $('rescue');
    if (G.rescue !== null) { rs.style.display = 'block'; rs.textContent = 'Helicopter extraction in ' + fmtTime(Math.max(0, G.rescue)); } else rs.style.display = 'none';

    document.querySelectorAll('[data-tool]').forEach(b => {
      const t = TOOLS.find(x => x.id === b.dataset.tool), c = t.cost();
      b.classList.toggle('on', G.tool === t.id);
      b.style.display = t.hidden && t.hidden() ? 'none' : '';
      b.querySelector('.cost').textContent = t.id === 'def' ? G.idle.length + ' idle' : costStr(c);
      b.disabled = !!(c.m || c.f || c.a) && !canAfford(c);
    });
    document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', +b.dataset.speed === 0 ? G.paused : !G.paused && +b.dataset.speed === G.speed));
    $('cUp').textContent = L.up ? costStr(L.up) : 'MAX';
    $('btnUp').disabled = !L.up || !canAfford(L.up);
    $('cRes').textContent = G.res.active ? Math.round(G.res.active.t / G.res.active.dur * 100) + '%' : Object.keys(G.res.done).length + '/' + RESEARCH.length;

    $('iLvl').textContent = G.level + ' / ' + LEVELS.length;
    $('iCore').textContent = Math.max(0, G.coreHp | 0) + ' / ' + L.coreHp;
    $('iTerr').textContent = G.territory + ' / ' + L.cap;
    const seal = $('iSeal'); seal.textContent = G.sealed ? 'Sealed' : 'OPEN'; seal.className = G.sealed ? 'ok' : 'warn';
    $('iBld').textContent = G.held;
    $('iPpl').textContent = people() + '/' + L.defs + ' · ' + defenders.length + ' posted · ' + G.lookouts.length + ' lookouts' + (G.food <= 0 ? ' (starving)' : '');
    let e = 0; for (let i = 0; i < W * H; i++) e += explored[i];
    $('iTime').textContent = fmtTime(G.elapsed) + ' / ' + G.hordesBeaten + ' hordes';
    $('iKills').textContent = G.kills + ' / ' + Math.round(e / (W * H) * 100) + '%';

    const b = nearBuilding(), pr = $('prompt');
    if (b && !G.over) {
      pr.style.display = 'block';
      pr.textContent = b.crew ? 'A crew is working here' : b.looted ? BUILDING_TYPES[b.type].label + ' - already scavenged' : 'Hold E to scavenge the ' + BUILDING_TYPES[b.type].label;
    } else pr.style.display = 'none';

    renderPeople(); renderCrews(); renderLog(); renderTrade();
    if ($('research').classList.contains('show')) renderResearch();
  }

  function renderPeople() {
    const key = G.idle.map(s => s.id + s.role + (s.sick > 0 ? 's' + (s.sick | 0) : '') + (G.sel.includes(s.id) ? '*' : '')).join('|') + G.food;
    if (key === lastPeople) return; lastPeople = key;
    const el = $('people');
    if (!G.idle.length) { el.innerHTML = '<div style="color:var(--dim)">None. Scavenge, send crews, or seal the camp to draw refugees.</div>'; return; }
    el.innerHTML = '';
    for (const s of G.idle) {
      const r = ROLES[s.role], c = document.createElement('div');
      c.className = 'chip' + (G.sel.includes(s.id) ? ' sel' : ''); c.title = r.label + ': ' + r.desc;
      c.innerHTML = '<span class="badge" style="background:' + r.color + '">' + r.letter + '</span><span style="flex:1">' + s.name + '</span>';
      if (s.sick > 0) {
        const b = document.createElement('button'); b.className = 'mini-btn'; b.textContent = 'Sick ' + (s.sick | 0) + 's · treat ' + SICK.treatCost + 'f';
        b.addEventListener('click', ev => { ev.stopPropagation(); treatSick(s.id); }); c.appendChild(b);
      }
      c.addEventListener('click', () => { const i = G.sel.indexOf(s.id); if (i >= 0) G.sel.splice(i, 1); else G.sel.push(s.id); Snd.click(); lastPeople = ''; });
      el.appendChild(c);
    }
  }
  function renderCrews() {
    const key = G.crews.map(c => c.bi + ':' + (c.t / c.dur * 20 | 0)).join('|');
    if (key === lastCrews) return; lastCrews = key;
    $('crewsH').style.display = G.crews.length ? '' : 'none';
    $('crews').innerHTML = G.crews.map(c => {
      const b = buildings[c.bi];
      return '<div>' + c.members.map(s => s.name.split(' ')[0]).join(', ') + ' → ' + BUILDING_TYPES[b.type].label + ' · risk ' + Math.round(c.risk * 100) + '%<div class="bar"><i style="width:' + (c.t / c.dur * 100) + '%"></i></div></div>';
    }).join('');
  }
  function renderLog() {
    const key = G.log.length + (G.log[0] ? G.log[0].msg : '');
    if (key === lastLog) return; lastLog = key;
    $('log').innerHTML = G.log.map(l => '<div>' + fmtTime(l.t) + ' ' + l.msg.replace(/</g, '&lt;') + '</div>').join('');
  }
  function renderTrade() {
    const el = $('trade');
    if (!G.trader) { el.style.display = 'none'; el.dataset.k = ''; return; }
    el.style.display = 'block';
    const k = EVENTS.trades.map((t, i) => canAfford(t.give) ? i : '-').join('') + (G.trader.t / 5 | 0);
    if (el.dataset.k === k) return; el.dataset.k = k;
    el.innerHTML = '<h4>Trader · leaves in ' + Math.ceil(G.trader.t) + 's</h4>';
    EVENTS.trades.forEach((t, i) => {
      const b = document.createElement('button'); b.textContent = t.label; b.disabled = !canAfford(t.give);
      b.addEventListener('click', () => { doTrade(i); el.dataset.k = ''; }); el.appendChild(b);
    });
  }

  // ---- research ---------------------------------------------------------------
  function toggleResearch() {
    const el = $('research');
    el.classList.toggle('show'); lastRes = '';
    if (el.classList.contains('show')) renderResearch();
    Snd.click();
  }
  function renderResearch() {
    const a = G.res.active;
    const key = Object.keys(G.res.done).join() + (a ? a.id + (a.t | 0) : '') + Math.floor(G.mat / 10) + Math.floor(G.ammo / 10) + Math.floor(G.food / 10);
    if (key === lastRes) return; lastRes = key;
    const el = $('research');
    el.innerHTML = '<div class="row"><h3>Research</h3><button id="rClose" style="padding:2px 8px">Close (R)</button></div>';
    for (const r of RESEARCH) {
      const done = G.res.done[r.id], act = a && a.id === r.id, afford = canAfford(r.cost);
      const d = document.createElement('div'); d.className = 'tech';
      d.innerHTML = '<div><b>' + r.name + '</b><small>' + r.desc + '</small><small>' + costStr(r.cost) + ' · ' + r.time + 's</small></div>';
      const b = document.createElement('button');
      b.textContent = done ? 'Done' : act ? Math.round(a.t / a.dur * 100) + '%' : 'Research';
      b.disabled = done || act || !!a || !afford;
      b.addEventListener('click', () => { startResearch(r.id); lastRes = ''; });
      d.appendChild(b); el.appendChild(d);
    }
    $('rClose').addEventListener('click', toggleResearch);
  }

  // ---- menus ---------------------------------------------------------------
  const menuOpen = () => menuMode !== null;
  function showMenu(mode) {
    menuMode = mode;
    const c = $('card'), ov = $('overlay');
    const diff = (localStorage.getItem('zomb-diff') || 'normal');
    const diffBtns = '<div class="seg" id="diffSeg">' + Object.keys(DIFFICULTY).map(k => '<button data-diff="' + k + '" class="' + (k === diff ? 'on' : '') + '">' + DIFFICULTY[k].label + '</button>').join('') + '</div>';
    const vol = '<div style="margin-top:12px">Volume <input id="volume" type="range" min="0" max="100" value="' + Math.round(Snd.vol * 100) + '"></div>';
    let h = '';
    if (mode === 'title') {
      h = '<h1>ZOMB SURVIVE</h1><div class="sub">Hold out. Build up. Get rescued.</div>' +
        '<p>You are the last one left at a ruined camp. The town is full of the dead, and there is no night to warn you when a horde is coming.</p>' +
        '<ul><li><b>Scavenge</b> (hold E), <b>scout</b> the fog and <b>send crews</b> for supplies. Some buildings hide survivors.</li>' +
        '<li><b>Fortify</b> with walls, towers, gates and traps. Zombies never break walls: they pile up and climb, so kill them as they climb.</li>' +
        '<li><b>Build lookouts</b> to see hordes coming. Without them you only get a faint rumble.</li>' +
        '<li><b>Recruit</b> survivors with roles: fighters, snipers, medics, builders, scavengers.</li>' +
        '<li><b>Research</b> upgrades, <b>trade</b>, and weather events. At camp level ' + RADIO_LEVEL + ' build the <b>radio tower</b> and survive ' + fmtTime(RESCUE_TIME) + ' until the helicopter arrives.</li></ul>' +
        '<div>Difficulty</div>' + diffBtns + vol +
        '<div id="menuBtns">' + (Save.exists() ? '<button id="mContinue">Continue</button>' : '') + '<button id="mNew" class="' + (Save.exists() ? 'alt' : '') + '">New game</button></div>';
    } else if (mode === 'pause') {
      h = '<h1>Paused</h1><div class="sub">Survived ' + fmtTime(G.elapsed) + ' · ' + G.hordesBeaten + ' hordes beaten</div>' + vol +
        '<div id="menuBtns"><button id="mResume">Resume</button><button id="mSave" class="alt">Save game</button><button id="mQuit" class="alt">Abandon run</button></div>';
    } else {
      h = '<h1>' + G.endWhy + '</h1><div class="sub">' + (G.won ? 'The helicopter lifts you out of the dead town.' : 'The dead take the town.') + '</div>' +
        '<p>You lasted <b>' + fmtTime(G.elapsed) + '</b>, beat <b>' + G.hordesBeaten + '</b> horde' + (G.hordesBeaten === 1 ? '' : 's') + ', killed <b>' + G.kills + '</b> zombies and reached camp level <b>' + G.level + '</b>.</p>' +
        '<div>Difficulty</div>' + diffBtns + '<div id="menuBtns"><button id="mNew">New game</button></div>';
    }
    c.innerHTML = h; ov.classList.remove('hidden');
    const on = (id, fn) => { const e = $(id); if (e) e.addEventListener('click', () => { Snd.resume(); Snd.click(); fn(); }); };
    document.querySelectorAll('[data-diff]').forEach(b => b.addEventListener('click', () => {
      localStorage.setItem('zomb-diff', b.dataset.diff);
      document.querySelectorAll('[data-diff]').forEach(x => x.classList.toggle('on', x === b));
    }));
    const v = $('volume'); if (v) v.addEventListener('input', () => { Snd.resume(); Snd.setVolume(v.value / 100); });
    on('mNew', () => { newGame(localStorage.getItem('zomb-diff') || 'normal'); hideMenu(); });
    on('mContinue', () => { if (Save.load()) hideMenu(); else toast('Could not load the save'); });
    on('mResume', hideMenu);
    on('mSave', () => { toast(Save.save() ? 'Game saved' : 'Could not save'); });
    on('mQuit', () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } showMenu('title'); });
  }
  function hideMenu() { menuMode = null; $('overlay').classList.add('hidden'); }
  function showEnd() { showMenu('end'); }

  // ---- input ---------------------------------------------------------------
  let panning = false, painting = false, lastPaint = null, lastMouse = { x: 0, y: 0 };
  function screenToTile(sx, sy) {
    const z = G.cam.zoom;
    const wx = (sx - innerWidth / 2) / z / T + G.cam.x, wy = (sy - innerHeight / 2) / z / T + G.cam.y;
    return { tx: Math.floor(wx), ty: Math.floor(wy) };
  }
  function paintLine(a, b) {                       // bresenham so fast drags leave no gaps
    let x0 = a.tx, y0 = a.ty; const x1 = b.tx, y1 = b.ty;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      tryBuild(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  function bindInput() {
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('mousedown', e => {
      Snd.resume();
      if (!G || menuOpen()) return;
      lastMouse = { x: e.clientX, y: e.clientY };
      if (e.button === 2 || e.button === 1) { panning = true; G.cam.free = true; return; }
      if (e.button === 0) {
        painting = G.tool !== 'crew' && G.tool !== 'radio'; lastPaint = screenToTile(e.clientX, e.clientY); tryBuild(lastPaint.tx, lastPaint.ty);
      }
    });
    addEventListener('mouseup', () => { panning = false; painting = false; lastPaint = null; });
    canvas.addEventListener('mousemove', e => {
      if (!G) return;
      G.hover = screenToTile(e.clientX, e.clientY);
      if (panning) {
        G.cam.x -= (e.clientX - lastMouse.x) / G.cam.zoom / T; G.cam.y -= (e.clientY - lastMouse.y) / G.cam.zoom / T;
      } else if (painting) {
        const cur = G.hover; if (lastPaint) paintLine(lastPaint, cur); lastPaint = cur;
      }
      lastMouse = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('mouseleave', () => { if (G) G.hover = null; });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const z0 = G.cam.zoom;
      const wx = (e.clientX - innerWidth / 2) / z0 / T + G.cam.x, wy = (e.clientY - innerHeight / 2) / z0 / T + G.cam.y;
      const z1 = G.cam.zoom = clamp(z0 * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.9, 6);
      if (G.cam.free) { G.cam.x = wx - (e.clientX - innerWidth / 2) / z1 / T; G.cam.y = wy - (e.clientY - innerHeight / 2) / z1 / T; }
    }, { passive: false });
    const toolKeys = {}; for (const t of TOOLS) toolKeys[t.key.toLowerCase()] = t.id;
    addEventListener('keydown', e => {
      Snd.resume();
      const k = e.key.toLowerCase();
      if (k === 'escape') { if (!G) return; if (menuMode === 'pause') hideMenu(); else if (!menuMode) showMenu('pause'); return; }
      if (menuMode) return;
      keys[k] = true; if (e.shiftKey) keys.shift = true;
      if (!G) return;
      if (toolKeys[k]) { const t = TOOLS.find(x => x.id === toolKeys[k]); if (!(t.hidden && t.hidden())) G.tool = t.id; }
      else if (k === 'u') upgradeCore();
      else if (k === 'r') toggleResearch();
      else if (k === 'm') toast(Snd.toggleMute() ? 'Sound off' : 'Sound on');
      else if (k === ' ') { G.paused = !G.paused; e.preventDefault(); }
      if (k.startsWith('arrow')) e.preventDefault();
    });
    addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; if (!e.shiftKey) keys.shift = false; });
    addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (G && !G.over && !menuMode) { Save.save(); } });
    addEventListener('beforeunload', () => { if (G && !G.over) Save.save(); });
  }

  return { init, update, bindInput, showMenu, hideMenu, showEnd, menuOpen };
})();
