import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSession, onAuthStateChange } from '../services/authService'
import { isSupabaseConfigured } from '../lib/supabase'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!isSupabaseConfigured) return
    getSession().then(setSession).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load session')).finally(() => setLoading(false))
    return onAuthStateChange((_event, nextSession) => setSession(nextSession))
  }, [])
  return { session, user: session?.user as User | undefined, loading, error, configured: isSupabaseConfigured }
}
