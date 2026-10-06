import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import {
  ArrowRight,
  Lock,
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
import { ApiError, fetchPlaylistTracks, fetchPlaylists } from '../../lib/api-client'
import { platformById } from '../../lib/platforms'
import { coverStyle } from '../../lib/cover'
import { isPicked, isTrackPicked, pickedCount, totalPicked, type Pick } from '../../lib/selection'
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
  /**
   * 곡을 불러오지 못한 재생목록과 그 이유.
   * 'forbidden' = 내 재생목록이 아니라 읽을 권한이 없다(다시 시도해도 같다).
   * 'error'     = 그 밖의 실패(일시적일 수 있다).
   * 빈 재생목록과도 구분해야 한다 — 사용자에게 완전히 다른 상태다.
   */
  const [failed, setFailed] = useState<Record<string, 'forbidden' | 'error'>>({})

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
  // 못 읽는 재생목록은 "전체"에서 빠진다. 안 그러면 전체 선택이 영원히 완료되지 않아
  // 한 번 더 눌러도 해제가 안 된다.
  // 미리 아는 경우(owned=false)와 열어보고 알게 된 경우(403)를 함께 잠근다.
  const isLocked = (p: Playlist) => !p.owned || failed[p.id] === 'forbidden'
  const selectable = playlists.filter((p) => !isLocked(p))
  const pickedListCount = playlists.filter((p) => isPicked(picks[p.id])).length
  const allPicked = selectable.length > 0 && pickedListCount === selectable.length

  const setPick = (playlistId: string, pick: Pick | null) => {
    const next = { ...picks }
    if (pick) next[playlistId] = pick
    else delete next[playlistId]
    set({ picks: next })
  }

  const togglePlaylist = (p: Playlist) => {
    if (isLocked(p)) return
    setPick(p.id, isPicked(picks[p.id]) ? null : { mode: 'all' })
  }

  const toggleAll = () =>
    set({
      picks: allPicked
        ? {}
        : Object.fromEntries(selectable.map((p) => [p.id, { mode: 'all' } as Pick])),
    })

  const toggleExpand = (playlistId: string) => {
    // 읽을 수 없는 재생목록은 열지 않는다 — 열면 403 이고, 그걸 사용자에게 보여줄 이유가 없다.
    const target = playlists.find((p) => p.id === playlistId)
    if (target && isLocked(target)) return

    const next = new Set(expanded)
    if (next.has(playlistId)) next.delete(playlistId)
    else next.add(playlistId)
    setExpanded(next)

    if (!tracksByPlaylist[playlistId]) {
      fetchPlaylistTracks(playlistId)
        .then((list) => set({ tracksByPlaylist: { ...tracksByPlaylist, [playlistId]: list } }))
        .catch((err: unknown) => {
          // 실패해도 빈 목록으로 확정한다. 안 그러면 스피너가 영원히 돈다
          // — "로딩 중"과 "불러오지 못함"은 사용자에게 완전히 다른 상태다.
          const forbidden = err instanceof ApiError && err.forbidden
          setFailed((prev) => ({ ...prev, [playlistId]: forbidden ? 'forbidden' : 'error' }))
          set({ tracksByPlaylist: { ...tracksByPlaylist, [playlistId]: [] } })
          // 못 읽는 재생목록을 고른 채로 두면 다음 단계에서 빈 작업이 된다.
          if (forbidden) setPick(playlistId, null)
        })
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
    const locked = isLocked(p)

    return (
      <div key={p.id}>
        {/* 행 전체가 펼치기 버튼이다. 체크박스만 이벤트를 가로챈다. */}
        <div
          className={`tree-row${count > 0 ? ' picked' : ''}${locked ? ' locked' : ''}`}
          role="button"
          tabIndex={locked ? -1 : 0}
          aria-disabled={locked}
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
              {locked ? (
                /* 숨기지 않고 이유를 적는다 — 목록에서 사라지면 "왜 내 플리가 없지"가 된다 */
                <>
                  <Lock size={11} /> 내가 만든 재생목록만 가져올 수 있어요
                </>
              ) : (
                `${count}/${p.trackCount}곡 선택됨`
              )}
            </span>
          </span>

          {!locked && (
            <span className="tree-toggle" aria-hidden="true">
              {open ? <ChevronDown size={19} /> : <ChevronRight size={19} />}
            </span>
          )}
        </div>

        {open && (
          <div className="track-list">
            {!tracks ? (
              <div className="track-loading">
                <Loader2 size={15} className="spin" /> 곡을 불러오는 중
              </div>
            ) : failed[p.id] === 'forbidden' ? (
              <div className="track-loading">내가 만든 재생목록만 가져올 수 있어요</div>
            ) : failed[p.id] ? (
              <div className="track-loading">곡을 불러오지 못했어요</div>
            ) : tracks.length === 0 ? (
              <div className="track-loading">곡이 없는 재생목록이에요</div>
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
  // 세션이 없으면 조용히 되돌리지 않는다. 이유 없이 첫 화면으로 튕기면
  // 사용자도 개발자도 "로그인이 된 건지 안 된 건지" 를 알 수 없다.
  if (!sourcePlatform || !sourceAccount) return <Navigate to="/?error=not_connected" replace />

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
