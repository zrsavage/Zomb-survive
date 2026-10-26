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
  { cat: 'Command', id: 'combat', key: '0', label: 'Fight', cost: () => ({}), tip: 'Aim with the mouse. Hold left-click to fire, R reloads, right-click or F swings at what is close. Every shot is yours and every shot is heard.' },
  { cat: 'Command', id: 'orders', key: 'C', label: 'Select & command', cost: () => ({}), tip: 'Click or drag to select survivors. Right-click: move there, man a wall, or scavenge a building. They carry it out on their own.' },
  { cat: 'Land', id: 'demolish', key: 'N', label: 'Demolish', cost: () => ({}), tip: 'Click a building to pull it down. It takes time, recovers salvage, and leaves clear ground for fields, beds, workshops or walls.' },
  { cat: 'Defense', id: 'wall',    key: '1', label: 'Wall',          cost: () => effCost('wall'),    tip: 'Free-form barricade. Zombies pile up and climb it.' },
  { cat: 'Defense', id: 'tower',   key: '2', label: 'Tower',         cost: () => effCost('tower'),   tip: 'Sturdy; survivors shoot farther from it. Upgrades a wall.' },
  { cat: 'Defense', id: 'gate',    key: '3', label: 'Gate',          cost: () => effCost('gate'),    tip: 'You walk through freely. Zombies treat it as a wall.' },
  { cat: 'Defense', id: 'lookout', key: '4', label: 'Lookout',       cost: () => effCost('lookout'), tip: 'Spots hordes early and reveals the map. Place anywhere.' },
  { cat: 'Defense', id: 'reinforce', key: 'Q', label: 'Reinforce',   cost: () => ({ m: Math.ceil(TIER.cost[1] * buildMul()) }), tip: 'Upgrade a wall: Timber > Reinforced > Concrete (needs research). Tougher, shrugs off pile pressure.' },
  { cat: 'Defense', id: 'electrify', key: 'Z', label: 'Electrify',   cost: () => effCost('electrify'), tip: 'Zaps zombies climbing this wall. Needs a fuelled generator.' },
  { cat: 'Defense', id: 'outpost', key: '', label: 'Outpost', cost: () => effCost('outpost'), tip: 'Fortified post outside your territory (near buildings). Garrison it and it works nearby buildings for you at 70%; also a lookout.' },
  { cat: 'Traps & fire', id: 'spike',   key: '5', label: 'Spike trap',  cost: () => effCost('spike'),   tip: 'Cuts down zombies that walk over it. Wears out.' },
  { cat: 'Traps & fire', id: 'barrel',  key: '6', label: 'Fire barrel', cost: () => effCost('barrel'),  tip: 'Ignites when a crowd gathers and sets them alight. One use.' },
  { cat: 'Traps & fire', id: 'decoy',   key: 'V', label: 'Decoy',       cost: () => effCost('decoy'),   tip: 'Noise-maker: for 15s it draws idle zombies, and part of a horde, toward it.' },
  { cat: 'Traps & fire', id: 'grate', key: '', label: 'Seal sewer', cost: () => effCost('grate'), tip: 'Seal a sewer access you have found. Unsealed ones let hordes come up inside your walls.' },
  { cat: 'Traps & fire', id: 'molotov', key: 'T', label: 'Molotov',     cost: () => effCost('molotov'), tip: 'Throw (range ' + FIRE.range + '). Burns crowds, sets them alight and destroys nests.' },
  ...Object.keys(FACILITIES).map((id, n) => ({ cat: 'Facilities', id, key: '', label: FACILITIES[id].label, cost: facCost(id), lvl: FACILITIES[id].level, tip: FACILITIES[id].desc + ' (camp level ' + FACILITIES[id].level + ', inside territory)' })),
  { cat: 'People', id: 'def',     key: '7', label: 'Post survivor', cost: () => ({}),               tip: 'Put the selected idle survivor on a wall/tower/lookout.' },
  { cat: 'People', id: 'crew',    key: '8', label: 'Send crew',     cost: () => ({ a: CREW.ammoCost }), tip: 'Click a scouted building or nest. Risky but pays more.' },
  { cat: 'People', id: 'erase',   key: '9', label: 'Erase',         cost: () => ({}),               tip: 'Remove a wall, trap or facility you built (refunds half), cancel a plan, or take a survivor off the wall.' },
  { cat: 'Camp', id: 'siren', key: '', label: 'Sound the siren', cost: () => HEAT.siren, tip: 'Deliberately draw a real horde to the camp. Click the camp core. Rare, big, and the only way besides noise to get one.' },
  { cat: 'Camp', id: 'radio',   key: '', label: 'Radio tower',   cost: () => COST.radio,         tip: 'Call for supply drops: a pallet of food and supplies lands in the camp every ' + BROADCAST.gap + 's for ' + fmtTime(BROADCAST.time) + ', but the noise draws the dead. Camp level ' + RADIO_LEVEL + '. Click the tower again to call again after it cools.', hidden: () => G.level < RADIO_LEVEL && G.rescue === null },
];
const costStr = c => [c.m && c.m + 'm', c.f && c.f + 'f', c.a && c.a + 'a', c.med && c.med + 'med', c.fuel && c.fuel + 'fuel'].filter(Boolean).join(' ');
const fmtRate = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '/s';

const UI = (() => {
  let lastRules = '', lastRadio = '', lastMap = '';
  let menuMode = null, lastPeople = '', lastRes = '', lastCrews = null, lastLog = '';

  // ---- build the static parts -------------------------------------------------------------
  const RESROW = [['a', 'rAmmo'], ['m', 'rMat'], ['f', 'rFood'], ['water', 'rWater'], ['fuel', 'rFuel'], ['med', 'rMed']];
  // ---- the two states: the fight, and the build menu ------------------------------------------------------------------
  const FIGHT_TOOLS = ['combat', 'orders'];
  const inBuild = () => G && !FIGHT_TOOLS.includes(G.tool);
  const TABS = [['Defence', ['Defense']], ['Traps', ['Traps & fire']], ['Facilities', ['Facilities']], ['Land & people', ['Land', 'People']], ['Camp', ['Camp']]];
  let buildTab = 0;
  function setTool(id) { G.tool = id; Snd.click(); }
  function toggleBuild() { if (!G || G.over) return; setTool(inBuild() ? 'combat' : 'none'); }
  function buildDock() {
    const el = $('dock');
    const b = (id, ic, label, key) => '<button id="dk' + id + '" title="' + label + '">' + Icons.img(ic, 24) + '<span>' + label + (key ? ' <kbd>' + key + '</kbd>' : '') + '</span></button>';
    el.innerHTML = b('Fight', 'combat', 'Fight', '0') + b('Cmd', 'orders', 'Command', 'C') + '<span class="sep"></span>' + b('Build', 'wall', 'Build', 'B') + '<span class="sep"></span>' + b('Crew', 'crew', 'Crew', 'K') + b('Pack', 'depot', 'Pack', 'I') + b('Camp', 'bunkhouse', 'Camp', '') + b('More', 'generator', 'More', '');
    $('dkFight').onclick = () => setTool('combat'); $('dkCmd').onclick = () => setTool('orders'); $('dkBuild').onclick = toggleBuild;
    $('dkCrew').onclick = () => toggleWork(); $('dkPack').onclick = () => togglePack();
    $('dkCamp').onclick = () => { document.body.classList.toggle('side-open'); Snd.click(); };
    $('dkMore').onclick = () => { document.body.classList.toggle('more-open'); Snd.click(); };
  }
  function buildMenu() {
    const el = $('bmenu');
    el.innerHTML = '<div class="tabs">' + TABS.map((t, i) => '<button data-tab="' + i + '">' + t[0] + '</button>').join('') + '<span class="btip" id="btip" style="margin-left:8px">Pick one, then click the ground.</span><span class="grow"></span><button id="bmDone" style="display:inline-flex">Done</button></div><div class="cards" id="bcards"></div>';
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { buildTab = +b.dataset.tab; renderCards(); Snd.click(); });
    $('bmDone').onclick = () => setTool('combat');
    renderCards();
  }
  function renderCards() {
    const cards = $('bcards'), cats = TABS[buildTab][1];
    document.querySelectorAll('#bmenu [data-tab]').forEach(b => b.classList.toggle('on', +b.dataset.tab === buildTab));
    cards.innerHTML = '';
    for (const t of TOOLS) {
      if (!cats.includes(t.cat) || FIGHT_TOOLS.includes(t.id)) continue;
      const b = document.createElement('button'); b.className = 'bcard'; b.dataset.tool = t.id; b.title = t.tip;
      b.innerHTML = Icons.img(t.id, 28) + '<span>' + t.label + '</span><span class="cc"></span>';
      b.addEventListener('click', () => setTool(t.id));
      b.addEventListener('mouseenter', () => { $('btip').textContent = t.label + ': ' + t.tip; });
      b.addEventListener('mouseleave', () => { const s = TOOLS.find(x => x.id === G.tool); $('btip').textContent = s ? s.label + ': ' + s.tip : 'Pick one, then click the ground.'; });
      cards.appendChild(b);
    }
  }
  function updateBuildMenu() {
    const RI = { m: 'm', f: 'f', a: 'a', med: 'med', fuel: 'fuel', water: 'water' };
    document.querySelectorAll('#bcards [data-tool]').forEach(b => {
      const t = TOOLS.find(x => x.id === b.dataset.tool), c = t.cost(), locked = t.lvl && G.level < t.lvl;
      b.classList.toggle('on', G.tool === t.id);
      b.style.display = t.hidden && t.hidden() ? 'none' : '';
      const afford = !(c.m || c.f || c.a || c.med || c.fuel) || canAfford(c);
      b.classList.toggle('dim', !!locked || !afford);
      const cc = b.querySelector('.cc'), key = t.id + JSON.stringify(c) + locked + afford;
      if (cc.dataset.k !== key) { cc.dataset.k = key; cc.innerHTML = t.id === 'def' ? G.idle.length + ' idle' : locked ? 'camp level ' + t.lvl : Object.keys(c).filter(k => c[k]).map(k => '<span>' + Items.img(RI[k] || k, 11) + c[k] + '</span>').join('') || 'free'; }
    });
    const s = TOOLS.find(x => x.id === G.tool);
    if (!document.querySelector('#bcards .bcard:hover')) $('btip').textContent = s ? s.label + ': ' + s.tip : 'Pick one, then click the ground.';
  }

  function init() {
    Loot.init(); $('introCard').addEventListener('click', () => Intro.onClick());
    for (const [k, id] of RESROW) { const b = $(id).parentElement.querySelector('b'); if (b) b.outerHTML = '<img src="' + Items.url(k) + '" alt="">'; }
    $('packChip').addEventListener('click', () => togglePack()); $('jobChip').addEventListener('click', () => toggleJobs());
    for (const id of ['townWrap', 'rMat', 'rFood', 'rWater', 'rFuel', 'rMed', 'jobChip', 'packChip', 'morWrap']) { const e = $(id); const w = e.classList.contains('res') ? e : e.parentElement; w.classList.add('bo'); }
    buildDock(); buildMenu();
    document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => {
      const s = +b.dataset.speed; if (s === 0) G.paused = !G.paused; else { G.paused = false; G.speed = s; }
    }));
    $('btnUp').addEventListener('click', upgradeCore);
    $('btnRes').addEventListener('click', toggleResearch);
    $('btnFallen').addEventListener('click', toggleMemorial);
    $('btnRules').addEventListener('click', toggleRules);
    $('btnWork').addEventListener('click', toggleWork);
    $('btnSecure').addEventListener('click', toggleSecure);
    $('btnMap').addEventListener('click', toggleMap);
    $('btnTruck').addEventListener('click', () => Base.buildTruck());
    const cs = $('craftSeg');
    for (const k in RECIPES) {
      const b = document.createElement('button'); b.dataset.craft = k; b.style.justifyContent = 'center'; b.style.padding = '3px 2px'; b.style.fontSize = '11px';
      b.textContent = RECIPES[k].label; b.title = RECIPES[k].weapon ? MW[RECIPES[k].weapon].label + ': ' + Object.entries(RECIPES[k].in).map(([a, n]) => n + ' ' + a).join(' + ') + ', ' + RECIPES[k].time + 's. Melee weapon: damage x' + MW[RECIPES[k].weapon].dmg + ', reach ' + MW[RECIPES[k].weapon].reach + ', needs melee level ' + MW[RECIPES[k].weapon].need + (RECIPES[k].tech ? '. Needs research.' : '') : Object.entries(RECIPES[k].in).map(([a, n]) => n + ' ' + a).join(' + ') + ' -> ' + Object.entries(RECIPES[k].out).map(([a, n]) => n + ' ' + a).join(' ') + ' every ' + RECIPES[k].time + 's';
      b.addEventListener('click', () => { G.craft = k; Snd.click(); }); cs.appendChild(b);
    }
  }

  const LOWS = [['food', () => G.food < 25], ['water', () => G.water < 25], ['ammo', () => G.ammo < 20], ['medicine', () => G.med < 1 && G.idle.some(s => s.sick > 0)]];
  function updateModeUI() {
    const b = inBuild(), bd = document.body;
    bd.classList.toggle('mode-build', b); bd.classList.toggle('mode-play', !b);
    $('dkFight').classList.toggle('on', G.tool === 'combat'); $('dkCmd').classList.toggle('on', G.tool === 'orders'); $('dkBuild').classList.toggle('on', b);
    $('dkCamp').classList.toggle('on', bd.classList.contains('side-open')); $('dkMore').classList.toggle('on', bd.classList.contains('more-open'));
    if (b) {
      $('modeBanner').textContent = 'BUILD MODE';
      updateBuildMenu();
      // zombies on you? the menu gets out of the way
      if (!AI.on && !G.over) {
        let close = P.hurt > 0;
        if (!close) for (const z of zombies) { if (z.mode !== 0 && z.hp > 0 && (z.x - P.px) ** 2 + (z.y - P.py) ** 2 < 49) { close = true; break; } }
        if (close) { G.tool = 'combat'; toast('Zombies on you. Back to the fight.'); Snd.error && Snd.error(); }
      }
    }
    // the fight panel: health, stamina, what is in your hands
    const w = Combat.WP(), mw = MW[P.mw && MW[P.mw] ? P.mw : 'knife'];
    const hp = Math.max(0, P.hp) / PLAYER.hp * 100, sta = (P.sta === undefined ? 100 : P.sta) / STAMINA.max * 100;
    const key = [hp | 0, sta | 0, w.label, P.mag, G.ammo | 0, P.reloadT > 0, mw.label, P.tired].join('|');
    const cb = $('cbt'); if (cb.dataset.k !== key) {
      cb.dataset.k = key;
      cb.innerHTML = '<div class="bars"><div class="bar2"><i style="width:' + hp + '%;background:' + (hp < 35 ? 'var(--bad)' : '#6fcf6a') + '"></i></div><div class="bar2"><i style="width:' + sta + '%;background:' + (P.tired ? '#c9a23a' : '#6fb0e8') + '"></i></div></div>' +
        '<div class="gun"><b>' + (P.reloadT > 0 ? 'RELOADING' : P.mag + ' <span style="color:var(--dim);font-size:13px">/ ' + (G.ammo | 0) + '</span>') + '</b><small>' + w.label + (Combat.unlocked().length > 1 ? ' · Q switch' : '') + '</small></div>' +
        '<div class="gun"><b style="font-size:13px">' + mw.label + '</b><small>swing: F or right-click</small></div>';
    }
    const low = LOWS.filter(([, f]) => f()).map(([n]) => n); const lc = $('lowChip');
    lc.textContent = low.length ? 'Running low: ' + low.join(', ') : ''; lc.classList.toggle('show', low.length > 0 && !G.intro);
  }

  // ---- HUD ---------------------------------------------------------------
  function update() {
    const L = LEVELS[G.level - 1];
    for (const [k, id] of RESROW) { const r = Items.RES[k], v = G[r.field] | 0, w = $(id).parentElement; w.title = r.name + ': ' + v + ' of ' + storeCap() + ' storable. ' + r.use + '.'; }
    $('rJobs').textContent = (G.blue || []).length; $('rJobs').style.color = (G.blue || []).length > 6 ? '#e8a447' : '';
    if ($('jobs').classList.contains('show')) renderJobs();
    $('rPack').textContent = Items.pack().length; $('rPack').style.color = Items.pack().length >= Items.PACK.slots ? 'var(--bad)' : '';
    if ($('pack').classList.contains('show')) renderPack();
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
    $('townName').textContent = G.townName || 'Camp';
    const bgAlert = Campaign.towns.some(t => t !== Campaign.active && t.pending);
    $('cMap').textContent = Campaign.towns.length > 1 ? (bgAlert ? '! alert' : Campaign.towns.length + ' towns') : (Campaign.truck ? 'truck ready' : '');
    const ta = $('townAlert'); ta.style.display = Campaign.alert ? 'block' : 'none'; if (Campaign.alert) ta.textContent = Campaign.alert.text;
    if ($('map').classList.contains('show')) renderMap();
    $('rWater').textContent = G.water | 0; $('rWater').style.color = G.water <= 0 ? 'var(--bad)' : '';
    const S = season(), left = SEASON_LEN - (gameTime() % SEASON_LEN);
    $('iSeason').textContent = S.name + ' (' + Math.ceil(left / 60) + 'm left)';
    $('iSupply').textContent = Math.round(G.supply * 100) + '%' + (G.depleted ? ' · ' + G.depleted + ' dry' : '');
    $('supBar').style.width = (G.supply * 100) + '%'; $('supBar').style.background = G.supply < STOCK.crit ? 'var(--bad)' : G.supply < STOCK.warn ? '#e8a447' : 'var(--good)';
    $('iWater').textContent = (G.water | 0) + ' / ' + Math.round(G.hygiene) + '% clean'; $('iWater').style.color = G.water <= 0 || G.hygiene < HYGIENE.low ? 'var(--bad)' : '';
    const rowOf = id => $(id).closest('.row'); const show = (id, v) => { const r = rowOf(id); if (r) r.style.display = v ? '' : 'none'; };
    show('iStock', G.ap + G.inc + G.keys > 0); show('iNests', G.nests.length > 0 || !!G.nestSeen); show('iPower', facilities.some(f => ['generator', 'solar', 'floodlight', 'workshop', 'turret'].includes(f.type)));
    show('iPress', G.elapsed >= PRESSURE.start * 0.8 || G.heat > 3);
    $('iStock').textContent = 'AP ' + G.ap + ' · Inc ' + G.inc + ' · Keys ' + G.keys;
    const hasShop = facilities.some(f => f.type === 'workshop');
    $('craftRow').style.display = hasShop ? '' : 'none';
    document.querySelectorAll('[data-craft]').forEach(b => { const R0 = RECIPES[b.dataset.craft]; b.classList.toggle('on', b.dataset.craft === G.craft); b.disabled = !!(R0.tech && !has(R0.tech)); if (R0.weapon) b.textContent = R0.label + ((G.mstock || {})[R0.weapon] ? ' ×' + G.mstock[R0.weapon] : ''); });
    const bay = facilities.some(f => f.type === 'garagebay'), tb = $('btnTruck');
    tb.style.display = bay && !Campaign.truck ? '' : 'none';
    if (bay && !Campaign.truck) { tb.textContent = G.truckT > 0 ? 'Truck: ' + Math.ceil(G.truckT) + 's' : 'Build truck (' + costStr(TRUCK.cost) + ')'; tb.disabled = G.truckT > 0 || !canAfford(TRUCK.cost); }
    $('rFuel').textContent = G.fuel | 0; $('rFuel').style.color = G.power.demand > 0 && G.fuel < 5 ? 'var(--bad)' : '';
    $('rMed').textContent = G.med | 0; $('rMed').style.color = G.med < 1 ? 'var(--dim)' : '';
    $('iPower').textContent = G.power.supply + '/' + G.power.demand.toFixed(1) + (G.power.burn > 0 ? ' · -' + G.power.burn.toFixed(2) + ' fuel/s' : '') + (G.power.demand > G.power.supply ? ' (brownout)' : '');
    $('iPress').textContent = Math.round(pressureRate() * 60) + '/min · noise ' + (G.heat | 0) + '%' + (hordes.some(h => !h.minor) ? ' · HORDE' : '');
    $('iNests').textContent = G.nests.length + (G.nests.length ? ' (hordes +' + Math.round(NEST.hordeBonus * 100 * G.nests.length) + '%)' : '');
    $('pHp').textContent = Math.max(0, P.hp | 0); $('pHp').style.color = P.hp < 35 ? 'var(--bad)' : '';
    $('zCount').textContent = G.visibleZ;
    const hd = $('horde'); hd.style.display = '';
    if (G.hordeMsg) { hd.className = 'panel ' + G.hordeMsg.cls; hd.textContent = G.hordeMsg.text; }
    else if (G.herdMsg) { hd.className = 'panel alert'; hd.textContent = G.herdMsg; }
    else if (G.intro) { hd.className = 'panel'; hd.style.display = 'none'; }
    else if (!inBuild() && !AI.on) { hd.style.display = 'none'; }
    else { hd.style.display = ''; hd.className = 'panel'; hd.textContent = G.lookouts.length ? 'Lookouts watching - no horde sighted' : 'No lookouts - you will get almost no warning'; }
    const rs = $('rescue');
    if (G.rescue !== null) { rs.style.display = 'block'; rs.textContent = G.rescueKind === 'convoy' ? 'Convoy arrives in ' + fmtTime(Math.max(0, G.rescue)) : 'Broadcasting for supplies: next drop in ' + fmtTime(Math.max(0, G.dropT)) + ' - ends in ' + fmtTime(Math.max(0, G.rescue)); } else rs.style.display = 'none';

    updateModeUI();
    document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', +b.dataset.speed === 0 ? G.paused : !G.paused && +b.dataset.speed === G.speed));
    $('cUp').textContent = L.up ? costStr(L.up) : 'MAX';
    $('btnUp').disabled = !L.up || !canAfford(L.up);
    $('cRes').textContent = G.res.active ? Math.round(G.res.active.t / G.res.active.dur * 100) + '%' : Object.keys(G.res.done).length + '/' + RESEARCH.length;

    $('iLvl').textContent = G.level + ' / ' + LEVELS.length;
    $('iCore').textContent = Math.max(0, G.coreHp | 0) + ' / ' + L.coreHp;
    $('iTerr').textContent = G.sealed ? G.territory + ' (walled in)' : G.territory + ' / ' + L.cap;
    const seal = $('iSeal'); seal.textContent = G.sealed ? 'Sealed' : 'OPEN'; seal.className = G.sealed ? 'ok' : 'warn';
    $('iBld').textContent = G.held;
    { const why = !G.sealed ? 'wall the camp in' : G.territory < 20 ? 'too small' : G.food < 20 ? 'needs food' : G.morale < MORALE.noRefugeesBelow ? 'morale too low' : !roomForPerson() ? 'camp full (level up or wall in more)' : null;
      $('iRef').textContent = why ? 'none: ' + why : 'one in ~' + Math.max(1, Math.ceil(G.refugeeT / ((1 + Math.min(G.territory, 450) / 150) * ruleMul('refugee')))) + 's'; $('iRef').style.color = why ? 'var(--dim)' : 'var(--good)'; }
    $('iPpl').textContent = people() + '/' + popCap() + ' · ' + defenders.length + ' posted · ' + G.lookouts.length + ' lookouts' + (G.food <= 0 ? ' (starving)' : '');
    let e = 0; for (let i = 0; i < W * H; i++) e += explored[i];
    $('iTime').textContent = fmtTime(G.elapsed) + ' / ' + G.hordesBeaten + ' hordes';
    $('iKills').textContent = G.kills + ' / ' + Math.round(e / (W * H) * 100) + '%';

    $('respawn').style.display = P.dead > 0 || P.travel > 0 ? 'block' : 'none';
    if (P.travel > 0) $('respawn').textContent = 'Arriving in ' + G.townName + '...';
    else if (P.dead > 0) $('respawn').textContent = 'Survivor down - a replacement arrives in ' + Math.ceil(P.dead) + 's';
    const b = nearBuilding(), pr = $('prompt');
    if (b && !G.over && P.dead <= 0 && !P.inside && !AI.on && (b.nest || b.crew)) {
      pr.style.display = 'block'; pr.textContent = b.nest ? 'Infested! Burn it out with a Molotov or send a crew with a fighter' : 'A crew is working here';
    } else pr.style.display = 'none';

    const nr = Object.keys(G.rules).length; $('cRules').textContent = nr ? nr + ' active' : G.ruleCd > 0 ? Math.ceil(G.ruleCd) + 's' : 'none';
    renderPeople(); renderCrews(); renderLog(); renderTrade(); renderRadio(); renderCmd();
    if ($('work').classList.contains('show')) renderWork();
    if ($('secure').classList.contains('show')) renderSecure();
    { const a = G.assess || []; $('cSecure').textContent = G.secured ? 'SECURED' : a.length ? a.filter(c => c.ok).length + '/' + a.length : ''; }
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
    const key = G.crews.map(c => c.bi + ':' + ((c.prog !== undefined ? c.prog : c.t / c.dur) * 20 | 0) + (c.phase || '')).join('|');
    if (key === lastCrews) return; lastCrews = key;
    $('crewsH').style.display = G.crews.length ? '' : 'none';
    $('crews').innerHTML = G.crews.map(c => {
      const b = buildings[c.bi];
      return '<div>' + c.members.map(who).join(', ') + ' → ' + BUILDING_TYPES[b.type].label + ' · ' + ({ out: 'walking out', work: 'scavenging', back: 'coming home' }[c.phase || 'out']) + '<div class="bar"><i style="width:' + ((c.prog !== undefined ? c.prog : c.t / c.dur) * 100) + '%"></i></div></div>';
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

  // ---- world map: the towns, travel, convoys, founding ---------------------------------------------------------------
  function townStats(t) {
    const live = t === Campaign.active, g = t.G, B = live ? buildings : t.lists.buildings, D = live ? defenders : t.lists.defenders;
    let rem = 0, tot = 0; for (const b of B) { tot += b.s0 || 0; for (const k of STOCK_KEYS) rem += (b.stock && b.stock[k]) || 0; }
    return { g, people: g.idle.length + D.length + g.crews.reduce((n, c) => n + c.members.length, 0), def: D.length, supply: tot ? rem / tot : 0, nests: g.nests.length,
      lookouts: live ? G.lookouts.length : (g.lookouts ? g.lookouts.length : 0) };
  }
  function toggleMap() {
    const el = $('map'); el.classList.toggle('show'); lastMap = '';
    if (el.classList.contains('show')) renderMap();
    Snd.click();
  }
  function renderMap() {
    const key = Campaign.towns.map(t => t.id + t.status + (t.pending ? 'p' : '') + (t.G.morale | 0) + (t.G.food | 0) + (t.G.mat | 0) + t.G.idle.length).join() + Campaign.convoys.length + (G.sel.length) + !!Campaign.truck + (G.truckT | 0) + G.fuel + G.level + G.idle.length + (Campaign.res.done.expedition ? 1 : 0);
    if (key === lastMap) return; lastMap = key;
    const el = $('map');
    let h = '<div class="row"><h3>World map</h3><button id="mpClose" style="padding:2px 8px">Close (Tab)</button></div>';
    h += '<div style="color:var(--dim)">Truck: <b class="' + (Campaign.truck ? 'ok2' : 'no2') + '">' + (Campaign.truck ? 'ready' : G.truckT > 0 ? 'under construction' : 'none') + '</b> &middot; Fuel here: ' + (G.fuel | 0) +
      ' &middot; Convoys on the road: ' + Campaign.convoys.length + '</div>';
    for (const t of Campaign.towns) {
      const st = townStats(t), g = st.g, here = t === Campaign.active;
      const res = ['mat', 'food', 'ammo', 'water', 'fuel', 'med'].map(k => Math.floor(g[k]) + ' ' + { mat: 'mat', food: 'food', ammo: 'ammo', water: 'water', fuel: 'fuel', med: 'med' }[k]).join(' &middot; ');
      h += '<div class="tcard ' + (here ? 'here' : '') + (t.status === 'lost' ? ' lost' : '') + '"><h4>' + t.name + '<span class="chip2">' + (t.status === 'lost' ? 'FALLEN' : here ? 'you are here' : 'running in the background') + '</span>' +
        (t.pending ? '<span class="chip2 no2">horde incoming</span>' : '') + '</h4>';
      h += '<div>Camp level ' + g.level + ' &middot; ' + st.people + ' people (' + st.def + ' posted) &middot; morale ' + moraleLabel(g.morale) + ' ' + (g.morale | 0) + ' &middot; supplies left ' + Math.round(st.supply * 100) + '%' + (st.nests ? ' &middot; ' + st.nests + ' nests' : '') + '</div>';
      h += '<div style="color:var(--dim)">' + res + '</div>';
      if (!here && t.status === 'alive') {
        h += '<div class="btns"><button data-travel="' + t.id + '"' + (Campaign.truck ? '' : ' disabled') + '>Travel there (' + TRAVEL.fuel + ' fuel)</button>';
        const P = [['100 materials', { m: 100 }], ['50 food', { f: 50 }], ['50 ammo', { a: 50 }], ['20 fuel', { fuel: 20 }], ['30 water', { water: 30 }], ['10 medicine', { med: 10 }]];
        P.forEach(([lab, res], i) => { h += '<button data-send="' + t.id + ':' + i + '"' + (canAfford(res) ? '' : ' disabled') + '>Send ' + lab + '</button>'; });
        h += '<button data-sendppl="' + t.id + '">Send selected survivors (' + G.idle.filter(s => G.sel.includes(s.id)).length + ')</button></div>';
      }
      h += '</div>';
    }
    if (Campaign.towns.length < MAX_TOWNS) {
      const reqs = Campaign.foundReqs();
      h += '<div class="tcard"><h4>Found a new town</h4><div style="color:var(--dim)">Take a founding party to another town: its supplies are finite, and so are the ones you have here.</div>' +
        reqs.map(r => '<div class="' + (r.ok ? 'ok2' : 'no2') + '">' + (r.ok ? '&#10003; ' : '&#10007; ') + r.text + '</div>').join('') +
        '<div class="btns"><button id="mpFound"' + (reqs.every(r => r.ok) ? '' : ' disabled') + '>Found a town and travel there</button></div></div>';
    }
    el.innerHTML = h;
    $('mpClose').addEventListener('click', toggleMap);
    el.querySelectorAll('[data-travel]').forEach(b => b.addEventListener('click', () => { Campaign.travel(+b.dataset.travel); lastMap = ''; toggleMap(); }));
    const PRESETS = [{ m: 100 }, { f: 50 }, { a: 50 }, { fuel: 20 }, { water: 30 }, { med: 10 }];
    el.querySelectorAll('[data-send]').forEach(b => b.addEventListener('click', () => { const [id, i] = b.dataset.send.split(':'); Campaign.sendSupplies(+id, PRESETS[+i]); lastMap = ''; renderMap(); }));
    el.querySelectorAll('[data-sendppl]').forEach(b => b.addEventListener('click', () => { Campaign.sendSurvivors(+b.dataset.sendppl); lastMap = ''; renderMap(); }));
    const f = $('mpFound'); if (f) f.addEventListener('click', () => { Campaign.found(); lastMap = ''; toggleMap(); });
  }

  // ---- camp rules ---------------------------------------------------------------
  let lastJobs = '';
  function toggleJobs() { const el = $('jobs'); el.classList.toggle('show'); lastJobs = ''; if (el.classList.contains('show')) renderJobs(); Snd.click(); }
  function renderJobs() {
    const L = (G.blue || []).slice().sort((a, b) => b.prio - a.prio || a.id - b.id);
    const key = L.map(b => b.id + ':' + b.prio + ':' + Math.round(b.prog / b.work * 20)).join() + '|' + (Build.hands | 0) + (Build.busy | 0) + (G.mat | 0);
    if (key === lastJobs) return; lastJobs = key;
    const el = $('jobs'), left = Build.workLeft();
    const big = L.length > 14;                                               // a big wall plan: show it as groups, not hundreds of rows
    const groups = []; if (big) { const m = new Map(); for (const bp of L) { const k = bp.tool + ':' + bp.prio; let g = m.get(k); if (!g) { g = { tool: bp.tool, prio: bp.prio, items: [], cost: {}, work: 0, prog: 0, w: 0 }; m.set(k, g); groups.push(g); } g.items.push(bp); for (const c in bp.cost) g.cost[c] = (g.cost[c] || 0) + bp.cost[c]; g.work += bp.work; g.prog += bp.prog; g.w += bp.w ? 1 : 0; } }
    const rows = big ? groups.map((g, gi) => '<tr><td>' + (g.w ? '<span style="color:var(--amber)">▸</span> ' : '') + '<b>' + Build.label(g.tool) + ' ×' + g.items.length + '</b></td>' +
      '<td><div style="width:70px;height:5px;background:#0008;border-radius:3px"><i style="display:block;height:100%;width:' + Math.round(g.prog / g.work * 100) + '%;background:' + (g.w ? 'var(--amber)' : '#6a7a70') + '"></i></div><small style="color:var(--dim)">' + Math.ceil(g.work - g.prog) + 's of work</small></td>' +
      '<td><small>' + Build.costText(g.cost) + '<br><span style="color:var(--dim)">set aside</span></small></td>' +
      '<td style="white-space:nowrap"><button data-gp="' + gi + '" data-d="1" title="Higher priority">▲</button><button data-gp="' + gi + '" data-d="-1" title="Lower priority">▼</button> <b style="display:inline-block;width:52px;text-align:center;color:' + (g.prio === 3 ? '#ff8a6a' : g.prio === 1 ? '#8ab0d8' : '') + '">' + Build.PRIO[g.prio] + '</b> <button data-gx="' + gi + '" title="Cancel the lot and get unused supplies back">✕</button></td></tr>').join('') :
      L.map(b => '<tr><td>' + (b.w ? '<span style="color:var(--amber)">▸</span> ' : '') + '<a href="#" data-go="' + b.id + '" style="color:inherit"><b>' + Build.label(b.tool) + '</b></a> <small style="color:var(--dim)">at ' + b.x + ',' + b.y + '</small></td>' +
      '<td><div style="width:70px;height:5px;background:#0008;border-radius:3px"><i style="display:block;height:100%;width:' + Math.round(b.prog / b.work * 100) + '%;background:' + (b.w ? 'var(--amber)' : '#6a7a70') + '"></i></div><small style="color:var(--dim)">' + Math.ceil(b.work - b.prog) + 's of work' + ((b.have || 0) < (b.tot || 0) ? ' · supplies ' + (b.have || 0) + '/' + b.tot : '') + '</small></td>' +
      '<td><small>' + Build.costText(b.cost) + '<br><span style="color:var(--dim)">set aside</span></small></td>' +
      '<td style="white-space:nowrap"><button data-p="' + b.id + '" data-d="1" title="Higher priority">▲</button><button data-p="' + b.id + '" data-d="-1" title="Lower priority">▼</button> <b style="display:inline-block;width:52px;text-align:center;color:' + (b.prio === 3 ? '#ff8a6a' : b.prio === 1 ? '#8ab0d8' : '') + '">' + Build.PRIO[b.prio] + '</b> <button data-x="' + b.id + '" title="Cancel and get the unused supplies back">✕</button></td></tr>').join('');
    el.innerHTML = '<div class="row"><h3>Build queue</h3><button id="jbClose" style="padding:2px 8px">Close (J)</button></div>' +
      '<div style="color:var(--dim);margin-bottom:6px">Supplies are set aside when you plan something, but they sit in the camp stockpile: someone has to <b>carry them over</b> first (stand by the fire to load up, or free survivors do it). Then it is built by <b>you</b> (stand next to it and hold still) and by survivors with <b>Build</b> on (K). Untrained hands are slow. Urgent jobs are worked first. ' + (L.length ? 'About <b>' + Math.ceil(left) + ' hand-seconds</b> of work queued; hands available: <b>' + (Build.hands | 0) + '</b>, working now: <b>' + (Build.busy | 0) + '</b>.' : '') + '</div>' +
      (L.length ? '<table class="wk" style="width:100%">' + rows + '</table><div style="margin-top:8px"><button id="jbClear">Cancel everything (refund unused)</button></div>' : '<div style="color:var(--dim)">Nothing queued. Pick a wall or tower and click or drag on the ground to plan it.</div>');
    $('jbClose').onclick = toggleJobs;
    const find = id => (G.blue || []).find(b => b.id === +id);
    el.querySelectorAll('button[data-gp]').forEach(b => b.onclick = () => { const g = groups[+b.dataset.gp]; for (const bp of g.items) Build.setPrio(bp, bp.prio + +b.dataset.d); lastJobs = ''; renderJobs(); Snd.click(); });
    el.querySelectorAll('button[data-gx]').forEach(b => b.onclick = () => { const g = groups[+b.dataset.gx]; for (const bp of g.items) Build.cancel(bp); lastJobs = ''; renderJobs(); });
    el.querySelectorAll('button[data-p]').forEach(b => b.onclick = () => { const bp = find(b.dataset.p); if (bp) Build.setPrio(bp, bp.prio + +b.dataset.d); lastJobs = ''; renderJobs(); Snd.click(); });
    el.querySelectorAll('button[data-x]').forEach(b => b.onclick = () => { const bp = find(b.dataset.x); if (bp) Build.cancel(bp); lastJobs = ''; renderJobs(); });
    el.querySelectorAll('a[data-go]').forEach(a => a.onclick = ev => { ev.preventDefault(); const bp = find(a.dataset.go); if (bp) { G.cam.free = true; G.cam.x = bp.x + 0.5; G.cam.y = bp.y + 0.5; } });
    const cl = el.querySelector('#jbClear'); if (cl) cl.onclick = () => { for (const bp of (G.blue || []).slice()) Build.cancel(bp); lastJobs = ''; renderJobs(); };
  }
  let lastPack = '';
  function togglePack() {
    const el = $('pack'); el.classList.toggle('show'); lastPack = '';
    if (el.classList.contains('show')) renderPack();
    Snd.click();
  }
  function renderPack() {
    const inv = Items.pack(), cap = storeCap(), camp = Items.atCamp();
    const key = RESROW.map(([k]) => G[Items.RES[k].field] | 0).join() + '|' + inv.map(s => s.id + s.n).join() + '|' + camp + '|' + (P.mag | 0) + '|' + (P.hp | 0) + '|' + (P.mw || '') + JSON.stringify(G.mstock || {});
    if (key === lastPack) return; lastPack = key;
    const el = $('pack');
    const stock = RESROW.map(([k]) => { const r = Items.RES[k], v = G[r.field] | 0, low = (k === 'a' && v < 30) || (k === 'f' && v < 20) || (k === 'water' && v < 20) || (k === 'm' && v < 40);
      return '<div class="lootrow">' + Items.img(k, 22) + '<span class="ln"><b>' + r.name + '</b> <span class="lq" style="color:' + (low ? 'var(--bad)' : '') + '">' + v + '</span> / ' + cap + '<div class="bar"><i style="width:' + Math.min(100, v / cap * 100) + '%;background:' + (low ? 'var(--bad)' : 'var(--acc)') + '"></i></div><small>' + r.use + '</small></span></div>'; }).join('');
    const pk = inv.length ? inv.map(s => { const d = Items.ITEMS[s.id];
      return '<div class="lootrow">' + Items.img(s.id, 24) + '<span class="ln"><b>' + d.name + '</b> <span class="lq">x' + s.n + '</span><br><small>' + d.desc + '</small></span>' +
        (d.use ? '<button data-u="' + s.id + '">Use</button>' : '') + (d.stash ? '<button data-s="' + s.id + '"' + (camp ? '' : ' disabled title="Walk back to camp to stash"') + '>Stash</button>' : '') + '<button data-d="' + s.id + '">Drop</button></div>'; }).join('')
      : '<div style="color:var(--dim)">Empty. The dead sometimes carry something worth taking; ruins hide more.</div>';
    const armory = () => { const st = G.mstock || {}, cur = P.mw && MW[P.mw] ? P.mw : 'knife'; const have = Object.keys(MW).filter(k => st[k] > 0 && k !== cur);
      return '<div>Carrying: <b>' + MW[cur].label + '</b> <small style="color:var(--dim)">(damage ×' + MW[cur].dmg + ', reach ' + MW[cur].reach + ')</small></div>' + (have.length ? have.map(k => '<div class="lootrow"><span class="ln"><b>' + MW[k].label + '</b> ×' + st[k] + ' <small>damage ×' + MW[k].dmg + ', reach ' + MW[k].reach + ', ' + (MW[k].cd < 1 ? 'fast' : MW[k].cd > 1.1 ? 'slow' : 'average') + '</small></span><button data-eq="' + k + '">Take</button></div>').join('') : '<small style="color:var(--dim)">Nothing on the rack. Build a workshop and make some.</small>'); };
    el.innerHTML = '<div class="row"><h3>Pack &amp; stockpile</h3><button id="pkClose" style="padding:2px 8px">Close (I)</button></div>' +
      '<div class="sec">Weapon</div><div>' + Items.img('a', 18) + ' Pistol: <b>' + (P.mag | 0) + '</b> in the magazine, <b>' + (G.ammo | 0) + '</b> in reserve. Health <b>' + Math.max(0, P.hp | 0) + '</b>.</div>' +
      '<div class="sec">Your melee weapon</div>' + armory() +
      '<div class="sec">Camp stockpile</div>' + stock +
      '<div class="sec">Your pack (' + Items.packCount() + ' items, ' + inv.length + '/' + Items.PACK.slots + ' slots)</div>' + pk +
      (inv.some(s => Items.ITEMS[s.id].stash) ? '<div style="margin-top:8px"><button id="pkStash"' + (camp ? '' : ' disabled') + '>Stash everything useful at camp</button> ' + (camp ? '' : '<small style="color:var(--dim)">(walk back to the fire first)</small>') + '</div>' : '');
    el.querySelector('#pkClose').onclick = togglePack;
    el.querySelectorAll('button[data-u]').forEach(b => b.onclick = () => { Items.useOne(b.dataset.u); lastPack = ''; renderPack(); });
    el.querySelectorAll('button[data-s]').forEach(b => b.onclick = () => { Items.stashOne(b.dataset.s); lastPack = ''; renderPack(); });
    el.querySelectorAll('button[data-d]').forEach(b => b.onclick = () => { Items.dropOne(b.dataset.d); lastPack = ''; renderPack(); });
    el.querySelectorAll('button[data-eq]').forEach(b => b.onclick = () => { const st = mwStock(), id = b.dataset.eq; if (st[id] > 0) { st[id]--; const old = P.mw; if (old && MW[old] && old !== 'knife') st[old] = (st[old] || 0) + 1; P.mw = id; Snd.click(); } lastPack = ''; renderPack(); });
    const st = el.querySelector('#pkStash'); if (st) st.onclick = () => { Items.stashAll(); lastPack = ''; renderPack(); };
  }
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
  const menuOpen = () => menuMode !== null || !!(G && G.radioMsg) || Loot.isOpen() || Intro.slidesOpen();
  let settingsBack = 'title', newBack = 'title';
  const DIFF_NOTE = { easy: 'Smaller waves, more time to get set up.', normal: 'The intended game.', hard: 'Bigger waves, less time.' };
  function showMenu(mode) {
    menuMode = mode; $('obj').classList.remove('show'); if (mode === 'title') $('introCard').classList.remove('show');
    const c = $('card'), ov = $('overlay');
    const fx = mode === 'title' || mode === 'new' || (mode === 'settings' && settingsBack === 'title');
    ov.classList.toggle('title', fx); if (fx) { TitleFx.start($('fxc')); Save.setLive(false); } else TitleFx.stop();
    const diff = (store.get('zomb-diff') || 'normal');
    const story = store.get('zomb-story') || 'cassandra';
    const storyBtns = '<div class="seg" id="storySeg">' + Object.keys(STORYTELLERS).map(k => '<button data-story="' + k + '" class="' + (k === story ? 'on' : '') + '">' + STORYTELLERS[k].label + '</button>').join('') + '</div>' +
      '<div id="storyDesc" style="color:var(--dim);font-size:12px;margin-top:4px">' + STORYTELLERS[story].desc + '</div>';
    const diffBtns = '<div class="seg" id="diffSeg">' + Object.keys(DIFFICULTY).map(k => '<button data-diff="' + k + '" class="' + (k === diff ? 'on' : '') + '">' + DIFFICULTY[k].label + '</button>').join('') + '</div>';
    const settingsHtml = '<div style="margin-top:12px">Volume <input id="volume" type="range" min="0" max="100" value="' + Math.round(Snd.vol * 100) + '"></div>' +
      '<div style="margin-top:12px">Hints</div><div class="seg" id="hintSeg"><button data-hint="on" class="' + (Hints.on() ? 'on' : '') + '">On</button><button data-hint="off" class="' + (Hints.on() ? '' : 'on') + '">Off</button></div>' +
      '<div style="margin-top:12px">Graphics</div><div class="seg" id="qualSeg">' + Object.keys(QUALITY).map(k => '<button data-q="' + k + '" class="' + (k === Q.name ? 'on' : '') + '">' + k[0].toUpperCase() + k.slice(1) + '</button>').join('') + '</div>' +
      '<div id="menuBtns"><button id="mFull" class="alt">Fullscreen (F)</button>' + (Save.exists() || G ? '<button id="mExport" class="alt">Export save (copy text)</button>' : '') + '<button id="mImport" class="alt">Import a save</button>' + (mode === 'settings' && settingsBack === 'pause' ? '<button id="mAbandon" class="alt">Abandon run (deletes the save)</button>' : '') + '<button id="mSetBack">Back</button></div>' +
      '<div style="color:var(--dim);font-size:12px;margin-top:8px">' + Save.status() + '</div>';
    let h = '';
    if (mode === 'title') {
      h = '<h1>GRAVEL &amp; ASH</h1><div class="sub">Hold out. Build up. Make it last.</div>' +
        '<div id="menuBtns">' + (Save.exists() ? '<button id="mContinue">Continue</button>' : '') + '<button id="mNew" class="' + (Save.exists() ? 'alt' : '') + '">New game</button><button id="mSettings" class="alt">Settings</button></div>';
    } else if (mode === 'new') {
      h = '<h1>New game</h1><div class="sub">Choose how hard, and how the dead behave.</div>' +
        '<div style="margin-top:6px">Difficulty</div>' + diffBtns + '<div id="diffDesc" style="color:var(--dim);font-size:12px;margin-top:4px">' + DIFF_NOTE[diff] + '</div>' +
        '<div style="margin-top:12px">Omen</div>' + storyBtns +
        '<div id="menuBtns"><button id="mStart">Begin</button><button id="mNewBack" class="alt">Back</button></div>';
    } else if (mode === 'settings') {
      h = '<h1>Settings</h1>' + settingsHtml;
    } else if (mode === 'pause') {
      h = '<h1>Paused</h1><div class="sub">Survived ' + fmtTime(G.elapsed) + ' · ' + G.hordesBeaten + ' hordes beaten</div>' +
        '<div id="menuBtns"><button id="mResume">Resume</button><button id="mMem" class="alt">Memorial (' + G.memorial.length + ')</button><button id="mSave" class="alt">Save now</button><button id="mSettings" class="alt">Settings</button><button id="mQuit" class="alt">Save and quit to title</button></div><div style="color:var(--dim);font-size:12px;margin-top:8px">The game also saves by itself every 30 seconds.</div>';
    } else {
      h = '<h1>' + G.endWhy + '</h1><div class="sub">' + (G.won ? 'Your towns stand on their own. The dead no longer decide anything.' : 'The dead take the town.') + '</div>' +
        '<p>You lasted <b>' + fmtTime(G.elapsed) + '</b>, beat <b>' + G.hordesBeaten + '</b> horde' + (G.hordesBeaten === 1 ? '' : 's') + ', killed <b>' + G.kills + '</b> zombies and reached camp level <b>' + G.level + '</b>.</p>' +
        '<h4 style="margin-top:12px">The fallen</h4><div style="max-height:30vh;overflow:auto">' + memorialHtml(8) + '</div>' +
        '<div id="menuBtns"><button id="mNew">New game</button></div>';
    }
    c.innerHTML = h; ov.classList.remove('hidden');
    const on = (id, fn) => { const e = $(id); if (e) e.addEventListener('click', () => { Snd.resume(); Snd.click(); fn(); }); };
    document.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
      setQuality(b.dataset.q); resize(); document.querySelectorAll('[data-q]').forEach(x => x.classList.toggle('on', x === b));
    }));
    document.querySelectorAll('[data-diff]').forEach(b => b.addEventListener('click', () => {
      store.set('zomb-diff', b.dataset.diff); const dd = $('diffDesc'); if (dd) dd.textContent = DIFF_NOTE[b.dataset.diff];
      document.querySelectorAll('[data-diff]').forEach(x => x.classList.toggle('on', x === b));
    }));
    document.querySelectorAll('[data-hint]').forEach(b => b.addEventListener('click', () => { Hints.setOn(b.dataset.hint === 'on'); document.querySelectorAll('[data-hint]').forEach(x => x.classList.toggle('on', x === b)); }));
    const v = $('volume'); if (v) v.addEventListener('input', () => { Snd.resume(); Snd.setVolume(v.value / 100); });
    document.querySelectorAll('[data-story]').forEach(b => b.addEventListener('click', () => {
      store.set('zomb-story', b.dataset.story); $('storyDesc').textContent = STORYTELLERS[b.dataset.story].desc;
      document.querySelectorAll('[data-story]').forEach(x => x.classList.toggle('on', x === b));
    }));
    on('mNew', () => { newBack = mode; showMenu('new'); });
    on('mStart', () => { Hints.reset(); newGame(store.get('zomb-diff') || 'normal', undefined, store.get('zomb-story') || 'cassandra'); Save.setLive(true); hideMenu(); if (typeof Intro !== 'undefined') Intro.begin(); });
    on('mNewBack', () => showMenu(newBack === 'new' ? 'title' : newBack));
    on('mSettings', () => { settingsBack = mode; showMenu('settings'); });
    on('mSetBack', () => showMenu(settingsBack));
    on('mContinue', () => { if (Save.load()) { Save.setLive(true); hideMenu(); } else toast('Could not load the save'); });
    on('mExport', async () => { if (!Save.save()) toast('Nothing to export yet'); showTransfer('export'); });
    on('mImport', () => showTransfer('import', mode));
    on('mFull', toggleFullscreen);
    on('mResume', hideMenu);
    on('mMem', () => { hideMenu(); toggleMemorial(); });
    on('mSave', () => { toast(Save.save() ? 'Game saved. ' + Save.status() : 'Could not save'); });
    on('mQuit', () => { Save.save(); showMenu('title'); });
    on('mAbandon', () => { Save.clear(); Save.setLive(false); showMenu('title'); });
  }
  // a save as text: copy it out, paste it back in (works anywhere, even when storage is blocked)
  async function showTransfer(kind, back) {
    const c = $('card'); back = back || 'pause';
    c.innerHTML = '<h1>' + (kind === 'export' ? 'Export save' : 'Import a save') + '</h1><div class="sub">' + (kind === 'export' ? 'Copy this text somewhere safe' : 'Paste a copied save here') + '</div>' +
      '<textarea id="xfer" rows="9" spellcheck="false" style="width:100%;margin-top:8px;background:#0b0f0d;color:#d8e6d4;border:1px solid var(--line);border-radius:6px;padding:8px;font:11px monospace;user-select:text;-webkit-user-select:text"></textarea>' +
      '<div id="menuBtns"><button id="xGo">' + (kind === 'export' ? 'Copy to clipboard' : 'Load this save') + '</button><button id="xBack" class="alt">Back</button></div><div id="xMsg" style="color:var(--dim);font-size:12px;margin-top:6px"></div>';
    const ta = $('xfer'), msg = $('xMsg');
    if (kind === 'export') {
      const raw = Save.raw(); ta.value = raw ? await Cloud.pack(raw) : ''; msg.textContent = raw ? 'Select all and copy, or press the button.' : 'There is no save yet.';
    }
    $('xBack').addEventListener('click', () => showMenu(back));
    $('xGo').addEventListener('click', async () => {
      if (kind === 'export') { ta.select(); try { await navigator.clipboard.writeText(ta.value); msg.textContent = 'Copied.'; } catch (e) { msg.textContent = 'Press Ctrl+C to copy the selected text.'; } return; }
      try { const str = await Cloud.unpack(ta.value); if (!Save.load(str)) throw new Error('That save could not be read'); Save.adopt(str); Save.setLive(true); hideMenu(); toast('Save loaded'); } catch (e) { msg.textContent = 'Could not load: ' + (e.message || e); }
    });
  }
  function refreshTitle() { if (menuMode === 'title') showMenu('title'); }
  function hideMenu() { menuMode = null; $('overlay').classList.add('hidden'); TitleFx.stop(); }
  function showEnd() { showMenu('end'); }

  // ---- input (pointer events: mouse, touch and pen share one path) -----------------------------------------------
  const pointers = new Map();
  let pinch = null, panning = false, painting = false, lastPaint = null, lastMouse = { x: 0, y: 0 };
  let selDrag = null, rc = null;
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

  // ---- selecting and ordering survivors (RimWorld-style) ----
  const toWorld = (sx, sy) => { const z = G.cam.zoom; return { x: (sx - innerWidth / 2) / z / T + G.cam.x, y: (sy - innerHeight / 2) / z / T + G.cam.y }; };
  const clearSel = () => { G.sel = []; G.selP = false; };
  const hasSel = () => G.selP || G.sel.length > 0;
  function pickAt(w) {
    let best = null, bd = 0.7 * 0.7;
    const consider = (o, x, y) => { const d = (x - w.x) ** 2 + (y - 0.35 - w.y) ** 2; if (d < bd) { bd = d; best = o; } };
    if (P.dead <= 0) consider({ p: true }, P.px, P.py);
    for (const u of Units.all()) consider({ s: u.s }, u.px, u.py);
    for (const d of defenders) consider({ s: d.s }, d.px, d.py);
    return best;
  }
  function finishSelect(sd) {
    const add = sd.add;
    if (sd.moved && !sd.touch) {                                   // box select
      const a = toWorld(Math.min(sd.x0, sd.x1), Math.min(sd.y0, sd.y1)), b = toWorld(Math.max(sd.x0, sd.x1), Math.max(sd.y0, sd.y1));
      const inBox = (x, y) => x >= a.x && x <= b.x && y - 0.35 >= a.y && y - 0.35 <= b.y;
      if (!add) clearSel();
      if (P.dead <= 0 && inBox(P.px, P.py)) G.selP = true;
      for (const u of Units.all()) if (inBox(u.px, u.py) && !G.sel.includes(u.s.id)) G.sel.push(u.s.id);
      for (const d of defenders) if (inBox(d.px, d.py) && !G.sel.includes(d.s.id)) G.sel.push(d.s.id);
      Snd.click(); lastPeople = ''; return;
    }
    const w = toWorld(sd.x1, sd.y1), hit = pickAt(w);
    if (hit) {
      if (!add && !(sd.touch && ((hit.p && G.selP) || (hit.s && G.sel.includes(hit.s.id))))) clearSel();
      if (hit.p) G.selP = !G.selP || !add; else { const i = G.sel.indexOf(hit.s.id); if (i >= 0 && add) G.sel.splice(i, 1); else if (i < 0) G.sel.push(hit.s.id); }
      Snd.click(); lastPeople = ''; return;
    }
    if (sd.touch && hasSel()) { rightClick(sd.x1, sd.y1); return; }   // on a phone a tap on the ground gives the order
    clearSel(); lastPeople = '';
  }
  function rightClick(sx, sy) {
    if (!G || !hasSel()) return;
    const t = screenToTile(sx, sy);
    if (Units.orderAt(t.tx, t.ty)) { G.orderFx = { x: t.tx + 0.5, y: t.ty + 0.5, t: 1 }; Snd.click(); lastPeople = ''; }
  }
  function renderCmd() {
    const el = $('cmdbar'), sel = Units.selected(), n = sel.length + (G.selP ? 1 : 0);
    if (!n) { el.classList.remove('show'); el.dataset.k = ''; return; }
    const names = [...(G.selP ? ['You'] : []), ...sel.map(e => who(e.s) + ' (' + Units.statusOf(e.s) + ')')];
    const k = names.join('|') + G.crews.length; if (el.dataset.k === k) return; el.dataset.k = k;
    el.classList.add('show');
    el.innerHTML = '<b>' + n + ' selected</b> · ' + names.slice(0, 4).join(', ') + (names.length > 4 ? ' +' + (names.length - 4) : '') + '<br><span style="color:var(--dim)">Right-click: ground to move · wall to man it · building to scavenge</span> <button id="cbDown">Stand down (X)</button><button id="cbTM">Train melee</button><button id="cbTS">Train shooting</button><button id="cbWork">Work (K)</button><button id="cbClr">Deselect</button>';
    $('cbDown').onclick = () => { Units.standDownSelected(); lastPeople = ''; };
    $('cbTM').onclick = () => { for (const e of Units.selected()) Units.workOf(e.s).train = 'melee'; lastWork = ''; toast('Selected survivors will train melee when they are free'); };
    $('cbTS').onclick = () => { for (const e of Units.selected()) Units.workOf(e.s).train = 'shoot'; lastWork = ''; toast('Selected survivors will practise shooting: it costs ammo and the noise draws the dead'); };
    $('cbWork').onclick = toggleWork; $('cbClr').onclick = () => { clearSel(); lastPeople = ''; };
  }
  let lastSecure = '';
  function toggleSecure() { const el = $('secure'); el.classList.toggle('show'); lastSecure = ''; if (el.classList.contains('show')) renderSecure(); Snd.click(); }
  function renderSecure() {
    const a = G.assess || Survival.assess(), key = a.map(c => c.ok + c.text).join('|') + (G.safeT | 0) + G.secured + Campaign.towns.length;
    if (key === lastSecure) return; lastSecure = key;
    const n = Campaign.towns.filter(t => t.status === 'alive' && (t === Campaign.active ? G.secured : t.G.secured)).length;
    let h = '<div class="row"><h3>Sustainability</h3><button id="scClose" style="padding:2px 8px">Close (Y)</button></div><div style="color:var(--dim);margin-bottom:6px">A town is <b>secured</b> when every line below holds for ' + fmtTime(SECURE.time) + ' straight: it feeds, arms and defends itself. Then it is safe to move on to the next town. Secure ' + WIN_TOWNS + ' towns to win (' + n + ' secured so far).</div>';
    for (const c of a) h += '<div class="tech"><div><b style="color:' + (c.ok ? '#7fe08a' : '#e8827a') + '">' + (c.ok ? '✔ ' : '✘ ') + '</b>' + c.text + '</div></div>';
    h += '<div style="margin-top:8px">' + (G.secured ? '<b style="color:#7fe08a">' + G.townName + ' is SECURED.</b>' : 'Steady for ' + fmtTime(G.safeT) + ' of ' + fmtTime(SECURE.time)) + '</div><div class="bar"><i style="width:' + Math.min(100, G.safeT / SECURE.time * 100) + '%"></i></div>' +
      '<div style="color:var(--dim);margin-top:6px"><small>Build: Gardens (food), Wells / Rain collectors (water), Mines (materials), Solar arrays + a Workshop (ammo and weapons without fuel), keep the walls repaired and the garrison full.</small></div>';
    el.innerHTML = h; $('scClose').onclick = toggleSecure;
  }
  let lastWork = '';
  function toggleWork() { const el = $('work'); el.classList.toggle('show'); lastWork = ''; if (el.classList.contains('show')) renderWork(); Snd.click(); }
  function renderWork() {
    const rows = [...G.idle.map(s => ({ s })), ...defenders.map(d => ({ s: d.s })), ...G.crews.flatMap(c => c.members.map(s => ({ s })))];
    const key = rows.map(r => r.s.id + Units.statusOf(r.s) + JSON.stringify(Units.workOf(r.s)) + (r.s.mw || '') + skillLv(r.s, 'melee') + skillLv(r.s, 'shoot') + (G.sel.includes(r.s.id) ? '*' : '')).join('|') + JSON.stringify(G.mstock || {});
    if (key === lastWork) return; lastWork = key;
    const el = $('work');
    let h = '<div class="row"><h3>Work &amp; orders</h3><button id="wkClose" style="padding:2px 8px">Close (K)</button></div><div style="color:var(--dim);margin-bottom:4px">Free survivors guard when a horde comes, then build, scavenge and train. Shooting practice burns ammo and its noise draws the dead; past level 3 needs a training yard.</div>' + '<div style="margin:4px 0">Everyone free: <button data-bulk="melee" style="display:inline-flex">Train melee</button> <button data-bulk="shoot" style="display:inline-flex">Train shooting</button> <button data-bulk="off" style="display:inline-flex">Stop training</button> <small style="color:var(--dim)">Rack: ' + (Object.entries(G.mstock || {}).filter(([k, n]) => n > 0).map(([k, n]) => MW[k].label + ' ×' + n).join(', ') || 'empty (the workshop makes weapons)') + '</small></div><table class="wk" style="width:100%"><tr><th>Survivor</th><th>Doing</th><th>Guard</th><th>Scavenge</th><th>Build</th><th>Train</th><th>Melee weapon</th></tr>';
    rows.forEach((r, i) => { const w = Units.workOf(r.s); h += '<tr data-i="' + i + '"><td>' + (G.sel.includes(r.s.id) ? '▸ ' : '') + '<a href="#" data-sel="' + i + '" style="color:inherit">' + r.s.name + '</a> <small style="color:var(--dim)">' + ROLES[r.s.role].label + '</small></td><td><small>' + Units.statusOf(r.s) + '</small></td><td><button data-w="guard" data-i="' + i + '" class="' + (w.guard ? 'on' : '') + '">' + (w.guard ? 'On' : 'Off') + '</button></td><td><button data-w="loot" data-i="' + i + '" class="' + (w.loot ? 'on' : '') + '">' + (w.loot ? 'On' : 'Off') + '</button></td><td><button data-w="build" data-i="' + i + '" class="' + (w.build !== false ? 'on' : '') + '">' + (w.build !== false ? 'On' : 'Off') + '</button></td><td><button data-tr data-i="' + i + '" class="' + (w.train && w.train !== 'off' ? 'on' : '') + '">' + ({ off: 'Off', melee: 'Melee ' + skillLv(r.s, 'melee'), shoot: 'Shoot ' + skillLv(r.s, 'shoot') }[w.train || 'off']) + '</button></td><td><button data-mwb data-i="' + i + '" title="Click to change. Auto gives the best one they can handle.">' + MW[mwOf(r.s)].label + (r.s.mwLock ? '' : ' (auto)') + '</button> <small style="color:var(--dim)">need ' + MW[mwOf(r.s)].need + '</small></td></tr>'; });
    h += '</table>' + (rows.length ? '' : '<div style="color:var(--dim)">No survivors yet.</div>');
    el.innerHTML = h;
    $('wkClose').onclick = toggleWork;
    el.querySelectorAll('button[data-w]').forEach(b => b.onclick = () => { const r = rows[+b.dataset.i]; const w = Units.workOf(r.s); w[b.dataset.w] = b.dataset.w === 'build' ? w.build === false : !w[b.dataset.w]; lastWork = ''; renderWork(); Snd.click(); });
    el.querySelectorAll('button[data-tr]').forEach(b => b.onclick = () => { const r = rows[+b.dataset.i]; const w = Units.workOf(r.s); w.train = { off: 'melee', melee: 'shoot', shoot: 'off' }[w.train || 'off']; lastWork = ''; renderWork(); Snd.click(); });
    el.querySelectorAll('button[data-mwb]').forEach(b => b.onclick = () => { const r = rows[+b.dataset.i], s0 = r.s, st = G.mstock || {}; const opts = ['auto', ...Object.keys(MW).filter(k => (st[k] > 0 || k === s0.mw) && k !== 'knife')]; const cur = s0.mwLock ? s0.mw : 'auto'; const nx = opts[(opts.indexOf(cur) + 1) % opts.length]; equipMw(s0, nx, true); if (nx === 'auto') autoArm(); lastWork = ''; renderWork(); Snd.click(); });
    el.querySelectorAll('button[data-bulk]').forEach(b => b.onclick = () => { for (const r of rows) { if (defenders.some(d => d.s === r.s) || G.crews.some(c => c.members.includes(r.s))) continue; Units.workOf(r.s).train = b.dataset.bulk; } lastWork = ''; renderWork(); Snd.click(); });
    el.querySelectorAll('a[data-sel]').forEach(a => a.onclick = ev => { ev.preventDefault(); const r = rows[+a.dataset.sel]; clearSel(); G.sel.push(r.s.id); lastWork = ''; renderWork(); lastPeople = ''; });
  }

  function bindInput() {
    $('mini').addEventListener('pointerdown', e => { if (!G) return; const r = $('mini').getBoundingClientRect(); G.cam.free = true; G.cam.x = clamp((e.clientX - r.left) / r.width * W, 0, W); G.cam.y = clamp((e.clientY - r.top) / r.height * H, 0, H); e.stopPropagation(); });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => {
      Snd.resume();
      if (e.pointerType === 'touch' && !document.body.classList.contains('touch')) setTouchMode(true);
      if (!G || menuOpen()) return;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      lastMouse = { x: e.clientX, y: e.clientY };
      G.hover = screenToTile(e.clientX, e.clientY);
      Combat.mouse.x = e.clientX; Combat.mouse.y = e.clientY;
      if (e.pointerType === 'mouse') {
        if (e.button === 1) { panning = true; G.cam.free = true; return; }
        if (e.button === 2 && G.tool === 'combat' && !AI.on) { Combat.mdown = true; Combat.melee(); return; }
        if (e.button === 2) { rc = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }; return; }      // right-click orders, right-drag looks around
        if (e.button !== 0) return;
      } else if (pointers.size >= 2) {               // two fingers: pinch to zoom, drag to pan
        painting = false; G.cam.free = true; const p = pair(); pinch = { d: p.d, cx: p.cx, cy: p.cy, zoom: G.cam.zoom }; return;
      }
      if (G.tool === 'combat') { Combat.down = true; return; }
      if (G.tool === 'orders') { selDrag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, moved: false, touch: e.pointerType === 'touch', add: e.shiftKey }; return; }
      painting = G.tool !== 'crew' && G.tool !== 'radio'; lastPaint = G.hover; tryBuild(G.hover.tx, G.hover.ty);
    });
    canvas.addEventListener('pointermove', e => {
      if (!G) return;
      Combat.mouse.x = e.clientX; Combat.mouse.y = e.clientY;
      const p = pointers.get(e.pointerId);
      if (e.pointerType !== 'touch') G.hover = screenToTile(e.clientX, e.clientY);
      if (p) { p.x = e.clientX; p.y = e.clientY; }
      if (rc && rc.id === e.pointerId && !rc.moved && Math.hypot(e.clientX - rc.x, e.clientY - rc.y) > 5) { rc.moved = true; panning = true; G.cam.free = true; }
      if (selDrag && selDrag.id === e.pointerId) {
        selDrag.x1 = e.clientX; selDrag.y1 = e.clientY;
        if (!selDrag.moved && Math.hypot(selDrag.x1 - selDrag.x0, selDrag.y1 - selDrag.y0) > 6) selDrag.moved = true;
        const bx = $('selbox');
        if (selDrag.moved && !selDrag.touch) { bx.style.display = 'block'; bx.style.left = Math.min(selDrag.x0, selDrag.x1) + 'px'; bx.style.top = Math.min(selDrag.y0, selDrag.y1) + 'px'; bx.style.width = Math.abs(selDrag.x1 - selDrag.x0) + 'px'; bx.style.height = Math.abs(selDrag.y1 - selDrag.y0) + 'px'; }
        lastMouse = { x: e.clientX, y: e.clientY }; return;
      }
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
      if (e.button === 0 || e.type !== 'pointerup') Combat.down = false;
      if (e.button === 2 || e.type !== 'pointerup') Combat.mdown = false;
      if (selDrag && selDrag.id === e.pointerId) { $('selbox').style.display = 'none'; finishSelect(selDrag); selDrag = null; }
      if (rc && rc.id === e.pointerId) { if (!rc.moved) rightClick(e.clientX, e.clientY); rc = null; panning = false; }
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
      if (Intro.onKey(k)) { e.preventDefault(); return; }
      if (Loot.isOpen()) { if (e.repeat) return; if (k === 'e' || k === 'enter') Loot.takeAll(); else if (k === 'escape') Loot.leave(); e.preventDefault(); return; }
      if (k === 'escape') { if (!G) return; if (!menuMode && (document.body.classList.contains('side-open') || document.body.classList.contains('more-open'))) { document.body.classList.remove('side-open', 'more-open'); return; }
      if (!menuMode && inBuild()) { G.tool = 'combat'; Snd.click(); return; } if (menuMode === 'pause') hideMenu(); else if (menuMode === 'settings') showMenu(settingsBack); else if (menuMode === 'new') showMenu(newBack === 'new' ? 'title' : newBack); else if (!menuMode) showMenu('pause'); return; }
      if (menuMode) return;
      keys[k] = true; if (e.shiftKey) keys.shift = true;
      if (!G) return;
      if (toolKeys[k] && (inBuild() || k === '0' || k === 'c')) { const t = TOOLS.find(x => x.id === toolKeys[k]); if (!(t.hidden && t.hidden())) G.tool = t.id; }
      else if (k === 'b') toggleBuild();
      else if (k === 'q' && !inBuild() && !AI.on) Combat.swap();
      else if (k === 'u') upgradeCore();
      else if (k === 'x') { Units.standDownSelected(); lastPeople = ''; }
      else if (k === 'k') toggleWork();
      else if (k === 'y') toggleSecure();
      else if (k === 'i') togglePack();
      else if (k === 'j') toggleJobs();
      else if (k === 'r') { if (G.tool === 'combat' && !AI.on) Combat.reload(); else toggleResearch(); }
      else if (k === 'g') toggleMemorial();
      else if (k === 'p') toggleRules();
      else if (k === 'tab') { toggleMap(); e.preventDefault(); }
      else if (k === 'm') toast(Snd.toggleMute() ? 'Sound off' : 'Sound on');
      else if (k === 'f') { if (G.tool === 'combat' && !AI.on) Combat.melee(); else toggleFullscreen(); }
      else if (k === 'h') { G.holdFire = !G.holdFire; toast(G.holdFire ? 'Hold fire: the survivor stabs quietly instead of shooting' : 'Weapons free'); }
      else if (k === ' ') { G.paused = !G.paused; e.preventDefault(); }
      if (k.startsWith('arrow')) e.preventDefault();
    });
    addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; if (!e.shiftKey && !$('btnRun').classList.contains('on')) keys.shift = false; });
    addEventListener('blur', () => { Combat.down = false; Combat.mdown = false; for (const k in keys) keys[k] = false; if (G && !G.over && !menuMode) Save.save(); });
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

  return { init, update, bindInput, showMenu, hideMenu, showEnd, menuOpen, refreshTitle };
})();
