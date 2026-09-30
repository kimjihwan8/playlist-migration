import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import {
  AlertCircle,
  ArrowRight,
  ExternalLink,
  Heart,
  ListMusic,
  Loader2,
  Music2,
  RotateCcw,
} from 'lucide-react'
import { TopBar } from '../../components/TopBar'
import { Footer } from '../../components/Footer'
import { runTransfer, type Progress, type TransferItem } from '../../lib/api-client'
import { destinationOf } from '../../lib/destination'
import { platformById } from '../../lib/platforms'
import { pickedPlaylists, totalPicked } from '../../lib/selection'
import { useTransfer } from '../../lib/transfer-store'
import { FAILURE_LABEL, METHOD_LABEL } from '../../lib/types'
import type { MatchMethod, TrackResult } from '../../lib/types'
import './transfer.css'

type Filter = 'all' | 'matched' | 'failed'

const METHOD_COLOR: Record<MatchMethod, string> = {
  ISRC: 'var(--success)',
  FUZZY_AUTO: 'var(--accent)',
  FUZZY_MANUAL: '#6aa9d8',
}
const FAILED_COLOR = 'var(--surface-3)'

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0)

function ResultRow({ track, fresh }: { track: TrackResult; fresh: boolean }) {
  return (
    <div className={`result-row${fresh ? ' fresh' : ''}`}>
      <div className="source-cell">
        <div>
          <strong>{track.source.title}</strong>
          <span className="cell-sub">{track.source.artist}</span>
        </div>
      </div>

      <div className="arrow-cell">
        <ArrowRight size={16} />
      </div>

      <div className="target-cell">
        {track.status === 'FAILED' ? (
          <span className="failure-badge">
            <AlertCircle size={14} /> {FAILURE_LABEL[track.reason]}
          </span>
        ) : (
          <>
            <span className="album-art" style={{ background: track.target.cover }}>
              <Music2 size={17} />
            </span>
            <div>
              <strong>{track.target.title}</strong>
              <span className="cell-sub">
                {track.target.artist} · {track.target.album}
              </span>
            </div>
            <a href={track.target.url} aria-label={`${track.target.title} 타겟에서 열기`}>
              <ExternalLink size={16} />
            </a>
          </>
        )}
      </div>
    </div>
  )
}

/** 매칭 방법별 분해. 진행 중에도 실시간으로 자라고,
 *  P3에서 fuzzy가 붙으면 이 자리가 그대로 "ISRC-only → 계단식" 개선을 보여준다. */
function MethodBreakdown({ tracks }: { tracks: TrackResult[] }) {
  const counts = useMemo(() => {
    const acc: Record<string, number> = { ISRC: 0, FUZZY_AUTO: 0, FUZZY_MANUAL: 0, FAILED: 0 }
    for (const t of tracks) acc[t.status === 'MATCHED' ? t.method : 'FAILED']! += 1
    return acc
  }, [tracks])

  const total = tracks.length || 1
  const segments = (Object.keys(METHOD_COLOR) as MatchMethod[])
    .map((m) => ({ key: m, label: METHOD_LABEL[m], color: METHOD_COLOR[m], count: counts[m]! }))
    .filter((s) => s.count > 0)

  return (
    <>
      <div className="method-bar">
        {segments.map((s) => (
          <i key={s.key} style={{ width: `${(s.count / total) * 100}%`, background: s.color }} />
        ))}
        {counts.FAILED! > 0 && (
          <i style={{ width: `${(counts.FAILED! / total) * 100}%`, background: FAILED_COLOR }} />
        )}
      </div>
      <div className="method-legend">
        {segments.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />
            {s.label} <strong>{pct(s.count, total)}%</strong> <em>{s.count}곡</em>
          </span>
        ))}
        {counts.FAILED! > 0 && (
          <span>
            <i style={{ background: FAILED_COLOR }} />
            옮기지 못함 <strong>{pct(counts.FAILED!, total)}%</strong> <em>{counts.FAILED}곡</em>
          </span>
        )}
      </div>
    </>
  )
}

export function TransferScreen() {
  const navigate = useNavigate()
  const { playlists, picks, destinations, targetPlatform, targetAccount, result, set, reset } =
    useTransfer()

  const chosen = pickedPlaylists(playlists, picks)
  const expected = totalPicked(playlists, picks)
  const ready = chosen.length > 0 && Boolean(targetPlatform && targetAccount)

  const [progress, setProgress] = useState<Progress>({ done: 0, total: expected, tracks: [] })
  const [filter, setFilter] = useState<Filter>('all')
  // 마지막에 도착한 행만 애니메이션을 준다
  const seen = useRef(0)

  useEffect(() => {
    if (!ready || !targetPlatform || result) return
    let alive = true

    const items: TransferItem[] = chosen.map((p) => {
      const pick = picks[p.id]!
      return {
        playlistId: p.id,
        trackIds: pick.mode === 'all' ? 'all' : pick.trackIds,
        destination: destinationOf(p, destinations),
      }
    })

    runTransfer({ items, targetPlatform }, (p) => alive && setProgress(p)).then((done) => {
      if (alive) set({ result: done })
    })

    return () => {
      alive = false
    }
    // 진입 시 딱 한 번만 실행한다. store가 갱신돼도 재실행되면 안 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!ready) return <Navigate to="/" replace />

  const running = !result
  const tracks = result?.tracks ?? progress.tracks
  const matched = tracks.filter((t) => t.status === 'MATCHED')
  const failed = tracks.filter((t) => t.status === 'FAILED')
  const rate = pct(matched.length, tracks.length)
  const donePct = pct(progress.done, progress.total || expected)

  const visible = filter === 'all' ? tracks : filter === 'matched' ? matched : failed
  const freshFrom = seen.current
  seen.current = tracks.length

  const restart = () => {
    reset()
    navigate('/', { replace: true })
  }

  return (
    <div className="screen-shell">
      <TopBar>
        <button className="btn btn-ghost btn-sm" onClick={restart}>
          <RotateCcw size={14} /> 처음부터
        </button>
      </TopBar>

      <main className="page-main wide">
        <div className="transfer-heading">
          <div>
            <div className="eyebrow">{running ? '진행 중' : '이전 완료'}</div>
            <h1>{running ? <>곡을 옮기고 있어요<em>...</em></> : '이전 결과'}</h1>
            <p>
              {targetPlatform ? platformById(targetPlatform).name : ''} ·{' '}
              {targetAccount?.displayName} 계정
              {chosen.length > 1 && ` · 재생목록 ${chosen.length}개`}
            </p>
          </div>

          <div className="match-summary">
            <div
              className="donut"
              style={{
                background: `conic-gradient(var(--success) 0 ${rate}%, var(--surface-3) ${rate}% 100%)`,
              }}
            >
              <span>
                {rate}
                <small>%</small>
              </span>
            </div>
            <div>
              <strong>{running ? '지금까지 매칭률' : `${rate}% 매칭 성공`}</strong>
              <span>
                {tracks.length}곡 중 {matched.length}곡을 찾았어요
              </span>
            </div>
          </div>
        </div>

        {running ? (
          <div className="progress-block">
            <div className="progress-label">
              <Loader2 size={15} className="spin" />
              <span>곡을 찾는 중</span>
              <strong>
                {progress.total || expected}곡 중 {progress.done}곡
              </strong>
            </div>
            <div
              className="progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={donePct}
            >
              <div className="progress-value" style={{ width: `${donePct}%` }} />
            </div>
          </div>
        ) : (
          <div className="created-list">
            <div className="created-title">곡이 담긴 곳 {result.destinations.length}개</div>
            {result.destinations.map((d) => (
              <a className="created-row" key={d.label} href={d.url}>
                {d.kind === 'liked' ? <Heart size={16} fill="currentColor" /> : <ListMusic size={16} />}
                <span>{d.label}</span>
                <ExternalLink size={15} />
              </a>
            ))}
          </div>
        )}

        <div className="count-row">
          <div className="count-item">
            <strong>{tracks.length}</strong>
            <span>{running ? '처리한 곡' : '총 곡'}</span>
          </div>
          <div className="count-divider" />
          <div className="count-item good">
            <strong>{matched.length}</strong>
            <span>매칭됨</span>
          </div>
          <div className="count-divider" />
          <div className="count-item bad">
            <strong>{failed.length}</strong>
            <span>실패</span>
          </div>
        </div>

        <MethodBreakdown tracks={tracks} />

        <div className="results-card">
          <div className="filter-bar">
            <div className="tabs" role="tablist">
              {(
                [
                  ['all', '전체', tracks.length],
                  ['matched', '매칭됨', matched.length],
                  ['failed', '실패', failed.length],
                ] as const
              ).map(([key, label, count]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={filter === key}
                  className={filter === key ? 'active' : ''}
                  onClick={() => setFilter(key)}
                >
                  {label}
                  <span>{count}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="table-head">
            <span>원본 곡</span>
            <span />
            <span>매칭 결과</span>
          </div>

          <div>
            {visible.map((track, i) => (
              <ResultRow
                key={`${track.source.title}-${track.source.artist}-${i}`}
                track={track}
                fresh={filter === 'all' && i >= freshFrom}
              />
            ))}
            {visible.length === 0 && (
              <div className="waiting-state">
                {running ? (
                  <>
                    <Loader2 size={17} className="spin" /> 첫 결과를 기다리는 중이에요
                  </>
                ) : (
                  '표시할 곡이 없어요.'
                )}
              </div>
            )}
          </div>
        </div>

        {!running && (
          <div className="results-actions">
            <button className="btn btn-ghost" onClick={restart}>
              <RotateCcw size={16} /> 다시 하기
            </button>
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
