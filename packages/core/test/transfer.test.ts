import { describe, expect, it } from 'vitest'
import { chunk, DEFAULT_BATCH_SIZE } from '../src/transfer/batch'
import { backoffMs, classifyHttpStatus } from '../src/transfer/failure'
import { sourceNote } from '../src/transfer/description'

describe('chunk', () => {
  it('Spotify 한도인 100곡씩 자른다', () => {
    const items = Array.from({ length: 250 }, (_, i) => i)
    const batches = chunk(items)
    expect(DEFAULT_BATCH_SIZE).toBe(100)
    expect(batches.map((b) => b.length)).toEqual([100, 100, 50])
  })

  it('나눠도 순서가 보존된다', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('빈 목록은 빈 배열 — 호출자가 빈 요청을 보내지 않도록', () => {
    expect(chunk([])).toEqual([])
  })

  it('크기가 0 이하면 던진다 (무한 루프 방지)', () => {
    expect(() => chunk([1], 0)).toThrow(RangeError)
  })
})

describe('classifyHttpStatus — 실패 이분법', () => {
  it('429 와 5xx 는 일시적이라 재시도한다', () => {
    expect(classifyHttpStatus(429)).toBe('TRANSIENT')
    expect(classifyHttpStatus(500)).toBe('TRANSIENT')
    expect(classifyHttpStatus(503)).toBe('TRANSIENT')
    expect(classifyHttpStatus(408)).toBe('TRANSIENT')
  })

  it('404·403·400 은 다시 보내도 같으므로 즉시 실패시킨다', () => {
    expect(classifyHttpStatus(404)).toBe('PERMANENT')
    expect(classifyHttpStatus(403)).toBe('PERMANENT')
    expect(classifyHttpStatus(400)).toBe('PERMANENT')
  })

  it('401 은 재시도가 아니라 토큰 갱신이 답이라 TRANSIENT 로 보지 않는다', () => {
    expect(classifyHttpStatus(401)).toBe('PERMANENT')
  })
})

describe('backoffMs', () => {
  it('서버가 Retry-After 를 주면 추측하지 않고 그대로 따른다', () => {
    expect(backoffMs(0, 7)).toBe(7000)
    expect(backoffMs(5, 2)).toBe(2000)
  })

  it('지수로 늘지만 30초에서 멈춘다', () => {
    const noJitter = () => 1
    expect(backoffMs(0, undefined, noJitter)).toBe(1000)
    expect(backoffMs(1, undefined, noJitter)).toBe(2000)
    expect(backoffMs(3, undefined, noJitter)).toBe(8000)
    expect(backoffMs(20, undefined, noJitter)).toBe(30_000)
  })

  it('지터가 간격을 50~100% 사이로 흩는다 — 동시에 깨어나 다시 몰리지 않도록', () => {
    expect(backoffMs(2, undefined, () => 0)).toBe(2000) // 4000의 50%
    expect(backoffMs(2, undefined, () => 1)).toBe(4000)
  })
})

describe('sourceNote', () => {
  const at = new Date(2026, 9, 1)

  it('원본 소유자·이름·플랫폼·날짜를 남긴다', () => {
    const note = sourceNote(
      { name: '출근길', owner: 'jihwan', kind: 'playlist' },
      'Spotify',
      at,
    )
    expect(note).toBe("원본: jihwan의 '출근길' · Spotify에서 이전 (2026-10-01)")
  })

  it('좋아하는 노래는 따옴표 없이 이름으로 부른다', () => {
    const note = sourceNote({ name: 'Liked Songs', owner: 'jihwan', kind: 'liked' }, 'Spotify', at)
    expect(note).toBe('원본: jihwan의 좋아하는 노래 · Spotify에서 이전 (2026-10-01)')
  })
})
