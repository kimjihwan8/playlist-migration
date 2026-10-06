import {
  chunk,
  type Destination,
  type SourceAdapter,
  type SourcePlaylist,
  type SourceTrack,
  type TargetAdapter,
  type TargetTrack,
  type WrittenDestination,
} from '@pm/core'
import type { SpotifyHttp } from './http'
import {
  LIKED_ID,
  likedPlaylist,
  toSourcePlaylist,
  toSourceTrack,
  toTargetTrack,
  type SpotifyPlaylist,
  type SpotifyTrack,
  type SpotifyUser,
} from './map'

type Paged<T> = { items: T[]; next: string | null; total?: number }

/** 어댑터가 실제로 쓰는 것만. 테스트에서 가짜를 끼우기 쉽게 좁게 받는다. */
export type HttpClient = Pick<SpotifyHttp, 'get' | 'post' | 'put'>

/**
 * 배치 한도. **두 목적지가 서로 다르다** — 그래서 chunk 가 크기를 인자로 받는다.
 *   재생목록 추가: 100개 (POST /playlists/{id}/items)
 *   라이브러리 저장: 40개 (PUT /me/library)
 */
const PLAYLIST_ADD_LIMIT = 100
const LIBRARY_ADD_LIMIT = 40

/**
 * ⚠️ 2026-02 Web API 마이그레이션 반영본.
 * 구 엔드포인트(`/playlists/{id}/tracks`, `POST /users/{id}/playlists`, `PUT /me/tracks`)는
 * 2026-03-09 부터 **모든 호출자에게 403** 이다. 개발 모드 제한이 아니라 전면 폐기다.
 */
export class SpotifyAdapter implements SourceAdapter, TargetAdapter {
  private me: SpotifyUser | null = null

  constructor(private readonly http: HttpClient) {}

  async profile(): Promise<SpotifyUser> {
    this.me ??= await this.http.get<SpotifyUser>('/me')
    return this.me
  }

  // ---- 소스 ----

  async listPlaylists(): Promise<SourcePlaylist[]> {
    const [me, liked, playlists] = await Promise.all([
      this.profile(),
      this.http.get<Paged<unknown>>('/me/tracks?limit=1'),
      this.pageAll<SpotifyPlaylist>('/me/playlists?limit=50'),
    ])
    // 좋아하는 노래를 맨 앞에 — 계정 이사에서 가장 자주 옮기는 대상이다.
    return [likedPlaylist(me, liked.total ?? 0), ...playlists.map((p) => toSourcePlaylist(p, me))]
  }

  async listTracks(playlistId: string): Promise<SourceTrack[]> {
    if (playlistId === LIKED_ID) {
      // GET /me/tracks 는 마이그레이션에서 살아남았다(쓰기만 /me/library 로 옮겨갔다).
      const saved = await this.pageAll<{ track: SpotifyTrack | null }>('/me/tracks?limit=50')
      return saved.flatMap((s, i) => (s.track ? [toSourceTrack(s.track, `liked:${i}`)] : []))
    }
    // ⚠️ /items 는 **사용자가 소유하거나 협업 중인 재생목록만** 읽힌다.
    // 남이 만든 재생목록을 팔로우만 한 경우에는 403 이 난다.
    // 응답 필드도 `track` → `item` 으로 바뀌었다(2026-02). `/me/tracks` 는 그대로 `track` 이다.
    const items = await this.pageAll<{ item: SpotifyTrack | null }>(
      `/playlists/${playlistId}/items?limit=100`,
    )
    return items.flatMap((it, i) => {
      const t = it.item
      // 팟캐스트 에피소드와 삭제된 항목은 곡이 아니라 아예 제외한다.
      if (!t || (t.type && t.type !== 'track')) return []
      return [toSourceTrack(t, `${playlistId}:${i}`)]
    })
  }

  // ---- 타겟 ----

  async searchByIsrc(isrc: string): Promise<TargetTrack[]> {
    const q = encodeURIComponent(`isrc:${isrc}`)
    // limit 최대값이 50 → 10 으로 줄었다(2026-02). 5 는 그 안이라 그대로 둔다.
    const res = await this.http.get<{ tracks?: Paged<SpotifyTrack> }>(
      `/search?q=${q}&type=track&limit=5`,
    )
    return (res.tracks?.items ?? []).flatMap((t) => {
      const mapped = toTargetTrack(t)
      return mapped ? [mapped] : []
    })
  }

  async write(destination: Destination, tracks: readonly TargetTrack[]): Promise<WrittenDestination> {
    switch (destination.type) {
      case 'liked':
        return this.writeToLibrary(tracks)
      case 'new':
        return this.writeToNewPlaylist(destination, tracks)
      default:
        // 파일 목적지는 CSV 어댑터의 몫이다. 여기까지 왔다면 타겟을 잘못 고른 것이다.
        throw new Error(`Spotify 타겟이 다룰 수 없는 목적지: ${destination.type}`)
    }
  }

  private async writeToNewPlaylist(
    destination: Extract<Destination, { type: 'new' }>,
    tracks: readonly TargetTrack[],
  ): Promise<WrittenDestination> {
    // POST /users/{id}/playlists 는 폐기됐다 → /me/playlists.
    // 어차피 "쓰는 토큰이 곧 소유자" 였으므로 경로에서 사용자 ID 가 사라진 것이 더 정직하다.
    const created = await this.http.post<SpotifyPlaylist & { external_urls?: { spotify?: string } }>(
      '/me/playlists',
      {
        name: destination.name,
        description: destination.description,
        // Spotify 기본값이 공개다. 남의 개인 데이터를 옮기며 기본 공개는 사고라 명시적으로 끈다.
        public: false,
      },
    )

    // 순서대로 넣는다. 배치를 병렬로 보내면 도착 순서가 뒤집혀 재생목록 순서가 깨진다.
    for (const batch of chunk(tracks, PLAYLIST_ADD_LIMIT)) {
      await this.http.post(`/playlists/${created.id}/items`, { uris: batch.map((t) => t.uri) })
    }

    return {
      id: created.id,
      label: destination.name,
      kind: 'new',
      url: created.external_urls?.spotify ?? `https://open.spotify.com/playlist/${created.id}`,
    }
  }

  private async writeToLibrary(tracks: readonly TargetTrack[]): Promise<WrittenDestination> {
    // PUT /me/library 는 집합 연산이라 같은 곡을 두 번 넣어도 중복이 생기지 않는다
    // — 멱등성 처리가 따로 필요 없는 유일한 목적지.
    // 본문이 아니라 **쿼리 파라미터**로 URI 를 콤마로 이어 보낸다(한 번에 40개).
    for (const batch of chunk(tracks, LIBRARY_ADD_LIMIT)) {
      const uris = encodeURIComponent(batch.map((t) => t.uri).join(','))
      await this.http.put(`/me/library?uris=${uris}`)
    }
    return {
      id: null,
      label: '좋아하는 노래',
      kind: 'liked',
      url: 'https://open.spotify.com/collection/tracks',
    }
  }

  /** next 링크를 따라 끝까지 읽는다. 1만 곡짜리 재생목록이면 100번 호출한다. */
  private async pageAll<T>(firstPath: string): Promise<T[]> {
    const out: T[] = []
    let path: string | null = firstPath
    while (path) {
      const page: Paged<T> = await this.http.get<Paged<T>>(path)
      out.push(...page.items)
      path = page.next
    }
    return out
  }
}
