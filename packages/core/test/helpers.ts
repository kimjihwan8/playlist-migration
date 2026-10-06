import type { SearchPort } from '../src/domain/adapter'
import type { SourceTrack, TargetTrack } from '../src/domain/track'

export function sourceTrack(over: Partial<SourceTrack> = {}): SourceTrack {
  return {
    id: 's1',
    title: '밤편지',
    artist: '아이유',
    album: 'Palette',
    durationMs: 254_000,
    cover: null,
    isrc: 'KRA382000001',
    ...over,
  }
}

export function targetTrack(over: Partial<TargetTrack> = {}): TargetTrack {
  return {
    id: 't1',
    uri: 'spotify:track:t1',
    title: '밤편지',
    artist: 'IU',
    album: 'Palette',
    durationMs: 254_000,
    isrc: 'KRA382000001',
    cover: null,
    url: 'https://open.spotify.com/track/t1',
    ...over,
  }
}

/** 네트워크 없이 도는 가짜 타겟. 호출 기록을 남겨 "조회를 아꼈는가"까지 검증한다. */
export function fakeSearchPort(catalog: TargetTrack[] = []): SearchPort & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    async searchByIsrc(isrc) {
      calls.push(isrc)
      return catalog.filter((t) => t.isrc === isrc)
    },
  }
}
