import { useEffect, useMemo, useState } from 'react'
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CircleHelp, Clock3, Flag, Grid3X3, Lightbulb, Menu, MoreHorizontal, RotateCcw, Search, Settings, Swords, Undo2, Users, X } from 'lucide-react'
import { Board, Move, Point, SIZE, Stone, boardKey, coordinate, createBoard, tryMove } from './game'
import { AuthPanel } from './components/AuthPanel'
import { useAuth } from './hooks/useAuth'
import { isSupabaseConfigured } from './lib/supabase'
import { supabaseMatchService } from './services/matchService'

export type TimeControl = { mainMinutes: number; incrementSeconds: number; byoyomiSeconds: number; byoyomiPeriods: number; label: string }
export type OnlineGameRequest = { timeControl: TimeControl; boardSize: number; colorPreference: 'random' | Stone; reconnect?: boolean; newMatch?: boolean; startedAt?: string }
export type MatchStatus = 'searching' | 'playing' | 'finished' | 'resigned' | 'timeout' | 'cancelled'
export type PlayerInfo = { name: string; rank: string; avatar: string }
export type MatchState = { matchId: string; status: MatchStatus; blackPlayer: PlayerInfo; whitePlayer: PlayerInfo; activeColor: Stone; clocks: { black: number; white: number }; board: Board; moves: Move[]; captures: { black: number; white: number }; passes: number; result?: Stone | 'draw' }
export interface MatchService { findMatch(request: OnlineGameRequest): Promise<{ matchId: string; color?: Stone }>; cancelMatch(matchId: string): Promise<void>; submitMove(matchId: string, move: Move): Promise<void>; pass(matchId: string): Promise<void>; resign(matchId: string): Promise<void>; subscribe(matchId: string, listener: (state: MatchState) => void): () => void }
type ActiveMatch = { id: string; timeControl: TimeControl; board: Board; player: Stone; moves: Move[]; moveBoards: Board[]; captures: { black: number; white: number }; positionHistory: string[]; passes: number; byoPeriods: { black: number; white: number }; viewedMove: number | null; message: string; clocks: { black: number; white: number }; status: MatchStatus }

const nav = [{ label: 'Play', active: true }, { label: 'Learn', icon: BookOpen }, { label: 'Puzzles', icon: Lightbulb }, { label: 'Community', icon: Users }]
const presets: TimeControl[] = [{ mainMinutes: 10, incrementSeconds: 0, byoyomiSeconds: 0, byoyomiPeriods: 0, label: 'Blitz' }, { mainMinutes: 20, incrementSeconds: 0, byoyomiSeconds: 0, byoyomiPeriods: 0, label: 'Rapid' }, { mainMinutes: 30, incrementSeconds: 0, byoyomiSeconds: 0, byoyomiPeriods: 0, label: 'Classic' }]
const guest: PlayerInfo = { name: 'Opponent', rank: 'Unranked', avatar: 'OP' }

function App() {
  const [screen, setScreen] = useState<'home' | 'setup' | 'auth' | 'searching' | 'match'>('home')
  const auth = useAuth()
  useEffect(() => {
    const publicAppUrl = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.replace(/\/$/, '')
    if (!publicAppUrl || window.location.origin === publicAppUrl) return
    window.location.replace(`${publicAppUrl}${window.location.pathname}${window.location.search}${window.location.hash}`)
  }, [])
  const currentUser = useMemo<PlayerInfo>(() => {
    const metadata = auth.user?.user_metadata ?? {}
    const name = metadata.full_name || metadata.name || metadata.user_name || auth.user?.email?.split('@')[0] || 'Go player'
    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part: string) => part[0]).join('').toUpperCase() || 'GP'
    return { name, rank: metadata.rank || 'Unranked', avatar: initials }
  }, [auth.user, screen])
  const [timeControl, setTimeControl] = useState(presets[1])
  const [custom, setCustom] = useState({ minutes: 30, byoSeconds: 30, periods: 3 })
  const [board, setBoard] = useState<Board>(createBoard)
  const [player, setPlayer] = useState<Stone>('black')
  const [userColor, setUserColor] = useState<Stone>('black')
  const [opponent, setOpponent] = useState<PlayerInfo>({ name: 'Opponent', rank: 'Unranked', avatar: 'OP' })
  const [moves, setMoves] = useState<Move[]>([])
  const [moveBoards, setMoveBoards] = useState<Board[]>([])
  const [viewedMove, setViewedMove] = useState<number | null>(null)
  const [showMoveNumbers, setShowMoveNumbers] = useState(false)
  const [captures, setCaptures] = useState({ black: 0, white: 0 })
  const [history, setHistory] = useState<{ board: Board; player: Stone; captures: typeof captures }[]>([])
  const [positionHistory, setPositionHistory] = useState<string[]>([boardKey(createBoard())])
  const [passes, setPasses] = useState(0)
  const [status, setStatus] = useState<MatchStatus>('playing')
  const [clocks, setClocks] = useState({ black: 20 * 60, white: 20 * 60 })
  const [byoPeriods, setByoPeriods] = useState({ black: 0, white: 0 })
  const [matchId, setMatchId] = useState('local-match')
  const [localMode, setLocalMode] = useState(false)
  const [matchStarted, setMatchStarted] = useState(false)
  const [activeMatches, setActiveMatches] = useState<ActiveMatch[]>([])
  const [message, setMessage] = useState('Your turn')
  const [profileOpen, setProfileOpen] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)
  const starPoints = useMemo(() => new Set(['3,3', '3,9', '3,15', '9,3', '9,9', '9,15', '15,3', '15,9', '15,15']), [])
  const setMatchUrl = (id?: string) => { window.history.pushState({}, '', id ? `/${id}` : '/') }

  const resetGame = (tc = timeControl) => { const seconds = tc.mainMinutes * 60; setBoard(createBoard()); setPlayer('black'); setMoves([]); setMoveBoards([]); setViewedMove(null); setCaptures({ black: 0, white: 0 }); setHistory([]); setPositionHistory([boardKey(createBoard())]); setPasses(0); setStatus('playing'); setClocks({ black: seconds, white: seconds }); setByoPeriods({ black: tc.byoyomiPeriods, white: tc.byoyomiPeriods }); setMessage('Your turn') }
  const startLocal = () => { setLocalMode(true); setMatchId(`local-${Date.now()}`); setMatchStarted(true); setUserColor('black'); setOpponent(guest); resetGame(timeControl); setScreen('match') }
  const startOnline = async () => {
    if (!isSupabaseConfigured || !auth.user) { setScreen('auth'); return }
    setScreen('searching')
    try {
      const request: OnlineGameRequest = { timeControl, boardSize: SIZE, colorPreference: 'random', newMatch: true, startedAt: new Date().toISOString() }
      const first = await supabaseMatchService.findMatch(request)
      if (first.matchId.startsWith('queue:')) {
        const poll = window.setInterval(async () => {
          try { const next = await supabaseMatchService.findMatch({ ...request, reconnect: true }); if (!next.matchId.startsWith('queue:')) { window.clearInterval(poll); resetGame(timeControl); setPlayer(next.color ?? 'black'); setUserColor(next.color ?? 'black'); setMatchId(next.matchId); setMatchStarted(true); setScreen('match') } } catch { /* keep waiting while the queue is active */ }
        }, 2000)
        window.setTimeout(() => window.clearInterval(poll), 10 * 60 * 1000)
      } else { resetGame(timeControl); setPlayer(first.color ?? 'black'); setUserColor(first.color ?? 'black'); setMatchId(first.matchId); setMatchStarted(true); setScreen('match') }
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Could not find an opponent'); setScreen('setup') }
  }
  const cancelSearch = async () => { if (isSupabaseConfigured && auth.user) { try { await supabaseMatchService.cancelMatch('') } catch { /* keep the visible error state */ } }; setScreen('setup') }
  const setCustomControl = (value: { minutes: number; byoSeconds: number; periods: number }) => { setCustom(value); setTimeControl({ mainMinutes: value.minutes, incrementSeconds: 0, byoyomiSeconds: value.byoSeconds, byoyomiPeriods: value.periods, label: 'Custom' }) }

  useEffect(() => {
    const pathId = window.location.pathname.replace(/^\//, '')
    if (!auth.user || !isSupabaseConfigured || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pathId)) return
    let cancelled = false
    void supabaseMatchService.getMatch(pathId).then((online) => {
      if (cancelled) return
      const color = online.blackPlayer.id === auth.user?.id ? 'black' : 'white'
      setLocalMode(false); setUserColor(color); setOpponent(color === 'black' ? online.whitePlayer : online.blackPlayer); setMatchId(pathId); setBoard(online.board); setPlayer(online.activeColor); setMoves(online.moves); setCaptures(online.captures); setClocks(online.clocks); setPasses(online.passes); setStatus(online.status); setTimeControl(online.timeControl); setMatchStarted(true); setScreen('match')
    }).catch(() => { if (!cancelled) window.history.replaceState({}, '', '/') })
    return () => { cancelled = true }
  }, [auth.user?.id])

  useEffect(() => {
    if (!isSupabaseConfigured || !auth.user) return
    let cancelled = false
    const refresh = async () => {
      try {
        const matches = await supabaseMatchService.listActiveMatches()
        if (cancelled) return
        const onlineMatches = matches.map((match) => ({ id: match.matchId, timeControl: presets[1], board: match.board, player: match.activeColor, moves: match.moves, moveBoards: [], captures: match.captures, positionHistory: [boardKey(match.board)], passes: match.passes, byoPeriods: { black: 0, white: 0 }, viewedMove: null, message: match.activeColor === 'black' ? 'Black to play' : 'White to play', clocks: match.clocks, status: match.status }))
        setActiveMatches((current) => {
          return onlineMatches
        })
      } catch {
        // Keep already visible matches when a transient realtime/network request fails.
      }
    }
    void refresh()
    const refreshTimer = window.setInterval(() => { void refresh() }, 3000)
    return () => { cancelled = true; window.clearInterval(refreshTimer) }
  }, [auth.user])

  useEffect(() => {
    if (!['match', 'home'].includes(screen) || status !== 'playing') return
    const timer = window.setInterval(() => {
      setClocks((value) => { const next = Math.max(0, value[player] - 1); if (next === 0 && timeControl.byoyomiSeconds > 0 && byoPeriods[player] > 0) { setByoPeriods((p) => ({ ...p, [player]: p[player] - 1 })); return { ...value, [player]: timeControl.byoyomiSeconds } } if (next === 0) { setStatus('timeout'); setMessage(`${player === 'black' ? 'Black' : 'White'} ran out of time`) } return { ...value, [player]: next } })
      setActiveMatches((matches) => matches.map((match) => {
        if (match.id === matchId || match.status !== 'playing') return match
        const next = Math.max(0, match.clocks[match.player] - 1)
        return { ...match, clocks: { ...match.clocks, [match.player]: next } }
      }))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [screen, status, player, timeControl, byoPeriods])

  useEffect(() => {
    if (screen === 'match' && !matchId.startsWith('local')) setMatchUrl(matchId)
    if (screen !== 'match' && matchStarted && !matchId.startsWith('local')) setMatchUrl()
  }, [screen, matchId, matchStarted])

  useEffect(() => {
    if (!matchStarted || !matchId) return
    setActiveMatches((matches) => matches.map((match) => match.id === matchId ? { ...match, timeControl, board, player, moves, moveBoards, captures, positionHistory, passes, byoPeriods, viewedMove, message, clocks, status } : match))
  }, [matchStarted, matchId, timeControl, board, player, moves, moveBoards, captures, positionHistory, passes, byoPeriods, viewedMove, message, clocks, status])

  useEffect(() => {
    if (!isSupabaseConfigured || screen !== 'match' || !matchId) return
    return supabaseMatchService.subscribe(matchId, (next) => {
      const own = next.blackPlayer.id === auth.user?.id ? next.blackPlayer : next.whitePlayer
      const other = next.blackPlayer.id === auth.user?.id ? next.whitePlayer : next.blackPlayer
      setUserColor(own.id === next.blackPlayer.id ? 'black' : 'white'); setOpponent(other); setBoard(next.board); setPlayer(next.activeColor); setMoves(next.moves); setCaptures(next.captures); setClocks(next.clocks); setPasses(next.passes); setStatus(next.status); setMessage(next.status === 'playing' ? (next.activeColor === 'black' ? 'Black to play' : 'White to play') : 'Match complete'); setViewedMove(null)
    })
  }, [auth.user?.id, matchId, screen])

  const play = async (point: Point) => { if (screen !== 'match' || status !== 'playing' || viewedMove !== null) return; if (localMode) { const result = tryMove(board, point, player, positionHistory.at(-2)); if (!result.valid) { setMessage(result.reason); return } const nextMoves = [...moves, { ...point, player, captured: result.captured, label: coordinate(point) }]; setHistory((items) => [...items, { board, player, captures }]); setBoard(result.board); setMoves(nextMoves); setMoveBoards((items) => [...items, result.board]); setCaptures((value) => ({ ...value, [player]: value[player] + result.captured })); setPositionHistory((items) => [...items, boardKey(result.board)]); setPlayer(player === 'black' ? 'white' : 'black'); setPasses(0); return } setMessage('Submitting move…'); try { await supabaseMatchService.submitMove(matchId, { ...point, player, captured: 0, label: coordinate(point) }); const nextState = await supabaseMatchService.getMatch(matchId); setBoard(nextState.board); setMoves(nextState.moves); setCaptures(nextState.captures); setPlayer(nextState.activeColor); setClocks(nextState.clocks); setPasses(nextState.passes); setMessage(nextState.activeColor === 'black' ? 'Black to play' : 'White to play') } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Move was rejected') } }
  const undo = () => { if (!localMode || !history.length) return; const previous = history.at(-1)!; setHistory((items) => items.slice(0, -1)); setBoard(previous.board); setPlayer(previous.player); setCaptures(previous.captures); setMoves((items) => items.slice(0, -1)); setMoveBoards((items) => items.slice(0, -1)); setPositionHistory((items) => items.slice(0, -1)); setViewedMove(null) }
  const pass = async () => { if (status !== 'playing') return; if (localMode) { const nextPasses = passes + 1; setPasses(nextPasses); setPlayer(player === 'black' ? 'white' : 'black'); if (nextPasses >= 2) setStatus('finished'); return } setMessage('Passing…'); try { await supabaseMatchService.pass(matchId) } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Pass was rejected') } }
  const resign = async () => { if (status !== 'playing') return; if (localMode) { setStatus('resigned'); setMessage('Game resigned'); return } try { await supabaseMatchService.resign(matchId) } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Resign was rejected') } }
  const openMatch = async (id: string) => {
    if (isSupabaseConfigured && !id.startsWith('local')) {
      try {
        const online = await supabaseMatchService.getMatch(id)
        const color = online.blackPlayer.id === auth.user?.id ? 'black' : 'white'
        setUserColor(color); setOpponent(color === 'black' ? online.whitePlayer : online.blackPlayer); setMatchId(id); setBoard(online.board); setPlayer(online.activeColor); setMoves(online.moves); setCaptures(online.captures); setClocks(online.clocks); setPasses(online.passes); setStatus(online.status); setMessage(online.activeColor === 'black' ? 'Black to play' : 'White to play'); setScreen('match')
      } catch { setMessage('Could not reconnect to this match') }
      return
    }
    setMessage('Online server is not configured')
  }
  const displayedBoard = viewedMove === null ? board : moveBoards[viewedMove]
  if (auth.loading) return <div className="auth-loading">Loading your club account…</div>
  if (!isSupabaseConfigured) return <div className="app-shell auth-shell"><div className="auth-panel"><p className="eyebrow">SERVER CONNECTION REQUIRED</p><h1>Online server unavailable</h1><p>Configure the Supabase URL and anon key before starting a game.</p></div></div>
  return <div className="app-shell"><Header user={currentUser} profileOpen={profileOpen} setProfileOpen={setProfileOpen} mobileMenu={mobileMenu} setMobileMenu={setMobileMenu} goHome={() => setScreen('home')} />{screen === 'home' && <PlayHome activeMatches={activeMatches} currentMatchId={matchId} currentPlayer={player} currentClocks={clocks} onOpenMatch={openMatch} onOnline={() => setScreen(auth.user ? 'setup' : 'auth')} onLocal={startLocal} />}{screen === 'setup' && <TimeControlPicker selected={timeControl} setSelected={setTimeControl} custom={custom} setCustom={setCustomControl} onFind={startOnline} onBack={() => setScreen('home')} />}{screen === 'auth' && <AuthPanel onBack={() => setScreen('home')} onAuthenticated={() => setScreen('setup')} />}{screen === 'searching' && <Matchmaking timeControl={timeControl} onCancel={cancelSearch} />}{screen === 'match' && <MatchLayout board={displayedBoard} player={player} moves={moves} captures={captures} clocks={clocks} status={status} message={viewedMove === null ? message : `Reviewing move ${viewedMove + 1}`} timeControl={timeControl} starPoints={starPoints} matchId={matchId} viewedMove={viewedMove} user={currentUser} opponent={opponent} userColor={userColor} onViewMove={setViewedMove} onPlay={play} onPass={pass} onResign={resign} onUndo={undo} onNew={() => setScreen('setup')} onHome={() => setScreen('home')} />}</div>
}

function Header({ user, profileOpen, setProfileOpen, mobileMenu, setMobileMenu, goHome }: { user: PlayerInfo; profileOpen: boolean; setProfileOpen: (v: boolean) => void; mobileMenu: boolean; setMobileMenu: (v: boolean) => void; goHome: () => void }) { return <header className="topbar"><button className="mobile-menu" aria-label="Open navigation" onClick={() => setMobileMenu(!mobileMenu)}><Menu size={20} /></button><button className="brand" onClick={goHome}><span className="brand-mark">✦</span><span>KataGo <em>Club</em></span></button><nav className={mobileMenu ? 'nav open' : 'nav'}>{nav.map(({ label, icon: Icon, active }) => <button className={active ? 'nav-link active' : 'nav-link'} onClick={goHome} key={label}>{Icon && <Icon size={16} />}{label}</button>)}</nav><div className="top-actions"><button className="icon-button" aria-label="Help"><CircleHelp size={19} /></button><button className="profile-trigger" onClick={() => setProfileOpen(!profileOpen)} aria-expanded={profileOpen}><div className="avatar">{user.avatar}</div><span className="profile-name">{user.name}<ChevronDown size={15} /></span></button>{profileOpen && <div className="profile-menu"><div className="profile-menu-head"><div className="avatar large">{user.avatar}</div><div><strong>{user.name}</strong><small>{user.rank} · Online</small></div></div><div className="profile-stats"><div><strong>1,248</strong><small>Rating</small></div><div><strong>86</strong><small>Games</small></div><div><strong>142</strong><small>Puzzles</small></div></div><button className="profile-link">View full profile <ChevronDown size={15} /></button></div>}</div></header> }

function PlayHome({ activeMatches, currentMatchId, currentPlayer, currentClocks, onOpenMatch, onOnline, onLocal }: { activeMatches: ActiveMatch[]; currentMatchId: string; currentPlayer: Stone; currentClocks: { black: number; white: number }; onOpenMatch: (id: string) => void; onOnline: () => void; onLocal: () => void }) { return <main className="play-home"><div className="play-hero"><p className="eyebrow">PLAY GO</p><h1>Choose your game</h1><p>Find a match, sharpen your instincts, and make every stone count.</p></div><div className="play-grid"><button className="play-option primary" onClick={onOnline}><span className="play-option-icon"><Swords /></span><span><strong>Play online</strong><small>Find an opponent and play live</small></span><ChevronDown /></button><button className="play-option" onClick={onLocal}><span className="play-option-icon"><Users /></span><span><strong>Play locally</strong><small>Two players on this device</small></span><span className="soon">LOCAL</span></button><button className="play-option disabled" disabled><span className="play-option-icon"><Lightbulb /></span><span><strong>Play vs computer</strong><small>Coming soon</small></span><span className="soon">SOON</span></button></div><div className="play-footnote"><Clock3 size={16} /><span>Online games are server-authoritative; local games stay on this device.</span></div>{activeMatches.filter((match) => match.status === 'playing').length > 0 && <div className="active-match-list">{activeMatches.filter((match) => match.status === 'playing').map((match, index) => { const activePlayer = match.id === currentMatchId ? currentPlayer : match.player; const activeClocks = match.id === currentMatchId ? currentClocks : match.clocks; const time = `${Math.floor(activeClocks[activePlayer] / 60).toString().padStart(2, '0')}:${(activeClocks[activePlayer] % 60).toString().padStart(2, '0')}`; return <button className="active-match-card" type="button" key={match.id} onClick={() => onOpenMatch(match.id)}><span className="active-match-icon">{index + 1}</span><span className="active-match-copy"><strong>Active match {index + 1}</strong><small>{activePlayer === 'black' ? 'Black to play' : 'White to play'} · {time} · {match.timeControl.label}</small></span><span className="active-match-arrow">{match.id === currentMatchId ? 'Continue match →' : 'Open match →'}</span></button> })}</div>}</main> }

function TimeControlPicker({ selected, setSelected, custom, setCustom, onFind, onBack }: { selected: TimeControl; setSelected: (v: TimeControl) => void; custom: { minutes: number; byoSeconds: number; periods: number }; setCustom: (v: { minutes: number; byoSeconds: number; periods: number }) => void; onFind: () => void; onBack: () => void }) { return <main className="setup-page"><button className="back-link" onClick={onBack}>← Back to Play</button><div className="setup-card"><div className="setup-heading"><p className="eyebrow">PLAY ONLINE</p><h1>Choose a time control</h1><p>Set the pace for your next Go game.</p></div><div className="time-grid">{presets.map((preset) => <button className={selected.label === preset.label ? 'time-card selected' : 'time-card'} onClick={() => setSelected(preset)} key={preset.label}><span className="time-number">{preset.mainMinutes}<small>min</small></span><strong>{preset.label}</strong><span>Standard time</span></button>)}<button className={selected.label === 'Custom' ? 'time-card selected' : 'time-card'} onClick={() => setSelected({ mainMinutes: custom.minutes, incrementSeconds: 0, byoyomiSeconds: custom.byoSeconds, byoyomiPeriods: custom.periods, label: 'Custom' })}><span className="time-number">⚙</span><strong>Custom</strong><span>Main time + byoyomi</span></button></div>{selected.label === 'Custom' && <div className="custom-fields"><label>Main minutes<input type="number" min="1" value={custom.minutes} onChange={(e) => setCustom({ ...custom, minutes: Number(e.target.value) })} /></label><label>Byoyomi seconds<input type="number" min="5" value={custom.byoSeconds} onChange={(e) => setCustom({ ...custom, byoSeconds: Number(e.target.value) })} /></label><label>Periods<input type="number" min="1" value={custom.periods} onChange={(e) => setCustom({ ...custom, periods: Number(e.target.value) })} /></label></div>}<div className="setup-actions"><button className="find-button" onClick={onFind}><Search size={17} /> Find opponent</button></div></div></main> }

function Matchmaking({ timeControl, onCancel }: { timeControl: TimeControl; onCancel: () => void }) { return <main className="search-page"><div className="search-card"><div className="search-spinner"><Search size={27} /></div><p className="eyebrow">PLAY ONLINE</p><h1>Finding an opponent</h1><p>Looking for a Go player at your pace.</p><div className="search-time"><Clock3 size={16} /><strong>{timeControl.mainMinutes} min</strong><span>{timeControl.label}</span></div><button className="secondary-action" onClick={onCancel}><X size={16} /> Cancel search</button></div></main> }

function MatchLayout({ board, player, moves, captures, clocks, status, message, timeControl, starPoints, matchId, viewedMove, user, opponent, userColor, onViewMove, onPlay, onPass, onResign, onUndo, onNew, onHome }: { board: Board; player: Stone; moves: Move[]; captures: { black: number; white: number }; clocks: { black: number; white: number }; status: MatchStatus; message: string; timeControl: TimeControl; starPoints: Set<string>; matchId: string; viewedMove: number | null; user: PlayerInfo; opponent: PlayerInfo; userColor: Stone; onViewMove: (index: number | null) => void; onPlay: (point: Point) => void; onPass: () => void; onResign: () => void; onUndo: () => void; onNew: () => void; onHome: () => void }) {
  const [confirmResign, setConfirmResign] = useState(false)
  useEffect(() => {
    if (!matchId.startsWith('local')) return
    const undoButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('Undo'))
    undoButton?.removeAttribute('disabled')
  }, [matchId, moves.length])
  const [showMoveNumbers, setShowMoveNumbers] = useState(false)
  const lastMove = moves[moves.length - 1]
  const resultText = status === 'resigned' ? 'Game resigned' : status === 'timeout' ? 'Time expired' : 'Game over'
  const viewIndex = viewedMove === null ? moves.length - 1 : viewedMove
  const moveBy = (delta: number) => { const target = viewIndex + delta; onViewMove(delta > 0 && target >= moves.length - 1 ? null : Math.max(0, Math.min(moves.length - 1, target))) }
  const moveNumberAt = (row: number, col: number) => moves.slice(0, viewIndex + 1).reduce((found, move, index) => move.row === row && move.col === col ? index + 1 : found, 0)
  const blackPlayer = userColor === 'black' ? user : opponent
  const whitePlayer = userColor === 'white' ? user : opponent
  return <main className="match-page"><div className="match-topline"><button className="back-link" onClick={onHome}>← Exit match</button><span className="match-tag"><span className="live-dot">LIVE</span>{timeControl.mainMinutes} min · 19×19</span></div><div className="match-grid"><section className="match-board-column"><ClockCard player={whitePlayer} color="white" seconds={clocks.white} active={player === 'white' && status === 'playing'} /><div className="match-board-wrap"><div className="board" role="grid" aria-label="19 by 19 Go board">{board.map((row, rowIndex) => row.map((cell, colIndex) => { const key = `${rowIndex},${colIndex}`; const last = viewedMove === null && lastMove?.row === rowIndex && lastMove.col === colIndex; const number = cell ? moveNumberAt(rowIndex, colIndex) : 0; return <button disabled={viewedMove !== null} key={key} className="intersection" style={{ left: `${(colIndex / (SIZE - 1)) * 100}%`, top: `${(rowIndex / (SIZE - 1)) * 100}%` }} aria-label={coordinate({ row: rowIndex, col: colIndex })} onClick={() => onPlay({ row: rowIndex, col: colIndex })}>{starPoints.has(key) && !cell && <span className="star" />}{cell && <span className={`stone ${cell}`}>{number > 0 && <span className="stone-number">{number}</span>}{last && <span className="last-dot" />}</span>}</button> }))}</div></div><ClockCard player={blackPlayer} color="black" seconds={clocks.black} active={player === 'black' && status === 'playing'} /><MoveNavigation moves={moves} viewedMove={viewedMove} moveBy={moveBy} onViewMove={onViewMove} /><div className="match-status"><span className={`turn-pill ${player}`}><span className="mini-stone" />{status === 'playing' ? message : resultText}</span><span className="match-actions"><button onClick={onUndo} disabled>{Undo2 && <Undo2 size={15} />} Undo</button><button onClick={onPass} disabled={status !== 'playing'}><RotateCcw size={15} /> Pass</button><button className="danger-text" onClick={() => setConfirmResign(true)} disabled={status !== 'playing'}><Flag size={15} /> Resign</button></span></div>{status !== 'playing' && <div className="result-card"><strong>{resultText}</strong><span>Match complete</span><div><button className="secondary-action" onClick={onHome}>Back to Play</button><button className="find-button" onClick={onNew}>Play again</button></div></div>}</section><aside className="match-sidebar"><section className="match-panel"><div className="panel-heading"><h3>Game details</h3><Settings size={16} /></div><div className="match-summary"><span>Match ID</span><strong>{matchId}</strong></div><div className="match-summary"><span>Captured stones</span><strong>⚫ {captures.black} · ⚪ {captures.white}</strong></div></section><section className="match-panel chat-placeholder"><div className="panel-heading"><h3>Game chat</h3><MoreHorizontal size={16} /></div><p>Chat will be available in online matches.</p></section></aside></div>{confirmResign && <div className="modal-backdrop" role="presentation"><div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="resign-title"><button className="modal-close" aria-label="Close" onClick={() => setConfirmResign(false)}><X size={17} /></button><div className="modal-icon"><Flag size={20} /></div><h2 id="resign-title">Are you sure?</h2><p>Resigning will end this Go game.</p><div className="modal-actions"><button className="secondary-action" onClick={() => setConfirmResign(false)}>Keep playing</button><button className="danger-button" onClick={() => { setConfirmResign(false); onResign() }}>Resign game</button></div></div></div>}</main>
}

function MoveNavigation({ moves, viewedMove, moveBy, onViewMove }: { moves: Move[]; viewedMove: number | null; moveBy: (delta: number) => void; onViewMove: (index: number | null) => void }) {
  const disabled = !moves.length
  const [showMoveNumbers, setShowMoveNumbers] = useState(false)
  useEffect(() => { document.body.classList.toggle('hide-move-numbers', !showMoveNumbers); return () => document.body.classList.remove('hide-move-numbers') }, [showMoveNumbers])
  return <div className="move-navigation"><button aria-label="First move" onClick={() => onViewMove(0)} disabled={disabled || viewedMove === 0}><ChevronsLeft size={16} /></button><button aria-label="10 moves back" onClick={() => moveBy(-10)} disabled={disabled}><ChevronLeft size={16} /><small>10</small></button><button aria-label="Previous move" onClick={() => moveBy(-1)} disabled={disabled || viewedMove === 0}><ChevronLeft size={16} /></button><span>{viewedMove === null ? 'Live position' : `Move ${viewedMove + 1} / ${moves.length}`}</span><button aria-label="Next move" onClick={() => moveBy(1)} disabled={disabled || viewedMove === moves.length - 1}><ChevronRight size={16} /></button><button aria-label="10 moves forward" onClick={() => moveBy(10)} disabled={disabled}><small>10</small><ChevronRight size={16} /></button><button aria-label="Last move" onClick={() => onViewMove(null)} disabled={disabled || viewedMove === null}><ChevronsRight size={16} /></button><button className="move-number-toggle" aria-pressed={showMoveNumbers} onClick={() => setShowMoveNumbers((value) => !value)}>{showMoveNumbers ? 'Hide numbers' : 'Show numbers'}</button></div>
}

function ClockCard({ player, color, seconds, active }: { player: PlayerInfo; color: Stone; seconds: number; active: boolean }) { const display = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`; return <div className={active ? `clock-card active ${color}` : `clock-card ${color}`}><span className={`player-stone ${color}`} /><div><strong>{player.name}</strong><small>{player.rank}</small></div><time>{display}</time></div> }

export default App

