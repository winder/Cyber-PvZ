# 1. Babylon.js, TypeScript and Vite, in the browser

- **Status:** Accepted
- **Date:** 2026-10-04 (recorded retroactively; decided 2026-10-02 to 10-04)

## Context

The game had to run in a browser and on a tablet, and be easy to share. The
first plan was 2D isometric with Phaser, but the design moved to a real 3D map
the camera can rotate freely.

## Decision

Use **Babylon.js** with **TypeScript**, built with **Vite**, deployed to
**GitHub Pages**. Babylon was chosen over Three.js because it brings the game
pieces we needed (cameras, glow layer, picking, particles, materials) without
assembling them ourselves. The HUD is plain HTML over the canvas.

## Consequences

- Shareable by link; the tablet plays the dev server over Wi-Fi.
- Babylon is a large download (~1.5 MB gzipped) because we import from the
  package root. Tree-shaking with deep imports is possible later.
- 3D means real-time limits: stylized, not photoreal (see 0011).

## Alternatives considered

Phaser (2D isometric), Three.js, Godot/Bevy (desktop builds).
