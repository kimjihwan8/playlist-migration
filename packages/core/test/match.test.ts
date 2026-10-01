import { describe, expect, it, vi } from 'vitest'
import type { MatchStrategy } from '../src/matching/strategy'
import { DEFAULT_STRATEGIES, failureReason, matchAll, matchTrack } from '../src/matching/match'
import { fakeSearchPort, sourceTrack, targetTrack } from './helpers'

/** P3 의 계단식을 미리 흉내내는 가짜 전략 — 순서가 코어 안에 있다는 것을 검증하기 위한 것. */
function stubStrategy(method: MatchStrategy['method'], hit: boolean): MatchStrategy & { tried: number } {
  const s = {
    method,
    tried: 0,
    async attempt() {
      s.tried += 1
      return hit ? { target: targetTrack({ id: method }), confidence: 0.7 } : null
    },
  }
  return s
}

describe('matchTrack', () => {
  it('ISRC 로 찾으면 method ISRC · confidence 1', async () => {
    const port = fakeSearchPort([targetTrack()])

    const result = await matchTrack(sourceTrack(), port)

    expect(result.status).toBe('MATCHED')
    if (result.status !== 'MATCHED') return
    expect(result.method).toBe('ISRC')
    expect(result.confidence).toBe(1)
    expect(result.target.id).toBe('t1')
  })

  it('ISRC 가 없으면 NO_SOURCE_ISRC 로 실패한다', async () => {
    const result = await matchTrack(sourceTrack({ isrc: null }), fakeSearchPort())

    expect(result).toMatchObject({ status: 'FAILED', reason: 'NO_SOURCE_ISRC' })
  })

  it('ISRC 는 있는데 타겟에 없으면 NOT_FOUND_IN_TARGET 으로 실패한다', async () => {
    const result = await matchTrack(sourceTrack(), fakeSearchPort([]))

    expect(result).toMatchObject({ status: 'FAILED', reason: 'NOT_FOUND_IN_TARGET' })
  })

  it('앞 전략이 찾으면 뒤 전략은 호출되지 않는다', async () => {
    const first = stubStrategy('ISRC', true)
    const second = stubStrategy('FUZZY_AUTO', true)

    const result = await matchTrack(sourceTrack(), fakeSearchPort(), [first, second])

    expect(result.status).toBe('MATCHED')
    if (result.status === 'MATCHED') expect(result.method).toBe('ISRC')
    expect(first.tried).toBe(1)
    expect(second.tried).toBe(0)
  })

  it('앞 전략이 실패하면 다음 전략으로 내려간다 — 계단식의 순서는 코어가 쥔다', async () => {
    const first = stubStrategy('ISRC', false)
    const second = stubStrategy('FUZZY_AUTO', true)

    const result = await matchTrack(sourceTrack(), fakeSearchPort(), [first, second])

    expect(result.status).toBe('MATCHED')
    if (result.status === 'MATCHED') {
      expect(result.method).toBe('FUZZY_AUTO')
      expect(result.confidence).toBe(0.7)
    }
    expect(first.tried).toBe(1)
    expect(second.tried).toBe(1)
  })

  it('P1 의 기본 전략은 ISRC 하나뿐이다', () => {
    expect(DEFAULT_STRATEGIES.map((s) => s.method)).toEqual(['ISRC'])
  })
})

describe('failureReason', () => {
  it('형식이 깨진 ISRC 는 ISRC 가 없는 것과 같이 본다', () => {
    expect(failureReason(sourceTrack({ isrc: 'garbage' }))).toBe('NO_SOURCE_ISRC')
    expect(failureReason(sourceTrack({ isrc: null }))).toBe('NO_SOURCE_ISRC')
    expect(failureReason(sourceTrack())).toBe('NOT_FOUND_IN_TARGET')
  })
})

describe('matchAll', () => {
  it('매칭 결과의 순서가 입력 순서와 같다 — 타겟에 쓸 때 원래 순서여야 한다', async () => {
    const sources = [
      sourceTrack({ id: 'a', isrc: 'KRA382000001' }),
      sourceTrack({ id: 'b', isrc: null }),
      sourceTrack({ id: 'c', isrc: 'KRA382000003' }),
    ]
    const port = fakeSearchPort([
      targetTrack({ id: 'ta', isrc: 'KRA382000001' }),
      targetTrack({ id: 'tc', isrc: 'KRA382000003' }),
    ])

    const results = await matchAll(sources, port)

    expect(results.map((r) => r.source.id)).toEqual(['a', 'b', 'c'])
    expect(results.map((r) => r.status)).toEqual(['MATCHED', 'FAILED', 'MATCHED'])
  })

  it('한 곡이 끝날 때마다 알려준다 — 화면이 결과를 흘려받는 근거', async () => {
    const onResult = vi.fn()
    const sources = [sourceTrack({ id: 'a' }), sourceTrack({ id: 'b', isrc: null })]

    await matchAll(sources, fakeSearchPort([targetTrack()]), onResult)

    expect(onResult).toHaveBeenCalledTimes(2)
    expect(onResult.mock.calls[0]?.[1]).toBe(0)
    expect(onResult.mock.calls[1]?.[1]).toBe(1)
  })
})
