import type { Board, Move, Stone } from '../game'
export type { Board, Move, Stone }

export type TimeControl = { mainMinutes: number; incrementSeconds: number; byoyomiSeconds: number; byoyomiPeriods: number; label: string }
export type OnlineGameRequest = { timeControl: TimeControl; boardSize: number; colorPreference: 'random' | Stone; reconnect?: boolean; newMatch?: boolean; startedAt?: string }
export type MatchStatus = 'searching' | 'playing' | 'finished' | 'resigned' | 'timeout' | 'cancelled'
export type PlayerInfo = { id: string; name: string; rank: string; avatar: string }
export type MatchClocks = { black: number; white: number }
export type MatchState = {
  matchId: string
  status: MatchStatus
  blackPlayer: PlayerInfo
  whitePlayer: PlayerInfo
  activeColor: Stone
  clocks: MatchClocks
  board: Board
  moves: Move[]
  captures: { black: number; white: number }
  passes: number
  result?: Stone | 'draw'
  lastMoveAt: string
  timeControl: TimeControl
}

export interface MatchService {
  findMatch(request: OnlineGameRequest): Promise<{ matchId: string; color?: Stone }>
  getMatch(matchId: string): Promise<MatchState>
  listActiveMatches(): Promise<MatchState[]>
  cancelMatch(matchId: string): Promise<void>
  submitMove(matchId: string, move: Move): Promise<void>
  pass(matchId: string): Promise<void>
  resign(matchId: string): Promise<void>
  subscribe(matchId: string, listener: (state: MatchState) => void): () => void
}
