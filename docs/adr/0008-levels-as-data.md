# 8. Levels are data: map, theme and waves

- **Status:** Accepted
- **Date:** 2026-10-04 (recorded retroactively; decided 2026-10-02 to 10-04)

## Context

A second level needed a different layout, look and possibly waves,
without forking code.

## Decision

A level is `{ map, theme, waves }` in `src/data/config.ts`. The sim,
terrain, camera, minimap and world builder all take the active level. The
level comes from `?level=` (id or number); the title screen links to each.
Restarting reloads the page, keeping the level.

## Consequences

- A new level is mostly config plus optional decor.
- Themes switch whole subsystems (rock style, ground style, decor) by name.

## Alternatives considered

Separate builds or pages per level; code branches on level id.
