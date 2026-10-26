'use strict';
/* hints.js - the game explains itself one thing at a time, the first time each system matters.
   One short card at a time, never during the intro, never twice. Settings can switch them off. */
const Hints = (() => {
  const H = {};
  const KEY = 'gravel-hints-seen';
  let seen = {}; try { seen = JSON.parse(store.get(KEY) || '{}') || {}; } catch (e) { seen = {}; }
  const on = () => store.get('gravel-hints') !== 'off';
  const sick = () => G.idle.some(s => s.sick > 0) || defenders.some(d => d.s.sick > 0);
  const near = (r, f) => { for (const b of buildings) if (f(b) && Math.hypot(b.x + b.w / 2 - P.px, b.y + b.h / 2 - P.py) < r) return true; return false; };
  const LIST = [
    { id: 'noise', title: 'Noise draws them', text: 'Every shot is heard. Generators, floodlights, workshops and hammering fill the <b>noise</b> meter on the right. Filled, it brings a horde. Choose what you run, and when.', when: () => G.heat >= 12 },
    { id: 'people', title: 'Someone joined you', text: 'Survivors walk the camp on their own. <b>Select</b> them (C), then right-click: a wall to man it, a building to scavenge. <b>K</b> sets what each one does when left alone.', when: () => G.elapsed > 240 && G.idle.length + defenders.length >= 1 },
    { id: 'climb', title: 'They climb, they don\'t break', text: 'Walls are never smashed: the dead <b>pile up and climb</b>. Kill them as they climb, put towers where they gather, and keep people on the wall. A gap lets them walk straight in.', when: () => zombies.some(z => z.mode === 2 && z.st === 2) },
    { id: 'horde', title: 'A horde is coming', text: 'A real horde is on its way. Get everyone to the walls, check your ammo, and hold the core. The camp is what matters: people can be replaced.', when: () => hordes.some(h => !h.minor) },
    { id: 'lookout', title: 'You are flying blind', text: 'Build a <b>lookout</b> (build menu, B) so the fog lifts and you hear about hordes early. One on each side of camp is enough.', when: () => G.elapsed > 300 && !wall.some(k => k === K.LOOKOUT) },
    { id: 'ammo', title: 'Running low on ammo', text: 'Rounds are the clock. Search buildings, send crews, and build a <b>workshop</b> to turn materials into ammo. Walls and towers help you spend less of it.', when: () => G.ammo < 20 && G.elapsed > 200 },
    { id: 'food', title: 'Food is running out', text: 'People eat constantly and starving ones stop fighting. Build <b>gardens</b>, scavenge farms and stores, and watch the net rate beside the food count.', when: () => G.food < 25 && G.elapsed > 200 },
    { id: 'water', title: 'Water matters', text: 'Everyone drinks. <b>Wells</b> and rain collectors make more. A <b>latrine</b> keeps hygiene up so people stay well.', when: () => G.water < 35 },
    { id: 'power', title: 'Power costs noise', text: 'Generators burn <b>fuel</b> and are loud. Solar is quiet but slow. Powered things (workshop, floodlights, electric walls) stop when the power does.', when: () => facilities.some(f => f.type === 'generator' || f.type === 'floodlight') },
    { id: 'workshop', title: 'The workshop', text: 'It turns materials into ammo and gear, but only while powered, and it is noisy. Pick what it makes in the panel on the right.', when: () => facilities.some(f => f.type === 'workshop') },
    { id: 'research', title: 'Research', text: 'Press <b>R</b>. Better walls, faster reloads, cheaper builds. One project at a time, so choose what hurts most.', when: () => G.level >= 2 || G.elapsed > 1000 },
    { id: 'locked', title: 'A locked building', text: 'Some buildings need a <b>keycard</b>, or fuel to cut through. Cutting is loud. The vault and bunker hold the best loot.', when: () => near(8, b => b.locked && !b.looted) },
    { id: 'trader', title: 'A trader', text: 'A trader has set up near camp for a short while. Open the trade panel on the right to swap supplies before they leave.', when: () => !!G.trader },
    { id: 'sewer', title: 'Sewers', text: 'Zombies can climb out of manholes inside your walls. Use <b>Seal sewer</b> on the access to close it.', when: () => (typeof sewers !== 'undefined') && sewers.some(s => s.found && !s.sealed) },
    { id: 'nest', title: 'A nest', text: 'A nest keeps spawning the dead and thickens every horde. Clearing it needs a <b>Fighter or Sniper</b> in a crew, or a Molotov (T).', when: () => G.nests && G.nests.length > 0 },
    { id: 'sick', title: 'Someone is sick', text: 'Sickness spreads through a dirty camp. A <b>medic</b> treats it with medicine, and a clinic is faster. Keep hygiene up.', when: sick },
    { id: 'morale', title: 'Morale is slipping', text: 'Deaths hurt morale, wins heal it. Low morale slows defenders and stops new arrivals; far enough down, people desert. Rules (P) like Feasts can lift it.', when: () => G.morale < 40 },
    { id: 'tired', title: 'You are worn out', text: 'Swinging drains stamina. Out of it you hit weak and slow. Back off and let it recover, or shoot from range instead.', when: () => !!P.tired },
    { id: 'down', title: 'You went down', text: 'You come back at camp after a few seconds, a little poorer for it. The camp keeps going without you, so make sure it can.', when: () => P.dead > 0 && G.deaths >= 1 },
    { id: 'weapon', title: 'A new gun', text: 'You have another gun now. Press <b>Q</b> to switch. The military ones (machine pistol, assault rifle, marksman rifle) can only be found; what you build at camp is cruder. Each gun keeps its own clip.', when: () => Combat.unlocked().length > 1 },
    { id: 'refugees', title: 'More people', text: 'Your camp is sealed, so <b>refugees</b> will start arriving, as long as there is food, spirits are up and there is room. You also find survivors hiding in buildings you search, and strangers sometimes wander in. The "New arrivals" line on the right tells you what is holding them back.', when: () => G.sealed && G.elapsed > 120 },
    { id: 'walledin', title: 'Wall in more ground', text: 'Your camp is sealed. Walls can close off far more than the camp: whole blocks, a district, the town. Everything inside a closed loop is yours. Add a second and third layer where they press hardest, and remember every wall you hold needs people and towers behind it.', when: () => G.sealed && G.elapsed > 400 },
    { id: 'train', title: 'Training', text: 'People who are not on guard can <b>train</b>. Open <b>K</b> and set Melee or Shoot, or select people (C) and use the buttons. Melee practice is free. Shooting practice burns ammo and the noise draws the dead. Past level 3 needs a <b>training yard</b>. Better weapons need a trained arm.', when: () => G.idle.length >= 2 },
    { id: 'weaponsmith', title: 'Make better weapons', text: 'A powered <b>workshop</b> can make melee weapons as well as ammo: spiked clubs, machetes, spears, and with Smithing, fire axes and war blades. Each person is handed the best one their skill allows. Heavier weapons hit harder but tire an untrained arm.', when: () => facilities.some(f => f.type === 'workshop') },
    { id: 'demolish', title: 'Clear the ground', text: 'Need room for fields or beds? <b>Demolish</b> (in the build menu, Land) pulls a building down: it takes time, leaves salvage, and the ground is free. Gardens, bunkhouses and wells go on free ground inside your walls.', when: () => G.sealed && G.elapsed > 500 },
    { id: 'levelup', title: 'Camp level up', text: 'A higher level grows your territory, your storage and the number of people you can hold. <b>U</b> upgrades the core when you have the materials.', when: () => G.level >= 2 },
    { id: 'radio', title: 'The radio tower', text: 'Build it inside your territory and it calls in a <b>supply drop</b>. It is loud, so be ready before you press it. Grab the crate before the dead do.', when: () => G.level >= RADIO_LEVEL },
    { id: 'secure', title: 'Making a town secure', text: 'A town is <b>secured</b> when it can look after itself: walls sealed and manned, food and water growing, ammo being made. Press <b>Y</b> to see what is missing. Secure it, then move on to the next.', when: () => G.level >= 3 && G.sealed },
    { id: 'pile', title: 'Something was dropped', text: 'The dead sometimes carry something. Walk up and press <b>E</b>: a window shows what it is. Take it, stash it at camp, or leave it.', when: () => crates.some(c => c.type === 'pile' && Math.hypot(c.x - P.px, c.y - P.py) < 7) },
  ];
  let cur = null, since = -40, tick = 0, el = null, shown = 0;
  const save = () => { store.set(KEY, JSON.stringify(seen)); };
  function show(h) {
    cur = h; seen[h.id] = 1; save(); shown = 0;
    el = el || document.getElementById('hint');
    el.innerHTML = '<div class="hh"><span>TIP</span><a href="#" id="hintX">got it</a></div><b>' + h.title + '</b><div class="ht">' + h.text + '</div>';
    el.classList.add('show');
    document.getElementById('hintX').onclick = e => { e.preventDefault(); hide(); };
    Snd.click && Snd.click();
  }
  function hide() { if (el) el.classList.remove('show'); cur = null; since = 0; }
  H.reset = () => { if (el) el.classList.remove('show'); cur = null; since = -40; };
  H.setOn = v => { store.set('gravel-hints', v ? 'on' : 'off'); if (!v) hide(); };
  H.on = on;
  H.update = function (dt) {
    if (!G || AI.on) return;
    since += dt;
    if (cur) { shown += dt; if (shown > 16) hide(); return; }
    if (!on() || G.intro || G.paused || since < 22) return;
    if (hordes.some(h => !h.minor) || Loot.isOpen()) return;
    { let hunters = 0; for (const z of zombies) if (z.mode !== 0 && z.mode !== 3 && (z.x - P.px) ** 2 + (z.y - P.py) ** 2 < 144 && ++hunters >= 3) return; }
    tick -= dt; if (tick > 0) return; tick = 1;
    for (const h of LIST) {
      if (seen[h.id]) continue;
      let ok = false; try { ok = h.when(); } catch (e) { ok = false; }
      if (ok) { show(h); return; }
    }
  };
  return H;
})();
