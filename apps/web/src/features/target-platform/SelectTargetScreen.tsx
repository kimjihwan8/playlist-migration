import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { ArrowRight, Check, FileDown, Heart, ListMusic, Music2, RotateCcw } from 'lucide-react'
import { BackLink } from '../../components/BackLink'
import { TopBar } from '../../components/TopBar'
import { Footer } from '../../components/Footer'
import { Stepper } from '../../components/Stepper'
import { PlatformCard } from '../../components/PlatformCard'
import { PLATFORMS, platformById, type PlatformId } from '../../lib/platforms'
import { connectPlatform } from '../../lib/api-client'
import { coverStyle } from '../../lib/cover'
import { destinationOf, needsAccount } from '../../lib/destination'
import { pickedCount, pickedPlaylists, totalPicked } from '../../lib/selection'
import { useTransfer } from '../../lib/transfer-store'
import './target.css'

export function SelectTargetScreen() {
  const navigate = useNavigate()
  const {
    hydrated,
    sourcePlatform,
    playlists,
    picks,
    destinations,
    targetPlatform,
    targetAccount,
    set,
  } = useTransfer()
  const [connecting, setConnecting] = useState<PlatformId | null>(null)

  const chosen = pickedPlaylists(playlists, picks)
  const totalTracks = totalPicked(playlists, picks)

  const pick = async (id: PlatformId) => {
    // 파일로 내보내는 타겟은 연결할 계정이 없다 — 고르는 즉시 끝이다.
    if (!needsAccount(id)) {
      set({ targetPlatform: id, targetAccount: null })
      return
    }
    setConnecting(id)
    try {
      const account = await connectPlatform(id, 'target')
      set({ targetPlatform: id, targetAccount: account })
    } finally {
      setConnecting(null)
    }
  }

  if (!hydrated) return null
  if (!sourcePlatform || chosen.length === 0) return <Navigate to="/?error=nothing_picked" replace />

  const connected = Boolean(targetPlatform) && (!needsAccount(targetPlatform) || Boolean(targetAccount))

  return (
    <div className="screen-shell">
      <TopBar />

      <main className="page-main">
        <BackLink to="/source">선택 화면으로 돌아가기</BackLink>

        <div className="intro">
          <div className="eyebrow">STEP 3</div>
          <h1>
            <em>어디로</em> 옮길까요?
          </h1>
          <p>옮겨받을 서비스에 로그인하면 바로 이전을 시작해요.</p>
        </div>

        <div className="card target-card">
          <Stepper current="타겟" />

          <div className="transfer-summary">
            <ListMusic size={15} />
            <span>
              {platformById(sourcePlatform).name}에서 <strong>{totalTracks}곡</strong> · 목록{' '}
              <strong>{chosen.length}개</strong>
            </span>
          </div>

          {connected && targetPlatform ? (
            <>
              {/* 계정이 있는 타겟은 누구로 연결됐는지 보여주고, 파일 타겟은 고른 형식을 보여준다.
                  targetAccount 를 조건에 넣으면 계정 없는 타겟이 영원히 이 화면에 못 들어온다. */}
              <div className="connected-target">
                <span
                  className="slot-avatar"
                  style={targetAccount ? { background: targetAccount.avatar } : undefined}
                >
                  {targetAccount ? <Check size={19} /> : <FileDown size={18} />}
                </span>
                <div>
                  <strong>
                    {platformById(targetPlatform).name}
                    {targetAccount ? ` · ${targetAccount.displayName}` : ''}
                  </strong>
                  <span>{targetAccount ? '연결됨' : '로그인이 필요 없어요'}</span>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => set({ targetPlatform: null, targetAccount: null })}
                >
                  <RotateCcw size={13} /> 바꾸기
                </button>
              </div>

              <div className="name-list">
                <label>옮긴 곡을 어디에 넣을까요?</label>
                {chosen.map((p) => {
                  const dest = destinationOf(p, destinations, targetPlatform ?? undefined)
                  return (
                    <div className="name-row" key={p.id}>
                      <span className="name-cover" style={coverStyle(p.cover)}>
                        {p.kind === 'liked' ? <Heart size={14} fill="currentColor" /> : <Music2 size={14} />}
                      </span>
                      <span className="name-origin">
                        <strong>{p.name}</strong>
                        <span>{pickedCount(p, picks[p.id])}곡</span>
                      </span>
                      <ArrowRight size={14} />

                      {dest.type === 'file' ? (
                        /* 파일 타겟에는 "좋아하는 노래" 같은 목적지 개념이 없다.
                           고를 게 하나뿐인데 선택 상자를 두면 거짓 선택지가 된다. */
                        <span className="dest-fixed">CSV 파일</span>
                      ) : (
                        <select
                          className="dest-select"
                          value={dest.type}
                          aria-label={`${p.name}을 어디에 넣을지`}
                          onChange={(e) =>
                            set({
                              destinations: {
                                ...destinations,
                                [p.id]:
                                  e.target.value === 'liked'
                                    ? { type: 'liked' }
                                    : { type: 'new', name: p.name },
                              },
                            })
                          }
                        >
                          <option value="new">새 재생목록</option>
                          <option value="liked">좋아하는 노래</option>
                        </select>
                      )}

                      {dest.type === 'liked' ? (
                        <span className="liked-note">이미 담긴 곡은 그대로 둬요</span>
                      ) : (
                        <input
                          value={dest.name}
                          onChange={(e) =>
                            set({
                              destinations: {
                                ...destinations,
                                [p.id]: { ...dest, name: e.target.value },
                              },
                            })
                          }
                          placeholder={p.name}
                          aria-label={dest.type === 'file' ? `${p.name}의 파일 이름` : `${p.name}의 새 이름`}
                        />
                      )}
                    </div>
                  )
                })}
                <p className="name-hint">
                  {targetPlatform === 'csv'
                    ? 'title, artist, album, isrc, duration_ms 컬럼으로 내보내요. 매칭은 하지 않고 원본 그대로 담아요.'
                    : '새 재생목록은 비공개로 만들고, 설명에 원본 정보를 남겨요. 기존 재생목록에 합치는 건 아직 지원하지 않아요.'}
                </p>
              </div>

              <button
                className="btn btn-primary btn-block"
                style={{ marginTop: 18 }}
                onClick={() => navigate('/transfer')}
              >
                {totalTracks}곡 이전 시작 <ArrowRight size={16} />
              </button>
            </>
          ) : (
            <div className="platform-list">
              {PLATFORMS.filter((p) => p.roles.includes('target')).map((platform) => (
                <PlatformCard
                  key={platform.id}
                  platform={platform}
                  state={connecting === platform.id ? 'connecting' : 'idle'}
                  onClick={() => pick(platform.id)}
                />
              ))}
            </div>
          )}
        </div>

        {!connected && (
          <p className="scope-note">
            같은 서비스를 골라도 돼요 — 다른 계정으로 로그인하면 계정 간 이전이 됩니다.
          </p>
        )}
      </main>

      <Footer />
    </div>
  )
}
