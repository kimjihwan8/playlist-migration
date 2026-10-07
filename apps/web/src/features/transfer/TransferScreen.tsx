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
import { ApiError, runTransfer, type Progress, type TransferItem } from '../../lib/api-client'
import { coverStyle } from '../../lib/cover'
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
        <span className="album-art" style={coverStyle(track.source.cover)} aria-hidden="true">
          {!track.source.cover && <Music2 size={17} />}
        </span>
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
            {/* 커버는 URL 이다. CSS background 에 그대로 넣으면 무효가 되어 아무것도 안 보인다. */}
            <span className="album-art" style={coverStyle(track.target.cover)} aria-hidden="true">
              {!track.target.cover && <Music2 size={17} />}
            </span>
            <div>
              <strong>{track.target.title}</strong>
              <span className="cell-sub">
                {/* 앨범이 없는 곡이 있다 — 구분자만 덩그러니 남지 않게 함께 뺀다 */}
                {[track.target.artist, track.target.album].filter(Boolean).join(' · ')}
              </span>
            </div>
            {/* 외부 서비스로 나가는 링크는 새 탭으로 연다 — 여기서 떠나면
                 진행 중이던 결과(메모리에만 있다)가 날아간다.
                 rel 은 새 탭이 원래 탭을 조작하지 못하게 막는다. */}
            <a
              href={track.target.url}
              target="_blank"
              rel="noreferrer"
              aria-label={`${track.target.title} 타겟에서 열기 (새 탭)`}
            >
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
  // 이전이 실패하면 사용자에게 알린다. 안 그러면 진행률이 멈춘 채로 끝난다.
  const [failure, setFailure] = useState<string | null>(null)
  // 마지막에 도착한 행만 애니메이션을 준다
  const seen = useRef(0)
  // 이전은 한 번만 시작한다. 연결 상태를 확인하느라 effect 가 다시 돌아도 두 번 보내면 안 된다.
  const started = useRef(false)

  useEffect(() => {
    if (!ready || !targetPlatform || result || started.current) return
    started.current = true

    const items: TransferItem[] = chosen.map((p) => {
      const pick = picks[p.id]!
      return {
        playlistId: p.id,
        trackIds: pick.mode === 'all' ? 'all' : pick.trackIds,
        destination: destinationOf(p, destinations, targetPlatform ?? undefined),
      }
    })

    /**
     * **중간에 그만두지 않는다.**
     *
     * 보통은 cleanup 에서 `alive=false` 로 두고 결과를 버리지만, 여기서는 그러면 안 된다.
     * 이 요청은 조회가 아니라 **이미 타겟에 재생목록을 만들어 버린 작업**이다.
     * 결과를 버리면 서버에는 만들어졌는데 화면은 영원히 "진행 중"에 머문다.
     *
     * 특히 개발 모드의 StrictMode 는 마운트 직후 effect 를 한 번 더 돌리는데,
     * 그 사이 cleanup 이 먼저 실행되어 **성공한 작업의 결과를 통째로 날렸다.**
     * (중복 전송은 started 가 막으므로 여기서 또 막을 필요가 없다.)
     *
     * 언마운트 뒤 상태를 써도 괜찮다 — 쓰는 대상이 이 컴포넌트가 아니라
     * 위에서 살아 있는 store 다.
     */
    runTransfer({ items, targetPlatform }, setProgress)
      .then((done) => set({ result: done }))
      .catch((err: unknown) => {
        // 조용히 멈추면 "진행 중"에서 영원히 끝나지 않는다.
        setFailure(err instanceof ApiError ? err.code : 'unknown')
      })
    // ready 는 서버에 연결 상태를 묻고 나서야 true 가 된다 — 처음 한 프레임은 false 다.
    // 그래서 []가 아니라 [ready]이고, 중복 전송은 started 가 막는다.
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

  /** 처음부터 — 로그인까지 포함해 전부 비운다(다른 계정으로 갈아타는 경우). */
  const restart = () => {
    reset()
    navigate('/', { replace: true })
  }

  /**
   * 한 번 더 이전 — **로그인은 유지하고 고른 것만 비운다.**
   *
   * 전체 초기화로 보내면 방금 끝낸 사람에게 다시 로그인을 시키게 되고,
   * 반대로 아무것도 안 비우면 지난번 타겟이 그대로 골라져 있어 타겟 목록을 볼 수가 없다.
   * 둘 다 틀렸으므로 중간이 필요하다.
   */
  const again = () => {
    set({
      picks: {},
      destinations: {},
      result: null,
      targetPlatform: null,
      targetAccount: null,
    })
    navigate('/source', { replace: true })
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

        {failure && (
          <p className="transfer-failure" role="alert">
            <AlertCircle size={15} />
            <span>
              이전에 실패했어요{failure === 'not_connected' && ' — 계정 연결이 풀렸어요'}
              {failure === 'not_readable' && ' — 가져올 수 없는 재생목록이 섞여 있어요'}. 다시
              시도해 주세요.
            </span>
          </p>
        )}

        {running && !failure ? (
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
        ) : result ? (
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
                <a
                  className="created-row"
                  key={d.label}
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {d.kind === 'liked' ? <Heart size={16} fill="currentColor" /> : <ListMusic size={16} />}
                  <span>{d.label}</span>
                  <ExternalLink size={15} />
                </a>
              ),
            )}
          </div>
        ) : null}

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
            <button className="btn btn-primary" onClick={again}>
              <RotateCcw size={16} /> 한 번 더 옮기기
            </button>
            <button className="btn btn-ghost" onClick={restart}>
              다른 계정으로
            </button>
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
