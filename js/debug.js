'use strict';
/* debug.js - a hidden panel for testing. Open with the ` (backtick) key, or load the page with ?debug.
   Everything here only calls normal game functions; it exists so every system can be reached in seconds. */
const Debug = (() => {
  const ACTIONS = [
    ['Resources', [
      ['+500 of everything', () => { G.mat += 500; G.food += 300; G.ammo += 500; G.fuel += 100; G.med += 40; G.water += 200; }],
      ['+6 survivors (all roles)', () => { for (const r of ['fighter', 'sniper', 'medic', 'builder', 'scavenger', 'fighter']) if (roomForPerson()) G.idle.push(newSurvivor(r)); }],
      ['Camp level +1', () => { if (G.level < LEVELS.length) { G.level++; G.coreHp = LEVELS[G.level - 1].coreHp; G.fieldDirty = true; } }],
      ['Toggle autopilot (AI plays)', () => AI.toggle()],
      ['Reveal whole map', () => { explored.fill(1); G.visT = 0; }],
      ['Drain town to 10%', () => { for (const b of buildings) for (const k in b.stock) b.stock[k] = Math.floor(b.stock[k] * 0.1); G.incT = 0; }],
    ]],
    ['Threats', [
      ['Horde now', () => startHorde()],
      ['Boss horde (Tyrant)', () => { G.hordeN = Math.max(G.hordeN, 4); startHorde(); const h = hordes[hordes.length - 1]; h.boss = 1; }],
      ['Small horde (stragglers)', () => startHorde({ minor: true, mult: 0.5 })],
      ['Roaming herd', () => Outside.spawnHerd()],
      ['Nest', () => Outside.spawnNest()],
      ['Storm', () => { G.storm = EVENTS.storm; G.thunderT = 3; }],
      ['Fog', () => { G.fog = FOG.time; }],
      ['Next season', () => { G.elapsed = (Math.floor(G.elapsed / SEASON_LEN) + 1) * SEASON_LEN + 1; }],
      ['Sick survivor / supply drop / trader', () => { fireEvent(); fireEvent(); fireEvent(); }],
      ['Hurt the camp (-50%)', () => { G.coreHp = LEVELS[G.level - 1].coreHp * 0.5; }],
    ]],
    ['Story', [
      ['Research everything', () => { for (const r of RESEARCH) G.res.done[r.id] = true; G.res.active = null; }],
      ['Radio message now', () => { G.res.done.comms = true; G.radioT = 0; Radio.update(0.1); }],
      ['Truck + Expedition (ready to found)', () => { Campaign.truck = { built: true }; G.res.done.expedition = true; G.mat += 300; G.food += 200; G.ammo += 100; G.fuel += 60; G.water += 60; for (let i = 0; i < 4; i++) if (roomForPerson()) G.idle.push(newSurvivor()); }],
      ['Found a town (free)', () => { Campaign.truck = Campaign.truck || { built: true }; G.res.done.expedition = true; G.mat += 300; G.food += 200; G.ammo += 100; G.fuel += 60; G.water += 60; for (let i = 0; i < 4; i++) G.idle.push(newSurvivor()); G.sel = []; Campaign.found(); }],
      ['Radio: supply drop now', () => airdrop(1)],
      ['Secure this town now', () => { G.secured = true; Campaign.checkWin(); }],
      ['Fast-forward 60s', () => { for (let i = 0; i < 60 * 30; i++) { simulate(1 / 30); if (G.over) break; } }],
      ['Kill the camp (test falling)', () => { G.coreHp = -1; Campaign.campFell(); }],
    ]],
  ];
  function build() {
    const el = document.createElement('div');
    el.id = 'debug'; el.className = 'panel';
    el.style.cssText = 'left:226px;bottom:8px;max-width:min(760px,60vw);max-height:60vh;overflow:auto;display:none;z-index:5;font-size:11px';
    el.innerHTML = '<div class="row"><b>Debug / testing</b><span style="color:var(--dim)">` to hide</span></div>';
    for (const [title, list] of ACTIONS) {
      const h = document.createElement('h4'); h.textContent = title; el.appendChild(h);
      const row = document.createElement('div'); row.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:3px';
      for (const [label, fn] of list) {
        const b = document.createElement('button'); b.textContent = label; b.style.cssText = 'padding:2px 7px;font-size:11px';
        b.addEventListener('click', () => { try { fn(); toast(label); } catch (e) { toast('Debug action failed: ' + e.message); console.error(e); } });
        row.appendChild(b);
      }
      el.appendChild(row);
    }
    document.body.appendChild(el);
    return el;
  }
  let el = null;
  function toggle() { if (!el) el = build(); el.style.display = el.style.display === 'none' ? 'block' : 'none'; }
  addEventListener('keydown', e => { if (e.key === '`' && G) { toggle(); e.preventDefault(); } });
  if (/[?&]debug\b/.test(location.search)) addEventListener('load', () => { if (!el) { el = build(); el.style.display = 'block'; } });
  return { toggle };
})();
