import type { Destination, Playlist } from './types'

/**
 * 기본 목적지: 소스가 "좋아하는 노래"면 타겟도 좋아하는 노래로 간다.
 * 그러지 않으면 계정 이사인데 "좋아하는 노래"라는 이름의 일반 재생목록이 생겨버린다.
 */
export function defaultDestination(playlist: Playlist): Destination {
  return playlist.kind === 'liked' ? { type: 'liked' } : { type: 'new', name: playlist.name }
}

export function destinationOf(
  playlist: Playlist,
  map: Record<string, Destination>,
): Destination {
  return map[playlist.id] ?? defaultDestination(playlist)
}

export function destinationLabel(destination: Destination): string {
  return destination.type === 'liked' ? '좋아하는 노래' : destination.name
}
