/**
 * 실패 이분법 — 이 프로젝트의 재시도 정책 전부가 여기서 갈린다.
 *
 *  - TRANSIENT : 같은 요청을 나중에 다시 보내면 성공할 수 있다 → 백오프 후 재시도
 *  - PERMANENT : 몇 번을 보내도 결과가 같다 → 즉시 FAILED, 사유를 사용자에게 보여준다
 *
 * 이 구분이 없으면 "곡을 못 찾음"에 3번 재시도하며 레이트리밋을 깎고,
 * 반대로 429 를 영구 실패로 처리해 멀쩡한 곡을 버린다.
 */
export type FailureKind = 'TRANSIENT' | 'PERMANENT'

/** ERD 의 job_track.transfer_status */
export type TransferStatus = 'PENDING' | 'SUCCESS' | 'FAILED'

/**
 * HTTP 상태코드로 가른다.
 *
 * 429(레이트리밋)와 5xx(서버 장애)는 시간이 해결한다. 408/425 도 같다.
 * 401 은 토큰 만료라 **재시도가 아니라 갱신**이 답이므로 여기서 TRANSIENT 로 보지 않는다
 * — 갱신 로직을 거치지 않고 같은 토큰으로 재시도하면 영원히 401 이다.
 * 4xx 나머지(400 잘못된 요청, 403 권한 없음, 404 없음)는 다시 보내도 같다.
 */
export function classifyHttpStatus(status: number): FailureKind {
  if (status === 429 || status === 408 || status === 425) return 'TRANSIENT'
  if (status >= 500) return 'TRANSIENT'
  return 'PERMANENT'
}

/** 네트워크 끊김·타임아웃처럼 응답조차 못 받은 경우는 항상 일시적이다. */
export const NETWORK_FAILURE: FailureKind = 'TRANSIENT'

/**
 * 재시도 간격(ms). 지수 백오프 + 지터.
 *
 * 지터를 넣는 이유: 같은 순간에 429 를 맞은 요청들이 똑같은 간격으로 깨어나면
 * 그대로 다시 몰려가 또 429 를 맞는다(thundering herd).
 *
 * 서버가 Retry-After 를 줬다면 그쪽이 항상 우선이다 — 추측보다 통보가 정확하다.
 */
export function backoffMs(attempt: number, retryAfterSec?: number, random = Math.random): number {
  if (retryAfterSec !== undefined) return Math.ceil(retryAfterSec * 1000)
  const base = Math.min(1000 * 2 ** attempt, 30_000)
  return Math.round(base * (0.5 + random() * 0.5))
}
