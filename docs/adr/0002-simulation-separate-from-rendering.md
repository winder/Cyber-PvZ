# 2. A 2D fixed-step simulation, separate from rendering

- **Status:** Accepted
- **Date:** 2026-10-04 (recorded retroactively; decided 2026-10-02 to 10-04)

## Context

We needed balance tests (whole games played in milliseconds), predictable
behavior, and freedom to change the look (3D terrain, decor) without touching
the rules.

## Decision

All rules live in `src/sim/`: a **2D** simulation (x, z) on a **fixed 30 Hz
step**, seeded randomness, and an event list the renderer and audio consume.
Rendering (`src/render/`) only reads state and events. Height (hills,
ravines, leaps, flying) is **visual only**.

## Consequences

- Balance and behavior are unit-tested in Node with no browser.
- The 3D terrain could be added without changing rules; ravines block via
  the nav grid, not via height.
- Anything that must matter to play (e.g. a ravine) needs a 2D rule, and the
  visuals must agree with it (see 0009).

## Alternatives considered

Simulating in 3D with physics; mixing rules into Babylon scene updates.
