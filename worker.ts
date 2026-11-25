import { WebSocket } from 'ws';
import { GomokuMatch } from './game.js';
import { GOMOKU_FORBIDDEN_GAME, GOMOKU_GAME, GOMOKU_RIF_GAME, GOMOKU_SEKI_GAME } from './metadata.js';
import type { GameToPlatform, PlatformToGame } from '../../protocol/protocol.js';

const matchId = process.env.MATCH_ID;
const platformUrl = process.env.PLATFORM_WS_URL;
const secret = process.env.GAME_SECRET;
const gameId = process.env.GAME_ID || 'gomoku';
const metadata =
  gameId === 'gomoku-seki'
    ? GOMOKU_SEKI_GAME
    : gameId === 'gomoku-forbidden'
      ? GOMOKU_FORBIDDEN_GAME
      : gameId === 'gomoku-rif'
        ? GOMOKU_RIF_GAME
        : GOMOKU_GAME;
const mode =
  gameId === 'gomoku-seki'
    ? 'seki'
    : gameId === 'gomoku-forbidden'
      ? 'forbidden'
      : gameId === 'gomoku-rif'
        ? 'rif'
        : 'free';

if (!matchId || !platformUrl || !secret) {
  console.error('[gomoku-worker] MATCH_ID, PLATFORM_WS_URL and GAME_SECRET are required');
  process.exit(2);
}

const ws = new WebSocket(platformUrl);
let game: GomokuMatch | null = null;
let registered = false;

const send = (message: GameToPlatform) => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
};

ws.on('open', () => {
  ws.send(
    JSON.stringify({
      v: 1,
      t: 'register',
      secret,
      matchId,
      game: metadata,
    } satisfies GameToPlatform),
  );
});

ws.on('message', (raw) => {
  let message: PlatformToGame | { t: string; ok?: boolean; error?: string };
  try {
    message = JSON.parse(raw.toString());
  } catch {
    return;
  }

  if (!registered) {
    if (message.t !== 'register.ack') return;
    if (!('ok' in message) || !message.ok) {
      console.error('[gomoku-worker] register rejected:', message.error ?? 'unknown');
      process.exit(3);
    }
    registered = true;
    game = new GomokuMatch(mode, send);
    console.log(`[gomoku-worker] matched ${matchId} game=${gameId}`);
    return;
  }

  if (!game) return;
  if (message.t === 'register.ack') return;
  game.handle(message as PlatformToGame);
});

ws.on('close', (code) => {
  console.log(`[gomoku-worker] platform closed (${code})`);
  process.exit(0);
});

ws.on('error', (error) => {
  console.error('[gomoku-worker] websocket error:', error.message);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    ws.close();
    process.exit(0);
  });
}
