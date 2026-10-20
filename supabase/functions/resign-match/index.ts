import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: user } = await client.auth.getUser(token); if (!user.user) return json({ error: 'Authentication required' }, 401)
  const { matchId } = await request.json(); const { data: match } = await client.from('matches').select('black_player_id,white_player_id').eq('id', matchId).single()
  if (!match || ![match.black_player_id, match.white_player_id].includes(user.user.id)) return json({ error: 'Match not found' }, 404)
  const result = match.black_player_id === user.user.id ? 'white' : 'black'
  const { error } = await client.from('matches').update({ status: 'resigned', result, updated_at: new Date().toISOString() }).eq('id', matchId).eq('status', 'playing')
  if (error) return json({ error: error.message }, 400)
  await client.from('match_events').insert({ match_id: matchId, sequence: Date.now(), player_id: user.user.id, event_type: 'resign', payload: { result } })
  return json({ ok: true })
})
