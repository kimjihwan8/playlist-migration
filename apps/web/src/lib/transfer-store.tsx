import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { fetchAccount } from './api-client'
import type { PlatformId } from './platforms'
import type { Picks } from './selection'
import type { Account, Destination, Playlist, SourceTrack, TransferResult } from './types'

/** 화면들이 공유하는 이전 작업 상태.
 *  P2에서 job_id 기반 서버 상태로 옮겨가면 이 store는 얇아진다. */
type TransferState = {
  sourcePlatform: PlatformId | null
  sourceAccount: Account | null

  /** 소스에서 읽어온 목록. 타겟 화면에서도 이름을 써야 해서 store에 둔다. */
  playlists: Playlist[]
  /** 펼친 플레이리스트만 곡을 받아 캐시한다 */
  tracksByPlaylist: Record<string, SourceTrack[]>
  picks: Picks
  /** playlistId → 타겟의 어디에 넣을지. 없으면 화면이 기본값을 계산한다
   *  (소스가 "좋아하는 노래"면 타겟도 좋아하는 노래, 아니면 같은 이름의 새 재생목록) */
  destinations: Record<string, Destination>

  targetPlatform: PlatformId | null
  targetAccount: Account | null

  result: TransferResult | null
}

type TransferStore = TransferState & {
  /**
   * 서버에 연결 상태를 물어보기 전에는 false.
   * 이게 없으면 OAuth 에서 돌아온 직후 한 프레임 동안 "계정 없음"으로 보여
   * 화면이 첫 단계로 튕겨나간다.
   */
  hydrated: boolean
  set: (patch: Partial<TransferState>) => void
  reset: () => void
}

const EMPTY: TransferState = {
  sourcePlatform: null,
  sourceAccount: null,
  playlists: [],
  tracksByPlaylist: {},
  picks: {},
  destinations: {},
  targetPlatform: null,
  targetAccount: null,
  result: null,
}

/**
 * 선택 상태를 sessionStorage 에 둔다.
 *
 * 꼭 필요하다: 타겟 계정에 로그인하려면 브라우저가 Spotify 로 **떠났다가 돌아온다.**
 * 메모리에만 있으면 그 왕복에서 고른 재생목록과 곡이 전부 사라진다.
 * localStorage 가 아니라 sessionStorage 인 이유는 탭을 닫으면 남을 이유가 없어서다
 * (P2 에서 job_id 가 생기면 이 자리는 서버 상태로 넘어간다 — ERD 의 "P1/P2 차이" 표).
 */
// 저장 모양이 바뀌면 키를 올린다. 옛 데이터가 남아 'playlists 가 이미 있다'고
// 착각하면 서버를 부르지 않아, 목 데이터를 띄우거나 빈 화면을 보여준다.
const KEY = 'pm.transfer.v2'

/** 저장하지 않는 것: 계정은 서버가 진실이고, 곡 목록은 다시 받으면 되는 캐시다. */
type Persisted = Pick<TransferState, 'sourcePlatform' | 'playlists' | 'picks' | 'destinations' | 'targetPlatform'>

function load(): Partial<TransferState> {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Persisted) : {}
  } catch {
    // 프라이빗 모드나 저장소 차단 — 상태를 못 살려도 앱은 돌아야 한다.
    return {}
  }
}

function save(state: TransferState) {
  const slice: Persisted = {
    sourcePlatform: state.sourcePlatform,
    playlists: state.playlists,
    picks: state.picks,
    destinations: state.destinations,
    targetPlatform: state.targetPlatform,
  }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(slice))
  } catch {
    /* 저장 실패는 조용히 넘긴다 — 기능이 아니라 편의다 */
  }
}

const Ctx = createContext<TransferStore | null>(null)

export function TransferProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TransferState>(() => ({ ...EMPTY, ...load() }))
  const [hydrated, setHydrated] = useState(false)

  // 계정은 쿠키(서버)가 진실이다. 새로고침이든 OAuth 복귀든 여기서 다시 확인한다.
  useEffect(() => {
    let alive = true
    Promise.all([fetchAccount('source'), fetchAccount('target')])
      .then(([source, target]) => {
        if (!alive) return
        setState((prev) => ({
          ...prev,
          sourceAccount: source?.account ?? null,
          sourcePlatform: source?.platform ?? prev.sourcePlatform,
          targetAccount: target?.account ?? null,
          targetPlatform: target?.platform ?? prev.targetPlatform,
        }))
      })
      .finally(() => alive && setHydrated(true))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    save(state)
  }, [state])

  const value = useMemo<TransferStore>(
    () => ({
      ...state,
      hydrated,
      set: (patch) => setState((prev) => ({ ...prev, ...patch })),
      reset: () => {
        try {
          sessionStorage.removeItem(KEY)
        } catch {
          /* 무시 */
        }
        setState(EMPTY)
      },
    }),
    [state, hydrated],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTransfer(): TransferStore {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTransfer must be used inside <TransferProvider>')
  return ctx
}
