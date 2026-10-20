import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const auth = request.headers.get('Authorization') ?? ''
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const token = auth.replace(/^Bearer\s+/i, '')
  const { data: userData } = await admin.auth.getUser(token)
  if (!userData.user) return json({ error: 'Authentication required' }, 401)
  const { request: gameRequest } = await request.json()
  if (gameRequest.reconnect) {
    const activeQuery = admin.from('matches').select('id, black_player_id, white_player_id').or(`black_player_id.eq.${userData.user.id},white_player_id.eq.${userData.user.id}`).eq('status', 'playing').order('created_at', { ascending: false }).limit(1)
    const { data: activeMatch } = gameRequest.startedAt ? await activeQuery.gte('created_at', gameRequest.startedAt).maybeSingle() : await activeQuery.maybeSingle()
    if (activeMatch) return json({ matchId: activeMatch.id, color: activeMatch.black_player_id === userData.user.id ? 'black' : 'white' })
  }
  const { data, error } = await admin.rpc('matchmake', {
    p_user_id: userData.user.id,
    p_time_control: gameRequest.timeControl,
    p_board_size: gameRequest.boardSize,
  })
  if (error) return json({ error: error.message }, 400)
  const result = data?.[0]
  if (!result?.match_id) return json({ matchId: `queue:${userData.user.id}` })
  return json({ matchId: result.match_id, color: result.player_color })
})
