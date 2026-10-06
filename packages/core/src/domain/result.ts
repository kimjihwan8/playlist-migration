import type { SourceTrack, TargetTrack } from './track'

/**
 * 어떤 방법으로 찾았는가. 이 값의 분포가 곧 포폴의 정량 지표다
 * (ISRC 몇 %, 계단식이 몇 %를 더 건졌는가).
 * P1 은 'ISRC' 만 생산한다 — 나머지는 전략이 추가되면서 채워진다.
 */
export type MatchMethod =
  | 'ISRC'
  | 'FUZZY_AUTO'
  | 'FUZZY_MANUAL'
  | 'AI'
  /**
   * 매칭을 하지 않았다는 뜻.
   * 파일로 내보내는 타겟은 **대조할 카탈로그가 없다** — 소스 곡을 그대로 담는다.
   * 'MATCHED 100%' 로 보이지만 매칭 성능 지표에서는 빼야 하므로 이름을 따로 둔다.
   */
  | 'EXPORT'

/**
 * 왜 못 찾았는가. 자유 텍스트가 아니라 열거형이어야 집계와 분기가 된다
 * (ERD 의 error_code 를 error_message 와 분리한 것과 같은 이유).
 */
export type FailureReason =
  /** 소스 곡에 ISRC 가 없어서 조회할 키가 없었다 */
  | 'NO_SOURCE_ISRC'
  /** 조회는 했는데 타겟 카탈로그에 없었다 */
  | 'NOT_FOUND_IN_TARGET'

/**
 * 매칭 결과.
 *
 * ERD 의 match_status 에는 AMBIGUOUS 가 있지만 이 union 에는 아직 없다.
 * P1 의 전략(ISRC)은 애매한 결과를 만들 수 없다 — 코드가 같으면 같은 녹음이다.
 * AMBIGUOUS 는 점수제 fuzzy 가 들어오는 P3 에서 이 union 에 추가된다.
 * 미리 넣으면 호출자가 도달 불가능한 분기를 처리해야 한다.
 */
export type MatchResult =
  | {
      status: 'MATCHED'
      method: MatchMethod
      /** 0~1. ISRC 는 항상 1 — 식별자가 같으면 추측이 아니다. */
      confidence: number
      source: SourceTrack
      target: TargetTrack
    }
  | {
      status: 'FAILED'
      reason: FailureReason
      source: SourceTrack
    }
