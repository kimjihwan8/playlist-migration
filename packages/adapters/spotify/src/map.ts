import type { SourcePlaylist, SourceTrack, TargetTrack } from '@pm/core'

/** Spotify 응답 중 우리가 실제로 읽는 부분만 적는다. 전체 스키마를 베껴둘 이유가 없다. */
export type SpotifyTrack = {
  id: string | null
  uri: string
  name: string
  type?: string
  is_local?: boolean
  duration_ms: number | null
  artists: Array<{ name: string }>
  album?: { name?: string; images?: Array<{ url: string }> } | null
  external_ids?: { isrc?: string } | null
  external_urls?: { spotify?: string } | null
}

export type SpotifyPlaylist = {
  id: string
  name: string
  owner?: { display_name?: string | null; id?: string } | null
  /** 2026-02 에 `tracks` → `items` 로 이름이 바뀌었다. 남의 재생목록에는 아예 오지 않는다. */
  items?: { total?: number } | null
  images?: Array<{ url: string }> | null
}

export type SpotifyUser = {
  id: string
  display_name?: string | null
  images?: Array<{ url: string }> | null
}

/**
 * 아티스트가 여럿이면 쉼표로 잇는다. 코어의 artist 가 문자열 하나인 것은
 * 아티스트를 독립 개체로 다루지 않기로 한 ERD 결정과 같은 선이다.
 */
const artistsOf = (t: SpotifyTrack) => t.artists.map((a) => a.name).join(', ')

export function toSourceTrack(t: SpotifyTrack, fallbackId: string): SourceTrack {
  return {
    // 로컬 파일은 id 가 null 이다. 버리지 않고 합성 ID 로 통과시킨다 —
    // 조용히 빼면 사용자가 센 곡 수와 결과 수가 어긋나고, 왜 사라졌는지 알 길이 없다.
    // ISRC 가 없으니 NO_SOURCE_ISRC 로 떨어지고, 그게 정직한 결과다.
    id: t.id ?? fallbackId,
    title: t.name,
    artist: artistsOf(t),
    album: t.album?.name ?? null,
    durationMs: t.duration_ms ?? null,
    isrc: t.external_ids?.isrc ?? null,
  }
}

export function toTargetTrack(t: SpotifyTrack): TargetTrack | null {
  if (!t.id) return null // 쓸 수 없는 곡은 후보가 될 수 없다
  return {
    id: t.id,
    uri: t.uri,
    title: t.name,
    artist: artistsOf(t),
    album: t.album?.name ?? null,
    durationMs: t.duration_ms ?? null,
    isrc: t.external_ids?.isrc ?? null,
    cover: t.album?.images?.[0]?.url ?? null,
    url: t.external_urls?.spotify ?? `https://open.spotify.com/track/${t.id}`,
  }
}

export function toSourcePlaylist(p: SpotifyPlaylist, meId: string): SourcePlaylist {
  return {
    id: p.id,
    name: p.name,
    owner: p.owner?.display_name ?? p.owner?.id ?? '알 수 없음',
    trackCount: p.items?.total ?? 0,
    cover: p.images?.[0]?.url ?? null,
    kind: 'playlist',
    // 소유자 ID 로만 판정한다. 표시 이름은 중복될 수 있어 신뢰할 수 없다.
    owned: Boolean(p.owner?.id) && p.owner?.id === meId,
  }
}

/** "좋아하는 노래"는 재생목록이 아니지만 곡 단위라 가상 재생목록으로 끼워넣는다. */
export const LIKED_ID = 'liked'

export function likedPlaylist(me: SpotifyUser, total: number): SourcePlaylist {
  return {
    id: LIKED_ID,
    name: '좋아하는 노래',
    owner: me.display_name ?? me.id,
    trackCount: total,
    cover: null,
    kind: 'liked',
    owned: true, // 본인 라이브러리다
  }
}
