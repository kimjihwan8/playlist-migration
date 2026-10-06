import { describe, expect, it } from 'vitest'
import { toSourceTrack, toTargetTrack, type SpotifyTrack } from '../src/map'

const track = (over: Partial<SpotifyTrack> = {}): SpotifyTrack => ({
  id: 't1',
  uri: 'spotify:track:t1',
  name: '밤편지',
  duration_ms: 254_000,
  artists: [{ name: 'IU' }],
  album: { name: 'Palette', images: [{ url: 'https://img/1' }] },
  external_ids: { isrc: 'KRA382000001' },
  external_urls: { spotify: 'https://open.spotify.com/track/t1' },
  ...over,
})

describe('toSourceTrack', () => {
  it('아티스트가 여럿이면 쉼표로 잇는다', () => {
    const t = toSourceTrack(track({ artists: [{ name: 'IU' }, { name: '김이나' }] }), 'x')
    expect(t.artist).toBe('IU, 김이나')
  })

  it('로컬 파일(id 없음)은 버리지 않고 합성 ID 로 통과시킨다', () => {
    const t = toSourceTrack(track({ id: null, is_local: true, external_ids: {} }), 'pl1:7')
    // 조용히 빼면 사용자가 센 곡 수와 결과 수가 어긋난다
    expect(t.id).toBe('pl1:7')
    expect(t.isrc).toBeNull() // → NO_SOURCE_ISRC 로 떨어진다
  })

  it('album 과 duration 이 없어도 깨지지 않는다', () => {
    const t = toSourceTrack(track({ album: null, duration_ms: null }), 'x')
    expect(t.album).toBeNull()
    expect(t.durationMs).toBeNull()
  })
})

describe('toTargetTrack', () => {
  it('커버와 링크를 함께 옮긴다', () => {
    const t = toTargetTrack(track())
    expect(t?.cover).toBe('https://img/1')
    expect(t?.url).toBe('https://open.spotify.com/track/t1')
    expect(t?.uri).toBe('spotify:track:t1')
  })

  it('id 가 없으면 후보가 될 수 없다 — 쓸 수 없는 곡이다', () => {
    expect(toTargetTrack(track({ id: null }))).toBeNull()
  })

  it('external_urls 가 없으면 링크를 만들어 준다', () => {
    const t = toTargetTrack(track({ external_urls: null }))
    expect(t?.url).toBe('https://open.spotify.com/track/t1')
  })
})

describe('커버 이미지 고르기', () => {
  const withImages = (images: Array<{ url: string; width?: number }>) =>
    track({ album: { name: 'Palette', images } })

  it('목록용이라 가장 작은 이미지를 고른다', () => {
    // 44px 칸에 640px 이미지를 넣으면 수백 곡일 때 전부 낭비다.
    const t = toSourceTrack(
      withImages([
        { url: 'big', width: 640 },
        { url: 'mid', width: 300 },
        { url: 'small', width: 64 },
      ]),
      'x',
    )
    expect(t.cover).toBe('small')
  })

  it('크기 정보가 없으면 마지막 것을 쓴다 (작은 것부터 오지 않는다는 보장이 없다)', () => {
    const t = toSourceTrack(withImages([{ url: 'a' }, { url: 'b' }]), 'x')
    expect(t.cover).toBe('b')
  })

  it('커버가 없어도 깨지지 않는다 — 표시 전용이라 없어도 그만이다', () => {
    expect(toSourceTrack(track({ album: null }), 'x').cover).toBeNull()
    expect(toSourceTrack(withImages([]), 'x').cover).toBeNull()
  })

  it('타겟 곡도 같은 규칙을 쓴다', () => {
    const t = toTargetTrack(withImages([{ url: 'big', width: 640 }, { url: 'small', width: 64 }]))
    expect(t?.cover).toBe('small')
  })
})
