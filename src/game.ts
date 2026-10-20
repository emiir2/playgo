export type Stone = 'black' | 'white'
export type Cell = Stone | null
export type Board = Cell[][]
export type Point = { row: number; col: number }
export type Move = Point & { player: Stone; captured: number; label: string }

export const SIZE = 19

export function createBoard(): Board {
  return Array.from({ length: SIZE }, () => Array<Cell>(SIZE).fill(null))
}

export function otherPlayer(player: Stone): Stone { return player === 'black' ? 'white' : 'black' }

function inBounds(row: number, col: number) { return row >= 0 && row < SIZE && col >= 0 && col < SIZE }

function neighbors(point: Point): Point[] {
  return [[point.row - 1, point.col], [point.row + 1, point.col], [point.row, point.col - 1], [point.row, point.col + 1]]
    .filter(([row, col]) => inBounds(row, col)).map(([row, col]) => ({ row, col }))
}

export function getGroup(board: Board, start: Point): Point[] {
  const color = board[start.row][start.col]
  if (!color) return []
  const group: Point[] = []
  const queue = [start]
  const seen = new Set<string>()
  while (queue.length) {
    const point = queue.shift()!
    const key = `${point.row},${point.col}`
    if (seen.has(key)) continue
    seen.add(key); group.push(point)
    neighbors(point).forEach((next) => { if (board[next.row][next.col] === color) queue.push(next) })
  }
  return group
}

export function liberties(board: Board, group: Point[]): Point[] {
  const result = new Map<string, Point>()
  group.forEach((point) => neighbors(point).forEach((next) => {
    if (!board[next.row][next.col]) result.set(`${next.row},${next.col}`, next)
  }))
  return [...result.values()]
}

export function boardKey(board: Board) { return board.map((row) => row.map((cell) => cell?.[0] ?? '.').join('')).join('/') }

export function tryMove(board: Board, point: Point, player: Stone, previousKey?: string) {
  if (board[point.row]?.[point.col] || !inBounds(point.row, point.col)) return { valid: false as const, reason: 'That intersection is occupied.' }
  const next = board.map((row) => [...row])
  next[point.row][point.col] = player
  let captured = 0
  const enemy = otherPlayer(player)
  neighbors(point).forEach((neighbor) => {
    if (next[neighbor.row][neighbor.col] === enemy) {
      const enemyGroup = getGroup(next, neighbor)
      if (!liberties(next, enemyGroup).length) {
        captured += enemyGroup.length
        enemyGroup.forEach((stone) => { next[stone.row][stone.col] = null })
      }
    }
  })
  if (!liberties(next, getGroup(next, point)).length) return { valid: false as const, reason: 'Suicide is not allowed.' }
  if (previousKey && boardKey(next) === previousKey) return { valid: false as const, reason: 'Ko: this position cannot be repeated immediately.' }
  return { valid: true as const, board: next, captured }
}

export function coordinate(point: Point) {
  const letters = 'ABCDEFGHJKLMNOPQRST'
  return `${letters[point.col]}${SIZE - point.row}`
}
