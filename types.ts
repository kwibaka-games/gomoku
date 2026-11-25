export type GomokuColor = 'black' | 'white';
export type GomokuCell = GomokuColor | null;
export type GomokuMode = 'free' | 'seki';

export interface GomokuPlayerView {
  userId: string;
  name: string;
  seat: number;
  color: GomokuColor;
}

export interface GomokuResult {
  winners: string[];
  reason: 'five' | 'resign' | 'draw_white_win' | 'draw_both_lose';
  winnerColor?: GomokuColor;
  bothLose?: boolean;
  winningLine?: number[];
  board: GomokuCell[];
}

export interface GomokuView {
  schema: 'gomoku-v1';
  mode: GomokuMode;
  size: number;
  status: 'waiting' | 'playing' | 'finished';
  board: GomokuCell[];
  players: GomokuPlayerView[];
  you: { userId: string; color: GomokuColor } | null;
  turn: GomokuColor | null;
  lastMove?: { index: number; color: GomokuColor };
  result?: GomokuResult;
}

export type GomokuAction =
  | { type: 'place'; index: number; label?: string }
  | { type: 'resign'; label?: string };
