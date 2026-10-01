import type { Account, Destination, Playlist, SourceTrack, TrackResult, TransferResult } from './types'
import type { PlatformId } from './platforms'

/**
 * 백엔드(apps/api)와 이야기하는 유일한 지점.
 * 화면 컴포넌트는 fetch 를 직접 호출하지 않는다 — P2 에서 폴링으로 바뀔 때
 * 고쳐야 할 파일이 여기 하나로 끝나게 하려는 것.
 */

export type Role = 'source' | 'target'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${code} (${status})`)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    // 세션이 httpOnly 쿠키라 자격증명을 실어 보내야 한다.
    // 프론트와 API 가 같은 출처(CloudFront 뒤 /api/*)라 same-origin 으로 충분하다.
    credentials: 'same-origin',
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    ...init,
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new ApiError(res.status, body.error ?? 'unknown')
  }
  return (await res.json()) as T
}

/**
 * OAuth 는 API 호출이 아니라 **페이지 이동**이다.
 * fetch 로 부르면 Spotify 동의 화면이 CORS 에 막히고, 애초에 사용자가 로그인할 화면을 봐야 한다.
 * 그래서 이 함수는 값을 돌려주지 않는다 — 브라우저가 떠나고, 콜백이 /source 나 /target 으로 되돌려보낸다.
 */
export function connectPlatform(platform: PlatformId, role: Role): Promise<never> {
  window.location.href = `/api/auth/login?platform=${platform}&role=${role}`
  // 페이지가 떠나는 중에 호출자가 로딩 상태를 유지하도록 영원히 대기한다.
  return new Promise<never>(() => {})
}

type MeResponse = { platform: PlatformId; account: { id: string; displayName: string; avatar: string | null } }

/** 콜백에서 돌아온 뒤 "누구로 연결됐는지"를 서버에 묻는다. 연결 안 됐으면 null. */
export async function fetchAccount(role: Role): Promise<{ platform: PlatformId; account: Account } | null> {
  try {
    const me = await request<MeResponse>(`/auth/me?role=${role}`)
    return { platform: me.platform, account: toAccount(me.account) }
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null
    throw err
  }
}

export async function disconnect(role: Role): Promise<void> {
  await request(`/auth/logout?role=${role}`, { method: 'POST' })
}

export function fetchPlaylists(): Promise<Playlist[]> {
  return request<Playlist[]>('/playlists')
}

export function fetchPlaylistTracks(playlistId: string): Promise<SourceTrack[]> {
  return request<SourceTrack[]>(`/playlists/${encodeURIComponent(playlistId)}/tracks`)
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
 * P1 은 POST 한 방이라 **결과가 끝에 한꺼번에 들어온다.**
 * 화면은 이미 "흘러들어오는" 모양으로 만들어 뒀으므로 P2 에서 폴링으로 바꾸면
 * 화면 코드를 고치지 않고도 진짜로 한 곡씩 채워진다 — 버릴 화면을 만들지 않으려고 이렇게 뒀다.
 *
 * P2: POST 가 job_id 만 주고 GET /api/transfer/:id 를 폴링한다.
 */
export async function runTransfer(
  req: TransferRequest,
  onProgress?: (p: Progress) => void,
): Promise<TransferResult> {
  // total 을 모르는 채로 시작한다(서버가 'all'을 펼쳐야 안다).
  // 화면은 progress.total 이 0이면 자기가 센 예상치를 쓴다.
  onProgress?.({ done: 0, total: 0, tracks: [] })

  const result = await request<TransferResult>('/transfer', {
    method: 'POST',
    body: JSON.stringify(req),
  })

  onProgress?.({ done: result.tracks.length, total: result.tracks.length, tracks: result.tracks })
  return result
}

/**
 * 프로필 사진이 없는 계정이 흔하다. 화면은 avatar 를 CSS background 로 그리므로
 * 사진이 있으면 이미지로, 없으면 계정 ID 에서 뽑은 색 두 개로 그라디언트를 만든다
 * (같은 계정이면 늘 같은 색이라 식별에 도움이 된다).
 */
function toAccount(a: { id: string; displayName: string; avatar: string | null }): Account {
  return {
    id: a.id,
    displayName: a.displayName,
    avatar: a.avatar
      ? `url("${a.avatar}") center/cover`
      : `linear-gradient(135deg, ${hue(a.id, 0)}, ${hue(a.id, 90)})`,
  }
}

function hue(seed: string, offset: number): string {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 360
  return `hsl(${(h + offset) % 360} 55% 45%)`
}
