# 3. Pathfinding: nav grid + flow field, plants cost "chew time"

- **Status:** Accepted
- **Date:** 2026-10-04 (recorded retroactively; decided 2026-10-02 to 10-04)

## Context

The map is open (StarCraft-like), zombies find their own way, and the
player should be able to steer them (mazes, funnels). In PvZ, plants in the
way get eaten.

## Decision

A hidden 0.5-unit **nav grid**; one multi-source **Dijkstra flow field** to
the nearest standing base, rebuilt when plants or bases change. **Plants are
passable at a cost** equal to the time to chew through them, so zombies
detour when that's cheaper and chew when it isn't. Diagonal moves can't cut
past plant or obstacle corners. Giants and flyers skip the field.

## Consequences

- One field serves every ground zombie: cheap with many zombies.
- Walls route zombies naturally, and fully sealing a base never breaks
  pathing (they chew through).
- Distances must be stored as Float64: Float32 rounding made popped heap
  entries look stale and left cells unreachable (fixed early on).

## Alternatives considered

A* per zombie; treating plants as hard walls (sealed bases would break pathing).
