# 11. Art is generated in code, with drop-in hooks for Wesley's art

- **Status:** Accepted
- **Date:** 2026-10-04 (recorded retroactively; decided 2026-10-02 to 10-04)

## Context

There's no artist pipeline; Wesley draws on paper; the game must stay
small and tablet-friendly.

## Decision

Placeholder and scenery art is **procedural**: neon primitives, skins
painted by a generator script, and canvas-drawn textures (street, brick,
car paint). Hooks swap in real art: `art` (2D standee), `skin` (PNG),
`SOUND_FILES` (recordings).

## Consequences

- No asset downloads beyond the code and a few PNG skins.
- Detail is limited to what's practical to generate; matching photoreal
  references is out of reach (see 0001).

## Alternatives considered

Asset packs; hand-modelled 3D art.
