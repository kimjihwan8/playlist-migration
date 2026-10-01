import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Heart,
  Loader2,
  Minus,
  Music2,
  Search,
} from 'lucide-react'
import { BackLink } from '../../components/BackLink'
import { TopBar } from '../../components/TopBar'
import { Footer } from '../../components/Footer'
import { Stepper } from '../../components/Stepper'
import { fetchPlaylistTracks, fetchPlaylists } from '../../lib/api-client'
import { platformById } from '../../lib/platforms'
import { coverStyle } from '../../lib/cover'
import { isTrackPicked, pickedCount, totalPicked, type Pick } from '../../lib/selection'
import { useTransfer } from '../../lib/transfer-store'
import type { Playlist } from '../../lib/types'
import './browse.css'

function Checkbox({ state }: { state: 'on' | 'off' | 'partial' }) {
  return (
    <span className={`checkbox${state === 'on' ? ' on' : state === 'partial' ? ' partial' : ''}`}>
      {state === 'partial' ? (
        <Minus size={13} strokeWidth={3} />
      ) : (
        <Check size={13} strokeWidth={3} />
      )}
    </span>
  )
}

export function BrowseSourceScreen() {
  const navigate = useNavigate()
  const { hydrated, sourcePlatform, sourceAccount, playlists, tracksByPlaylist, picks, set, reset } =
    useTransfer()

  const [loading, setLoading] = useState(playlists.length === 0)
  // 여러 개를 동시에 펼쳐둘 수 있다 — 곡을 비교하며 고르는 게 이 화면의 목적이라서.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!sourceAccount || playlists.length > 0) return
    let alive = true
    fetchPlaylists().then((list) => {
      if (!alive) return
      setLoading(false)
      // 기본은 아무것도 선택 안 함 — 사용자가 고르는 게 이 화면의 목적이다.
      set({ playlists: list })
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceAccount])

  // 보관함("좋아하는 노래")은 항목이 고정이라 검색 대상이 아니다. 검색은 재생목록에만 건다.
  const libraryItems = playlists.filter((p) => p.kind === 'liked')
  const allPlaylistItems = playlists.filter((p) => p.kind === 'playlist')
  const playlistItems = useMemo(
    () => allPlaylistItems.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())),
    [allPlaylistItems, query],
  )

  const totalTracks = totalPicked(playlists, picks)
  const pickedListCount = playlists.filter((p) => pickedCount(p, picks[p.id]) > 0).length
  const allPicked = playlists.length > 0 && pickedListCount === playlists.length

  const setPick = (playlistId: string, pick: Pick | null) => {
    const next = { ...picks }
    if (pick) next[playlistId] = pick
    else delete next[playlistId]
    set({ picks: next })
  }

  const togglePlaylist = (p: Playlist) =>
    setPick(p.id, pickedCount(p, picks[p.id]) > 0 ? null : { mode: 'all' })

  const toggleAll = () =>
    set({
      picks: allPicked
        ? {}
        : Object.fromEntries(playlists.map((p) => [p.id, { mode: 'all' } as Pick])),
    })

  const toggleExpand = (playlistId: string) => {
    const next = new Set(expanded)
    if (next.has(playlistId)) next.delete(playlistId)
    else next.add(playlistId)
    setExpanded(next)

    if (!tracksByPlaylist[playlistId]) {
      fetchPlaylistTracks(playlistId).then((list) =>
        set({ tracksByPlaylist: { ...tracksByPlaylist, [playlistId]: list } }),
      )
    }
  }

  const toggleTrack = (p: Playlist, trackId: string) => {
    const all = tracksByPlaylist[p.id]?.map((t) => t.id) ?? []
    const current = picks[p.id]

    // 'all' 상태에서 곡 하나를 끄면 partial로 내려간다 (그 반대도 마찬가지)
    const selected = !current ? [] : current.mode === 'all' ? all : current.trackIds
    const next = selected.includes(trackId)
      ? selected.filter((id) => id !== trackId)
      : [...selected, trackId]

    if (next.length === 0) setPick(p.id, null)
    else if (next.length === all.length) setPick(p.id, { mode: 'all' })
    else setPick(p.id, { mode: 'partial', trackIds: next })
  }

  const switchAccount = () => {
    reset()
    navigate('/')
  }

  const renderRow = (p: Playlist) => {
    const pick = picks[p.id]
    const count = pickedCount(p, pick)
    const state = count === 0 ? 'off' : count === p.trackCount ? 'on' : 'partial'
    const tracks = tracksByPlaylist[p.id]
    const open = expanded.has(p.id)

    return (
      <div key={p.id}>
        {/* 행 전체가 펼치기 버튼이다. 체크박스만 이벤트를 가로챈다. */}
        <div
          className={`tree-row${count > 0 ? ' picked' : ''}`}
          role="button"
          tabIndex={0}
          aria-expanded={open}
          onClick={() => toggleExpand(p.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              toggleExpand(p.id)
            }
          }}
        >
          <button
            className="tree-pick"
            onClick={(e) => {
              e.stopPropagation()
              togglePlaylist(p)
            }}
            role="checkbox"
            aria-checked={state === 'on'}
            aria-label={`${p.name} 선택`}
          >
            <Checkbox state={state} />
          </button>

          <span className="tree-cover" style={coverStyle(p.cover)}>
            {p.kind === 'liked' ? <Heart size={19} fill="currentColor" /> : <Music2 size={19} />}
          </span>

          <span className="tree-meta">
            <strong>{p.name}</strong>
            <span>
              {count}/{p.trackCount}곡 선택됨
            </span>
          </span>

          <span className="tree-toggle" aria-hidden="true">
            {open ? <ChevronDown size={19} /> : <ChevronRight size={19} />}
          </span>
        </div>

        {open && (
          <div className="track-list">
            {!tracks ? (
              <div className="track-loading">
                <Loader2 size={15} className="spin" /> 곡을 불러오는 중
              </div>
            ) : (
              tracks.map((track) => (
                <button
                  key={track.id}
                  className="track-row"
                  role="checkbox"
                  aria-checked={isTrackPicked(pick, track.id)}
                  onClick={() => toggleTrack(p, track.id)}
                >
                  <Checkbox state={isTrackPicked(pick, track.id) ? 'on' : 'off'} />
                  <span className="track-info">
                    <strong>{track.title}</strong>
                    <span>{track.artist}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    )
  }

  if (!hydrated) return null
  if (!sourcePlatform || !sourceAccount) return <Navigate to="/" replace />

  return (
    <div className="screen-shell">
      <TopBar>
        <div className="account-chip">
          <span>{platformById(sourcePlatform).name}</span>
          <span>·</span>
          <span>{sourceAccount.displayName}</span>
        </div>
      </TopBar>

      <main className="page-main wide">
        <BackLink to="/">소스 플랫폼 다시 고르기</BackLink>

        <div className="intro">
          <div className="eyebrow">STEP 2</div>
          <h1>무엇을 옮길까요?</h1>
          <p>재생목록을 여러 개 골라도 되고, 펼쳐서 곡 단위로 빼도 돼요.</p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 30 }}>
          <Stepper current="선택" />
        </div>

        <div className="browse-actions">
          <span className="summary">
            <strong>{totalTracks}곡</strong> · 목록 {pickedListCount}개 선택됨
          </span>
          <button
            className="btn btn-primary"
            disabled={totalTracks === 0}
            onClick={() => navigate('/target')}
          >
            타겟 고르기 <ArrowRight size={17} />
          </button>
        </div>

        <div className="card browse-card">
          <div className="library-row">
            <button className="tree-pick" onClick={toggleAll} aria-label="전체 선택">
              <Checkbox state={allPicked ? 'on' : pickedListCount > 0 ? 'partial' : 'off'} />
            </button>
            <span className="account-avatar" style={{ background: sourceAccount.avatar }}>
              <Music2 size={19} />
            </span>
            <span className="library-meta">
              <strong>전체 보관함</strong>
              <span>{sourceAccount.displayName}</span>
            </span>
            <button className="switch-account" onClick={switchAccount}>
              계정 전환
            </button>
          </div>

          {loading ? (
            <div className="tree-empty">
              <Loader2 size={17} className="spin" /> 불러오는 중
            </div>
          ) : (
            <>
              {libraryItems.length > 0 && (
                <>
                  <div className="tree-section">보관함</div>
                  {libraryItems.map(renderRow)}
                </>
              )}

              <div className="tree-section">
                재생목록 <em>({allPlaylistItems.length})</em>
                <div className="search-field">
                  <Search size={15} />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="재생목록 찾기"
                    aria-label="재생목록 검색"
                  />
                </div>
              </div>

              {playlistItems.length > 0 ? (
                playlistItems.map(renderRow)
              ) : (
                <div className="tree-empty">검색 결과가 없어요.</div>
              )}
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
