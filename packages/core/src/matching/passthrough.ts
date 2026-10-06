import type { MatchResult } from '../domain/result'
import type { SourceTrack, TargetTrack } from '../domain/track'

/**
 * 매칭 없이 소스 곡을 결과로 옮긴다.
 *
 * 파일로 내보내는 타겟에는 대조할 카탈로그가 없다. 이때 matchAll 을 돌리면
 * 모든 곡이 NOT_FOUND_IN_TARGET 으로 떨어지는데, 그건 거짓이다 —
 * 못 찾은 게 아니라 찾을 곳이 없는 것이다.
 *
 * method 를 'EXPORT' 로 따로 두는 이유: 매칭률 집계에서 빼야 한다.
 * 섞이면 "ISRC 매칭률 100%" 같은 무의미한 숫자가 지표를 오염시킨다.
 */
export function exportResults(sources: readonly SourceTrack[]): MatchResult[] {
  return sources.map((source) => ({
    status: 'MATCHED' as const,
    method: 'EXPORT' as const,
    confidence: 1,
    source,
    target: asTarget(source),
  }))
}

const asTarget = (s: SourceTrack): TargetTrack => ({
  id: s.id,
  uri: s.id,
  title: s.title,
  artist: s.artist,
  album: s.album,
  durationMs: s.durationMs,
  isrc: s.isrc,
  cover: s.cover,
  url: '', // 파일에는 열 주소가 없다
})
