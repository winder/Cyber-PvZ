# 15. Zones are spawn sources; a level can keep every boss as written

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

The War Zone is an army base: a corridor with zones off it (mess hall,
armory, training field, jail, hospital), each a place zombies come out of
rather than a map edge. Each zone has its own boss, one per wave, so the
level can't use the one-boss-per-game pick. In the final wave the morgue's
dead get up off their gurneys and the jail breaks open. Its walls are
standing brick and sandbags, not dug-out ravines.

## Decision

- **A zone is a spawn source.** `MapDef.zones` names each zone's area, its
  door onto the corridor, its spots and its boss's lair. A spawn group's
  `edge` can be a zone: a boss comes out at the lair, anyone else at the
  zone's spots in turn (each body on a gurney, each cell, once), and walks
  out through the door on the normal flow field. A zone can make its zombies
  lie still for a moment first (`rise`), reusing `Zombie.rising`. The sim
  emits `zoneSpawn` with the spot, so the scenery can react (a body's sheet
  slides off, a cell door bursts) without the sim knowing what's drawn.
- **Barriers are rectangles that block, drawn standing up.** `MapDef.barriers`
  block nav cells exactly like ravines (`NavGrid.addRect`), with a `look`
  that only the scenery reads (brick wall, sandbags, fence, furniture,
  fenced-off grounds). Nothing can be planted in a zone's area either.
- **`LevelDef.keepBosses`** keeps every boss in the waves as written instead
  of swapping them all for one picked boss. `Game.boss` is then the final
  wave's boss.
- **Boss attacks are config, reused where they fit.** Knives and the
  arsenal's guns are `Gun`s (the Ship Captain's rockets, generalised with a
  `volley` and a `look`); the arsenal cycles its guns on a timer
  (`gunSwitched`). Healing is a new rule (`ZombieDef.heal`). The Executioner
  is `sweep` plus `guards`, which already existed.

## Consequences

- Rules stay 2D and in `src/sim/` (ADR 0002); the gurneys, the cells, the
  bodies and the jailbreak are looks only.
- Bodyguards now take the route when they're cut off from their leader (their
  walk to the bases is much longer than the leader's), so an escort that
  comes out of a zone isn't left behind its wall.
- The HUD names zones as spawn sources ("from the Jail"), and the build
  phase's red markers ring a zone's door.

## Alternatives considered

Zones as map edges with alleys (no way to come out from inside a zone or to
have spots and lairs). A separate boss system for "minibosses" per wave
(duplicates the boss bar, card and death flow that already handle any boss).
Ravines drawn as walls by theme (works for the rules, but walls and furniture
need their own shapes and looks, and a ravine is a hole by name).
