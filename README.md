# Cyber Plants vs Zombies 🌱⚡

Futuristic plants vs. futuristic zombies, on an open 3D map. Plan your defense,
press **GO**, and protect the Mega-Brain Greenhouse for 5 waves.

See [PRD.md](PRD.md) for the full design.

## Play it

```sh
npm install
npm run dev
```

Open the address Vite prints. To play on a tablet on the same Wi-Fi, open the
**Network** address it prints (like `http://192.168.x.x:5173`).

## Controls

| | Tablet | Computer |
|---|---|---|
| Move camera | Drag one finger | Drag, or WASD |
| Zoom | Pinch | Mouse wheel |
| Turn camera | Two-finger twist | Right-drag, or Q / E |
| Plant | Tap a card, then tap the ground | Click a card (or 1–4), then click |
| Sell a plant | Tap it (before the wave) | Click it |
| Start the wave | GO! | GO! or Enter |
| Pause / speed | ⏸ / 1× buttons | Space / F |

## Debug mode

Add `?debug` to the address (e.g. `https://winder.github.io/Cyber-PvZ/?debug`,
or `http://localhost:5173/?debug` locally). A 🐞 panel appears with:

- **Jump to wave 1–5**: goes to that wave's build phase with every base
  repaired, plants healed, and the field cleared. Works mid-battle and after
  losing.
- **∞ Sun**: keeps sun topped up at 99,999. Tap to turn it off.

## Change the game

Everything you'd want to tweak is in **`src/data/config.ts`**: plant costs,
health, damage, zombie speed, the waves, the map, and the sun economy. Change a
number, save, and the game reloads.

**Paint the zombies:** open the **Character Editor** (`/editor/` on the game's
site, or the link on the title screen). Paint on the 3D model or the unfolded
skin, then press **Save to game**. Saved skins live in that browser only. To make
a skin the official one for everyone, press **⬇ PNG** and put the file in
`public/skins/` (e.g. `public/skins/cyborg.png`).

Skins use the Minecraft skin layout (at 128×128), so Minecraft skins can be
loaded with **⬆ Load**. Zombies with `model` and `skin` in `config.ts` use
skins; the box shapes are defined in `src/models/models.ts`.

**Your own art (flat):** put a picture in `public/art/` (a PNG with a
see-through background works best) and set `art: 'art/your-picture.png'` on
that plant, zombie, or building in `config.ts`.

**Your own sounds:** put a sound in `public/sounds/` and add it to
`SOUND_FILES` in `config.ts`, e.g. `laser: 'sounds/pew.mp3'`.

## For developers

- `src/sim/` — game rules, no graphics. Fixed 30 ticks/second.
- `src/render/` — Babylon.js 3D view and camera.
- `src/ui/` — HTML HUD and minimap.
- `src/models/` — blocky character models; `src/editor/` — the character editor.
- `npm test` runs the rule tests, including balance checks that a sensible
  defense can win and no defense loses. Run them after changing numbers.
- Pushing to `main` deploys to GitHub Pages (`.github/workflows/deploy.yml`).
