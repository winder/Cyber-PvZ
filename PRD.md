# Laser Plants — Product Requirements

A futuristic **Plants vs. Zombies × StarCraft** mashup for the browser. Futuristic
plants defend a base from futuristic zombies on an open 3D map. The fun is in
**planning the perfect defense**, then watching it hold (or not).

Co-designed by Wesley.

## Goals

- Playable quickly: a one-level prototype that is fun on its own.
- Built to grow: new plants, zombies, maps, abilities, factions and art drop in
  without rewriting the game.
- Runs in a browser on both a computer and a tablet.

## Non-goals (for the prototype)

- Multiple levels, campaign, save/progress.
- Final art or recorded sound.
- Multiplayer.
- High ground / terrain height, random maps, extra factions, tech tree.

## Core loop

1. **Build phase** (no timer). A preview shows which map edges the next wave
   comes from and which zombie types are in it. Place plants anywhere free; sell
   any plant for a full refund. Press **GO**.
2. **Battle phase**. No planting. Sun banks automatically. Use battle
   abilities (they cost sun and have cooldowns). Pause and 2× speed are
   available; abilities can be aimed and fired while paused.
3. **Wave cleared**. Plants heal fully. Structures keep their damage. Bonus sun
   is granted. Back to the build phase.
4. Survive all **5 waves** (the last is a big final wave) to win.

## Win / lose

- Three structures start on the map:
  - **Mega-Brain Greenhouse** — if it is destroyed, you lose.
  - **Power Plant** — extra sun income while standing.
  - **Spaceship** — powers the battle abilities. If destroyed, no abilities.
- Destroyed structures stay destroyed for the rest of the level.
- Win by clearing the final wave with the Greenhouse standing.

## Economy

- One resource: **sun**.
- Sun is banked automatically (no tapping): a base trickle during battle, plus
  Solar Flowers, plus the Power Plant.
- Each cleared wave grants bonus sun.
- Selling a plant refunds its full cost (build phase only).

## Map

- One hand-made map, roughly 3–4 screens wide, flat ground.
- Rocks and cliffs block building and movement.
- Zombies enter from 2–3 map edges.
- **Free placement**: plants can go anywhere that is on the map, not on an
  obstacle, not on a structure, and not overlapping another plant.

## Plants

| Plant | Role | Notes |
|---|---|---|
| Solar Flower | Economy | Makes sun during battle |
| Laser Peashooter | Damage | Hits ground **and** air |
| Force-Field Nut | Wall | Lots of health, blocks zombies |
| Cryo-Pea | Control | Damages and slows; hits ground and air |

Each unit has `canHitGround` / `canHitAir` stats so a dedicated anti-air plant
can be added later.

## Zombies

| Zombie | Role | Notes |
|---|---|---|
| Cyborg Zombie | Basic | Walks |
| Riot Shield Bot | Armored | Takes reduced damage, slower |
| Jetpack Zombie | Flyer | Flies over plants and obstacles |

### Zombie behavior

- Each zombie heads for the **nearest** standing structure.
- Ground zombies find their own path. Plants block them; if walling off is
  cheaper than going around (or there is no way around), they **chew through**
  the plants in the way. Building a maze to steer them past your lasers is a
  core tactic.
- Jetpack Zombies fly straight to the nearest structure.
- On reaching a structure, a zombie attacks it until one of them is gone.

## Battle abilities

Cost sun, have a cooldown, require the Spaceship to be standing.

- **Orbital Laser Strike** — tap a spot; after a short delay it is blasted
  (hits ground and air).
- **Hyper Sun** — global: for a few seconds every plant attacks twice as fast
  and Solar Flowers make sun twice as fast.

## Camera & controls

| Action | Tablet | Computer |
|---|---|---|
| Pan | One-finger drag | Left-drag or WASD |
| Zoom | Pinch | Mouse wheel |
| Rotate (free) | Two-finger twist | Right-drag |
| Rotate (snap 90°) | — | Q / E |
| Face north | Compass button | Compass button |
| Place / select | Tap | Click |

- A short tap/click is an action; moving past a small threshold makes it a drag.
- Tap a plant card, then tap the ground to place. Tap a placed plant (build
  phase) to sell it.
- **Minimap** in the corner shows the map, units and the camera; tap it to jump.
- Landscape layout.

## Look & sound

- **Now**: glowing neon 3D primitive shapes on a dark grid.
- **Later**: Wesley's 2D drawings shown as flat standees in the 3D world
  (Paper Mario style). Setting a unit's `art` image path in the data file swaps
  its placeholder for the drawing.
- **Sound now**: simple synthesized beeps and zaps.
- **Sound later**: recorded effects; setting a file path for a sound name
  replaces the synthesized one.

## Tech

- TypeScript + **Babylon.js** + **Vite**. Vitest for logic tests.
- **Simulation is separate from rendering**: `src/sim` holds all game rules,
  runs on a fixed timestep and emits events; `src/render` draws it; `src/ui`
  is a DOM HUD over the canvas.
- Pathfinding: a hidden fine navigation grid. Obstacles are impassable; plant
  cells cost "time to chew through". A multi-source flow field from all standing
  structures gives every ground zombie its route to the nearest one. Recomputed
  when plants or structures appear or disappear.
- **All tunable numbers** (costs, stats, abilities, economy, waves, map layout)
  live in one file, `src/data/config.ts`, so balance changes are edits to data.

## Hosting

- Development: Vite dev server on the LAN so the tablet can play it over Wi-Fi.
- Release: public GitHub repo, deployed to GitHub Pages by a GitHub Actions
  workflow.

## Future ideas (designed for, not built)

- Dedicated anti-air plant; more plants, zombies, abilities.
- More maps, random maps, high ground.
- Upgrades / tech tree between waves.
- Multiple factions.
- Wesley's art and recorded sounds.
