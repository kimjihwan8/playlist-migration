import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import {
  AlertCircle,
  ArrowRight,
  FileDown,
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
import { destinationOf, needsAccount } from '../../lib/destination'
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
  // 매칭이 아니라 그대로 내보낸 것이라 중립색을 쓴다 — 성공처럼 보이면 지표를 오해하게 된다.
  EXPORT: '#8a8496',
}
const FAILED_COLOR = 'var(--surface-3)'

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0)

/** 응답에 담겨 온 파일을 브라우저가 내려받게 한다. 끝나면 URL 을 반드시 해제한다 — 안 하면 샌다. */
function download({ filename, mimeType, content }: { filename: string; mimeType: string; content: string }) {
  // \uFEFF(BOM): Excel 이 UTF-8 CSV 를 열 때 한글을 깨뜨리지 않게 하는 사실상 유일한 방법이다.
  const blob = new Blob(['\uFEFF', content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

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
  const { hydrated, playlists, picks, destinations, targetPlatform, targetAccount, result, set, reset } =
    useTransfer()

  const chosen = pickedPlaylists(playlists, picks)
  const expected = totalPicked(playlists, picks)
  // 계정이 없는 타겟(CSV)도 준비된 것이다. targetAccount 를 요구하면
  // 파일로 내보내기를 고른 사람이 영원히 첫 화면으로 튕긴다.
  const ready = chosen.length > 0 && Boolean(targetPlatform) && (!needsAccount(targetPlatform) || Boolean(targetAccount))

  const [progress, setProgress] = useState<Progress>({ done: 0, total: expected, tracks: [] })
  const [filter, setFilter] = useState<Filter>('all')
  // 마지막에 도착한 행만 애니메이션을 준다
  const seen = useRef(0)
  // 이전은 한 번만 시작한다. 연결 상태를 확인하느라 effect 가 다시 돌아도 두 번 보내면 안 된다.
  const started = useRef(false)

  useEffect(() => {
    if (!ready || !targetPlatform || result || started.current) return
    started.current = true
    let alive = true

    const items: TransferItem[] = chosen.map((p) => {
      const pick = picks[p.id]!
      return {
        playlistId: p.id,
        trackIds: pick.mode === 'all' ? 'all' : pick.trackIds,
        destination: destinationOf(p, destinations, targetPlatform ?? undefined),
      }
    })

    runTransfer({ items, targetPlatform }, (p) => alive && setProgress(p)).then((done) => {
      if (alive) set({ result: done })
    })

    return () => {
      alive = false
    }
    // ready 는 서버에 연결 상태를 묻고 나서야 true 가 된다 — 처음 한 프레임은 false 다.
    // 그래서 []가 아니라 [ready]이고, 중복 실행은 started 가 막는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  if (!hydrated) return null
  if (!ready) return <Navigate to="/?error=nothing_picked" replace />

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
              {targetAccount ? `${targetAccount.displayName} 계정` : '파일'}
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
            {result.destinations.map((d) =>
              d.download ? (
                /* 파일은 열 주소가 없다. 응답에 실려 온 내용을 그 자리에서 Blob 으로 만들어 내려준다
                   — 서버가 파일을 들고 있을 이유가 없고, P1 에 저장소가 없다는 사실과도 맞는다. */
                <button className="created-row" key={d.label} onClick={() => download(d.download!)}>
                  <FileDown size={16} />
                  <span>{d.download.filename}</span>
                  <span className="created-action">내려받기</span>
                </button>
              ) : (
                <a className="created-row" key={d.label} href={d.url}>
                  {d.kind === 'liked' ? <Heart size={16} fill="currentColor" /> : <ListMusic size={16} />}
                  <span>{d.label}</span>
                  <ExternalLink size={15} />
                </a>
              ),
            )}
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
