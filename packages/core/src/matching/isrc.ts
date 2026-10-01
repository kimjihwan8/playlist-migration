import type { SearchPort } from '../domain/adapter'
import type { SourceTrack } from '../domain/track'
import type { Candidate, MatchStrategy } from './strategy'

/**
 * ISRC 로 찾는다. P1 의 유일한 전략이자 계단식의 1단.
 *
 * confidence 가 늘 1 인 이유: ISRC 는 녹음 하나에 붙는 식별자다. 코드가 같으면
 * 같은 녹음이므로 추측이 아니다. 점수를 매길 대상이 아니라서 AMBIGUOUS 도 나올 수 없다.
 */
export const isrcStrategy: MatchStrategy = {
  method: 'ISRC',

  async attempt(source: SourceTrack, port: SearchPort): Promise<Candidate | null> {
    const isrc = normalizeIsrc(source.isrc)
    if (!isrc) return null // 조회할 키가 없다 — 다음 전략에게 넘긴다

    const found = await port.searchByIsrc(isrc)
    const first = found[0]
    if (!first) return null

    return { target: first, confidence: 1 }
  },
}

/**
 * ISRC 는 12자 영숫자이고 표기할 때 하이픈을 끼우는 관행이 있다(KR-A32-24-00001).
 * 플랫폼마다 표기가 섞여 들어오므로 조회 전에 한 모양으로 맞춘다.
 * 형식이 아예 어긋나면 null — 쓰레기 값으로 검색 API 를 호출해 레이트리밋을 깎지 않는다.
 */
export function normalizeIsrc(raw: string | null): string | null {
  if (!raw) return null
  const cleaned = raw.replace(/[\s-]/g, '').toUpperCase()
  return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(cleaned) ? cleaned : null
}
