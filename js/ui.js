'use strict';
/* ui.js - HUD, panels, menus and input. Talks to the sim only through its
   public functions (tryBuild, upgradeCore, startResearch, ...). */
let toastTimer = 0;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 4600);
}

const facCost = id => () => ({ m: Math.ceil(FACILITIES[id].cost.m * buildMul()) });
const TOOLS = [
  { cat: 'Defense', id: 'wall',    key: '1', label: 'Wall',          cost: () => effCost('wall'),    tip: 'Free-form barricade. Zombies pile up and climb it.' },
  { cat: 'Defense', id: 'tower',   key: '2', label: 'Tower',         cost: () => effCost('tower'),   tip: 'Sturdy; survivors shoot farther from it. Upgrades a wall.' },
  { cat: 'Defense', id: 'gate',    key: '3', label: 'Gate',          cost: () => effCost('gate'),    tip: 'You walk through freely. Zombies treat it as a wall.' },
  { cat: 'Defense', id: 'lookout', key: '4', label: 'Lookout',       cost: () => effCost('lookout'), tip: 'Spots hordes early and reveals the map. Place anywhere.' },
  { cat: 'Defense', id: 'reinforce', key: 'Q', label: 'Reinforce',   cost: () => ({ m: Math.ceil(TIER.cost[1] * buildMul()) }), tip: 'Upgrade a wall: Timber > Reinforced > Concrete (needs research). Tougher, shrugs off pile pressure.' },
  { cat: 'Defense', id: 'electrify', key: 'Z', label: 'Electrify',   cost: () => effCost('electrify'), tip: 'Zaps zombies climbing this wall. Needs a fuelled generator.' },
  { cat: 'Traps & fire', id: 'spike',   key: '5', label: 'Spike trap',  cost: () => effCost('spike'),   tip: 'Cuts down zombies that walk over it. Wears out.' },
  { cat: 'Traps & fire', id: 'barrel',  key: '6', label: 'Fire barrel', cost: () => effCost('barrel'),  tip: 'Ignites when a crowd gathers and sets them alight. One use.' },
  { cat: 'Traps & fire', id: 'decoy',   key: 'V', label: 'Decoy',       cost: () => effCost('decoy'),   tip: 'Noise-maker: for 15s it draws idle zombies, and part of a horde, toward it.' },
  { cat: 'Traps & fire', id: 'molotov', key: 'T', label: 'Molotov',     cost: () => effCost('molotov'), tip: 'Throw (range ' + FIRE.range + '). Burns crowds, sets them alight and destroys nests.' },
  ...Object.keys(FACILITIES).map((id, n) => ({ cat: 'Facilities', id, key: '', label: FACILITIES[id].label, cost: facCost(id), lvl: FACILITIES[id].level, tip: FACILITIES[id].desc + ' (camp level ' + FACILITIES[id].level + ', inside territory)' })),
  { cat: 'People', id: 'def',     key: '7', label: 'Post survivor', cost: () => ({}),               tip: 'Put the selected idle survivor on a wall/tower/lookout.' },
  { cat: 'People', id: 'crew',    key: '8', label: 'Send crew',     cost: () => ({ a: CREW.ammoCost }), tip: 'Click a scouted building or nest. Risky but pays more.' },
  { cat: 'People', id: 'erase',   key: '9', label: 'Demolish',      cost: () => ({}),               tip: 'Refunds half. Also unposts survivors.' },
  { cat: 'Camp', id: 'radio',   key: 'B', label: 'Radio tower',   cost: () => COST.radio,         tip: 'Call for rescue. Camp level ' + RADIO_LEVEL + '. Then hold out!', hidden: () => G.level < RADIO_LEVEL && G.rescue === null },
];
const costStr = c => [c.m && c.m + 'm', c.f && c.f + 'f', c.a && c.a + 'a', c.med && c.med + 'med', c.fuel && c.fuel + 'fuel'].filter(Boolean).join(' ');
const fmtRate = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '/s';

const UI = (() => {
  let lastRules = '', lastRadio = '';
  let menuMode = null, lastPeople = '', lastRes = '', lastCrews = null, lastLog = '';

  // ---- build the static parts -------------------------------------------------------------
  function init() {
    const list = $('toolList');
    let lastCat = '';
    for (const t of TOOLS) {
      if (t.cat !== lastCat) { lastCat = t.cat; const h = document.createElement('div'); h.className = 'cat'; h.textContent = t.cat; list.appendChild(h); }
      const b = document.createElement('button');
      b.className = 'tool'; b.dataset.tool = t.id; b.title = t.tip;
      b.innerHTML = '<span class="nm">' + (t.key ? '<kbd>' + t.key + '</kbd>' : '') + t.label + '</span><span class="cost"></span>';
      b.addEventListener('click', () => { G.tool = t.id; Snd.click(); });
      list.appendChild(b);
    }
    document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => {
      const s = +b.dataset.speed; if (s === 0) G.paused = !G.paused; else { G.paused = false; G.speed = s; }
    }));
    $('btnUp').addEventListener('click', upgradeCore);
    $('btnRes').addEventListener('click', toggleResearch);
    $('btnFallen').addEventListener('click', toggleMemorial);
    $('btnRules').addEventListener('click', toggleRules);
  }

  // ---- HUD ---------------------------------------------------------------
  function update() {
    const L = LEVELS[G.level - 1];
    $('rAmmo').textContent = G.ammo | 0; $('dAmmo').textContent = fmtRate(G.net.a);
    $('rMat').textContent = G.mat | 0; $('dMat').textContent = fmtRate(G.net.m);
    $('rFood').textContent = G.food | 0; $('dFood').textContent = fmtRate(G.net.f);
    $('rFood').style.color = G.food <= 0 ? 'var(--bad)' : '';
    $('rAmmo').style.color = G.ammo < 1 ? 'var(--bad)' : '';
    const mo = $('mor'), ml = moraleLabel(G.morale), mc = G.morale < 20 ? 'var(--bad)' : G.morale < 40 ? '#e8a447' : G.morale > 75 ? 'var(--good)' : '';
    mo.textContent = ml + ' ' + (G.morale | 0); mo.style.color = mc;
    $('morWrap').title = 'Camp morale ' + (G.morale | 0) + ' (heading to ' + (G.moraleTarget | 0) + '). High: defenders shoot faster. Low: slower, no refugees; in despair people desert. Deaths hurt, wins heal.';
    $('iMor').textContent = ml + ' ' + (G.morale | 0) + ' → ' + (G.moraleTarget | 0); $('morBar').style.width = G.morale + '%'; $('morBar').style.background = mc || 'var(--acc)';
    $('cFallen').textContent = G.memorial.length;
    $('rFuel').textContent = G.fuel | 0; $('rFuel').style.color = G.power.demand > 0 && G.fuel < 5 ? 'var(--bad)' : '';
    $('rMed').textContent = G.med | 0; $('rMed').style.color = G.med < 1 ? 'var(--dim)' : '';
    $('iPower').textContent = G.power.supply + '/' + G.power.demand.toFixed(1) + (G.power.burn > 0 ? ' · -' + G.power.burn.toFixed(2) + ' fuel/s' : '') + (G.power.demand > G.power.supply ? ' (brownout)' : '');
    $('iNests').textContent = G.nests.length + (G.nests.length ? ' (hordes +' + Math.round(NEST.hordeBonus * 100 * G.nests.length) + '%)' : '');
    $('pHp').textContent = Math.max(0, P.hp | 0); $('pHp').style.color = P.hp < 35 ? 'var(--bad)' : '';
    $('zCount').textContent = G.visibleZ;
    const hd = $('horde');
    if (G.hordeMsg) { hd.className = 'panel ' + G.hordeMsg.cls; hd.textContent = G.hordeMsg.text; }
    else { hd.className = 'panel'; hd.textContent = G.lookouts.length ? 'Lookouts watching - no horde sighted' : 'No lookouts - you will get almost no warning'; }
    const rs = $('rescue');
    if (G.rescue !== null) { rs.style.display = 'block'; rs.textContent = (G.rescueKind === 'convoy' ? 'Convoy arrives in ' : 'Helicopter extraction in ') + fmtTime(Math.max(0, G.rescue)); } else rs.style.display = 'none';

    document.querySelectorAll('[data-tool]').forEach(b => {
      const t = TOOLS.find(x => x.id === b.dataset.tool), c = t.cost();
      b.classList.toggle('on', G.tool === t.id);
      b.style.display = t.hidden && t.hidden() ? 'none' : '';
      const locked = t.lvl && G.level < t.lvl;
      b.querySelector('.cost').textContent = t.id === 'def' ? G.idle.length + ' idle' : costStr(c) + (locked ? ' L' + t.lvl : '');
      b.disabled = locked || (!!(c.m || c.f || c.a || c.med || c.fuel) && !canAfford(c));
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

    $('respawn').style.display = P.dead > 0 ? 'block' : 'none';
    if (P.dead > 0) $('respawn').textContent = 'Survivor down - a replacement arrives in ' + Math.ceil(P.dead) + 's';
    const b = nearBuilding(), pr = $('prompt');
    if (b && !G.over && P.dead <= 0) {
      pr.style.display = 'block';
      pr.textContent = b.nest ? 'Infested! Burn it out with a Molotov or send a crew with a fighter' : b.crew ? 'A crew is working here' : b.looted ? BUILDING_TYPES[b.type].label + ' - already scavenged' : 'Hold E to scavenge the ' + BUILDING_TYPES[b.type].label;
    } else pr.style.display = 'none';

    const st = STORYTELLERS[G.story] || STORYTELLERS.cassandra;
    $('iStory').textContent = st.label; $('iStory').title = st.desc + ' Tension: ' + Math.round(Director.tension() * 100) + '%';
    const nr = Object.keys(G.rules).length; $('cRules').textContent = nr ? nr + ' active' : G.ruleCd > 0 ? Math.ceil(G.ruleCd) + 's' : 'none';
    renderPeople(); renderCrews(); renderLog(); renderTrade(); renderRadio();
    if ($('rules').classList.contains('show')) renderRules();
    if ($('research').classList.contains('show')) renderResearch();
  }

  function renderPeople() {
    const key = G.idle.map(s => s.id + s.role + (s.grief > 0 ? 'g' : '') + (s.sick > 0 ? 's' + (s.sick | 0) : '') + (G.sel.includes(s.id) ? '*' : '')).join('|') + G.food;
    if (key === lastPeople) return; lastPeople = key;
    const el = $('people');
    if (!G.idle.length) { el.innerHTML = '<div style="color:var(--dim)">None. Scavenge, send crews, or seal the camp to draw refugees.</div>'; return; }
    el.innerHTML = '';
    for (const s of G.idle) {
      const r = ROLES[s.role], c = document.createElement('div');
      c.className = 'chip' + (G.sel.includes(s.id) ? ' sel' : ''); c.title = survivorTip(s);
      c.innerHTML = '<span class="badge" style="background:' + r.color + '">' + r.letter + '</span><span style="flex:1">' + s.name + '<small style="color:var(--dim);display:block">' + r.label + (s.traits && s.traits.length ? ' · ' + traitText(s) : '') + (s.grief > 0 ? ' · grieving' : '') + '</small></span>';
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
      return '<div>' + c.members.map(who).join(', ') + ' → ' + BUILDING_TYPES[b.type].label + ' · risk ' + Math.round(c.risk * 100) + '%<div class="bar"><i style="width:' + (c.t / c.dur * 100) + '%"></i></div></div>';
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

  function survivorTip(s) {
    const r = ROLES[s.role], friend = s.friend && findSurvivor(s.friend), lover = s.lover && findSurvivor(s.lover), rival = s.rival && findSurvivor(s.rival);
    return s.name + ' - ' + r.label + '\n' + r.desc + '\n"' + (s.story || '') + '"\n' +
      (s.traits || []).map(t => TRAITS[t].label + ': ' + TRAITS[t].desc).join('\n') +
      (skillText(s) ? '\nSkills: ' + skillText(s) : '') +
      (friend ? '\nFriend: ' + friend.name : '') + (lover ? '\nLover: ' + lover.name : '') + (rival ? '\nRival: ' + rival.name : '') + '\nKills: ' + (s.kills || 0) + (s.grief > 0 ? '\nGrieving a lost friend' : '');
  }
  // ---- memorial ---------------------------------------------------------------
  function memorialHtml(limit) {
    const list = G.memorial.slice().reverse();
    if (!list.length) return '<div style="color:var(--dim)">Nobody has fallen yet.</div>';
    return list.slice(0, limit || 99).map(m => '<div class="tech"><div><b>' + m.name + '</b> <span style="color:' + ROLES[m.role].color + '">' + ROLES[m.role].label + '</span>' +
      '<small>' + m.cause + ' at ' + fmtTime(m.time) + ' · lasted ' + fmtTime(m.lived) + ' · ' + m.kills + ' kills' + (m.traits.length ? ' · ' + m.traits.map(t => TRAITS[t].label).join(', ') : '') + '</small></div></div>').join('') +
      (limit && list.length > limit ? '<div style="color:var(--dim);padding-top:6px">...and ' + (list.length - limit) + ' more</div>' : '');
  }
  function toggleMemorial() {
    const el = $('memorial'); el.classList.toggle('show');
    if (el.classList.contains('show')) {
      el.innerHTML = '<div class="row"><h3>Memorial - the fallen</h3><button id="mClose" style="padding:2px 8px">Close (G)</button></div>' + memorialHtml();
      $('mClose').addEventListener('click', toggleMemorial);
    }
    Snd.click();
  }

  // ---- camp rules ---------------------------------------------------------------
  function toggleRules() {
    const el = $('rules'); el.classList.toggle('show'); lastRules = '';
    if (el.classList.contains('show')) renderRules();
    Snd.click();
  }
  function renderRules() {
    const key = Object.keys(G.rules).join() + G.level + Math.ceil(G.ruleCd);
    if (key === lastRules) return; lastRules = key;
    const el = $('rules');
    el.innerHTML = '<div class="row"><h3>Camp rules</h3><button id="rlClose" style="padding:2px 8px">Close (P)</button></div>' +
      '<div style="color:var(--dim);margin-bottom:4px">Every policy trades something for something else. ' + (G.ruleCd > 0 ? 'Next change in ' + Math.ceil(G.ruleCd) + 's.' : 'You can change one now.') + '</div>';
    for (const id in RULES) {
      const r = RULES[id], on = ruleOn(id), locked = G.level < r.level;
      const d = document.createElement('div'); d.className = 'tech';
      d.innerHTML = '<div><b>' + r.label + '</b>' + (locked ? ' <small>needs camp level ' + r.level + '</small>' : '') + '<small>' + r.desc + '</small></div>';
      const b = document.createElement('button'); b.textContent = on ? 'Repeal' : 'Decree'; b.classList.toggle('on', on); b.disabled = locked;
      b.addEventListener('click', () => { toggleRule(id); lastRules = ''; renderRules(); });
      d.appendChild(b); el.appendChild(d);
    }
    $('rlClose').addEventListener('click', toggleRules);
  }

  // ---- radio ---------------------------------------------------------------
  function renderRadio() {
    const el = $('radio'), m = Radio.current();
    if (!m) { el.classList.remove('show'); lastRadio = ''; return; }
    const key = m.id + G.ammo + G.food + roomForPerson();
    el.classList.add('show');
    if (key === lastRadio) return; lastRadio = key;
    el.innerHTML = '<h4>Incoming transmission</h4><h3>' + m.title + '</h3><div class="txt">' + m.text() + '</div>';
    m.choices.forEach((c, i) => {
      const b = document.createElement('button'); b.textContent = c.label; b.disabled = !!(c.cond && !c.cond());
      b.addEventListener('click', () => { Radio.choose(i); lastRadio = ''; renderRadio(); });
      el.appendChild(b);
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
  const menuOpen = () => menuMode !== null || !!(G && G.radioMsg);
  function showMenu(mode) {
    menuMode = mode;
    const c = $('card'), ov = $('overlay');
    const diff = (localStorage.getItem('zomb-diff') || 'normal');
    const story = localStorage.getItem('zomb-story') || 'cassandra';
    const storyBtns = '<div class="seg" id="storySeg">' + Object.keys(STORYTELLERS).map(k => '<button data-story="' + k + '" class="' + (k === story ? 'on' : '') + '">' + STORYTELLERS[k].label + '</button>').join('') + '</div>' +
      '<div id="storyDesc" style="color:var(--dim);font-size:12px;margin-top:4px">' + STORYTELLERS[story].desc + '</div>';
    const diffBtns = '<div class="seg" id="diffSeg">' + Object.keys(DIFFICULTY).map(k => '<button data-diff="' + k + '" class="' + (k === diff ? 'on' : '') + '">' + DIFFICULTY[k].label + '</button>').join('') + '</div>';
    const vol = '<div style="margin-top:12px">Volume <input id="volume" type="range" min="0" max="100" value="' + Math.round(Snd.vol * 100) + '"></div>' +
      '<div style="margin-top:10px">Graphics quality <span style="color:var(--dim)">(Low is recommended on phones)</span></div><div class="seg" id="qualSeg">' +
      Object.keys(QUALITY).map(k => '<button data-q="' + k + '" class="' + (k === Q.name ? 'on' : '') + '">' + k[0].toUpperCase() + k.slice(1) + '</button>').join('') + '</div>' +
      '<div style="margin-top:10px"><button id="mFull" style="display:inline-flex">Toggle fullscreen (F)</button></div>';
    let h = '';
    if (mode === 'title') {
      h = '<h1>ZOMB SURVIVE</h1><div class="sub">Hold out. Build up. Get rescued.</div>' +
        '<p>You are the last one left at a ruined camp. The town is full of the dead, and there is no night to warn you when a horde is coming. Every survivor is a named specialist, but people can be replaced: the camp is what matters. Lose it and the run is over.</p>' +
        '<ul><li><b>Scavenge</b> (hold E), <b>scout</b> the fog and <b>send crews</b> for supplies. Some buildings hide survivors.</li>' +
        '<li><b>Fortify</b> with walls, towers, gates and traps. Zombies never break walls: they pile up and climb, so kill them as they climb.</li>' +
        '<li><b>Build lookouts</b> to see hordes coming. Without them you only get a faint rumble.</li>' +
        '<li><b>Recruit</b> survivors with roles: fighters, snipers, medics, builders, scavengers.</li>' +
        '<li><b>Research</b> upgrades, <b>trade</b>, and weather events. At camp level ' + RADIO_LEVEL + ' build the <b>radio tower</b> and survive ' + fmtTime(RESCUE_TIME) + ' until the helicopter arrives.</li></ul>' +
        '<div>Difficulty</div>' + diffBtns + '<div style="margin-top:8px">Storyteller</div>' + storyBtns + vol +
        '<div id="menuBtns">' + (Save.exists() ? '<button id="mContinue">Continue</button>' : '') + '<button id="mNew" class="' + (Save.exists() ? 'alt' : '') + '">New game</button></div>';
    } else if (mode === 'pause') {
      h = '<h1>Paused</h1><div class="sub">Survived ' + fmtTime(G.elapsed) + ' · ' + G.hordesBeaten + ' hordes beaten</div>' + vol +
        '<div id="menuBtns"><button id="mResume">Resume</button><button id="mMem" class="alt">Memorial (' + G.memorial.length + ')</button><button id="mSave" class="alt">Save game</button><button id="mQuit" class="alt">Abandon run</button></div>';
    } else {
      h = '<h1>' + G.endWhy + '</h1><div class="sub">' + (G.won ? (G.rescueKind === 'convoy' ? 'The convoy carries your people to the safe zone.' : 'The helicopter lifts you out of the dead town.') : 'The dead take the town.') + '</div>' +
        '<p>You lasted <b>' + fmtTime(G.elapsed) + '</b>, beat <b>' + G.hordesBeaten + '</b> horde' + (G.hordesBeaten === 1 ? '' : 's') + ', killed <b>' + G.kills + '</b> zombies, reached camp level <b>' + G.level + '</b>, and lost your own survivor <b>' + G.deaths + '</b> time' + (G.deaths === 1 ? '' : 's') + '.</p>' +
        '<h4 style="margin-top:12px">The fallen</h4><div style="max-height:30vh;overflow:auto">' + memorialHtml(8) + '</div>' +
        '<div>Difficulty</div>' + diffBtns + '<div style="margin-top:8px">Storyteller</div>' + storyBtns + '<div id="menuBtns"><button id="mNew">New game</button></div>';
    }
    c.innerHTML = h; ov.classList.remove('hidden');
    const on = (id, fn) => { const e = $(id); if (e) e.addEventListener('click', () => { Snd.resume(); Snd.click(); fn(); }); };
    document.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
      setQuality(b.dataset.q); resize(); document.querySelectorAll('[data-q]').forEach(x => x.classList.toggle('on', x === b));
    }));
    document.querySelectorAll('[data-diff]').forEach(b => b.addEventListener('click', () => {
      localStorage.setItem('zomb-diff', b.dataset.diff);
      document.querySelectorAll('[data-diff]').forEach(x => x.classList.toggle('on', x === b));
    }));
    const v = $('volume'); if (v) v.addEventListener('input', () => { Snd.resume(); Snd.setVolume(v.value / 100); });
    document.querySelectorAll('[data-story]').forEach(b => b.addEventListener('click', () => {
      localStorage.setItem('zomb-story', b.dataset.story); $('storyDesc').textContent = STORYTELLERS[b.dataset.story].desc;
      document.querySelectorAll('[data-story]').forEach(x => x.classList.toggle('on', x === b));
    }));
    on('mNew', () => { newGame(localStorage.getItem('zomb-diff') || 'normal', undefined, localStorage.getItem('zomb-story') || 'cassandra'); hideMenu(); });
    on('mContinue', () => { if (Save.load()) hideMenu(); else toast('Could not load the save'); });
    on('mFull', toggleFullscreen);
    on('mResume', hideMenu);
    on('mMem', () => { hideMenu(); toggleMemorial(); });
    on('mSave', () => { toast(Save.save() ? 'Game saved' : 'Could not save'); });
    on('mQuit', () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } showMenu('title'); });
  }
  function hideMenu() { menuMode = null; $('overlay').classList.add('hidden'); }
  function showEnd() { showMenu('end'); }

  // ---- input (pointer events: mouse, touch and pen share one path) -----------------------------------------------
  const pointers = new Map();
  let pinch = null, panning = false, painting = false, lastPaint = null, lastMouse = { x: 0, y: 0 };
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
  const pair = () => { const [a, b] = [...pointers.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; };
  function zoomAt(cx, cy, z1) {                    // zoom keeping the world point under (cx,cy) fixed (when the camera is free)
    const z0 = G.cam.zoom;
    const wx = (cx - innerWidth / 2) / z0 / T + G.cam.x, wy = (cy - innerHeight / 2) / z0 / T + G.cam.y;
    G.cam.zoom = clamp(z1, 0.9, 6);
    if (G.cam.free) { G.cam.x = wx - (cx - innerWidth / 2) / G.cam.zoom / T; G.cam.y = wy - (cy - innerHeight / 2) / G.cam.zoom / T; }
  }
  function setTouchMode(on) { document.body.classList.toggle('touch', on); applyLayout(); }
  function applyLayout() { document.body.classList.toggle('compact', innerWidth < 900 || document.body.classList.contains('touch')); document.body.classList.toggle('portrait', innerHeight > innerWidth); }

  function bindInput() {
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => {
      Snd.resume();
      if (e.pointerType === 'touch' && !document.body.classList.contains('touch')) setTouchMode(true);
      if (!G || menuOpen()) return;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      lastMouse = { x: e.clientX, y: e.clientY };
      G.hover = screenToTile(e.clientX, e.clientY);
      if (e.pointerType === 'mouse') {
        if (e.button === 2 || e.button === 1) { panning = true; G.cam.free = true; return; }
        if (e.button !== 0) return;
      } else if (pointers.size >= 2) {               // two fingers: pinch to zoom, drag to pan
        painting = false; G.cam.free = true; const p = pair(); pinch = { d: p.d, cx: p.cx, cy: p.cy, zoom: G.cam.zoom }; return;
      }
      painting = G.tool !== 'crew' && G.tool !== 'radio'; lastPaint = G.hover; tryBuild(G.hover.tx, G.hover.ty);
    });
    canvas.addEventListener('pointermove', e => {
      if (!G) return;
      const p = pointers.get(e.pointerId);
      if (e.pointerType !== 'touch') G.hover = screenToTile(e.clientX, e.clientY);
      if (p) { p.x = e.clientX; p.y = e.clientY; }
      if (pinch && pointers.size >= 2) {
        const q = pair();
        G.cam.x -= (q.cx - pinch.cx) / G.cam.zoom / T; G.cam.y -= (q.cy - pinch.cy) / G.cam.zoom / T;
        pinch.cx = q.cx; pinch.cy = q.cy;
        zoomAt(q.cx, q.cy, pinch.zoom * q.d / pinch.d);
      } else if (panning) {
        G.cam.x -= (e.clientX - lastMouse.x) / G.cam.zoom / T; G.cam.y -= (e.clientY - lastMouse.y) / G.cam.zoom / T;
      } else if (painting && p) {
        G.hover = screenToTile(e.clientX, e.clientY);
        if (lastPaint) paintLine(lastPaint, G.hover); lastPaint = G.hover;
      }
      lastMouse = { x: e.clientX, y: e.clientY };
    });
    const up = e => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (!pointers.size) { panning = false; painting = false; lastPaint = null; if (e.pointerType === 'touch' && G) G.hover = null; }
    };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('mouseleave', () => { if (G) G.hover = null; });
    canvas.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, G.cam.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)); }, { passive: false });
    for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, e => e.preventDefault());

    // ---- touch controls: stick, scavenge, run, menu, people drawer ----
    const stick = $('joy'), knob = $('joyKnob'); let joyId = null;
    const joyAt = e => {
      const r = stick.getBoundingClientRect(), R = r.width / 2;
      let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R); const l = Math.hypot(dx, dy) || 1;
      if (l > R) { dx = dx / l * R; dy = dy / l * R; }
      joy.x = dx / R; joy.y = dy / R; knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    };
    stick.addEventListener('pointerdown', e => { Snd.resume(); joyId = e.pointerId; stick.setPointerCapture(e.pointerId); joyAt(e); e.preventDefault(); });
    stick.addEventListener('pointermove', e => { if (e.pointerId === joyId) joyAt(e); });
    const joyEnd = e => { if (e.pointerId !== joyId) return; joyId = null; joy.x = joy.y = 0; knob.style.transform = ''; };
    stick.addEventListener('pointerup', joyEnd); stick.addEventListener('pointercancel', joyEnd);
    const hold = (id, fn) => { const b = $(id); b.addEventListener('pointerdown', e => { Snd.resume(); b.setPointerCapture(e.pointerId); b.classList.add('on'); fn(true); e.preventDefault(); }); const end = () => { b.classList.remove('on'); fn(false); }; b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end); };
    hold('btnLoot', on => { keys.e = on; });
    $('btnRun').addEventListener('click', () => { keys.shift = !keys.shift; $('btnRun').classList.toggle('on', !!keys.shift); });
    $('btnMenu').addEventListener('click', () => { if (G && !menuMode) showMenu('pause'); });
    $('btnPeople').addEventListener('click', () => { document.body.classList.toggle('drawer'); Snd.click(); });
    $('rotate').addEventListener('click', () => { $('rotate').style.display = 'none'; });

    const toolKeys = {}; for (const t of TOOLS) if (t.key) toolKeys[t.key.toLowerCase()] = t.id;
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
      else if (k === 'g') toggleMemorial();
      else if (k === 'p') toggleRules();
      else if (k === 'm') toast(Snd.toggleMute() ? 'Sound off' : 'Sound on');
      else if (k === 'f') toggleFullscreen();
      else if (k === ' ') { G.paused = !G.paused; e.preventDefault(); }
      if (k.startsWith('arrow')) e.preventDefault();
    });
    addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; if (!e.shiftKey && !$('btnRun').classList.contains('on')) keys.shift = false; });
    addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (G && !G.over && !menuMode) Save.save(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && G && !G.over) { Save.save(); if (!menuMode) showMenu('pause'); } });
    addEventListener('beforeunload', () => { if (G && !G.over) Save.save(); });
    addEventListener('resize', applyLayout);
    addEventListener('orientationchange', () => setTimeout(() => { resize(); applyLayout(); }, 200));
    if (matchMedia('(pointer: coarse)').matches) setTouchMode(true);
    applyLayout();
  }
  function toggleFullscreen() {
    const d = document, el = d.documentElement;
    if (!d.fullscreenElement && el.requestFullscreen) { el.requestFullscreen().then(() => { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); }).catch(() => {}); }
    else if (d.fullscreenElement) d.exitFullscreen();
  }

  return { init, update, bindInput, showMenu, hideMenu, showEnd, menuOpen };
})();
