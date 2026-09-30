import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
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

const Ctx = createContext<TransferStore | null>(null)

export function TransferProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TransferState>(EMPTY)

  const value = useMemo<TransferStore>(
    () => ({
      ...state,
      set: (patch) => setState((prev) => ({ ...prev, ...patch })),
      reset: () => setState(EMPTY),
    }),
    [state],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTransfer(): TransferStore {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTransfer must be used inside <TransferProvider>')
  return ctx
}
