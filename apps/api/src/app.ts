import { Hono } from 'hono'
import { SpotifyApiError } from '@pm/adapter-spotify'
import { NotConnectedError } from './lib/adapters'
import { loadEnv, type Env } from './lib/env'
import { authRoutes } from './routes/auth'
import { playlistRoutes } from './routes/playlists'
import { transferRoutes } from './routes/transfer'

/**
 * Lambda 한 개가 `ANY /api/{proxy+}` 를 통째로 받는다.
 * 엔드포인트를 늘릴 때 CDK 를 다시 건드리지 않아도 되고(여기 한 줄이면 된다),
 * P2 에서 워커만 별도 함수로 떼어내는 것이 "접수와 처리를 분리한다"는 서사와 맞는다.
 *
 * 프론트와 같은 CloudFront 뒤 `/api/*` 에 붙으므로 쿠키가 first-party 고 CORS 가 없다.
 */
export function createApp(env: Env = loadEnv()) {
  const app = new Hono().basePath('/api')

  app.get('/health', (c) => c.json({ ok: true }))
  app.route('/auth', authRoutes(env))
  app.route('/playlists', playlistRoutes(env))
  app.route('/transfer', transferRoutes(env))

  app.notFound((c) => c.json({ error: 'not_found' }, 404))

  app.onError((err, c) => {
    if (err instanceof NotConnectedError) {
      return c.json({ error: 'not_connected', role: err.role }, 401)
    }
    if (err instanceof SpotifyApiError) {
      // 종류를 함께 내려보낸다 — 화면이 "다시 시도" 를 권할지 말지 여기서 갈린다.
      return c.json({ error: 'spotify_error', kind: err.kind, status: err.status }, 502)
    }
    console.error(err)
    return c.json({ error: 'internal' }, 500)
  })

  return app
}
