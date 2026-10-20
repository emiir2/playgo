import type { RealtimeChannel } from '@supabase/supabase-js'
import type { MatchService, MatchState, Move, OnlineGameRequest } from '../types/online'
import { supabase } from '../lib/supabase'

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured. Add the environment variables before starting an online match.')
  return supabase
}

async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await requireClient().functions.invoke(name, { body })
  if (error) {
    const context = (error as { context?: Response }).context
    if (context) {
      try {
        const payload = await context.clone().json() as { error?: string }
        if (payload.error) throw new Error(payload.error)
      } catch (reason) {
        if (reason instanceof Error && reason.message !== 'Unexpected end of JSON input') throw reason
      }
    }
    throw error
  }
  return data as T
}

function mapPlayer(id: string, profiles: Record<string, unknown>[]) {
  const profile = profiles.find((item) => String(item.id) === id)
  const username = String(profile?.username ?? 'Opponent')
  return { id, name: username, rank: String(profile?.rank ?? 'Unranked'), avatar: String(profile?.avatar_url ?? username.slice(0, 2).toUpperCase()) }
}

function mapMatch(row: Record<string, unknown>, profiles: Record<string, unknown>[] = []): MatchState {
  const clocks = row.clocks as MatchState['clocks'] | undefined
  const blackId = String(row.black_player_id ?? '')
  const whiteId = String(row.white_player_id ?? '')
  return {
    matchId: String(row.id), status: row.status as MatchState['status'], blackPlayer: (row.black_player ?? mapPlayer(blackId, profiles)) as MatchState['blackPlayer'], whitePlayer: (row.white_player ?? mapPlayer(whiteId, profiles)) as MatchState['whitePlayer'], activeColor: row.active_color as MatchState['activeColor'], clocks: clocks ?? { black: Math.floor(Number(row.black_clock_ms ?? 0) / 1000), white: Math.floor(Number(row.white_clock_ms ?? 0) / 1000) }, board: row.board as MatchState['board'], moves: row.moves as Move[], captures: row.captures as MatchState['captures'], passes: Number(row.passes ?? 0), result: row.result as MatchState['result'], lastMoveAt: String(row.last_move_at ?? ''), timeControl: row.time_control as MatchState['timeControl'] ?? { mainMinutes: 10, incrementSeconds: 0, byoyomiSeconds: 0, byoyomiPeriods: 0, label: 'Blitz' }
  }
}

async function withProfiles(rows: Record<string, unknown>[]) {
  const ids = [...new Set(rows.flatMap((row) => [String(row.black_player_id), String(row.white_player_id)]).filter(Boolean))]
  if (!ids.length) return rows.map((row) => mapMatch(row))
  const { data } = await requireClient().from('profiles').select('id,username,rank,avatar_url').in('id', ids)
  return rows.map((row) => mapMatch(row, (data ?? []) as Record<string, unknown>[]))
}

export const supabaseMatchService: MatchService = {
  async findMatch(request: OnlineGameRequest) { return callFunction<{ matchId: string; color?: 'black' | 'white' }>('find-match', { request }) },
  async getMatch(matchId) { const { data, error } = await requireClient().from('matches').select('*').eq('id', matchId).single(); if (error) throw error; return (await withProfiles([data as Record<string, unknown>]))[0] },
  async listActiveMatches() { const { data, error } = await requireClient().from('matches').select('*').eq('status', 'playing').order('created_at', { ascending: false }); if (error) throw error; return withProfiles((data ?? []) as Record<string, unknown>[]) },
  async cancelMatch(matchId) { await callFunction('cancel-match', { matchId }) },
  async submitMove(matchId, move) { await callFunction('submit-move', { matchId, move }) },
  async pass(matchId) { await callFunction('pass-match', { matchId }) },
  async resign(matchId) { await callFunction('resign-match', { matchId }) },
  subscribe(matchId, listener) {
    const client = requireClient()
    void client.from('matches').select('*').eq('id', matchId).single().then(async ({ data }) => { if (data) listener((await withProfiles([data as Record<string, unknown>]))[0]) })
    let channel: RealtimeChannel = client.channel(`match:${matchId}`)
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` }, (payload) => { void withProfiles([payload.new as Record<string, unknown>]).then(([match]) => listener(match)) })
    channel.subscribe()
    return () => { void client.removeChannel(channel) }
  },
}
