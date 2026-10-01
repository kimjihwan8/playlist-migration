import type { SearchPort } from '../domain/adapter'
import type { FailureReason, MatchResult } from '../domain/result'
import type { SourceTrack } from '../domain/track'
import { isrcStrategy, normalizeIsrc } from './isrc'
import type { MatchStrategy } from './strategy'

/**
 * 계단식. **순서가 여기 있다는 것이 이 패키지의 요점이다.**
 *
 * P3 에서 fuzzy 가, 그 뒤에 AI 가 이 배열에 한 줄씩 붙는다. 호출자(apps/api, 워커)는
 * 한 글자도 바뀌지 않는다 — "매칭 전략 추가"가 커밋 하나로 드러나는 자리.
 *
 * 반대로 이 배열을 호출자 쪽에 두면 순서 결정이 인프라 코드로 새어나가고,
 * 타겟 플랫폼이 늘 때마다 거기에 분기가 쌓인다.
 */
export const DEFAULT_STRATEGIES: readonly MatchStrategy[] = [isrcStrategy]

export async function matchTrack(
  source: SourceTrack,
  port: SearchPort,
  strategies: readonly MatchStrategy[] = DEFAULT_STRATEGIES,
): Promise<MatchResult> {
  for (const strategy of strategies) {
    const hit = await strategy.attempt(source, port)
    if (hit) {
      return {
        status: 'MATCHED',
        method: strategy.method,
        confidence: hit.confidence,
        source,
        target: hit.target,
      }
    }
  }
  return { status: 'FAILED', reason: failureReason(source), source }
}

/**
 * 왜 실패했는지는 전략이 아니라 소스 곡의 상태가 결정한다.
 * ISRC 가 없었으면 애초에 조회를 못 한 것이고(NO_SOURCE_ISRC),
 * 있었는데 못 찾았으면 타겟 카탈로그에 없는 것이다(NOT_FOUND_IN_TARGET).
 * 이 구분이 "소스 데이터 문제"와 "타겟 카탈로그 문제"를 가르고, 그대로 집계 지표가 된다.
 */
export function failureReason(source: SourceTrack): FailureReason {
  return normalizeIsrc(source.isrc) ? 'NOT_FOUND_IN_TARGET' : 'NO_SOURCE_ISRC'
}

/**
 * 곡 여러 개를 매칭한다. **순서를 보존한다** —
 * 매칭이 병렬로 끝나도 타겟에 쓸 때는 원래 순서여야 제대로 된 이전이다(ERD 의 position).
 *
 * P1 은 의도적으로 직렬이다. 병렬로 때리면 Spotify 레이트리밋(앱 단위 30초 롤링)에
 * 더 빨리 닿고, 그 문제를 만나는 것 자체가 P2 의 명분이라 지금 피해갈 이유가 없다.
 */
export async function matchAll(
  sources: readonly SourceTrack[],
  port: SearchPort,
  onResult?: (result: MatchResult, index: number) => void,
  strategies: readonly MatchStrategy[] = DEFAULT_STRATEGIES,
): Promise<MatchResult[]> {
  const results: MatchResult[] = []
  for (const [index, source] of sources.entries()) {
    const result = await matchTrack(source, port, strategies)
    results.push(result)
    onResult?.(result, index)
  }
  return results
}
