import type { Account, Destination, Playlist, SourceTrack, TrackResult, TransferResult } from './types'
import type { PlatformId } from './platforms'
import { MOCK_ACCOUNTS, MOCK_PLAYLISTS, mockMatch, mockTracksFor } from '../mocks/data'

/**
 * 백엔드(apps/api)가 아직 없어서 목으로 동작한다.
 * 실연동 시 이 파일의 본문만 갈아끼우면 화면 코드는 그대로다.
 * — 그래서 화면 컴포넌트는 절대 fetch를 직접 호출하지 않는다.
 */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

export type Role = 'source' | 'target'

/**
 * 실연동: `location.href = /api/auth/login?platform=spotify&role=source` 로 브라우저를 넘긴다.
 * 승인 → 콜백이 세션 쿠키를 심고 앱으로 되돌려보내며, 계정 정보는 GET /api/me 로 읽는다.
 * 즉 실제로는 Promise를 반환하지 않고 페이지가 떠난다 — 목에서는 그 왕복을 지연으로 흉내낸다.
 */
export async function connectPlatform(_platform: PlatformId, role: Role): Promise<Account> {
  await delay(800)
  return MOCK_ACCOUNTS[role]
}

/** 실연동: GET /api/playlists — "좋아하는 노래"도 가상 플레이리스트로 함께 내려온다 */
export async function fetchPlaylists(): Promise<Playlist[]> {
  await delay(500)
  return MOCK_PLAYLISTS
}

/** 실연동: GET /api/playlists/:id/tracks */
export async function fetchPlaylistTracks(playlistId: string): Promise<SourceTrack[]> {
  await delay(350)
  return mockTracksFor(playlistId)
}

export type TransferItem = {
  playlistId: string
  /** 'all'이면 서버가 소스에서 전체 곡을 읽어 옮긴다 — 클라이언트가 곡 목록을 미리 받을 필요가 없다 */
  trackIds: 'all' | string[]
  destination: Destination
}

export type TransferRequest = {
  items: TransferItem[]
  targetPlatform: PlatformId
}

/** 진행 상황 + 지금까지 나온 결과. 화면은 이걸 그대로 렌더링한다. */
export type Progress = { done: number; total: number; tracks: TrackResult[] }

/**
 * 실연동(P1): POST /api/transfer 한 방. 동기라서 결과가 끝에 한꺼번에 들어온다
 *             (화면은 같은 모양이고 마지막에 한 번 채워질 뿐이다).
 *   destination.type === 'new'   → POST /v1/users/{id}/playlists (public: false)
 *                                   description에 출처를 자동으로 남긴다:
 *                                   "원본: {소유자}의 '{플리명}' · {플랫폼}에서 이전 (날짜)"
 *   destination.type === 'liked' → PUT /v1/me/tracks (집합 연산이라 중복이 안 생긴다)
 * 실연동(P2): POST /api/transfer 가 job_id만 주고 GET /api/transfer/:id 를 폴링한다.
 *             폴링 응답에 곡별 상태가 들어오므로 그때부터 진짜로 한 곡씩 채워진다.
 */
export async function runTransfer(
  req: TransferRequest,
  onProgress?: (p: Progress) => void,
): Promise<TransferResult> {
  // 고른 곡을 펼친다 — 'all'이면 서버가 하는 일을 목에서 대신한다.
  const sources: SourceTrack[] = req.items.flatMap((item) => {
    const all = mockTracksFor(item.playlistId)
    return item.trackIds === 'all' ? all : all.filter((t) => item.trackIds.includes(t.id))
  })

  const total = sources.length
  const step = total > 60 ? 30 : 90
  const tracks: TrackResult[] = []

  onProgress?.({ done: 0, total, tracks: [] })
  for (const [index, track] of sources.entries()) {
    await delay(step)
    tracks.push(mockMatch(track, index))
    onProgress?.({ done: tracks.length, total, tracks: [...tracks] })
  }

  return {
    destinations: req.items.map((item) =>
      item.destination.type === 'liked'
        ? { label: '좋아하는 노래', kind: 'liked' as const, url: '#' }
        : { label: item.destination.name, kind: 'new' as const, url: '#' },
    ),
    tracks,
  }
}
