import { describe, expect, it } from 'vitest'
import { SpotifyAdapter, type HttpClient } from '../src/adapter'
import type { SpotifyTrack } from '../src/map'

type Call = { method: 'GET' | 'POST' | 'PUT'; path: string; body?: unknown }

/**
 * 호출 경로를 기록하는 가짜 HTTP.
 *
 * 이 테스트의 목적은 응답 가공이 아니라 **어느 엔드포인트를 때리는지 못박는 것**이다.
 * 2026-02 마이그레이션에서 구 경로가 전부 403 이 됐는데, 그런 변화는
 * 타입 검사로는 절대 안 잡히고 실제 계정으로 돌려봐야만 드러난다.
 */
function fakeHttp(responses: Record<string, unknown> = {}): HttpClient & { calls: Call[] } {
  const calls: Call[] = []
  const reply = (path: string) => {
    // 가장 구체적인(긴) 키를 고른다 — '/me' 가 '/me/playlists' 를 가로채면 안 된다.
    const key = Object.keys(responses)
      .filter((k) => path.startsWith(k))
      .sort((a, b) => b.length - a.length)[0]
    return (key ? responses[key] : undefined) ?? { items: [], next: null }
  }
  return {
    calls,
    async get<T>(path: string) {
      calls.push({ method: 'GET', path })
      return reply(path) as T
    },
    async post<T>(path: string, body?: unknown) {
      calls.push({ method: 'POST', path, body })
      return reply(path) as T
    },
    async put<T>(path: string, body?: unknown) {
      calls.push({ method: 'PUT', path, body })
      return reply(path) as T
    },
  }
}

const target = (id: string) => ({
  id,
  uri: `spotify:track:${id}`,
  title: 't',
  artist: 'a',
  album: null,
  durationMs: null,
  isrc: null,
  cover: null,
  url: 'https://open.spotify.com/track/' + id,
})

const spotifyTrack: SpotifyTrack = {
  id: 't1',
  uri: 'spotify:track:t1',
  name: '밤편지',
  duration_ms: 1,
  artists: [{ name: 'IU' }],
  external_ids: { isrc: 'KRA382000001' },
}

describe('2026-02 마이그레이션 엔드포인트', () => {
  it('재생목록 곡 읽기는 /tracks 가 아니라 /items', async () => {
    const http = fakeHttp()
    await new SpotifyAdapter(http).listTracks('pl1')

    const path = http.calls[0]!.path
    expect(path).toContain('/playlists/pl1/items')
    expect(path).not.toContain('/tracks')
  })

  it('좋아하는 노래 읽기는 GET /me/tracks 그대로 (읽기는 폐기되지 않았다)', async () => {
    const http = fakeHttp()
    await new SpotifyAdapter(http).listTracks('liked')

    expect(http.calls[0]!.path).toContain('/me/tracks')
  })

  it('재생목록 생성은 POST /users/{id}/playlists 가 아니라 POST /me/playlists', async () => {
    const http = fakeHttp({ '/me': { id: 'u1' }, '/me/playlists': { id: 'new1' } })
    await new SpotifyAdapter(http).write(
      { type: 'new', name: '출근길', description: '원본: ...' },
      [target('a')],
    )

    const create = http.calls.find((c) => c.method === 'POST' && c.path === '/me/playlists')
    expect(create).toBeDefined()
    expect(http.calls.some((c) => c.path.includes('/users/'))).toBe(false)
  })

  it('새 재생목록은 반드시 비공개로 만든다', async () => {
    const http = fakeHttp({ '/me': { id: 'u1' }, '/me/playlists': { id: 'new1' } })
    await new SpotifyAdapter(http).write(
      { type: 'new', name: '출근길', description: 'note' },
      [target('a')],
    )

    const create = http.calls.find((c) => c.path === '/me/playlists')
    expect(create!.body).toMatchObject({ name: '출근길', description: 'note', public: false })
  })

  it('곡 추가는 /items 에 uris 배열로, 100개씩', async () => {
    const http = fakeHttp({ '/me': { id: 'u1' }, '/me/playlists': { id: 'new1' } })
    const many = Array.from({ length: 250 }, (_, i) => target(`t${i}`))

    await new SpotifyAdapter(http).write({ type: 'new', name: 'x', description: 'y' }, many)

    const adds = http.calls.filter((c) => c.path === '/playlists/new1/items')
    expect(adds).toHaveLength(3)
    expect((adds[0]!.body as { uris: string[] }).uris).toHaveLength(100)
    expect((adds[2]!.body as { uris: string[] }).uris).toHaveLength(50)
    expect((adds[0]!.body as { uris: string[] }).uris[0]).toBe('spotify:track:t0')
  })

  it('라이브러리 저장은 PUT /me/tracks 가 아니라 PUT /me/library, 쿼리로 40개씩', async () => {
    const http = fakeHttp()
    const many = Array.from({ length: 95 }, (_, i) => target(`t${i}`))

    await new SpotifyAdapter(http).write({ type: 'liked' }, many)

    const puts = http.calls.filter((c) => c.method === 'PUT')
    expect(puts).toHaveLength(3) // 40 + 40 + 15
    expect(puts[0]!.path.startsWith('/me/library?uris=')).toBe(true)
    expect(puts[0]!.body).toBeUndefined() // 본문이 아니라 쿼리 파라미터다

    const sent = decodeURIComponent(puts[0]!.path.split('uris=')[1]!).split(',')
    expect(sent).toHaveLength(40)
    expect(sent[0]).toBe('spotify:track:t0') // ID 가 아니라 URI
  })

  it('검색 limit 은 새 상한(10) 이하여야 한다', async () => {
    const http = fakeHttp({ '/search': { tracks: { items: [spotifyTrack], next: null } } })
    const found = await new SpotifyAdapter(http).searchByIsrc('KRA382000001')

    const limit = Number(new URL(`https://x${http.calls[0]!.path}`).searchParams.get('limit'))
    expect(limit).toBeLessThanOrEqual(10)
    expect(http.calls[0]!.path).toContain('isrc%3AKRA382000001')
    expect(found[0]?.uri).toBe('spotify:track:t1')
  })
})

describe('2026-02 마이그레이션 응답 필드', () => {
  it('재생목록 항목의 곡은 track 이 아니라 item 에 온다', async () => {
    const http = fakeHttp({ '/playlists/pl1/items': { items: [{ item: spotifyTrack }], next: null } })
    const tracks = await new SpotifyAdapter(http).listTracks('pl1')

    expect(tracks.map((t) => t.title)).toEqual(['밤편지'])
  })

  it('재생목록 곡 수는 tracks.total 이 아니라 items.total', async () => {
    const http = fakeHttp({
      '/me/playlists': { items: [{ id: 'pl1', name: '출근길', items: { total: 12 } }], next: null },
      '/me/tracks': { items: [], next: null, total: 0 },
      '/me': { id: 'u1' },
    })
    const [, playlist] = await new SpotifyAdapter(http).listPlaylists()

    expect(playlist?.trackCount).toBe(12)
  })
})
