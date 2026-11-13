# Frontier

A small turn-based strategy game in the spirit of 90s planetary-conquest 4X games, made simple enough for a kid to play alone. Pick a race (Ironhorn, Seers, Hivekin or Rootfolk), settle territories, build and upgrade cities, research, raise armies and watch the battles play out. Two to four players, against computer opponents.

Play it by opening `index.html` in a browser. It is one self-contained file: the code, styles, pixel art and pixel font are all inside it (the only outside request is an optional Google Fonts stylesheet for the body text).

## Build

Needs Node.js (any recent version); the build fetches esbuild with `npx`.

```
bash game/build.sh
```

This bundles `game/src/main.ts`, inlines `game/web/style.css` and the font from `game/web/fonts/`, and writes:

- `game/dist/frontier.html`: the game as an HTML fragment (no `<html>` wrapper)
- `index.html`: the same game as a full page, served by GitHub Pages

Commit the new `index.html` after a build.

## Layout

- `game/src/`: the game in TypeScript. `game.ts` (rules), `ai.ts`, `data.ts` (races, buildings, units, techs), `ui.ts`, `scene.ts`, `sprites.ts` and `pixel.ts` (pixel art drawn in code), `battle.ts`, `quests.ts`, `sound.ts`, `mapgen.ts`.
- `game/src/sim*.ts`, `game/src/preview.ts`: dev-only scripts (AI-vs-AI balance runs and a PNG art preview). They are not part of the game bundle.
- `game/web/`: HTML template, stylesheet and font.

## GitHub Pages

Settings > Pages > Build and deployment: Source "Deploy from a branch", branch `main`, folder `/ (root)`.

## Credits

Pixel font: Jersey 20 by Sarah Cadigan-Fried, SIL Open Font License 1.1.
