import type { GameMetadata } from '../../protocol/protocol.js';

const common = {
  protocol: 1,
  minPlayers: 2,
  maxPlayers: 2,
  author: 'kwibaka',
  spectatorChat: true,
} as const;

export const GOMOKU_GAME: GameMetadata = {
  ...common,
  id: 'gomoku',
  name: '五子棋（无禁手）',
  version: '0.1.0',
  description: '11×11 自由五子棋，无禁手；平局判白胜。',
};

export const GOMOKU_SEKI_GAME: GameMetadata = {
  ...common,
  id: 'gomoku-seki',
  name: '五子棋（无禁手·彗星座子）',
  version: '0.1.0',
  description: '15×15 自由五子棋，黑 H8 / 白 I9 座子，白先；平局双方均败。',
};
