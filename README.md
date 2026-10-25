# Zomb Survive

A top-down pixel-art survival / base-defence game that runs in the browser. Open `index.html` (no build step, no dependencies, all audio is synthesised).

You are the last survivor at a ruined camp. There is no day/night cycle: hordes arrive on their own schedule and you only get warning if you build lookouts. Scavenge, scout, fortify, recruit and call for rescue.

## Game loop
- **Scavenge** (hold `E` beside a building) or **send crews** (risky, pays more) for materials, food and ammo. Some buildings hide survivors.
- **Scout** the fog of war. Gunfire is noisy and draws idle zombies in.
- **Fortify** with free-form walls, towers, gates, spike traps and fire barrels. Zombies never break walls: they pile up and climb over the heap, so defenders stab them as they climb.
- **Detect hordes** with lookouts (also reveal the map). Without one you only get a faint rumble as a horde nears.
- **Recruit** survivors with roles - fighter, sniper, medic, builder, scavenger. A sealed, fed camp draws refugees. Post them on walls to shoot (ammo) then stab (free).
- **Grow** the camp: sealed territory (up to a level limit) holds buildings that produce supplies. **Research** upgrades, **trade** with visiting traders, and survive events (supply drops, sickness, storms).
- **Win**: at camp level 4 build the **radio tower** and hold out until the helicopter arrives. Hordes get far more frequent while you wait.

Zombie types: walker, runner, brute, screamer (wakes the dead and enrages the horde), leaper (vaults walls), bloater (explodes). Hordes grow 1.4x each time and reach the thousands.

## Controls
WASD move (Shift sprint) - hold E scavenge - click/drag build (within range of you) - 1-9, B tools - U upgrade camp - R research - wheel zoom - right-drag look around - M mute - Space pause - Esc menu. The game autosaves; use Continue on the title screen.

## Code layout (`js/`, plain scripts sharing globals, load order in `index.html`)
| file | what it owns |
| --- | --- |
| `config.js` | every tunable number and data table (zombies, roles, research, events, difficulty, costs) |
| `util.js` | helpers, seeded RNG |
| `world.js` | map arrays, town generation, flow fields, territory, fog of war |
| `art.js` | animated sprite atlas (parametric bodies + outline), terrain/buildings, walls, camp. A hand-drawn atlas can replace `Art.sprites[name]` |
| `audio.js` | WebAudio synth: positional SFX, ambience, horde rumble, tension drone |
| `sim.js` | simulation: zombies, fighting, survivors/crews, traps, hordes, events, research, economy, building |
| `render.js` | frame drawing, dynamic lighting, fog drift, rain, vignette, minimap |
| `ui.js` | HUD, panels, menus, input |
| `save.js` | localStorage save/load (town is regenerated from the seed) |
| `main.js` | boot and frame loop |

`window.__game` exposes state and helpers for debugging.
