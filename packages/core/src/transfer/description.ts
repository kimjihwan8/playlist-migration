import type { SourcePlaylist } from '../domain/adapter'

/**
 * 새로 만든 재생목록의 설명에 출처를 남긴다.
 *
 * 설명을 **편집하는 UI** 는 기각했지만(TuneMyMusic 이 그 자리를 자기 홍보 문구에 쓴다),
 * 설명 자체는 필요하다. 타겟 계정으로 로그인한 사람이 소유자가 되므로
 * (Spotify 는 쓰는 토큰이 곧 소유자다 — 다른 소유자를 지정할 API 가 없다)
 * 원본이 누구 것이었는지는 여기 적지 않으면 사라진다.
 */
export function sourceNote(
  playlist: Pick<SourcePlaylist, 'name' | 'owner' | 'kind'>,
  platformName: string,
  now: Date = new Date(),
): string {
  const label = playlist.kind === 'liked' ? '좋아하는 노래' : `'${playlist.name}'`
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return `원본: ${playlist.owner}의 ${label} · ${platformName}에서 이전 (${date})`
}

const pad = (n: number) => String(n).padStart(2, '0')
