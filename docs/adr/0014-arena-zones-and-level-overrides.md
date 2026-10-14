# 14. The mosh pit is a zone rule; arena walls and seats are obstacles

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

The Hellfire Arena isn't a rectangle of open ground: its floor fans out
from a stage, rows of seats stand at odd angles all over it, and the mosh
pit changes how zombies move and how much damage they take. It also has its
own boss (Satan) and calls the abilities by other names.

## Decision

- **Shape and seats are obstacles.** A `MapDef.fan` blocks every nav cell
  off the fan (and outside its `tunnels`), and each `MapDef.seats` row blocks
  the cells within half a row's depth of its line, exactly like rocks and
  ravines. Pathing, placement and giants need no new rules.
- **The mosh pit is a zone in the sim.** Each tick a ground zombie (not a
  boss, giant or flyer) inside `MapDef.moshPit` is `moshing`: damage to it is
  cut by `MOSH.shield`, and it alternates `rocking` (slow) and `surging`
  (fast) on timers drawn from the game's seeded random numbers. Leaving the
  pit clears all of it. Which dance move it does is picked by the renderer.
- **Levels can override bosses and ability names.** `LevelDef.bosses`
  replaces the random pool; `LevelDef.abilities` renames an ability (name,
  icon, description, sound). The ability's rules and ids stay the same, so
  the sim, cooldowns and tests don't change.

## Consequences

- Every rule stays 2D and in `src/sim/` (ADR 0002); the stands, the fans,
  the stage height and the dance moves are looks only.
- Two seat rows funnel the way to the stage across the pit, so every ground
  zombie gets the shield. Balance tests for the level cover it.
- The renderer reads `Zombie.moshing/rocking` to pose zombies, as it reads
  `rising` for graves.
- A level's decor can draw its own look for the strike ability
  (`Decor.replacesStrike`).

## Alternatives considered

A general polygon outline for maps (more flexible, but a fan and rectangles
cover this level). Making the pit a speed multiplier only (loses the
shield, which is what makes the pit matter). New ability ids for the arena
(would duplicate the rules and every test of them).
