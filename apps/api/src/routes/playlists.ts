import { Hono } from 'hono'
import { adapterFor } from '../lib/adapters'
import { loadEnv, type Env } from '../lib/env'

export function playlistRoutes(env: Env = loadEnv()) {
  const app = new Hono()

  /** 소스 계정의 재생목록. "좋아하는 노래"가 가상 재생목록으로 맨 앞에 섞여 온다. */
  app.get('/', async (c) => {
    const adapter = await adapterFor(c, env, 'source')
    return c.json(await adapter.listPlaylists())
  })

  /** 재생목록 하나의 곡 목록. 화면이 개별 곡 체크박스를 그릴 때만 부른다. */
  app.get('/:id/tracks', async (c) => {
    const adapter = await adapterFor(c, env, 'source')
    return c.json(await adapter.listTracks(c.req.param('id')))
  })

  return app
}
