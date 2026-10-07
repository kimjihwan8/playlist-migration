/** 화면이 다루는 타입. 매칭 엔진(packages/core)이 생기면 도메인 타입은 거기서 가져오고
 *  여기엔 화면 전용(뷰모델) 타입만 남긴다. */

export type Account = {
  id: string
  displayName: string
  /** 프로필 이미지가 없는 계정이 흔해서 그라디언트로 대체한다 */
  avatar: string
}

export type Playlist = {
  id: string
  name: string
  owner: string
  trackCount: number
  cover: string | null
  /** 'liked' = "좋아하는 노래". 플레이리스트가 아니라 별도 컬렉션이지만
   *  곡 단위라 어댑터에서 가상 플레이리스트로 취급한다 — 코어·UI 변경 0. */
  kind: 'playlist' | 'liked'
  /** 내가 만든 재생목록인가. 아니면 곡을 읽을 수 없어 선택도 막는다. */
  owned: boolean
}

export type SourceTrack = {
  id: string
  title: string
  artist: string
  album: string | null
  durationMs: number | null
  cover: string | null
  /** null이면 ISRC 매칭을 건너뛰고 바로 실패한다(P1 기준) */
  isrc: string | null
}

/**
 * 옮긴 곡을 타겟의 어디에 넣을지.
 * - 'new'  : 새 재생목록을 만든다. 비공개로 만들어서 `playlist-modify-public` 스코프를 안 쓴다.
 * - 'liked': "좋아하는 노래"에 넣는다. 집합 연산이라 중복이 안 생겨 멱등성 처리가 따로 필요 없다.
 *            (기존 재생목록에 추가는 중복 제거가 필요해서 P2로 미뤘다)
 */
export type Destination =
  | { type: 'new'; name: string }
  | { type: 'liked' }
  /** 파일로 내려받는다. 계정도 권한도 필요 없는 유일한 목적지. */
  | { type: 'file'; name: string }

export type MatchMethod = 'ISRC' | 'FUZZY_AUTO' | 'FUZZY_MANUAL' | 'EXPORT'

export type FailureReason = 'NO_SOURCE_ISRC' | 'NOT_FOUND_IN_TARGET'

type TrackView = { title: string; artist: string; cover: string | null }

export type MatchedTrack = {
  status: 'MATCHED'
  method: MatchMethod
  source: TrackView
  target: TrackView & { album: string | null; url: string }
}

export type FailedTrack = {
  status: 'FAILED'
  reason: FailureReason
  source: TrackView
}

export type TrackResult = MatchedTrack | FailedTrack

export type TransferResult = {
  /** 타겟에 만들어진 재생목록 / 좋아하는 노래 / 내려받을 파일 */
  destinations: Array<{
    label: string
    kind: 'new' | 'liked' | 'file'
    url: string
    /** 파일 목적지일 때만. 서버가 들고 있을 이유가 없어 응답에 실려 온다. */
    download?: { filename: string; mimeType: string; content: string }
  }>
  tracks: TrackResult[]
}

/** 사용자 화면 문구. ISRC 같은 내부 용어는 노출하지 않는다. */
export const FAILURE_LABEL: Record<FailureReason, string> = {
  NO_SOURCE_ISRC: '곡 정보가 부족해요',
  NOT_FOUND_IN_TARGET: '타겟에 없는 곡이에요',
}

export const METHOD_LABEL: Record<MatchMethod, string> = {
  ISRC: '정확히 일치',
  FUZZY_AUTO: '비슷한 곡으로 찾음',
  FUZZY_MANUAL: '직접 고른 곡',
  // 매칭을 한 게 아니라 그대로 내보낸 것이다. 매칭률 지표와 섞이면 안 된다.
  EXPORT: '파일로 내보냄',
}
