import type { Account, Playlist, SourceTrack, TrackResult } from '../lib/types'

const COVERS = [
  'linear-gradient(135deg, #f2a33a, #592b18)',
  'linear-gradient(135deg, #2c3850, #a885b0)',
  'linear-gradient(135deg, #f6dfc1, #73948b)',
  'linear-gradient(135deg, #f2c9b5, #738da1)',
  'linear-gradient(135deg, #e3a644, #5d3626)',
] as const

const cover = (i: number) => COVERS[i % COVERS.length]!

export const MOCK_ACCOUNTS: Record<'source' | 'target', Account> = {
  source: { id: 'u_source', displayName: 'jihwan', avatar: 'linear-gradient(135deg, #7c5cff, #3d2b8c)' },
  target: { id: 'u_target', displayName: 'jihwan.work', avatar: 'linear-gradient(135deg, #49cf89, #1c6647)' },
}

export const MOCK_PLAYLISTS: Playlist[] = [
  { id: 'liked', name: '좋아하는 노래', owner: 'jihwan', trackCount: 11, cover: 'linear-gradient(135deg, #6d5bd0, #b06fb8)', kind: 'liked' },
  { id: 'p1', name: '출퇴근길', owner: 'jihwan', trackCount: 12, cover: cover(0), kind: 'playlist' },
  { id: 'p2', name: '새벽 코딩', owner: 'jihwan', trackCount: 8, cover: cover(1), kind: 'playlist' },
  { id: 'p3', name: 'K-POP 2024', owner: 'jihwan', trackCount: 10, cover: cover(2), kind: 'playlist' },
  { id: 'p4', name: 'Chill Evening', owner: 'jihwan', trackCount: 6, cover: cover(3), kind: 'playlist' },
  { id: 'p5', name: '운동할 때', owner: 'jihwan', trackCount: 9, cover: cover(4), kind: 'playlist' },
]

const SEED: Array<[string, string, string, string | null]> = [
  ['Get Lucky', 'Daft Punk', 'Random Access Memories', 'USQX91300108'],
  ['Ditto', 'NewJeans', 'Get Up', 'KRA382200401'],
  ['Spring Day', 'BTS', 'You Never Walk Alone', 'KRA381700120'],
  ['밤편지', '아이유', 'Palette', null],
  ['Old Town Road (Remix)', 'Lil Nas X', '7', 'USSM11900431'],
  ['Blinding Lights', 'The Weeknd', 'After Hours', 'USUG11904206'],
  ['Dynamite', 'BTS', 'BE', 'QM6MZ2035108'],
  ['좋은 날', '아이유', 'Real', null],
  ['Levitating', 'Dua Lipa', 'Future Nostalgia', 'GBAHT2000200'],
  ['Hype Boy', 'NewJeans', 'New Jeans', 'KRA382200203'],
  ['As It Was', 'Harry Styles', "Harry's House", 'USSM12290313'],
  ['Super Shy', 'NewJeans', 'Get Up', 'KRA382300402'],
]

/** 플레이리스트마다 trackCount만큼 잘라서 곡 목록을 만든다 */
export function mockTracksFor(playlistId: string): SourceTrack[] {
  const playlist = MOCK_PLAYLISTS.find((p) => p.id === playlistId)
  const count = playlist?.trackCount ?? 10
  return Array.from({ length: count }, (_, i) => {
    const [title, artist, album, isrc] = SEED[i % SEED.length]!
    return { id: `${playlistId}-t${i}`, title, artist, album, isrc }
  })
}

/** 소스 곡 하나를 매칭 결과로 바꾼다.
 *  ISRC가 없으면 곧바로 실패(P1 규칙), 있으면 대부분 성공하되 일부는 타겟에 없다고 본다. */
export function mockMatch(track: SourceTrack, index: number): TrackResult {
  const source = { title: track.title, artist: track.artist }

  if (!track.isrc) return { status: 'FAILED', reason: 'NO_SOURCE_ISRC', source }
  if (index % 9 === 4) return { status: 'FAILED', reason: 'NOT_FOUND_IN_TARGET', source }

  return {
    status: 'MATCHED',
    method: 'ISRC',
    source,
    target: {
      title: track.title,
      artist: track.artist,
      album: track.album,
      cover: cover(index),
      url: '#',
    },
  }
}
