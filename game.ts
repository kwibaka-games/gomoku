import type { GameToPlatform, PlatformToGame, Seat } from '../../protocol/protocol.js';
import {
  GOMOKU_FORBIDDEN_GAME,
  GOMOKU_GAME,
  GOMOKU_RIF_GAME,
  GOMOKU_SEKI_GAME,
} from './metadata.js';
import type {
  GomokuAction,
  GomokuCell,
  GomokuColor,
  GomokuMode,
  GomokuPhase,
  GomokuResult,
  GomokuView,
} from './types.js';

const DIRECTIONS: readonly [number, number][] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

interface Opening {
  name: string;
  direct: boolean;
  white: [number, number];
  black3: [number, number];
}

/**
 * Standard 26 renju openings. Coordinates are internal 0-based board
 * columns/rows; the browser displays columns A-H,J-P (I is skipped).
 */
export const OPENINGS: Opening[] = [
  // Direct (white 2 at H9)
  { name: '寒星', direct: true, white: [7, 8], black3: [7, 9] },
  { name: '溪月', direct: true, white: [7, 8], black3: [8, 9] },
  { name: '疏星', direct: true, white: [7, 8], black3: [9, 9] },
  { name: '花月', direct: true, white: [7, 8], black3: [8, 8] },
  { name: '残月', direct: true, white: [7, 8], black3: [9, 8] },
  { name: '雨月', direct: true, white: [7, 8], black3: [8, 7] },
  { name: '金星', direct: true, white: [7, 8], black3: [9, 7] },
  { name: '松月', direct: true, white: [7, 8], black3: [7, 6] },
  { name: '丘月', direct: true, white: [7, 8], black3: [8, 6] },
  { name: '新月', direct: true, white: [7, 8], black3: [9, 6] },
  { name: '瑞星', direct: true, white: [7, 8], black3: [7, 5] },
  { name: '山月', direct: true, white: [7, 8], black3: [8, 5] },
  { name: '游星', direct: true, white: [7, 8], black3: [9, 5] },
  // Indirect (white 2 at I9)
  { name: '长星', direct: false, white: [8, 8], black3: [9, 9] },
  { name: '峡月', direct: false, white: [8, 8], black3: [9, 8] },
  { name: '恒星', direct: false, white: [8, 8], black3: [9, 7] },
  { name: '水月', direct: false, white: [8, 8], black3: [9, 6] },
  { name: '流星', direct: false, white: [8, 8], black3: [9, 5] },
  { name: '云月', direct: false, white: [8, 8], black3: [8, 7] },
  { name: '浦月', direct: false, white: [8, 8], black3: [8, 6] },
  { name: '岚月', direct: false, white: [8, 8], black3: [8, 5] },
  { name: '银月', direct: false, white: [8, 8], black3: [7, 6] },
  { name: '明星', direct: false, white: [8, 8], black3: [7, 5] },
  { name: '斜月', direct: false, white: [8, 8], black3: [6, 6] },
  { name: '名月', direct: false, white: [8, 8], black3: [6, 5] },
  { name: '彗星', direct: false, white: [8, 8], black3: [5, 5] },
];

const OPENING_BY_NAME = new Map(OPENINGS.map((opening) => [opening.name, opening]));

interface Match {
  id: string;
  mode: GomokuMode;
  size: number;
  seats: Seat[];
  board: GomokuCell[];
  colors: Record<GomokuColor, string>;
  turn: GomokuColor;
  status: 'waiting' | 'playing' | 'finished';
  phase: GomokuPhase;
  seq: number;
  ready: Set<string>;
  result: GomokuResult | null;
  started: boolean;
  lastMove: { index: number; color: GomokuColor } | null;
  openingName: string | null;
  fifthOptions: number[];
  afterOpeningWhitePending: boolean;
}

export function opposite(color: GomokuColor): GomokuColor {
  return color === 'black' ? 'white' : 'black';
}

export function boardSize(mode: GomokuMode): number {
  return mode === 'free' ? 11 : 15;
}

export function firstTurn(mode: GomokuMode): GomokuColor {
  return mode === 'seki' ? 'white' : 'black';
}

export function initialBoard(mode: GomokuMode): GomokuCell[] {
  const size = boardSize(mode);
  const board: GomokuCell[] = Array<GomokuCell>(size * size).fill(null);
  if (mode === 'seki') {
    // 简化彗星座子：黑 H8、白 J7、黑 F10（列 H 后直接 J）。
    board[7 * size + 7] = 'black'; // H8
    board[6 * size + 8] = 'white'; // J7
    board[9 * size + 5] = 'black'; // F10
  }
  return board;
}

function setStone(board: GomokuCell[], size: number, col: number, row: number, color: GomokuColor): void {
  board[row * size + col] = color;
}

export function applyOpening(
  board: GomokuCell[],
  size: number,
  name: string,
): { board: GomokuCell[]; white: [number, number]; black3: [number, number] } | null {
  const opening = OPENING_BY_NAME.get(name);
  if (!opening) return null;
  const next = Array<GomokuCell>(size * size).fill(null);
  setStone(next, size, 7, 7, 'black'); // H8
  setStone(next, size, opening.white[0], opening.white[1], 'white');
  setStone(next, size, opening.black3[0], opening.black3[1], 'black');
  return { board: next, white: opening.white, black3: opening.black3 };
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

function longestRun(
  board: GomokuCell[],
  size: number,
  index: number,
  color: GomokuColor,
): number {
  const row = Math.floor(index / size);
  const col = index % size;
  let best = 1;
  for (const [dr, dc] of DIRECTIONS) {
    let count = 1;
    for (const step of [-1, 1]) {
      let r = row + dr * step;
      let c = col + dc * step;
      while (r >= 0 && r < size && c >= 0 && c < size && board[r * size + c] === color) {
        count += 1;
        r += dr * step;
        c += dc * step;
      }
    }
    best = Math.max(best, count);
  }
  return best;
}

function lineCoordinates(
  size: number,
  index: number,
  dr: number,
  dc: number,
): number[] {
  const row = Math.floor(index / size);
  const col = index % size;
  let r = row - dr * size;
  let c = col - dc * size;
  const result: number[] = [];
  while (r >= 0 && r < size && c >= 0 && c < size) {
    if (r === row && c === col) break;
    r += dr;
    c += dc;
  }
  // The loop above moves to the first valid cell only if it finds the center;
  // rebuild from the center outward for clarity.
  result.length = 0;
  for (let k = -size; k <= size; k += 1) {
    const rr = row + dr * k;
    const cc = col + dc * k;
    if (rr >= 0 && rr < size && cc >= 0 && cc < size) result.push(rr * size + cc);
  }
  return result;
}

function directionHasFour(
  board: GomokuCell[],
  size: number,
  index: number,
  dr: number,
  dc: number,
): boolean {
  const line = lineCoordinates(size, index, dr, dc);
  for (let i = 0; i + 5 <= line.length; i += 1) {
    const window = line.slice(i, i + 5);
    if (!window.includes(index)) continue;
    let black = 0;
    let empty = 0;
    for (const cell of window) {
      if (board[cell] === 'black') black += 1;
      else if (board[cell] === null) empty += 1;
    }
    if (black === 4 && empty === 1) return true;
  }
  return false;
}

function hasOpenFour(
  board: GomokuCell[],
  size: number,
  index: number,
  dr: number,
  dc: number,
): boolean {
  const line = lineCoordinates(size, index, dr, dc);
  for (let i = 0; i + 4 <= line.length; i += 1) {
    if (!line.slice(i, i + 4).every((cell) => board[cell] === 'black')) continue;
    const before = i > 0 ? line[i - 1]! : -1;
    const after = i + 4 < line.length ? line[i + 4]! : -1;
    if (before >= 0 && after >= 0 && board[before] === null && board[after] === null) {
      return true;
    }
  }
  return false;
}

function directionHasOpenThree(
  board: GomokuCell[],
  size: number,
  index: number,
  dr: number,
  dc: number,
): boolean {
  const line = lineCoordinates(size, index, dr, dc);
  for (const empty of line) {
    if (board[empty] !== null) continue;
    const before = longestRun(board, size, index, 'black');
    const trial = [...board];
    trial[empty] = 'black';
    if (hasOpenFour(trial, size, index, dr, dc)) return true;
    void before;
  }
  return false;
}

/** Return empty points that are forbidden for Black (overline, double-four, double-three). */
export function forbiddenPoints(board: GomokuCell[], size: number): number[] {
  const result: number[] = [];
  for (let index = 0; index < board.length; index += 1) {
    if (board[index]) continue;
    const trial = [...board];
    trial[index] = 'black';
    if (longestRun(trial, size, index, 'black') >= 6) {
      result.push(index);
      continue;
    }
    // A move making exactly five wins even if it also creates a three/four.
    const win = findWin(trial, size, 'black', index);
    if (win && win.length === 5) continue;
    let fours = 0;
    let threes = 0;
    for (const [dr, dc] of DIRECTIONS) {
      if (directionHasFour(trial, size, index, dr, dc)) fours += 1;
      if (directionHasOpenThree(trial, size, index, dr, dc)) threes += 1;
    }
    if (fours >= 2 || threes >= 2) result.push(index);
  }
  return result;
}

export function drawOutcome(
  mode: GomokuMode,
  colors: Record<GomokuColor, string>,
): Pick<GomokuResult, 'winners' | 'reason' | 'winnerColor' | 'bothLose'> {
  if (mode === 'seki') {
    return { winners: [], reason: 'draw_both_lose', bothLose: true };
  }
  if (mode === 'free') {
    return { winners: [colors.white], reason: 'draw_white_win', winnerColor: 'white' };
  }
  return { winners: [], reason: 'draw' };
}

export class GomokuMatch {
  private readonly matches = new Map<string, Match>();

  constructor(
    private readonly mode: GomokuMode,
    private readonly send: (message: GameToPlatform) => void,
  ) {}

  getMetadata(): typeof GOMOKU_GAME | typeof GOMOKU_SEKI_GAME | typeof GOMOKU_FORBIDDEN_GAME | typeof GOMOKU_RIF_GAME {
    if (this.mode === 'seki') return GOMOKU_SEKI_GAME;
    if (this.mode === 'forbidden') return GOMOKU_FORBIDDEN_GAME;
    if (this.mode === 'rif') return GOMOKU_RIF_GAME;
    return GOMOKU_GAME;
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
    const match: Match = {
      id: matchId,
      mode: this.mode,
      size: boardSize(this.mode),
      seats,
      board: initialBoard(this.mode),
      colors: { black: black.userId, white: white.userId },
      turn: firstTurn(this.mode),
      status: 'waiting',
      phase: 'waiting',
      seq: 1,
      ready: new Set(),
      result: null,
      started: false,
      lastMove: null,
      openingName: null,
      fifthOptions: [],
      afterOpeningWhitePending: false,
    };
    this.matches.set(matchId, match);
    this.sendViews(match);
  }

  private ready(matchId: string, playerId: string): void {
    const match = this.matches.get(matchId);
    if (!match || match.started) return;
    if (!match.seats.some((seat) => seat.userId === playerId)) return;
    match.ready.add(playerId);
    if (!match.seats.every((seat) => match.ready.has(seat.userId))) return;
    match.started = true;
    match.status = 'playing';
    if (match.mode === 'forbidden' || match.mode === 'rif') {
      match.phase = 'opening';
      match.turn = 'black';
    } else {
      match.phase = 'playing';
    }
    this.send({ v: 1, t: 'match.started', matchId });
    this.sendViews(match);
  }

  private action(matchId: string, playerId: string, action: unknown): void {
    const match = this.matches.get(matchId);
    if (!match || match.status !== 'playing' || !action || typeof action !== 'object') return;
    const color = this.colorOf(match, playerId);
    if (!color) return;
    const type = (action as { type?: unknown }).type;

    if (type === 'opening') {
      this.opening(match, playerId, color, action as { name?: unknown });
      return;
    }
    if (type === 'swap' || type === 'no-swap') {
      this.swap(match, color, type === 'swap');
      return;
    }
    if (type === 'fifth-propose') {
      this.fifthPropose(match, playerId, color, action as { indices?: unknown });
      return;
    }
    if (type === 'fifth-choose') {
      this.fifthChoose(match, playerId, color, action as { index?: unknown });
      return;
    }
    if (type === 'resign') {
      if (match.phase === 'playing' || match.phase === 'fifth-offer' || match.phase === 'fifth-choose') {
        match.seq += 1;
        this.finish(match, {
          winners: [match.colors[opposite(color)]],
          reason: 'resign',
          winnerColor: opposite(color),
          board: [...match.board],
        });
      }
      return;
    }
    if (type !== 'place' || match.phase !== 'playing') {
      this.error(matchId, playerId, 'E_PHASE', '当前阶段不能落子');
      return;
    }
    this.place(match, playerId, color, action as { index?: unknown });
  }

  private opening(
    match: Match,
    playerId: string,
    color: GomokuColor,
    action: { name?: unknown },
  ): void {
    if (match.phase !== 'opening' || color !== 'black') {
      this.error(match.id, playerId, 'E_PHASE', '现在不能指定开局');
      return;
    }
    const name = typeof action.name === 'string' ? action.name : '';
    const applied = applyOpening(match.board, match.size, name);
    if (!applied) {
      this.error(match.id, playerId, 'E_OPENING', '未知开局');
      return;
    }
    match.board = applied.board;
    match.openingName = name;
    match.seq += 1;
    match.turn = 'white';
    match.phase = match.mode === 'rif' ? 'swap' : 'playing';
    if (match.mode === 'rif') {
      match.afterOpeningWhitePending = true;
    }
    this.sendViews(match);
  }

  private swap(match: Match, color: GomokuColor, doSwap: boolean): void {
    if (match.phase !== 'swap' || color !== 'white') {
      this.error(match.id, match.colors.white, 'E_PHASE', '现在不能交换');
      return;
    }
    if (doSwap) {
      [match.colors.black, match.colors.white] = [match.colors.white, match.colors.black];
    }
    match.phase = 'playing';
    match.turn = 'white';
    match.afterOpeningWhitePending = true;
    match.seq += 1;
    this.sendViews(match);
  }

  private place(match: Match, playerId: string, color: GomokuColor, action: { index?: unknown }): void {
    if (match.turn !== color) {
      this.error(match.id, playerId, 'E_TURN', '还没轮到你');
      return;
    }
    const index = Number(action.index);
    if (!Number.isInteger(index) || index < 0 || index >= match.board.length || match.board[index]) {
      this.error(match.id, playerId, 'E_ILLEGAL', '落子位置不合法');
      return;
    }
    if (color === 'black' && (match.mode === 'forbidden' || match.mode === 'rif')) {
      if (forbiddenPoints(match.board, match.size).includes(index)) {
        this.error(match.id, playerId, 'E_FORBIDDEN', '黑棋禁手点');
        return;
      }
    }

    const previousBoard = [...match.board];
    const previousLastMove = match.lastMove;
    match.board[index] = color;
    match.lastMove = { index, color };
    match.seq += 1;

    const win = findWin(match.board, match.size, color, index);
    if (win) {
      if (color === 'black' && win.length > 5) {
        match.board = previousBoard;
        match.lastMove = previousLastMove;
        match.seq -= 1;
        this.error(match.id, playerId, 'E_FORBIDDEN', '黑棋长连禁手');
        return;
      }
      this.finish(match, {
        winners: [match.colors[color]],
        reason: 'five',
        winnerColor: color,
        winningLine: win,
        board: [...match.board],
      });
      return;
    }
    if (match.board.every((cell) => cell !== null)) {
      const draw = drawOutcome(match.mode, match.colors);
      this.finish(match, { ...draw, board: [...match.board] });
      return;
    }

    if (match.mode === 'rif' && match.afterOpeningWhitePending && color === 'white') {
      match.afterOpeningWhitePending = false;
      match.phase = 'fifth-offer';
      match.turn = 'black';
      this.sendViews(match);
      return;
    }
    match.turn = opposite(color);
    this.sendViews(match);
  }

  private fifthPropose(
    match: Match,
    playerId: string,
    color: GomokuColor,
    action: { indices?: unknown },
  ): void {
    if (match.phase !== 'fifth-offer' || color !== 'black') {
      this.error(match.id, playerId, 'E_PHASE', '现在不能提交两打');
      return;
    }
    const indices = Array.isArray(action.indices)
      ? action.indices.map(Number).filter((value) => Number.isInteger(value))
      : [];
    if (indices.length !== 2 || indices[0] === indices[1]) {
      this.error(match.id, playerId, 'E_FIFTH', '请选择两个不同的打点');
      return;
    }
    if (indices.some((index) => index < 0 || index >= match.board.length || match.board[index])) {
      this.error(match.id, playerId, 'E_FIFTH', '打点必须为空位');
      return;
    }
    const forbidden = forbiddenPoints(match.board, match.size);
    if (indices.some((index) => forbidden.includes(index))) {
      this.error(match.id, playerId, 'E_FORBIDDEN', '打点包含黑棋禁手');
      return;
    }
    match.fifthOptions = indices;
    match.phase = 'fifth-choose';
    match.turn = 'white';
    match.seq += 1;
    this.sendViews(match);
  }

  private fifthChoose(
    match: Match,
    playerId: string,
    color: GomokuColor,
    action: { index?: unknown },
  ): void {
    if (match.phase !== 'fifth-choose' || color !== 'white') {
      this.error(match.id, playerId, 'E_PHASE', '现在不能选择打点');
      return;
    }
    const index = Number(action.index);
    if (!match.fifthOptions.includes(index)) {
      this.error(match.id, playerId, 'E_FIFTH', '请选择黑棋提供的打点');
      return;
    }
    match.board[index] = 'black';
    match.lastMove = { index, color: 'black' };
    match.fifthOptions = [];
    match.phase = 'playing';
    match.turn = 'white';
    match.seq += 1;
    const win = findWin(match.board, match.size, 'black', index);
    if (win && win.length === 5) {
      this.finish(match, {
        winners: [match.colors.black],
        reason: 'five',
        winnerColor: 'black',
        winningLine: win,
        board: [...match.board],
      });
      return;
    }
    this.sendViews(match);
  }

  private finish(match: Match, result: GomokuResult): void {
    match.status = 'finished';
    match.phase = 'finished';
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
    const color = userId ? this.colorOf(match, userId) : null;
    const forbidden =
      color === 'black' &&
      (match.mode === 'forbidden' || match.mode === 'rif') &&
      (match.phase === 'playing' || match.phase === 'fifth-offer')
        ? forbiddenPoints(match.board, match.size)
        : undefined;
    return {
      schema: 'gomoku-v1',
      mode: match.mode,
      size: match.size,
      status: match.status,
      phase: match.phase,
      board: [...match.board],
      players: match.seats.map((seat) => ({
        userId: seat.userId,
        name: seat.name,
        seat: seat.seat,
        color: this.colorOf(match, seat.userId)!,
      })),
      you: userId ? { userId, color: this.colorOf(match, userId)! } : null,
      turn: match.status === 'playing' ? match.turn : null,
      ...(match.openingName ? { openingName: match.openingName } : {}),
      ...(match.mode === 'forbidden' || match.mode === 'rif'
        ? { openings: OPENINGS.map((opening) => opening.name) }
        : {}),
      ...(match.fifthOptions.length ? { fifthOptions: [...match.fifthOptions] } : {}),
      ...(forbidden ? { forbidden } : {}),
      ...(match.lastMove ? { lastMove: match.lastMove } : {}),
      ...(match.result ? { result: match.result } : {}),
    };
  }

  private actionsFor(match: Match, userId: string): GomokuAction[] {
    if (match.status !== 'playing') return [];
    const color = this.colorOf(match, userId);
    if (!color) return [];
    if (match.phase === 'swap' && color === 'white') {
      return [{ type: 'swap' }, { type: 'no-swap' }];
    }
    if (match.phase === 'fifth-choose' && color === 'white') {
      return match.fifthOptions.map((index) => ({ type: 'fifth-choose', index }));
    }
    if (match.phase === 'fifth-offer' || match.phase === 'opening') return [];
    if (match.phase !== 'playing') return [];
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
