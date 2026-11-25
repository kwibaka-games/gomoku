# kwibaka-game-gomoku

五子棋 variants for [kwibaka-boardgame-platform](https://github.com/ZangXuanyi/kwibaka-boardgame-platform).

This repository is one engine exposing two catalog IDs:

- `gomoku`: 11×11, no forbidden moves, black first; a full-board draw is a
  white win.
- `gomoku-seki`: 15×15, no forbidden moves, comet setup with black H8, white J7,
  black F10, then white moves first; a full-board draw is a loss for both players.

The same engine also exposes:

- `gomoku-forbidden`: 15×15, specified opening, black forbidden points
  (overline/double-four/double-three); a black-only hint toggle marks them.
- `gomoku-rif`: 15×15, specified opening, forbidden points, three-move swap and
  five-move two choices.

The free and seki modes have no hint UI. Coordinates skip I (A-H, J-P).

## Layout

```text
types.ts / game.ts / metadata.ts / worker.ts
web/gomoku.js
```

## License

AGPL-3.0-only. See `LICENSE`.
