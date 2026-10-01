import { afterEach, describe, expect, it, vi } from 'vitest'
import { SpotifyApiError, SpotifyHttp } from '../src/http'
import type { SpotifyTokens } from '../src/oauth'

const tokens = (over: Partial<SpotifyTokens> = {}): SpotifyTokens => ({
  accessToken: 'at-1',
  refreshToken: 'rt-1',
  expiresAt: Date.now() + 60_000,
  ...over,
})

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, ...init })

/** 재시도를 실제로 기다리지 않는다 — 테스트는 밀리초 안에 끝나야 한다. */
const nowait = async () => {}

afterEach(() => vi.unstubAllGlobals())

describe('SpotifyHttp', () => {
  it('429 를 맞으면 Retry-After 만큼 기다렸다가 다시 보낸다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429, headers: { 'retry-after': '2' } }))
      .mockResolvedValueOnce(json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    const waits: number[] = []
    const http = new SpotifyHttp({
      clientId: 'cid',
      tokens: tokens(),
      wait: async (ms) => void waits.push(ms),
    })

    expect(await http.get('/me')).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(waits).toEqual([2000]) // 추측하지 않고 서버가 말한 시간을 쓴다
  })

  it('404 는 재시도하지 않고 즉시 던진다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('not found', { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)

    const http = new SpotifyHttp({ clientId: 'cid', tokens: tokens(), wait: nowait })

    await expect(http.get('/playlists/nope')).rejects.toBeInstanceOf(SpotifyApiError)
    expect(fetchMock).toHaveBeenCalledTimes(1) // 영구 실패에 레이트리밋을 깎지 않는다
  })

  it('401 은 토큰을 갱신하고 한 번만 다시 보낸다', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('accounts.spotify.com')) {
        return json({ access_token: 'at-2', refresh_token: 'rt-2', expires_in: 3600 })
      }
      return fetchMock.mock.calls.filter((c) => !String(c[0]).includes('accounts')).length === 1
        ? new Response('expired', { status: 401 })
        : json({ ok: true })
    })
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const seen: SpotifyTokens[] = []
    const http = new SpotifyHttp({
      clientId: 'cid',
      tokens: tokens(),
      onTokens: (t) => void seen.push(t),
      wait: nowait,
    })

    expect(await http.get('/me')).toEqual({ ok: true })
    expect(seen[0]?.accessToken).toBe('at-2') // 갱신된 토큰이 바깥(세션)으로 전달된다
    expect(http.currentTokens().refreshToken).toBe('rt-2')
  })

  it('401 이 갱신 후에도 계속되면 포기한다 — 무한 갱신 루프를 막는다', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes('accounts.spotify.com')
        ? json({ access_token: 'at-2', expires_in: 3600 })
        : new Response('nope', { status: 401 }),
    )
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const http = new SpotifyHttp({ clientId: 'cid', tokens: tokens(), wait: nowait })

    await expect(http.get('/me')).rejects.toThrow(SpotifyApiError)
  })

  it('만료된 토큰은 요청 전에 미리 갱신한다 — 401 왕복을 아낀다', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes('accounts.spotify.com')
        ? json({ access_token: 'at-fresh', expires_in: 3600 })
        : json({ ok: true }),
    )
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const http = new SpotifyHttp({
      clientId: 'cid',
      tokens: tokens({ expiresAt: Date.now() - 1 }),
      wait: nowait,
    })

    await http.get('/me')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('accounts.spotify.com')
    expect(http.currentTokens().accessToken).toBe('at-fresh')
  })

  it('갱신 응답에 refresh_token 이 없으면 쓰던 것을 유지한다', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes('accounts.spotify.com')
        ? json({ access_token: 'at-2', expires_in: 3600 }) // refresh_token 없음
        : json({ ok: true }),
    )
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const http = new SpotifyHttp({
      clientId: 'cid',
      tokens: tokens({ expiresAt: Date.now() - 1 }),
      wait: nowait,
    })

    await http.get('/me')
    // null 로 덮었다면 다음 갱신이 영원히 불가능해진다
    expect(http.currentTokens().refreshToken).toBe('rt-1')
  })

  it('네트워크가 끊기면 일시적 실패로 보고 다시 시도한다', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    const http = new SpotifyHttp({ clientId: 'cid', tokens: tokens(), wait: nowait })

    expect(await http.get('/me')).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
