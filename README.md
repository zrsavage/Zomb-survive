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

## Storyteller, rules, skills, noise, radio, relationships
- **Storyteller** (pick at New Game): *Cassandra* (steady, hordes scale with your strength), *Phoebe* (chill, longer lulls, more help), *Randy* (chaos). A tension model decides what happens: when you struggle you get supply drops, traders and strangers; when you are comfortable you get storms, sickness and unannounced straggler groups. After heavy losses it gives you a breather.
- **Camp rules** (`P`): six policies with trade-offs (Rationing, Overtime, Feasts and Music, Open Arms, Martial Law, Conscript Scavengers). One change per 90s.
- **Skills**: shooting, melee, medicine, building and scavenging level up with use (0-5 stars); each class starts trained in its own. Max level earns a title (Marksman, Duelist, Field Surgeon, Master Builder, Pathfinder).
- **Noise**: gunfire, hammering and sprinting carry (expanding rings show how far). Standing still makes you much harder to notice. **Decoys** (`V`) draw idle zombies and part of a horde toward them. *Suppressors* research cuts gunfire range.
- **Radio**: research *Ham Radio* for branching transmissions (convoy, pleas for help, raiders, supply tips, lost survivors, a deserter asking to return, a numbers station). Some chains unlock a second ending: a **convoy** to the safe zone. While the helicopter is coming, the pilot radios too.
- **Relationships**: survivors become friends, lovers or rivals over time. Lovers fight harder side by side and lift morale; rivals bicker; losing a lover hurts badly.

## Resources, the world outside, zombies and base building
- **Resources:** besides materials, food and ammo there are now **fuel** (generators, Molotovs) and **medicine** (treating the sick, medics heal at full speed). Houses, stores and garages give a little; **points of interest** give a lot and are guarded: Pharmacy (medicine), Gas Station (fuel), Police Station (ammo), Junkyard (materials), Farmstead (food). They show on the minimap once scouted, and produce passive income once inside your territory.
- **Nests:** every few minutes the dead start nesting in a building outside your walls. A nest keeps spawning zombies and makes the next horde bigger. Destroy it with a **Molotov** (`T`) or send a crew that includes a fighter. A nest inside your own territory spawns zombies inside the walls.
- **Fire:** Molotovs and fire barrels set zombies alight; burning zombies take damage, panic and spread the fire through a crowd.
- **New zombies:** *spitters* spray acid at wall defenders from range, *riot zombies* shrug off bullets (not blades), *infected dogs* are fast but cannot climb: they only come through gaps, so a fully sealed camp stops them. Later hordes are tougher. Fallen defenders may **turn** and have to be put down.
- **Base facilities** (inside territory): Garden (food), Workshop (materials to ammo), Generator, Floodlight, Clinic (medicine, cures sickness), Depot (+300 storage). The **power grid** burns fuel and generators are loud: they draw the dead. **Electrify** walls to zap climbers (needs power). **Reinforce** walls from Timber to Reinforced to Concrete (research).

## Phone / tablet (desktop is still the primary target)
- Touch controls appear automatically: virtual stick to move, **SCAV** (hold) to scavenge, **RUN** toggle, tap or drag to build, two fingers to pan/zoom. The tools live in a bottom bar; the people/log panel is a drawer (chess-piece button) and the pause menu is the hamburger button.
- Phones default to **Low** quality (cheaper lighting, no ground fog, fewer particles, smaller zombie cap). Change it any time in the menu.
- Landscape is recommended. Serve over https to install it as a fullscreen app (manifest + service worker included, works offline).

Survivors are named people with a class (Fighter, Sniper, Medic, Builder, Scavenger), a backstory and one or two RimWorld-style traits (Brave, Coward, Sharpshooter, Trigger-happy, Tough, Frail, Lucky, Unlucky, Glutton, Frugal, Cheerful, Gloomy, Bloodthirsty, Pacifist, Quick, Handy) that change how they fight, eat, scavenge and affect the camp. Friends arrive together and grieve when one dies. Camp **morale** (0-100) drops when people die and rises with victories; high morale speeds up fire, low morale slows it, stops refugees and eventually makes people desert. Everyone lost is recorded in the **Memorial** (G) and gets a cross at the camp. Hover a posted survivor to see their name and class. They can be lost, but only the camp falling ends the run.

Your own survivor is expendable: dying costs 10% of supplies and an 8 second respawn. Only the camp falling ends the run.

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
