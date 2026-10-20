import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type AuthResult = { user: User | null; session: Session | null }

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.')
  return supabase
}

export async function signUp(email: string, password: string, username: string): Promise<AuthResult> {
  const client = requireClient()
  const { data, error } = await client.auth.signUp({ email, password, options: { data: { username } } })
  if (error) throw error
  return data
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const { data, error } = await requireClient().auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signInWithGoogle(): Promise<void> {
  const publicAppUrl = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.replace(/\/$/, '')
  const { error } = await requireClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: publicAppUrl || window.location.origin } })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  const { error } = await requireClient().auth.signOut()
  if (error) throw error
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await requireClient().auth.getSession()
  if (error) throw error
  return data.session
}

export function onAuthStateChange(listener: (event: AuthChangeEvent, session: Session | null) => void): () => void {
  if (!supabase) return () => undefined
  const { data } = supabase.auth.onAuthStateChange(listener)
  return () => data.subscription.unsubscribe()
}
