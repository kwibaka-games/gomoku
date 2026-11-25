# kwibaka-game-gomoku

五子棋 variants for [kwibaka-boardgame-platform](https://github.com/ZangXuanyi/kwibaka-boardgame-platform).

This repository is one engine exposing two catalog IDs:

- `gomoku`: 11×11, no forbidden moves, black first; a full-board draw is a
  white win.
- `gomoku-seki`: 15×15, no forbidden moves, comet setup with black H8 and
  white I9, white moves first; a full-board draw is a loss for both players.

This is the first pair of four planned Gomoku entries. Forbidden-move variants
can be added to the same engine later.

No next-move hint UI is provided.

## Layout

```text
types.ts / game.ts / metadata.ts / worker.ts
web/gomoku.js
```

## License

AGPL-3.0-only. See `LICENSE`.
