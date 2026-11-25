import type { GameToPlatform, PlatformToGame, Seat } from '../../protocol/protocol.js';
import { GOMOKU_GAME, GOMOKU_SEKI_GAME } from './metadata.js';
import type {
  GomokuAction,
  GomokuCell,
  GomokuColor,
  GomokuMode,
  GomokuResult,
  GomokuView,
} from './types.js';

const DIRECTIONS: readonly [number, number][] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

interface Match {
  id: string;
  mode: GomokuMode;
  size: number;
  seats: Seat[];
  board: GomokuCell[];
  colors: Record<GomokuColor, string>;
  turn: GomokuColor;
  status: 'waiting' | 'playing' | 'finished';
  seq: number;
  ready: Set<string>;
  result: GomokuResult | null;
  started: boolean;
  lastMove: { index: number; color: GomokuColor } | null;
}

export function opposite(color: GomokuColor): GomokuColor {
  return color === 'black' ? 'white' : 'black';
}

export function boardSize(mode: GomokuMode): number {
  return mode === 'seki' ? 15 : 11;
}

export function initialBoard(mode: GomokuMode): GomokuCell[] {
  const size = boardSize(mode);
  const board: GomokuCell[] = Array<GomokuCell>(size * size).fill(null);
  if (mode === 'seki') {
    // 彗星座子（简化座子）：前三手固定为黑 H8、白 J7、黑 F10。
    // Coordinates are 0-based: H=7,J=9,F=5; rows 8=7,7=6,10=9.
    board[7 * size + 7] = 'black'; // H8
    board[6 * size + 9] = 'white'; // J7
    board[9 * size + 5] = 'black'; // F10
  }
  return board;
}

export function firstTurn(mode: GomokuMode): GomokuColor {
  return mode === 'seki' ? 'white' : 'black';
}

export function findWin(
  board: GomokuCell[],
  size: number,
  color: GomokuColor,
  index: number,
): number[] | null {
  const row = Math.floor(index / size);
  const col = index % size;
  for (const [dr, dc] of DIRECTIONS) {
    const positions = [index];
    for (const step of [-1, 1]) {
      let r = row + dr * step;
      let c = col + dc * step;
      while (r >= 0 && r < size && c >= 0 && c < size && board[r * size + c] === color) {
        positions.push(r * size + c);
        r += dr * step;
        c += dc * step;
      }
    }
    if (positions.length >= 5) {
      positions.sort((a, b) => a - b);
      return positions;
    }
  }
  return null;
}

export function drawOutcome(
  mode: GomokuMode,
  colors: Record<GomokuColor, string>,
): Pick<GomokuResult, 'winners' | 'reason' | 'winnerColor' | 'bothLose'> {
  if (mode === 'seki') {
    return { winners: [], reason: 'draw_both_lose', bothLose: true };
  }
  return { winners: [colors.white], reason: 'draw_white_win', winnerColor: 'white' };
}

export class GomokuMatch {
  private readonly matches = new Map<string, Match>();

  constructor(
    private readonly mode: GomokuMode,
    private readonly send: (message: GameToPlatform) => void,
  ) {}

  getMetadata(): typeof GOMOKU_GAME | typeof GOMOKU_SEKI_GAME {
    return this.mode === 'seki' ? GOMOKU_SEKI_GAME : GOMOKU_GAME;
  }

  handle(message: PlatformToGame): void {
    switch (message.t) {
      case 'match.create':
        this.create(message.matchId, message.seats);
        return;
      case 'player.ready':
        this.ready(message.matchId, message.playerId);
        return;
      case 'action':
        this.action(message.matchId, message.playerId, message.action);
        return;
      case 'player.connection':
        if (message.connected) this.sendViewToPlayer(message.matchId, message.playerId);
        return;
      case 'match.abort':
        this.matches.delete(message.matchId);
        return;
      default:
        return;
    }
  }

  private create(matchId: string, seats: Seat[]): void {
    if (seats.length !== 2) {
      this.send({
        v: 1,
        t: 'error',
        matchId,
        code: 'E_PLAYERS',
        message: '五子棋需要正好 2 名玩家',
      });
      return;
    }
    const black = seats[0]!;
    const white = seats[1]!;
    const colors: Record<GomokuColor, string> = {
      black: black.userId,
      white: white.userId,
    };
    const match: Match = {
      id: matchId,
      mode: this.mode,
      size: boardSize(this.mode),
      seats,
      board: initialBoard(this.mode),
      colors,
      turn: firstTurn(this.mode),
      status: 'waiting',
      seq: 1,
      ready: new Set(),
      result: null,
      started: false,
      lastMove: null,
    };
    this.matches.set(matchId, match);
    this.sendViews(match);
  }

  private ready(matchId: string, playerId: string): void {
    const match = this.matches.get(matchId);
    if (!match || match.started) return;
    if (!match.seats.some((seat) => seat.userId === playerId)) return;
    match.ready.add(playerId);
    if (match.seats.every((seat) => match.ready.has(seat.userId))) {
      match.started = true;
      match.status = 'playing';
      this.send({ v: 1, t: 'match.started', matchId });
      this.sendViews(match);
    }
  }

  private action(matchId: string, playerId: string, action: unknown): void {
    const match = this.matches.get(matchId);
    if (!match || match.status !== 'playing' || !match.started) return;
    const color = this.colorOf(match, playerId);
    if (!color) return;
    if (!action || typeof action !== 'object') {
      this.error(matchId, playerId, 'E_ILLEGAL', '动作格式错误');
      return;
    }
    const type = (action as { type?: unknown }).type;
    if (type === 'resign') {
      match.seq += 1;
      this.finish(match, {
        winners: [match.colors[opposite(color)]],
        reason: 'resign',
        winnerColor: opposite(color),
        board: [...match.board],
      });
      return;
    }
    if (type !== 'place') {
      this.error(matchId, playerId, 'E_ILLEGAL', '只支持 place 或 resign');
      return;
    }
    if (match.turn !== color) {
      this.error(matchId, playerId, 'E_TURN', '还没轮到你');
      return;
    }
    const index = Number((action as { index?: unknown }).index);
    if (!Number.isInteger(index) || index < 0 || index >= match.board.length || match.board[index]) {
      this.error(matchId, playerId, 'E_ILLEGAL', '落子位置不合法');
      return;
    }

    match.board[index] = color;
    match.lastMove = { index, color };
    match.seq += 1;
    const winningLine = findWin(match.board, match.size, color, index);
    if (winningLine) {
      this.finish(match, {
        winners: [match.colors[color]],
        reason: 'five',
        winnerColor: color,
        winningLine,
        board: [...match.board],
      });
      return;
    }
    if (match.board.every((cell) => cell !== null)) {
      const draw = drawOutcome(match.mode, match.colors);
      this.finish(match, { ...draw, board: [...match.board] });
      return;
    }
    match.turn = opposite(color);
    this.sendViews(match);
  }

  private finish(match: Match, result: GomokuResult): void {
    match.status = 'finished';
    match.result = result;
    this.sendViews(match);
    this.send({ v: 1, t: 'result', matchId: match.id, result });
  }

  private colorOf(match: Match, userId: string): GomokuColor | null {
    if (match.colors.black === userId) return 'black';
    if (match.colors.white === userId) return 'white';
    return null;
  }

  private viewFor(match: Match, userId: string | null): GomokuView {
    return {
      schema: 'gomoku-v1',
      mode: match.mode,
      size: match.size,
      status: match.status,
      board: [...match.board],
      players: match.seats.map((seat) => ({
        userId: seat.userId,
        name: seat.name,
        seat: seat.seat,
        color: this.colorOf(match, seat.userId)!,
      })),
      you: userId ? { userId, color: this.colorOf(match, userId)! } : null,
      turn: match.status === 'playing' ? match.turn : null,
      ...(match.lastMove ? { lastMove: match.lastMove } : {}),
      ...(match.result ? { result: match.result } : {}),
    };
  }

  private actionsFor(match: Match, userId: string): GomokuAction[] {
    if (match.status !== 'playing') return [];
    const color = this.colorOf(match, userId);
    if (!color) return [];
    const actions: GomokuAction[] = [];
    if (match.turn === color) {
      for (let index = 0; index < match.board.length; index += 1) {
        if (!match.board[index]) actions.push({ type: 'place', index, label: '落子' });
      }
    }
    actions.push({ type: 'resign', label: '认输' });
    return actions;
  }

  private sendViews(match: Match): void {
    for (const seat of match.seats) {
      this.send({
        v: 1,
        t: 'view',
        matchId: match.id,
        to: `player:${seat.userId}`,
        seq: match.seq,
        view: this.viewFor(match, seat.userId),
        actions: this.actionsFor(match, seat.userId),
      });
    }
    this.send({
      v: 1,
      t: 'view',
      matchId: match.id,
      to: 'spectator',
      seq: match.seq,
      view: this.viewFor(match, null),
      actions: [],
    });
  }

  private sendViewToPlayer(matchId: string, playerId: string): void {
    const match = this.matches.get(matchId);
    if (!match || !this.colorOf(match, playerId)) return;
    this.send({
      v: 1,
      t: 'view',
      matchId,
      to: `player:${playerId}`,
      seq: match.seq,
      view: this.viewFor(match, playerId),
      actions: this.actionsFor(match, playerId),
    });
  }

  private error(matchId: string, playerId: string, code: string, message: string): void {
    this.send({ v: 1, t: 'error', matchId, playerId, code, message });
  }
}
