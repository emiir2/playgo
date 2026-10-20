import { corsHeaders, json } from '../_shared/cors.ts'
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: user } = await client.auth.getUser(token)
  if (!user.user) return json({ error: 'Authentication required' }, 401)
  const { matchId } = await request.json()
  const { data: match, error } = await client.from('matches').select('*').eq('id', matchId).single()
  if (error || !match || ![match.black_player_id, match.white_player_id].includes(user.user.id)) return json({ error: 'Match not found' }, 404)
  if (match.status !== 'playing') return json({ status: match.status, clocks: { black: Math.floor(Number(match.black_clock_ms) / 1000), white: Math.floor(Number(match.white_clock_ms) / 1000) } })
  const color = match.active_color as 'black' | 'white'
  const elapsed = Math.max(0, Date.now() - new Date(match.last_move_at).getTime())
  const field = color === 'black' ? 'black_clock_ms' : 'white_clock_ms'
  const remaining = Math.max(0, Number(match[field]) - elapsed)
  const update: Record<string, unknown> = { [field]: remaining, updated_at: new Date().toISOString() }
  if (remaining <= 0) { update.status = 'timeout'; update.result = color === 'black' ? 'white' : 'black' }
  const { data: updated, error: updateError } = await client.from('matches').update(update).eq('id', matchId).eq('status', 'playing').eq('active_color', color).select('*').maybeSingle()
  if (updateError) return json({ error: updateError.message }, 400)
  const current = updated ?? match
  return json({ status: current.status, result: current.result, clocks: { black: Math.floor(Number(current.black_clock_ms) / 1000), white: Math.floor(Number(current.white_clock_ms) / 1000) } })
})
