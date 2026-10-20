import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'

const neighbors = (r: number, c: number, size: number) => [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([y, x]) => y >= 0 && y < size && x >= 0 && x < size)
function group(board: (string | null)[][], row: number, col: number) {
  const color = board[row][col]; if (!color) return { stones: [], liberties: new Set<string>() }
  const stones: [number, number][] = [], liberties = new Set<string>(), seen = new Set<string>(), queue: [number, number][] = [[row, col]]
  while (queue.length) { const [r, c] = queue.pop()!, key = `${r},${c}`; if (seen.has(key)) continue; seen.add(key); stones.push([r, c]); for (const [nr, nc] of neighbors(r, c, board.length)) { if (board[nr][nc] === null) liberties.add(`${nr},${nc}`); else if (board[nr][nc] === color && !seen.has(`${nr},${nc}`)) queue.push([nr, nc]) } }
  return { stones, liberties }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: userData } = await admin.auth.getUser(token)
  if (!userData.user) return json({ error: 'Authentication required' }, 401)
  const { matchId, move } = await request.json()
  const { data: match, error: readError } = await admin.from('matches').select('*').eq('id', matchId).single()
  if (readError || !match) return json({ error: 'Match not found' }, 404)
  const color = match.black_player_id === userData.user.id ? 'black' : match.white_player_id === userData.user.id ? 'white' : null
  if (!color) return json({ error: 'You are not a player in this match' }, 403)
  if (match.status !== 'playing') return json({ error: 'Match is over' }, 409)
  if (match.active_color !== color) return json({ error: 'Not your turn' }, 409)
  const row = Number(move?.row), col = Number(move?.col), board = match.board as (string | null)[][]
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= board.length || col < 0 || col >= board.length) return json({ error: 'Invalid move' }, 400)
  if (board[row][col]) return json({ error: 'Intersection is occupied' }, 409)
  board[row][col] = color
  const opponent = color === 'black' ? 'white' : 'black'
  let captured = 0
  for (const [nr, nc] of neighbors(row, col, board.length)) {
    if (board[nr][nc] !== opponent) continue
    const enemy = group(board, nr, nc)
    if (enemy.liberties.size === 0) { for (const [sr, sc] of enemy.stones) board[sr][sc] = null; captured += enemy.stones.length }
  }
  const own = group(board, row, col)
  if (own.liberties.size === 0) return json({ error: 'Suicide is not allowed' }, 409)
  const oldCaptures = match.captures ?? { black: 0, white: 0 }
  const captures = { black: Number(oldCaptures.black ?? 0), white: Number(oldCaptures.white ?? 0) }
  captures[color] += captured
  const moves = [...(match.moves ?? []), { row, col, player: color, captured, label: `${String.fromCharCode(65 + col)}${board.length - row}` }]
  const next = color === 'black' ? 'white' : 'black'
  const elapsed = Math.max(0, Date.now() - new Date(match.last_move_at).getTime())
  const clocks = { black: Math.max(0, Number(match.black_clock_ms ?? 0)), white: Math.max(0, Number(match.white_clock_ms ?? 0)) }
  clocks[color] = Math.max(0, clocks[color] - elapsed)
  const { data: updated, error } = await admin.from('matches').update({ board, moves, captures, active_color: next, passes: 0, black_clock_ms: clocks.black, white_clock_ms: clocks.white, last_move_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', matchId).eq('status', 'playing').eq('active_color', color).select('id').single()
  if (error || !updated) return json({ error: error?.message ?? 'Move could not be applied' }, 409)
  return json({ ok: true, matchId })
})
