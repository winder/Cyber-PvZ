# Cyber Plants vs Zombies — Product Requirements

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
- High ground that changes gameplay, random maps, extra factions, tech tree.

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

## Levels

Pick a level on the title screen (or add `?level=2` / `?level=rust` to the
address). Each level has its own map, color theme, and waves.

1. **Neon Grid**: open hills at night, bases spread out (the map below).
2. **Rust Corridor**: a bright, dusty, dystopian canyon in ochre and rust under
   an orange haze. A long corridor with the Spaceship, Power Plant and
   Greenhouse in a row down the middle, so zombies hit them in order. Long
   ravines wall off both sides; zombies from the sides can only get in
   through a gap (north: just east of the Spaceship; south: between the
   Spaceship and the Power Plant) or round the far east ends.

## Map (Neon Grid)

- A hand-made map, roughly 3–4 screens wide, on 3D rolling hills (the
  hills are looks only; the rules are the same as flat ground). Bases sit on
  level pads.
- Rocks and ravines (sheer trenches cut straight down into the ground) block
  building and movement.
- Zombies enter from 2–3 map edges.
- **Free placement**: plants can go anywhere that is on the map, not on an
  obstacle, not on a structure, and not overlapping another plant.

## Plants

| Plant | Role | Notes |
|---|---|---|
| Solar Flower | Economy | Makes sun during battle |
| Laser Peashooter | Damage | Hits ground **and** air |
| Force-Field Nut | Wall | A long wall (3.2 × 0.9) with lots of health. Turn it in 45° steps to steer zombies |
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
- Walls turn 45° at a time with the **↻ Turn** button (or **R**). While
  placing walls, it turns the next wall and the one just placed (handy on a
  tablet: tap to place, then turn it). With a placed wall selected, it turns
  that wall. Use walls to build funnels and mazes that route zombies past
  your lasers.
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

## Final boss: ZomWes 8000

- Appears in the final wave, announced with a roar and a boss health bar.
- Rides in a **Westbot** (from Wesley's drawing): a hulking robot about 16
  units tall (too big to see whole when zoomed in) with a red visor, a fanged
  mouth glowing blue, red drips, a blue core, one arm raised, and huge
  bell-bottom legs with torn green hems.
- A little robot driver sits on its head, pulling two control levers.
- A small nest of glossy, smooth 3D curls rings the driver, deliberately unlike
  the blocky style of everything else.
- Arrives with **3 Guardians** (from Wesley's drawing): double-size zombies
  with a blue Y on the face and glowing blue scythes. They march in formation
  beside and behind him, slash every plant in reach, and attack bases they
  reach. If he falls, they carry on alone toward the nearest base.
- Walks in a straight line over rocks and ravines. Stomps every plant near him
  when one is in his way.
- Wanders: each time the base he's attacking loses another 25% of its health,
  he heads for a different base (the one he visited longest ago). Config can
  switch this to trigger on his own health instead.
- Tuned so ~20 laser peashooters spread across the bases beat him comfortably,
  ~14 barely, and 8 lose (checked by tests).

## Character editor

A second page at `/editor/` for painting character skins.

- Characters are blocky box models (head, body, arms, legs, plus extras like a
  jetpack) with Minecraft-layout skins at 128×128. Minecraft skins import.
- Cyborg Zombie and Jetpack Zombie start from skins based on Wesley's drawings.
- Paint on the 3D model or the unfolded skin: pencil, eraser (makes holes),
  fill (one face at a time), color picker, three brush sizes, mirror
  left↔right, undo/redo, walk-animation preview.
- **Save to game** stores the skin in the browser; the game uses it instead of
  the default. **⬇ PNG** exports it to commit as the new default.

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
