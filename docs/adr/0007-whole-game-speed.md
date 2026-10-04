# 7. Speed up the whole game, not just zombies

- **Status:** Accepted
- **Date:** 2026-10-04 (recorded retroactively; decided 2026-10-02 to 10-04)

## Context

The request was for zombies to move at 2× by default, with the speed
button still doubling it.

## Decision

Add `GAME_SPEED = 2` and run the **whole simulation** faster (zombies,
plants, sun, cooldowns). The speed button multiplies on top.

## Consequences

- Balance is unchanged; only the pace is.
- Raised the per-frame step cap so 4× keeps up on slow tablets.
- If only zombie walking speed should change, balance must be retuned.

## Alternatives considered

Doubling every zombie's `speed` (makes every level much harder).
