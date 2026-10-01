/**
 * 플랫폼 중립 곡 표현. 어댑터가 각 플랫폼의 응답을 이 모양으로 번역해서 넘기고,
 * 매칭 엔진은 이 두 타입만 본다 — 그래서 코어에 `if (platform === ...)` 가 없다.
 */

/** 소스에서 읽어온 곡. 옮길 대상. */
export type SourceTrack = {
  /** 소스 플랫폼의 트랙 ID. 화면에서 곡을 골라 보낼 때의 키. */
  id: string
  title: string
  artist: string
  album: string | null
  durationMs: number | null
  /**
   * 국제표준녹음코드. null 이 흔하다 — 사용자가 올린 로컬 파일, 일부 지역 카탈로그.
   * null 이면 P1 에서는 매칭 불가(NO_SOURCE_ISRC)이고, P3 의 계단식 fuzzy 가 받아낸다.
   */
  isrc: string | null
}

/** 타겟에서 찾아낸 곡. 쓰기와 화면 표시에 쓴다. */
export type TargetTrack = {
  id: string
  /** 타겟에 쓸 때 쓰는 식별자. Spotify 는 `spotify:track:...` 형태라 id 와 다르다. */
  uri: string
  title: string
  artist: string
  album: string | null
  durationMs: number | null
  isrc: string | null
  /** 결과 화면용. 없는 경우가 있어 nullable. */
  cover: string | null
  /** 사람이 눌러서 열 수 있는 링크 */
  url: string
}
