# 9. Ravines are rectangles to the rules, carved shapes to the eye

- **Status:** Accepted
- **Date:** 2026-10-04 (recorded retroactively; decided 2026-10-02 to 10-04)

## Context

Cliff blocks looked wrong; ravines had to be part of the 3D ground, with
natural shapes, while pathing stays predictable.

## Decision

To the rules a ravine is a **rectangle** of blocked nav cells. The visible
hole is a rounded, wobbly crack carved into the terrain that always stays
**inside** that rectangle (a test checks this). Flyers and giants follow the
ground surface as if ravines weren't there.

## Consequences

- Gameplay and level design use simple rectangles.
- Visuals can be as organic as we like, as long as they stay inside.
- Anything drawn at ground height over a ravine (like light pools or a
  backdrop ground) must avoid the hole.

## Alternatives considered

Blocking cells from the carved shape (harder to design levels around).
