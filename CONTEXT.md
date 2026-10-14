# Cyber Plants vs Zombies — Domain Language

The words we use for the game, in play and in code. When a term has a
player-facing name and a different code name, both are listed. Decisions
behind these terms are in [docs/adr/](docs/adr/).

## The game

**Level** — One playable stage: a **Map**, a **Theme** and a list of
**Waves**. Picked on the title screen or with `?level=` in the address.
Currently *Neon Grid* (1), *Rust Corridor* (2), *Cyber Cemetery* (3) and
*Crash Jungle* (4).
Code: `LevelDef`.

**Wave** — One round of zombies. A level has 5; the last is the **final
wave**, where the **Boss** appears. Each wave is a list of **Spawn groups**
(zombie type, **Edge** or `'graves'`, count, interval, delay).

**Build phase** / **Battle phase** — The two halves of every wave. In the
build phase the player places, sells and turns **Plants** with no time
limit, then presses **GO**. In the battle phase nothing can be planted; the
player can only use **Abilities**, pause, and change speed. Code: `phase`
is `'build' | 'battle' | 'won' | 'lost'`.

**Sun** — The only currency. Banked automatically during battle (base
income, **Power Plant**, Solar Flowers) plus a bonus for clearing a wave.
*Avoid:* "money", "energy".

**Score** — Points for one game: every zombie beaten (tougher ones are worth
more, the **Boss** most), every wave cleared (later waves more) and, on a
win, the health left on each **Base**. Sun doesn't count. A rule, so it's
kept by the sim. Code: `Game.score`, `SCORE`. *Avoid:* "points" for sun.

**Level record** — What the browser remembers about a level: its **high
score** (best score from a finished game, won or lost) and its **plays**
(games where the first wave was started). Shown on the title screen's level
buttons. Saved on that device only; debug-mode games aren't recorded. Code:
`src/records.ts`.

**Game speed** — How fast the whole game runs. "1×" is `GAME_SPEED` (2× the
original pace); the speed button doubles it. Everything speeds up together.
*Avoid:* "zombie speed" for this (that's a per-zombie stat).

## Things on the map

**Base** — A building the player defends: the **Mega-Brain Greenhouse**
(lose it and you lose), the **Power Plant** (extra sun) and the **Spaceship**
(powers abilities). Code: `Structure` / `StructureId`. *Avoid:* "tower".

**Plant** — Anything the player places: Solar Flower, Laser Peashooter,
Force-Field Nut, Cryo-Pea. Most are round; **Walls** are long.

**Wall** — The Force-Field Nut: a long segment (3.2 × 0.9) that can be
**turned** in 45° steps. Used to **route** zombies (funnels, mazes). Code:
`PlantDef.wall`, `Plant.angle`, `rotatePlant`. *Avoid:* "nut" when you mean
its shape or routing role.

**Footprint** — The area a plant occupies: a circle, or a rotated rectangle
for walls. Used for placement checks and for which **Nav cells** it blocks.
Code: `src/sim/shapes.ts`.

**Rock** — An obstacle zombies and plants can't use. On Rust Corridor rocks
are drawn as **Car wrecks**, on Cyber Cemetery as **Tombstones** (in rows),
on Crash Jungle as crashed spaceships (**Wrecks**); the rules don't change. A rock can carry a `look` to be drawn as a landmark
instead, like the **Gazebo**. Rocks a **Tombstone Zombie** rises out of
leave the map. Code: `Rock`.

**Mound** — One big hill raised out of the ground, flat on top (Cyber
Cemetery's gazebo hill). Looks only: zombies walk over it as if it were flat.
Code: `MapDef.mound`.

**Crater** — A scorched bowl in the ground with a raised rim, where a ship
came down (Crash Jungle; every wreck sits in one). Looks only: zombies walk
through it. Code: `MapDef.craters`.

**Crash furrow** — Crash Jungle's ravines: the trenches crashing ships
ploughed, each with its wreck at the west end. Rules as any ravine.

**Ravine** — A trench carved into the ground that nothing can cross except
flyers and **Giants**. Its visible hole always stays inside its rectangular
blocked area. Replaced the earlier "cliffs". *Avoid:* "cliff".

**Arena** — The Hellfire Arena's floor: a **Fan** (a slice of a circle,
narrow at the stage end in the west, opening out east). Only the fan and its
**Tunnels** can be walked on or planted in; everything else is the
**Stands** (packed with fans, looks only). Code: `MapDef.fan`,
`MapDef.tunnels`, `onFloor` in `src/sim/arena.ts`.

**Tunnel** — An opening through the stands from the floor out to the map's
edge, where an arena's zombies come in (Gates A, B and C). Code:
`MapDef.tunnels`, with the edge's **Alleys** at the tunnel mouths.

**Stage** — The raised floor at the arena's narrow end, where the bases
stand. Looks only: zombies walk up onto it. Code: `MapDef.stage`.

**Seat row** — A row of seats bolted to the arena floor, at an odd angle:
a thick line nothing gets through (except giants and flyers), full of fans
rocking out (looks only). Two run from the **Mosh pit** out to the walls,
so the only way to the stage is across the pit. Code: `MapDef.seats`,
`SEAT_ROW_DEPTH`. *Avoid:* "bleachers" (that's the **Stands**).

**Mosh pit** — A circle of floor in front of the stage. Ground zombies in it
(not bosses or flyers) are **Moshing**: they get a **Rock shield** (blocks
half of all damage) and take turns **rocking out** (barely moving, doing one
of seven moves: horns, windmill, air guitar, drum solo, headbang, pogo,
crowd-surf) and **surging** (super speed). Nothing can be planted in it.
Code: `MapDef.moshPit`, `MOSH`, `Zombie.moshing/rocking/surging`; the moves
are looks only (`src/render/dance.ts`).

**Edge** — A side of the map zombies enter from (north, south, east, west),
with a spawn range along it. **Alleys** narrow an edge to a few spawn points
(Rust Corridor).

## Zombies

**Zombie** — Any enemy. Ground zombies follow the **Flow field**; flyers
(Jetpack Zombie) go straight to the nearest base over everything.

**Chewing** — What a zombie does when a plant blocks its way: it stops and
damages the plant until it's gone. Plants aren't walls to the pathfinder;
they're expensive to cross (**Chew cost**), so zombies go round if that's
cheaper.

**Boss** — The final-wave zombie with a health bar and announcements. Each
game picks one at random (`BOSSES`; `?boss=` in the address to choose):
**ZomWes 8000**, whose body is the **Westbot** model, the **Ship
Captain**, or the **Necro-Gardener**. Code: `Game.boss`. *Avoid:* "Wesbot", "Webot".

**Disco boss** — Every 3rd game played (counting **plays** on all levels,
`DISCO_EVERY`), whichever boss turns up has a mirror ball bouncing around
inside it: a glow that shows through its body, lights up the parts it's
near, and throws turning beams of colored light. `?disco` in the address
forces it. Looks only. Code: `src/render/disco.ts`, `Renderer.discoBoss`.

**Ship Captain** — A medium-sized boss in body armor with a rocket launcher
for a right hand. He **fires rockets** (blast damage to every plant where
one lands) as he walks, and every so often **summons** a few zombies around
himself. His **parrot** rides on his shoulder, takes the odd lap round his
head, and flies off to safety when he's nearly beaten (looks only). He
**goes down with his ship**: a last rocket bursts into fireworks, he salutes
and sinks into the ground. Code: `ZombieDef.rockets`, `ZombieDef.summon`,
`ZombieDef.pet`, `Game.rockets`.

**Necro-Gardener** — A boss in a cracked glass greenhouse helmet, with a
watering can of purple **goo** for a right hand. He **sprays** the nearest
healthy plants as he walks, and they become **zombified plants**. As he
walks in, every plant **wilts** for a moment; he dies **overwatered**: he
empties the can over himself and a giant Solar Flower grows out of him
(both looks only). Code: `ZombieDef.goo`.

**Zombified plant** — A plant with goo on it, working for the zombies: a
shooter fires at the nearest base or healthy plant instead of at zombies, a
Solar Flower makes no sun, and a **Wall** drops its field so zombies walk
through. Zombies leave it alone. It's **cured** when the goo wears off, when
an Orbital Laser Strike lands on it (which doesn't hurt it), when the
Necro-Gardener falls, or when the wave ends. Code: `Plant.zombified`.
*Avoid:* "infected", "turned" in the UI (code uses `turned` for the look).

**Giant** — A zombie that walks straight over rocks and ravines and
**stomps** every plant near it when one is in the way (ZomWes).

**Wander** — ZomWes moves to a different base each time the base it's
attacking loses another 25% of its health, touring the base visited longest
ago. Configurable to trigger on its own health instead (`wanderOn`).

**Guardian** — One of the Boss's three scythe-wielding bodyguards. They
**escort** the boss in formation **slots** (left, right, behind) and
**sweep** (hit every plant in reach). If the boss falls they carry on alone.
Code: `Zombie.leader`, `Zombie.slot`, `ZombieDef.guards`, `ZombieDef.sweep`.

**Satan** — The Hellfire Arena's boss (its only one: `LevelDef.bosses`).
Red, big gut, goat legs, a spade-tipped tail and goat horns. He brings four
**Roadie Zombies** as bodyguards, and a **Biker Zombie** gang rides in with
him. He plays **Riffs** on his guitar. His own death: **Back to Hell**.

**Riff** — Satan's attack, every few seconds, at the nearest plant (or a
base): by turns a cone of **flame** that burns every plant in it, then a
bolt of **lightning** that jumps from plant to plant. Code: `ZombieDef.riff`,
events `flameRiff` / `zapRiff`.

**Biker Zombie** — Fast, on a chopper (the bike is looks only). In the mosh
pit it pops wheelies. **Roadie Zombie** — Slow and armored, carrying a road
case in front like a shield.

**Tombstone Zombie** — A Cyber Cemetery zombie that **rises** out of a
tombstone instead of walking in: the rock is gone for good (the way through
opens up), and it climbs out wearing a clump of grass with that same
tombstone stuck in it. Only graves far enough from the bases along the
zombies' route rise. The stone is a helmet (armor). Spawn groups for it come
from `'graves'`. Code: `ZombieDef.rise`, `ZombieDef.hat`, `Zombie.grave`,
`Game.risen`.

**Open grave** — The hole and heap of dug-up earth left where a tombstone
rose. Looks only.

**Gait** — How a model moves: an ordinary walk, or the Guardians'
**leap-and-slice**. Code: `ModelDef.gait`.

## Abilities

**Ability** — A battle-phase power that costs sun, has a cooldown and needs
the Spaceship: **Orbital Laser Strike** (tap a spot) and **Hyper Sun** (all
plants attack twice as fast for a few seconds).

**Ability look** — What an ability is called on a level, with its icon and
sound; the rules don't change. On the Hellfire Arena the Orbital Laser
Strike is the **Guitar Solo Blast** and Hyper Sun is the **Encore**. Code:
`LevelDef.abilities`, `abilityLook`.

## Pathfinding (code)

**Nav grid** — A hidden 0.5-unit grid over the map. Cells are blocked
(rocks, ravines), owned by a plant (with a chew cost), or free.

**Flow field** — Distance from every nav cell to the nearest standing base,
from one multi-source search. Ground zombies step "downhill". Rebuilt when
plants or bases appear or disappear.

## Characters, skins and the editor

**Model** — A blocky character made of box **Parts** (head, body, arms,
legs, plus extras like a jetpack, bell-bottom legs or the Westbot's
**driver** and **levers**). Parts can hang off other parts and can taper.
Code: `src/models/models.ts`.

**Skin** — The picture painted onto a model, using the Minecraft skin
layout (Minecraft skins import). Most skins are 128×128; models with more
parts use a bigger **skin page** (Westbot: 256×256). Defaults live in
`public/skins/`.

**Character Editor** — The `/editor/` page for painting skins. **Save to
game** keeps a skin in that browser only; **⬇ PNG** exports one to commit as
the new default.

**Decoration** — Non-skin 3D extras on a model: curly **hair** (nest),
**weapons** (scythe), jetpack flames.

## Look and scenery

**Theme** — A level's colors and look: sky, fog, ground, lights, how rocks
are drawn, the ground style and **Decor**. Code: `ThemeDef`.

**Decor** — Animated scenery that doesn't affect play: Rust Corridor's ruined
city (buildings, lamps, tumbleweeds, skyline), and Cyber Cemetery's graveyard
(neon **Fence**, **Gazebo**, ghosts rising from graves, slime, haunted houses
under a big moon), and Crash Jungle's jungle (giant trees with crashed ships
hanging from their vines, palms, ferns, macaws). Code: `src/render/decor.ts`,
`src/render/graveyard.ts`, `src/render/jungle.ts`.

**Fence** — Cyber Cemetery's border: iron posts strung with humming neon
beams, with a broken gate at the back where the zombies come in.

**Gazebo** — The creepy gazebo on top of Cyber Cemetery's mound: an open
coffin, a swinging lantern, a red beacon. To the rules it's a rock.

**Cutaway** — The row of buildings between the camera and the street sinks
to ground-floor ruins so it never hides the game.

**Collapse** — A Rust Corridor building coming down: it sinks and leans
into the street in a cloud of dust, throwing bricks that stay as rubble.
Set off by a **Giant**'s stomp or an Orbital Laser Strike near the street's
edge, and by ZomWes's entrance. On Cyber Cemetery the same moments knock
tombstones flat instead, and on Crash Jungle they shake a hanging ship loose
to fall out of the trees. Looks only. Code: `Decor.crumble`.

**Weather** — A dust storm (Rust Corridor) or thunderstorm (Neon Grid) that
rolls in partway through chosen waves: thicker haze, blowing dust or rain,
lightning. Looks only; the minimap still shows every zombie. Code:
`ThemeDef.weather`, `src/render/weather.ts`.

## Spectacle

**Cinematic** — A staged moment that takes the camera and holds the battle
still, like the pause button. Tap (or Space) skips it. Code:
`src/render/spectacle.ts`, `RtsCamera.fly`.

**Boss entrance** — The cinematic when ZomWes spawns: rumble, lights out, a
vast shadow over the bases, the camera swoops to the boss, and its **name
card** ("ZOMWES 8000 HAS ENTERED THE RUST CORRIDOR").

**Finishing blow** — When the last zombie of the final wave falls: slow
motion while the camera closes in, then confetti and the **victory banner**
before the win screen.

**Death** — How a fallen zombie goes, picked at random: limbs pop off while
the body crumbles; "!!!" and bug eyes, then a stiff topple; or zapped to
x-ray bones and ash. Some zombies have a death of their own, played half the
time (the Jetpack Zombie is blasted at the camera; the Riot Shield Bot is
squished by its shield). The Orbital Laser Strike **shatters** what it kills,
throwing a few parts at the screen. Looks only. Code: `src/render/deaths.ts`,
`ZombieDef.death`.

## Testing

**Debug mode** — `?debug` in the address: jump to any wave (bases repaired,
field cleared) and unlimited sun.

**Balance tests** — Simulated playthroughs: a sensible defense must win, no
defense must lose, and about 20 laser peashooters must beat the boss fight.
