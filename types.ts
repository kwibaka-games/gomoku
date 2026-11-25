export type GomokuColor = 'black' | 'white';
export type GomokuCell = GomokuColor | null;
export type GomokuMode = 'free' | 'seki' | 'forbidden' | 'rif';
export type GomokuPhase =
  | 'waiting'
  | 'opening'
  | 'swap'
  | 'fifth-offer'
  | 'fifth-choose'
  | 'playing'
  | 'finished';

export interface GomokuPlayerView {
  userId: string;
  name: string;
  seat: number;
  color: GomokuColor;
}

export interface GomokuResult {
  winners: string[];
  reason: 'five' | 'resign' | 'draw' | 'draw_white_win' | 'draw_both_lose';
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
  phase: GomokuPhase;
  board: GomokuCell[];
  players: GomokuPlayerView[];
  you: { userId: string; color: GomokuColor } | null;
  turn: GomokuColor | null;
  openingName?: string;
  openings?: string[];
  fifthOptions?: number[];
  forbidden?: number[];
  lastMove?: { index: number; color: GomokuColor };
  result?: GomokuResult;
}

export type GomokuAction =
  | { type: 'opening'; name: string }
  | { type: 'swap' }
  | { type: 'no-swap' }
  | { type: 'fifth-propose'; indices: number[] }
  | { type: 'fifth-choose'; index: number }
  | { type: 'place'; index: number; label?: string }
  | { type: 'resign'; label?: string };
