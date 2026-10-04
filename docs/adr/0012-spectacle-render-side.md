# 12. Spectacle is render-side; cinematics hold the sim like pause

- **Status:** Accepted
- **Date:** 2026-10-04

## Context

We wanted big moments to feel big: ZomWes's entrance, buildings collapsing,
a slow-motion finishing blow, and weather. Some of these take the camera
away from the player for a few seconds while zombies are on the field.

## Decision

All of it lives in `src/render/` and reacts to sim events; the sim gains no
rules for it (ADR 0002). A **cinematic** holds the battle by not stepping
the sim, exactly as the pause button does, and can be skipped with a tap.
Slow motion only slows the render clock; the final wave has already been
won when it starts. Collapses and weather never change paths, ranges or
targets.

## Consequences

- Balance tests and replays are unaffected; nothing in `src/sim/` changed.
- The player never loses ground while the camera is away.
- Weather can hide zombies on screen, so the minimap stays the honest view.

## Alternatives considered

Letting the battle run during the entrance (the player could lose plants
while unable to act); making collapsed buildings block paths (would need a
sim rule and new balance work).
