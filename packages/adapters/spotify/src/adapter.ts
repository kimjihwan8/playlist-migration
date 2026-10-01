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

/** 재생목록 추가는 한 번에 100곡, 좋아하는 노래는 50곡 — 그래서 chunk 가 크기를 받는다. */
const PLAYLIST_ADD_LIMIT = 100
const LIBRARY_ADD_LIMIT = 50

export class SpotifyAdapter implements SourceAdapter, TargetAdapter {
  private me: SpotifyUser | null = null

  constructor(private readonly http: SpotifyHttp) {}

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
    return [likedPlaylist(me, liked.total ?? 0), ...playlists.map(toSourcePlaylist)]
  }

  async listTracks(playlistId: string): Promise<SourceTrack[]> {
    if (playlistId === LIKED_ID) {
      const saved = await this.pageAll<{ track: SpotifyTrack | null }>('/me/tracks?limit=50')
      return saved.flatMap((s, i) => (s.track ? [toSourceTrack(s.track, `liked:${i}`)] : []))
    }
    const items = await this.pageAll<{ track: SpotifyTrack | null }>(
      `/playlists/${playlistId}/tracks?limit=100`,
    )
    return items.flatMap((it, i) => {
      const t = it.track
      // 팟캐스트 에피소드와 삭제된 항목은 곡이 아니라 아예 제외한다.
      if (!t || (t.type && t.type !== 'track')) return []
      return [toSourceTrack(t, `${playlistId}:${i}`)]
    })
  }

  // ---- 타겟 ----

  async searchByIsrc(isrc: string): Promise<TargetTrack[]> {
    const q = encodeURIComponent(`isrc:${isrc}`)
    const res = await this.http.get<{ tracks?: Paged<SpotifyTrack> }>(
      `/search?q=${q}&type=track&limit=5`,
    )
    return (res.tracks?.items ?? []).flatMap((t) => {
      const mapped = toTargetTrack(t)
      return mapped ? [mapped] : []
    })
  }

  async write(destination: Destination, tracks: readonly TargetTrack[]): Promise<WrittenDestination> {
    return destination.type === 'liked'
      ? this.writeToLibrary(tracks)
      : this.writeToNewPlaylist(destination, tracks)
  }

  private async writeToNewPlaylist(
    destination: Extract<Destination, { type: 'new' }>,
    tracks: readonly TargetTrack[],
  ): Promise<WrittenDestination> {
    const me = await this.profile()
    const created = await this.http.post<SpotifyPlaylist & { external_urls?: { spotify?: string } }>(
      `/users/${me.id}/playlists`,
      {
        name: destination.name,
        description: destination.description,
        // Spotify 기본값이 공개다. 남의 개인 데이터를 옮기며 기본 공개는 사고라 명시적으로 끈다.
        public: false,
      },
    )

    // 순서대로 넣는다. 배치를 병렬로 보내면 도착 순서가 뒤집혀 재생목록 순서가 깨진다.
    for (const batch of chunk(tracks, PLAYLIST_ADD_LIMIT)) {
      await this.http.post(`/playlists/${created.id}/tracks`, { uris: batch.map((t) => t.uri) })
    }

    return {
      id: created.id,
      label: destination.name,
      kind: 'new',
      url: created.external_urls?.spotify ?? `https://open.spotify.com/playlist/${created.id}`,
    }
  }

  private async writeToLibrary(tracks: readonly TargetTrack[]): Promise<WrittenDestination> {
    // PUT /me/tracks 는 집합 연산이라 같은 곡을 두 번 넣어도 중복이 생기지 않는다
    // — 멱등성 처리가 따로 필요 없는 유일한 목적지.
    for (const batch of chunk(tracks, LIBRARY_ADD_LIMIT)) {
      await this.http.put('/me/tracks', { ids: batch.map((t) => t.id) })
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
