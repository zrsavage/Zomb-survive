# Zomb Survive

Browser base-builder / wall-defense game. Open `index.html` in a browser (no build step).

You start as a lone survivor at a camp in an overrun town. There is no day/night cycle: hordes arrive on their own schedule, and you only get warning if you have built **lookouts**.

- **Scavenge** buildings (hold E beside one) for materials, food and ammo. Some hide survivors.
- **Scout** the fog of war. You only see near yourself, your posted survivors and lookouts. Gunfire makes noise and draws idle zombies in.
- **Fortify** with free-form walls and towers. Zombies never break walls: they pile up and climb over the heap, so defenders stab them as they climb.
- **Detect hordes** with lookouts (placeable anywhere, they also reveal the map). Without one you hear nothing until the horde is at your walls.
- **Recruit**: a sealed, fed camp attracts refugees. Post them on walls/towers to shoot (ammo) then stab (free).
- **Grow**: everything sealed in with the camp (up to a level limit) is your territory, and the buildings in it produce supplies. Upgrade the camp to hold more.

Hordes grow 1.4x each time and reach the thousands.

Controls: WASD move (Shift sprint), hold E scavenge, left-click/drag build (within range of you), 1-5 tools, U upgrade camp, wheel zoom, right-drag look around, Space pause.

Tuning constants are at the top of `game.js`.
