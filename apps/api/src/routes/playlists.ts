import { Hono } from 'hono'
import { adapterFor } from '../lib/adapters'
import { loadEnv, type Env } from '../lib/env'
import { record, type SpotifyCall } from '../lib/trace'

export function playlistRoutes(env: Env = loadEnv()) {
  const app = new Hono()

  /** 소스 계정의 재생목록. "좋아하는 노래"가 가상 재생목록으로 맨 앞에 섞여 온다. */
  app.get('/', async (c) => {
    const t = timer('GET /playlists')
    const adapter = await adapterFor(c, env, 'source', t.onCall)
    const playlists = await adapter.listPlaylists()
    if (!env.isProd) t.done(playlists.length)
    return c.json(playlists)
  })

  /** 재생목록 하나의 곡 목록. 화면이 개별 곡 체크박스를 그릴 때만 부른다. */
  app.get('/:id/tracks', async (c) => {
    const t = timer('GET /playlists/:id/tracks')
    const adapter = await adapterFor(c, env, 'source', t.onCall)
    const tracks = await adapter.listTracks(c.req.param('id'))
    if (!env.isProd) t.done(tracks.length)
    return c.json(tracks)
  })

  return app
}

/** 한 요청의 소요시간과 Spotify 호출을 모아 기록한다. */
function timer(route: string) {
  const startedAt = Date.now()
  const calls: SpotifyCall[] = []
  return {
    onCall: (method: string, path: string, ms: number, status: number) =>
      void calls.push({ method, path, ms, status }),
    done: (count: number) =>
      record({
        at: new Date().toISOString(),
        route,
        totalMs: Date.now() - startedAt,
        steps: {},
        items: 1,
        tracks: count,
        calls,
      }),
  }
}
