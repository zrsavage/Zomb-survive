# Testing guide

Open `index.html` (or serve the folder over http). Press **`** (backtick) in game, or load `index.html?debug`, to open the **debug panel**: it gives resources, survivors, camp levels, every threat (hordes, bosses, herds, nests, storms, fog, seasons), research, radio messages, a free second town, and a 60-second fast-forward. Use the 4x speed button for longer waits. Progress autosaves every 30 seconds (Esc > Save game also works).

## The ten suggestions

| # | Feature | How to see it quickly |
|---|---------|----------------------|
| 1 | **Outposts** | Build a wall with *Outpost* (Defense list) within 7 tiles of a building outside your territory. *Post survivor* on it. Watch that building's stock drain into your supplies (side panel: Town supplies). It also works as a lookout. |
| 2 | **Tyrant boss** | Debug > *Boss horde (Tyrant)*. A giant walks in with the horde halfway through; killing it drops a golden crate (walk onto it): big loot, a keycard and a free research. |
| 3 | **Crafting + special ammo** | Build Generator + Workshop (camp level 2), give it fuel, then pick Ammo / AP / Incendiary / Blade in the side panel ("Workshop makes"). AP bullets are used on armoured zombies, incendiary into crowds; blades auto-equip on defenders. |
| 4 | **Water + hygiene** | Build Well / Rain collector / Latrine (camp level 1). Let water reach 0 to see thirst sickness and morale loss; let Hygiene drop under 30 for the sickness and morale penalties. |
| 5 | **Truck** | Build a Garage bay (camp level 3), then press *Build truck* in the side panel (150 materials, 20 fuel, 60s). Crews get faster and richer; the truck is needed to travel. |
| 6 | **Sewers** | Walk near a manhole (red outline once found) or let a horde (wave 4+) spawn: zombies come up through unsealed manholes. Use *Seal sewer* on a found one. |
| 7 | **Roaming herds** | Debug > *Roaming herd*. Build a lookout, and the minimap shows an orange box. Herds that reach the camp attack like a small horde. |
| 8 | **Turrets + batteries** | Camp level 3: Generator + Turret + Battery. Turrets fire by themselves when powered; the battery bar fills and covers brownouts. |
| 9 | **Keys + locked buildings** | Police Station and Bunker (padlock icon on the map). Hold E next to one: it uses a keycard, or 2 fuel and 9 seconds. |
| 10 | **Seasons + fog** | Debug > *Next season* (winter: snow, gardens stop, more food/fuel use) and *Fog* (short vision, harder to be noticed). |

## The bigger systems

- **Finite town / second town:** Debug > *Drain town to 10%* triggers the "picked clean" warnings. Debug > *Truck + Expedition*, then **Tab** (world map) > *Found a town*. Switch back with *Travel there* (needs the truck and 8 fuel). Debug > *Horde now* before you travel to see the background simulation and the "horde incoming" alert on the map.
- **Omen / rules / skills / noise / radio / relationships / morale / memorial:** pick the omen at New Game; `P` camp rules; `G` memorial; `V` decoy; hold a survivor tooltip to see skills and relationships; Debug > *Radio message now*.
- **Phone:** open in a phone (or Chrome device mode). Touch stick, SCAV button, RUN, bottom tool bar, drawer for people, world map via the camp button.

## Known rough edges to look for

- Balance numbers (stock sizes, horde sizes in background towns, season strength, convoy risk) are first guesses.
- A newly founded town has no defences: fortify it immediately.
- Background hordes are resolved by an abstract formula, not a live fight; travel there in time to fight them for real.

## Autopilot and bot playthroughs
`js/ai.js` is the Governor: it plays a camp by itself (survivor movement, walls, defenders, research, crews, trader, radio) through the same inputs a person uses.
Toggle it from the debug panel ("Toggle autopilot"). Headless runs (needs Playwright):

    node tools/playtest.js '[{"name":"a","diff":"normal","story":"cassandra","seed":101,"maxTime":1500}]' out.json 4
    node tools/summ.js ./out.json

`cheat: {ammo: 400}` or `{mat: 400}` in a config keeps a resource topped up, to see which resource limits survival.
