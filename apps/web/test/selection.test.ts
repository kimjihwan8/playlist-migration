import { describe, expect, it } from 'vitest'
import { isPicked, pickedCount, pickedPlaylists, totalPicked } from '../src/lib/selection'
import type { Picks } from '../src/lib/selection'
import type { Playlist } from '../src/lib/types'

const playlist = (over: Partial<Playlist> = {}): Playlist => ({
  id: 'p1',
  name: '출근길',
  owner: 'jihwan',
  trackCount: 12,
  cover: null,
  kind: 'playlist',
  owned: true,
  ...over,
})

describe('isPicked — 개수가 아니라 여부', () => {
  it('고르지 않았으면 false', () => {
    expect(isPicked(undefined)).toBe(false)
  })

  it("'all' 이면 true", () => {
    expect(isPicked({ mode: 'all' })).toBe(true)
  })

  it('곡을 하나라도 골랐으면 true, 다 껐으면 false', () => {
    expect(isPicked({ mode: 'partial', trackIds: ['t1'] })).toBe(true)
    expect(isPicked({ mode: 'partial', trackIds: [] })).toBe(false)
  })
})

describe('곡 수가 0인 재생목록도 고른 것으로 센다', () => {
  // 빈 재생목록이거나, 플랫폼이 곡 수를 안 줘서 0 으로 들어온 경우.
  // 개수로 판정하면 "골랐는데 안 골랐다"가 되어 전체 해제와 다음 단계가 동시에 깨진다.
  const empty = playlist({ id: 'empty', trackCount: 0 })
  const picks: Picks = { empty: { mode: 'all' } }

  it('고른 것으로 인식된다', () => {
    expect(isPicked(picks.empty)).toBe(true)
  })

  it('다음 화면으로 넘길 목록에 포함된다', () => {
    expect(pickedPlaylists([empty], picks).map((p) => p.id)).toEqual(['empty'])
  })

  it('다만 표시용 곡 수는 그대로 0 이다', () => {
    expect(pickedCount(empty, picks.empty)).toBe(0)
  })
})

describe('전체 선택 / 전체 해제', () => {
  const list = [playlist({ id: 'a' }), playlist({ id: 'b', trackCount: 0 }), playlist({ id: 'c' })]
  const allOn: Picks = Object.fromEntries(list.map((p) => [p.id, { mode: 'all' as const }]))

  it('전체 선택하면 모두 고른 것으로 센다 — 곡 수가 0인 것이 섞여 있어도', () => {
    // 이 숫자가 list.length 와 같아야 "전체 선택됨"으로 인식되고,
    // 그래야 한 번 더 누를 때 전체 해제로 간다(해제가 안 되던 버그의 핵심).
    const count = list.filter((p) => isPicked(allOn[p.id])).length
    expect(count).toBe(list.length)
  })

  it('전체 해제하면 하나도 남지 않는다', () => {
    expect(pickedPlaylists(list, {})).toEqual([])
  })
})

describe('totalPicked', () => {
  it('고른 재생목록들의 곡 수를 더한다', () => {
    const list = [playlist({ id: 'a', trackCount: 10 }), playlist({ id: 'b', trackCount: 5 })]
    const picks: Picks = { a: { mode: 'all' }, b: { mode: 'partial', trackIds: ['t1', 't2'] } }
    expect(totalPicked(list, picks)).toBe(12)
  })

  it('아무것도 안 골랐으면 0', () => {
    expect(totalPicked([playlist()], {})).toBe(0)
  })
})
