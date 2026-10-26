# Gravel & Ash

A top-down pixel-art survival / base-defence game that runs in the browser. Open `index.html` (no build step, no dependencies, all audio is synthesised).

You are the last survivor at a ruined camp. There is no day/night cycle. A constant trickle of the dead walks toward your camp and slowly thickens over the hours; real hordes are rare and only come when you draw them. Scavenge, scout, fortify, recruit and call for rescue.

## Game loop
- **Scavenge** (hold `E` beside a building) or **send crews** (risky, pays more) for materials, food and ammo. Some buildings hide survivors.
- **Scout** the fog of war. Gunfire is noisy and draws idle zombies in.
- **Fortify** with free-form walls, towers, gates, spike traps and fire barrels. Zombies never break walls: they pile up and climb over the heap, so defenders stab them as they climb.
- **Detect hordes** with lookouts (also reveal the map). Without one you only get a faint rumble as a horde nears.
- **Recruit** survivors with roles - fighter, sniper, medic, builder, scavenger. A sealed, fed camp draws refugees. Post them on walls to shoot (ammo) then stab (free).
- **Grow** the camp: sealed territory (up to a level limit) holds buildings that produce supplies. **Research** upgrades, **trade** with visiting traders, and survive events (supply drops, sickness, storms).
- **The siege:** zombies drift toward the camp all game (the side panel shows the rate per minute). It starts as a few a minute and ramps with time and camp level, with new zombie types appearing as the hours pass. A **noise meter** fills while you run loud things (generators, floodlights, workshops, breaching locked buildings, decoys, a lot of gunfire); when it is full a real horde comes. You can also **sound the siren** on purpose. Hordes are big, bring a Tyrant every third time, and are the only thing that scales with the minutes.
- **Success is sustainability.** A town is *secured* when, for 6 minutes straight, it grows enough food and water, mines raw materials (**Mine**), makes its own ammunition on clean power (**Solar array** + **Workshop**), keeps its walls whole and its garrison full, and has been left alone. The Sustainability panel (`Y`) shows each line. Then move on: found the next town (a secured home is required) and secure that too. **Secure 3 towns at once to win.**
- **The radio** is a call for support, not a way out: build the radio tower (camp level 3) and pallets of food and supplies drop into the camp for 8 minutes, but the broadcast is loud and draws the dead. Click the tower again to call again once it has cooled.

Zombie types: walker, runner, brute, screamer (wakes the dead and enrages the horde), leaper (vaults walls), bloater (explodes). Hordes are rare, grow with the clock, and reach the hundreds.

## Omens, rules, skills, noise, radio, relationships
- **Omen** (pick at New Game): *The Tide* (steady pressure that scales with your strength), *The Lull* (chill, longer lulls, more help), *Wildfire* (chaos). A tension model decides what happens: when you struggle you get supply drops, traders and strangers; when you are comfortable you get storms, sickness and unannounced straggler groups. After heavy losses it gives you a breather.
- **Camp rules** (`P`): six policies with trade-offs (Rationing, Overtime, Feasts and Music, Open Arms, Martial Law, Conscript Scavengers). One change per 90s.
- **Skills**: shooting, melee, medicine, building and scavenging level up with use (0-5 stars); each class starts trained in its own. Max level earns a title (Marksman, Duelist, Field Surgeon, Master Builder, Pathfinder).
- **Noise**: gunfire, hammering and sprinting carry (expanding rings show how far). Standing still makes you much harder to notice. **Decoys** (`V`) draw idle zombies and part of a horde toward them. *Suppressors* research cuts gunfire range.
- **Radio**: research *Ham Radio* for branching transmissions (convoy, pleas for help, raiders, supply tips, lost survivors, a deserter asking to return, a numbers station). Some chains unlock a second ending: a **convoy** to the safe zone. While the helicopter is coming, the pilot radios too.
- **Relationships**: survivors become friends, lovers or rivals over time. Lovers fight harder side by side and lift morale; rivals bicker; losing a lover hurts badly.

## Resources, the world outside, zombies and base building
- **Resources:** besides materials, food and ammo there are now **fuel** (generators, Molotovs) and **medicine** (treating the sick, medics heal at full speed). Houses, stores and garages give a little; **points of interest** give a lot and are guarded: Pharmacy (medicine), Gas Station (fuel), Police Station (ammo), Junkyard (materials), Farmstead (food). They show on the minimap once scouted, and produce passive income once inside your territory.
- **Nests:** every few minutes the dead start nesting in a building outside your walls. A nest keeps spawning zombies and makes the next horde bigger. Destroy it with a **Molotov** (`T`) or send a crew that includes a fighter. A nest inside your own territory spawns zombies inside the walls.
- **Fire:** Molotovs and fire barrels set zombies alight; burning zombies take damage, panic and spread the fire through a crowd.
- **New zombies:** *spitters* spray acid at wall defenders from range, *riot zombies* shrug off bullets (not blades), Later hordes are tougher. Zombies are slow but tireless: they follow your scent for a long time and never retreat. **Melee** is a real defence: swings cost stamina (skill makes it cheaper and recovers faster), tired defenders swing slowly or switch to the gun, and **spears** (fighters carry one; everyone after the *Pikes & Spears* research) reach through the fence and skewer two at once. Fallen defenders may **turn** and have to be put down.
- **Base facilities** (inside territory): Garden (food), Workshop (materials to ammo), Generator, Floodlight, Clinic (medicine, cures sickness), Depot (+300 storage). The **power grid** burns fuel and generators are loud: they draw the dead. **Electrify** walls to zap climbers (needs power). **Reinforce** walls from Timber to Reinforced to Concrete (research).

## A finite town, and a second one
- **Desktop first:** the game is built for a mouse and keyboard on a desktop browser. The touch controls are a basic fallback only.
- **Commanding survivors (RimWorld-style):** every survivor is a person who walks around camp. In command mode (`C`) click or drag a box to select, then **right-click** to order: ground = move there, a wall/tower = man it (they walk over and take the post), a building = go scavenge it (the party walks out, loots, fights what it meets and walks home). `X` stands selected people down. Anyone you are not ordering decides for themselves from the **Work** toggles (`K`): *Guard* people man the walls when a horde comes and step down afterwards, *Scavenge* people go out for loot on their own. On a phone, tap to select and tap the ground to order. WASD still drives the founder.
- **Big towns:** each town is 88x66 tiles with about 60 buildings: 12 hand-made lot layouts make one district, and the town is four mirrored copies of it (each town mirrors them differently). Old saves from before this cannot be loaded.
- **Finite supplies:** every building holds a limited stock. Scavenging and passive income (buildings in your territory, garrisoned outposts) both draw it down, and the side panel shows how much of the town is left. When it runs dry you have to move on. Gardens, wells and rain collectors are renewable; ammo, materials, fuel and medicine are not.
- **Truck:** build a Garage bay, then a Truck (Tab / side panel). Crews are faster with it, and it is needed to travel between towns.
- **Second town:** research *Expedition Planning*, then found a town from the **World map (Tab)** with a founding party and supplies. It starts as a ruined camp in a richer, more infested town. You can hold up to three.
- **Two towns at once:** you only play (and see) one town at a time; the others keep running in the background. Their economy, morale, nests and hordes are simulated in an abstract way: a horde that reaches a town you are not in is resolved by comparing your defence there (posted survivors, turrets, walls, traps, ammo) with the horde. Lookouts there warn you ("horde in ~40s") so you can travel back and defend it yourself, which brings the horde into the live game. A lost town is gone; the game ends when your last camp falls.
- **Convoys:** send supplies or survivors between towns (50s on the road, with a risk of ambush, lower with a truck).

## More survival systems
- **Water and hygiene** (wells, rain collectors, latrines), **four seasons** (winter stops gardens and raises food and fuel needs; summer is thirstier) and **fog** weather.
- **Tyrant bosses** walk with every third horde and drop loot, a keycard and a free blueprint.
- **Crafting** at the Workshop: ammo, AP rounds (against armour), incendiary rounds (into crowds) and combat blades.
- **Locked buildings** (Police Station, Bunker) need a keycard, or fuel to cut through.
- **Sewers:** unsealed manholes let part of a horde come up near your camp; seal them with a grate.
- **Roaming herds** wander the roads; lookouts show them on the minimap.
- **Outposts**, **turrets** and **batteries** extend your reach and your grid.

## Testing
See `TESTING.md`. Press ` (backtick) in game or add `?debug` to the URL for the debug panel.

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

## Your own guns, and walling in more ground
- You start with a pistol. **B** switches guns in Fight mode; each keeps its own clip.
- Military guns can only be **found**, never built: **Machine pistol** (full auto, ~11 rounds/s), **Assault rifle** (~9/s, 30-round clip, 14 tiles) and **Marksman rifle** (20 tiles, punches through 3, big headshots). They turn up in police stations, bunkers, the Tyrant's cache, supply drops, and very rarely on the dead.
- What you can build (research) is **homemade**: the Homemade Carbine (crude, slow, hits hard) and Homemade Auto (about 6 rounds/s). They shoot, but they are not as good as the real thing.
- Ground you wall in is yours however large: a closed loop of walls (any number of layers) claims everything inside, up to most of the town. If there is a gap, the camp only holds ground near the core (the level's open-ground limit). Big wall plans appear in the build queue (J) as groups.

## Melee weapons, training, and clearing land
- The workshop (powered) makes **melee weapons** as well as ammo: spiked club, spear, machete, and (research *Smithing*) fire axe and war blade. Each person is handed the best one their melee level can handle (auto), or you choose in **K**. Heavier weapons need a trained arm (machete 1, axe 3, war blade 4); under-skilled people hit weaker and tire faster. You carry one too (pack panel, **I**).
- **Training** (K or the command bar): free survivors practise melee on their own, or shoot. Shooting practice burns ammo, makes noise and draws the dead. Without a **Training yard** people stop improving at level 3.
- **Demolish** (N) pulls a building down: it takes time, leaves rubble and a pile of salvage, and clears the ground for gardens, wells, **Bunkhouses** (+5 beds) or **Barracks** (+14).

## Two states: the fight, and the build menu
- Out of build mode the screen is the fight: health, stamina, your gun and clip, and a slim dock at the bottom (Fight, Command, Build, Crew, Pack, Camp, More). **B** opens the **build menu**: a row of picture cards in tabs (Defence, Traps, Facilities, Land & people, Camp). While it is open you are not shooting, and if the dead get close it closes itself and puts you back in the fight. **Q** switches guns.
- **Building takes real effort.** Placing something sets the supplies aside, but they sit in the camp stockpile. Someone has to carry them over (stand by the fire to load up, or free survivors do it), then it is worked. Untrained hands are slow and learn by doing. Demolishing takes a long time too.
- **Buildings have an inside.** Press **E** at a door to go in. Each building has rooms, furniture and containers (fridges, lockers, drawers...) holding its supplies, a few of the dead, and 2 to 4 doors. If the dead crowd one door, leave by another. The street keeps going while you are in there.

- **Fighting by hand:** left-click fires (aim is judged at chest height, so point at the body), **right-click or F swings** the melee weapon (hold it to keep swinging). A short prompt tells you when something is close enough to hit.
