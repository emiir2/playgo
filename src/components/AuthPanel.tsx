import { useState } from 'react'
import { signIn, signInWithGoogle, signUp } from '../services/authService'

export function AuthPanel({ onBack, onAuthenticated }: { onBack: () => void; onAuthenticated: () => void }) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => { setBusy(true); setError(''); try { if (mode === 'sign-up') await signUp(email, password, username); else await signIn(email, password); onAuthenticated() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Authentication failed') } finally { setBusy(false) } }
  const google = async () => { setBusy(true); setError(''); try { await signInWithGoogle() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Google sign-in failed'); setBusy(false) } }
  return <main className="auth-page"><button className="back-link" onClick={onBack}>← Back to Play</button><section className="auth-card"><p className="eyebrow">KATAGO CLUB</p><h1>{mode === 'sign-in' ? 'Welcome back' : 'Create your account'}</h1><p>Sign in to play live Go games and keep your matches synced.</p>{mode === 'sign-up' && <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>}<label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} /></label>{error && <p className="auth-error" role="alert">{error}</p>}<button className="find-button" disabled={busy || !email || !password || (mode === 'sign-up' && !username)} onClick={submit}>{busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}</button><button className="google-button" disabled={busy} onClick={google}>Continue with Google</button><button className="auth-switch" onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}>{mode === 'sign-in' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}</button></section></main>
}
