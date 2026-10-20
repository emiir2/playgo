import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: user } = await client.auth.getUser(token); if (!user.user) return json({ error: 'Authentication required' }, 401)
  const { matchId } = await request.json(); const { data: match, error } = await client.from('matches').select('*').eq('id', matchId).single()
  if (error || !match || ![match.black_player_id, match.white_player_id].includes(user.user.id)) return json({ error: 'Match not found' }, 404)
  if (match.status !== 'playing') return json({ error: 'Match is over' }, 409)
  const activeId = match.active_color === 'black' ? match.black_player_id : match.white_player_id
  if (activeId !== user.user.id) return json({ error: 'Not your turn' }, 409)
  const passes = Number(match.passes ?? 0) + 1; const nextStatus = passes >= 2 ? 'finished' : 'playing'; const result = passes >= 2 ? 'draw' : null
  const { data: updated, error: updateError } = await client.from('matches').update({ passes, active_color: match.active_color === 'black' ? 'white' : 'black', status: nextStatus, result, last_move_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', matchId).eq('status', 'playing').eq('active_color', match.active_color).select('id').maybeSingle()
  if (!updated && !updateError) return json({ error: 'Match state changed; refresh and try again' }, 409)
  if (updateError) return json({ error: updateError.message }, 400)
  await client.from('match_events').insert({ match_id: matchId, sequence: (match.moves?.length ?? 0) + passes, player_id: user.user.id, event_type: 'pass', payload: { passes } })
  return json({ ok: true })
})
