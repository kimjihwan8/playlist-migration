import { describe, expect, it } from 'vitest'
import { isrcStrategy, normalizeIsrc } from '../src/matching/isrc'
import { fakeSearchPort, sourceTrack, targetTrack } from './helpers'

describe('normalizeIsrc', () => {
  it('하이픈 표기와 붙여쓴 표기를 같은 값으로 본다', () => {
    expect(normalizeIsrc('KR-A38-20-00001')).toBe('KRA382000001')
    expect(normalizeIsrc('KRA382000001')).toBe('KRA382000001')
  })

  it('소문자와 공백을 정리한다', () => {
    expect(normalizeIsrc(' kra38 2000001 ')).toBe('KRA382000001')
  })

  it('형식이 어긋나면 null — 쓰레기 값으로 검색 API 를 호출하지 않는다', () => {
    expect(normalizeIsrc(null)).toBeNull()
    expect(normalizeIsrc('')).toBeNull()
    expect(normalizeIsrc('ABC')).toBeNull()
    expect(normalizeIsrc('KRA38200000')).toBeNull() // 11자
    expect(normalizeIsrc('KRA3820000012')).toBeNull() // 13자
    expect(normalizeIsrc('1RA382000001')).toBeNull() // 국가코드가 숫자
    expect(normalizeIsrc('KRA38200000A')).toBeNull() // 끝 7자리가 숫자가 아님
  })
})

describe('isrcStrategy', () => {
  it('ISRC 가 같은 곡을 찾으면 confidence 1 로 돌려준다', async () => {
    const target = targetTrack()
    const port = fakeSearchPort([target])

    const hit = await isrcStrategy.attempt(sourceTrack(), port)

    expect(hit).toEqual({ target, confidence: 1 })
  })

  it('소스에 ISRC 가 없으면 조회조차 하지 않고 넘긴다', async () => {
    const port = fakeSearchPort([targetTrack()])

    const hit = await isrcStrategy.attempt(sourceTrack({ isrc: null }), port)

    expect(hit).toBeNull()
    expect(port.calls).toEqual([]) // 레이트리밋을 깎지 않았다
  })

  it('형식이 깨진 ISRC 도 조회하지 않는다', async () => {
    const port = fakeSearchPort([])
    await isrcStrategy.attempt(sourceTrack({ isrc: 'not-an-isrc' }), port)
    expect(port.calls).toEqual([])
  })

  it('하이픈이 섞인 ISRC 로도 찾아낸다', async () => {
    const port = fakeSearchPort([targetTrack()])
    const hit = await isrcStrategy.attempt(sourceTrack({ isrc: 'KR-A38-20-00001' }), port)
    expect(hit?.target.id).toBe('t1')
  })

  it('타겟 카탈로그에 없으면 null', async () => {
    const port = fakeSearchPort([])
    expect(await isrcStrategy.attempt(sourceTrack(), port)).toBeNull()
  })
})
