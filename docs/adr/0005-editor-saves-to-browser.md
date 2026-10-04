# 5. The editor saves skins to the browser; defaults are committed PNGs

- **Status:** Accepted
- **Date:** 2026-10-04 (recorded retroactively; decided 2026-10-02 to 10-04)

## Context

Wesley paints skins on a tablet. There's no server, and GitHub Pages is
static.

## Decision

**Save to game** stores the skin in `localStorage` (shared by the game and
`/editor/` because they're on the same site). The official skins are PNGs in
`public/skins/`; **⬇ PNG** exports a skin to commit as the new default. A
saved skin whose size doesn't match the model's skin page is ignored.

## Consequences

- Works offline and with no backend.
- Saved skins live on one device/browser only; sharing means exporting.
- Changing a model's layout invalidates old saved skins (handled by the
  size check).

## Alternatives considered

A backend or Pages-incompatible storage; committing from the browser.
