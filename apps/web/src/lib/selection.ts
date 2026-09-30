import type { Playlist } from './types'

/**
 * 플레이리스트 선택 상태.
 * 'all'은 곡 목록을 아직 안 불러왔어도 표현할 수 있어서, 체크박스 하나 누를 때마다
 * 곡을 미리 받아오는 낭비를 피한다. 펼쳐서 개별 곡을 끄는 순간 'partial'로 내려간다.
 */
export type Pick = { mode: 'all' } | { mode: 'partial'; trackIds: string[] }

export type Picks = Record<string, Pick>

export function pickedCount(playlist: Playlist, pick: Pick | undefined): number {
  if (!pick) return 0
  return pick.mode === 'all' ? playlist.trackCount : pick.trackIds.length
}

export function totalPicked(playlists: Playlist[], picks: Picks): number {
  return playlists.reduce((sum, p) => sum + pickedCount(p, picks[p.id]), 0)
}

export function pickedPlaylists(playlists: Playlist[], picks: Picks): Playlist[] {
  return playlists.filter((p) => pickedCount(p, picks[p.id]) > 0)
}

export function isTrackPicked(pick: Pick | undefined, trackId: string): boolean {
  if (!pick) return false
  return pick.mode === 'all' || pick.trackIds.includes(trackId)
}
