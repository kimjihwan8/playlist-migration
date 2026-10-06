import type { Destination, Playlist } from './types'

/**
 * 기본 목적지: 소스가 "좋아하는 노래"면 타겟도 좋아하는 노래로 간다.
 * 그러지 않으면 계정 이사인데 "좋아하는 노래"라는 이름의 일반 재생목록이 생겨버린다.
 */
export function defaultDestination(playlist: Playlist, targetPlatform?: string): Destination {
  // 파일 타겟에는 "좋아하는 노래" 같은 개념이 없다 — 전부 파일 하나로 나간다.
  if (targetPlatform === 'csv') return { type: 'file', name: playlist.name }
  return playlist.kind === 'liked' ? { type: 'liked' } : { type: 'new', name: playlist.name }
}

export function destinationOf(
  playlist: Playlist,
  map: Record<string, Destination>,
  targetPlatform?: string,
): Destination {
  const chosen = map[playlist.id]
  // 타겟을 바꾸면 전에 고른 목적지가 그 타겟에 없을 수 있다(예: Spotify → CSV).
  if (chosen && (targetPlatform !== 'csv') === (chosen.type !== 'file')) return chosen
  return defaultDestination(playlist, targetPlatform)
}

export function destinationLabel(destination: Destination): string {
  return destination.type === 'liked' ? '좋아하는 노래' : destination.name
}

/** 파일 타겟은 계정 연결이라는 개념이 없다 — 고르는 즉시 준비 완료다. */
export const needsAccount = (platform: string | null) => platform !== null && platform !== 'csv'
