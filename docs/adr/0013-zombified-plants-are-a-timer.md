# 13. A zombified plant is a timer on the plant, not a second team

- **Status:** Accepted
- **Date:** 2026-10-13

## Context

The Necro-Gardener turns the player's plants against them. That means
plants can now be on the zombies' side, which touches targeting, pathing,
sun and the abilities.

## Decision

A plant carries `zombified`: seconds of goo left (0 = healthy). There is no
general "team" or "owner". While it's above 0 the plant:

- shoots the nearest base or healthy plant in range instead of zombies;
- makes no sun and gets nothing from Hyper Sun;
- is left out of the nav grid, so zombies walk through it (a zombified wall
  is an open door) and don't chew it.

It's cured when the timer runs out, when an Orbital Laser Strike lands on
it, when the last goo sprayer dies, or when the wave ends. Every plant is
healthy in the build phase, so selling, turning and placing never meet one.

## Consequences

- The Orbital Laser Strike is now a choice: hurt zombies or rescue plants.
- Stacking shooters close together is risky against this boss, since one
  spray takes a whole cluster. Balance tests cover him like the others.
- Area damage (rockets, stomps, sweeps) still hurts zombified plants;
  only aimed attacks skip them.
- A zombie can be standing inside a wall when it's cured. The pathfinder
  already lets a zombie walk out of the plant cell it's in.

## Alternatives considered

A `team` field on plants and zombies (more general, but nothing else needs
it, and every targeting rule would have to ask about it). Converting the
plant into a zombie entity (loses its position in the nav grid and its
health, and curing would have to convert it back).
