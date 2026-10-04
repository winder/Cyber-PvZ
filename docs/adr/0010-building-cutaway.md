# 10. A cutaway, not transparency, for buildings in the way

- **Status:** Accepted
- **Date:** 2026-10-04 (recorded retroactively; decided 2026-10-02 to 10-04)

## Context

Rust Corridor's skyscrapers along the near side hid the street from the
default camera.

## Decision

The row between the camera and the street **sinks** to ground-floor ruins
(scaled to 14% height), and rises when the camera turns away.

## Consequences

- The play area is always visible; the city still reads as ruins.
- Fading to see-through looked muddy and showed overlapping layers.

## Alternatives considered

Transparency; shorter buildings everywhere; no buildings on one side.
