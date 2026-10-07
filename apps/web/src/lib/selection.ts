import type { Playlist } from './types'

/**
 * 플레이리스트 선택 상태.
 * 'all'은 곡 목록을 아직 안 불러왔어도 표현할 수 있어서, 체크박스 하나 누를 때마다
 * 곡을 미리 받아오는 낭비를 피한다. 펼쳐서 개별 곡을 끄는 순간 'partial'로 내려간다.
 */
export type Pick = { mode: 'all' } | { mode: 'partial'; trackIds: string[] }

export type Picks = Record<string, Pick>

/**
 * **골랐는가**(개수가 아니라 여부).
 *
 * 개수로 판정하면 안 된다: 곡 수가 0인 재생목록(빈 재생목록, 또는 플랫폼이
 * 곡 수를 안 주는 경우)은 골라도 0이라 "안 골랐다"로 세어진다. 그러면
 * "전체 선택" 체크박스가 영영 켜진 상태로 인식되지 않아 해제가 되지 않고,
 * 다음 화면은 "아무것도 안 골랐다"며 사용자를 되돌려보낸다.
 */
export function isPicked(pick: Pick | undefined): boolean {
  if (!pick) return false
  return pick.mode === 'all' || pick.trackIds.length > 0
}

/** 몇 곡을 골랐는가. 화면에 숫자를 보여줄 때만 쓴다 — 선택 여부 판정에는 쓰지 않는다. */
export function pickedCount(playlist: Playlist, pick: Pick | undefined): number {
  if (!pick) return 0
  return pick.mode === 'all' ? playlist.trackCount : pick.trackIds.length
}

export function totalPicked(playlists: Playlist[], picks: Picks): number {
  return playlists.reduce((sum, p) => sum + pickedCount(p, picks[p.id]), 0)
}

export function pickedPlaylists(playlists: Playlist[], picks: Picks): Playlist[] {
  return playlists.filter((p) => isPicked(picks[p.id]))
}

export type CheckboxState = 'on' | 'off' | 'partial'

/**
 * 체크박스가 보여줄 상태.
 *
 * **고른 개수가 아니라 고른 여부로 먼저 가른다.** 개수부터 보면 곡이 0개인 재생목록이
 * 골랐는데도 꺼진 것처럼 보이고, 사용자는 안 고른 줄 알았던 재생목록이 다음 화면에
 * 나타나는 걸 보게 된다 — 화면이 거짓말을 하는 셈이다.
 */
export function checkboxState(playlist: Playlist, pick: Pick | undefined): CheckboxState {
  if (!isPicked(pick)) return 'off'
  return pickedCount(playlist, pick) === playlist.trackCount ? 'on' : 'partial'
}

export function isTrackPicked(pick: Pick | undefined, trackId: string): boolean {
  if (!pick) return false
  return pick.mode === 'all' || pick.trackIds.includes(trackId)
}
