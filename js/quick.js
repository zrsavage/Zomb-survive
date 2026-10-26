// Quick play: skip the ruined-camp opening and start inside a walled base with a crew, ready for the first horde.
const Quick = (() => {
  const R = 10, ROLES_Q = ['fighter', 'fighter', 'fighter', 'sniper', 'sniper', 'medic', 'builder', 'builder', 'fighter', 'sniper', 'scavenger', 'builder'];
  const free = (x, y) => inb(x, y) && bld[y * W + x] < 0 && !wall[y * W + x] && !isCoreTile(x, y) && !facAt[y * W + x] && !trapAt[y * W + x];
  function setup() {
    G.level = 3; G.coreHp = LEVELS[2].coreHp;
    G.ammo = 300; G.mat = 200; G.food = 100; G.water = 70; G.med = 8; G.fuel = 8; G.morale = G.moraleTarget = 70;
    for (const r of ['walls', 'spears']) if (RESEARCH.some(x => x.id === r)) G.res.done[r] = true;
    P.mag = 12; P.inv = P.inv || [];
    const cx = CORE.x, cy = CORE.y;
    // the wall: one ring with two gates, towers at the corners and flanking each gate
    const towers = new Set(), gates = new Set();
    const key = (x, y) => y * W + x;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) towers.add(key(cx + sx * R, cy + sy * R));
    towers.add(key(cx - R, cy)); towers.add(key(cx + R, cy));
    for (const sy of [-1, 1]) { gates.add(key(cx, cy + sy * R)); towers.add(key(cx - 3, cy + sy * R)); towers.add(key(cx + 3, cy + sy * R)); }
    for (let d = -R; d <= R; d++) for (const [x, y] of [[cx + d, cy - R], [cx + d, cy + R], [cx - R, cy + d], [cx + R, cy + d]]) {
      if (!inb(x, y) || bld[key(x, y)] >= 0) continue;
      const i = key(x, y); wall[i] = gates.has(i) ? K.GATE : towers.has(i) ? K.TOWER : K.WALL; wallTier[i] = 1;
    }
    for (let i = 0; i < W * H; i++) if (wall[i]) wallHp[i] = maxHp(wall[i], i);
    // a working camp inside
    const want = ['garden', 'garden', 'garden', 'well', 'rain', 'latrine', 'clinic', 'yard', 'solar', 'solar', 'solar', 'workshop', 'workshop', 'mine', 'mine', 'floodlight'], spots = [];
    for (let y = cy - R + 2; y <= cy + R - 2; y++) for (let x = cx - R + 2; x <= cx + R - 2; x++) { const d = Math.hypot(x - cx, y - cy); if (d >= 3 && d <= 7.5 && free(x, y)) spots.push([x, y, d]); }
    for (const t of want) { if (!spots.length) break; const k = (rng() * spots.length) | 0, [x, y] = spots.splice(k, 1)[0]; const f = { type: t, x, y, t: 0, on: false }; facilities.push(f); facAt[key(x, y)] = f; for (let j = spots.length - 1; j >= 0; j--) if (Math.abs(spots[j][0] - x) < 2 && Math.abs(spots[j][1] - y) < 2) spots.splice(j, 1); }
    // people
    const crew = ROLES_Q.map(r => newSurvivor(r)), posts = [...towers].filter(i => wall[i] === K.TOWER);
    for (const s of crew) { const p = posts.shift(); if (p !== undefined && addDefender(p % W, (p / W) | 0, s)) continue; G.idle.push(s); }
    for (let y = cy - 22; y <= cy + 22; y++) for (let x = cx - 28; x <= cx + 28; x++) if (inb(x, y)) explored[key(x, y)] = 1;
    // the neighbourhood has been thinned out: nothing within a couple of screens, and a lighter crowd beyond
    zombies = zombies.filter(z => Math.hypot(z.x - cx, z.y - cy) > 26 && rng() < 0.6);
    G.rush = true; G.nextHorde = 150; G.eventT = 600; G.refugeeT = 240;
    G.fieldDirty = true; G.visT = 0;
    Art.rebakeTerrain(); computeBaseField(); computePlayerField(); computeTerritory(); Survival.refreshIncome(); updateVision();
    log('Quick play: the walls are up and the crew is posted. The dead will not stop coming: a new horde roughly every minute.');
  }
  return { setup };
})();
