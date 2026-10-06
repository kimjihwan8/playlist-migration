import type { SourceTrack, TargetTrack } from './track'

/** "좋아하는 노래"는 재생목록이 아니지만 곡 단위라 가상 재생목록으로 취급한다 — 코어·UI 변경 0. */
export type PlaylistKind = 'playlist' | 'liked'

export type SourcePlaylist = {
  id: string
  name: string
  owner: string
  trackCount: number
  cover: string | null
  kind: PlaylistKind
  /**
   * 사용자가 **소유한** 재생목록인가.
   *
   * 목록에는 보이지만 곡은 못 읽는 재생목록이 존재한다 — 팔로우만 한 남의 재생목록,
   * 플랫폼이 만들어주는 추천 재생목록이 그렇다(Spotify 는 2026-02 부터 소유·협업
   * 재생목록의 항목만 내준다). 그걸 모르고 열면 403 이 난다.
   *
   * 즉 "보인다"와 "읽을 수 있다"가 다르고, 그 차이를 도메인이 들고 있어야
   * 화면이 미리 막을 수 있다. 실패한 뒤 사과하는 것보다 낫다.
   */
  owned: boolean
}

/** 옮긴 곡을 타겟의 어디에 넣을지. */
export type Destination =
  /** 새 재생목록을 만든다. 비공개로 만들어 `playlist-modify-public` 스코프를 안 쓴다. */
  | { type: 'new'; name: string; description: string }
  /** "좋아하는 노래"에 넣는다. 집합 연산이라 중복이 안 생겨 멱등성 처리가 따로 필요 없다. */
  | { type: 'liked' }

export type WrittenDestination = {
  /** 타겟에서 만들어졌거나 쓰여진 곳. liked 는 플랫폼이 ID 를 주지 않아 null. */
  id: string | null
  label: string
  kind: 'new' | 'liked'
  url: string
}

/** 소스에서 읽는 쪽. */
export interface SourceAdapter {
  listPlaylists(): Promise<SourcePlaylist[]>
  listTracks(playlistId: string): Promise<SourceTrack[]>
}

/**
 * 매칭 엔진이 타겟을 조회할 때 쓰는 좁은 창구.
 *
 * 전체 TargetAdapter 가 아니라 이 인터페이스만 받는 이유: 매칭은 "찾기"만 하고
 * 쓰기 권한이 필요 없다. 좁게 받으면 테스트에서 가짜를 만들기도 쉽다
 * (listPlaylists 나 createPlaylist 를 흉내낼 필요가 없다).
 */
export interface SearchPort {
  /**
   * ISRC 로 타겟에서 찾는다.
   *
   * ISRC 검색을 지원하지 않는 플랫폼(YouTube Music)은 **항상 빈 배열**을 돌려준다.
   * 이것은 인터페이스 위반이 아니라 계단식이 자연스럽게 흡수하는 정상 흐름이다.
   * 단건+null 로 두면 "못 찾음"과 "지원 안 함"이 구분되지 않는다.
   */
  searchByIsrc(isrc: string): Promise<TargetTrack[]>
}

/** 타겟에 쓰는 쪽. */
export interface TargetAdapter extends SearchPort {
  /**
   * 찾아낸 곡을 목적지에 쓴다. 식별자 문자열이 아니라 TargetTrack 을 통째로 받는 이유:
   * 플랫폼마다 쓰기에 요구하는 식별자가 다르다(Spotify 는 재생목록엔 uri, 좋아하는 노래엔 id).
   * 한쪽만 넘기면 어댑터가 자기 URI 를 역파싱해야 하고, 그 규칙이 코어 쪽 가정이 되어버린다.
   */
  write(destination: Destination, tracks: readonly TargetTrack[]): Promise<WrittenDestination>
}
