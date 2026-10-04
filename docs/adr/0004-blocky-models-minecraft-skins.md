# 4. Blocky part models with Minecraft-layout skins

- **Status:** Accepted
- **Date:** 2026-10-04 (recorded retroactively; decided 2026-10-02 to 10-04)

## Context

Wesley draws blocky, Minecraft-style characters and wanted to paint them.
We needed models that are easy to texture by hand and to edit in-game.

## Decision

Characters are boxes (parts) with skins in the **Minecraft skin layout**,
at 128×128 by default. Models can attach parts to parts, taper parts, and
use bigger **skin pages** (the Westbot uses 256×256). Many zombies of one
type share a template mesh via instances.

## Consequences

- Minecraft skins import directly into the Character Editor.
- The same layout code drives the game, the editor and the skin generator.
- Non-box detail (hair, scythes, flames) is added as separate 3D
  decorations, deliberately breaking the blocky style where wanted.

## Alternatives considered

Hand-made 3D models (needs Blender and an asset pipeline); 2D standees only.
