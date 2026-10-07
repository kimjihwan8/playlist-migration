import { Hono } from 'hono'
import { adapterFor } from '../lib/adapters'
import { loadEnv, type Env } from '../lib/env'
import { getSession, isRole } from '../lib/session'
import { recent, restore } from '../lib/trace'

/**
 * 개발 전용. Spotify 가 **실제로 무엇을 돌려주는지** 가공 없이 보여준다.
 *
 * 이게 없으면 "곡이 0개"일 때 원인이 셋 중 어디인지 알 수 없다:
 * ① Spotify 가 빈 응답을 줬다 ② 응답 모양이 우리 가정과 다르다 ③ 우리 매핑이 틀렸다.
 * 세 가지를 가르려면 원본을 봐야 한다.
 *
 * 프로덕션에서는 아예 등록하지 않는다 — 임의 경로를 대신 호출해 주는 창구를
 * 배포본에 남겨둘 이유가 없다.
 */
export function debugRoutes(env: Env = loadEnv()) {
  const app = new Hono()

  /** 지금 누구로 연결돼 있는지 한눈에. 계정을 착각하는 일이 생각보다 흔하다. */
  app.get('/who', async (c) => {
    const out: Record<string, unknown> = {}
    for (const role of ['source', 'target'] as const) {
      const session = await getSession(c, env, role)
      out[role] = session ? session.account : null
    }
    return c.json(out)
  })

  /**
   * 최근 이전 작업의 측정 기록. **세션을 요구하지 않는다** —
   * 성능 문제를 밖에서 확인할 수 있어야 하고, 여기에는 개인 데이터가 없다.
   */
  app.get('/transfers', async (c) => {
    await restore()
    return c.json(
      recent().map((t) => ({
        at: t.at,
        route: t.route,
        totalMs: t.totalMs,
        steps: t.steps,
        items: t.items,
        tracks: t.tracks,
        callCount: t.calls.length,
        slowest: [...t.calls].sort((a, b) => b.ms - a.ms).slice(0, 5),
        // 같은 경로를 몇 번 불렀는지 — 중복 호출이 여기서 드러난다.
        byPath: t.calls.reduce<Record<string, number>>((acc, call) => {
          const key = `${call.method} ${call.path.split('?')[0]}`
          acc[key] = (acc[key] ?? 0) + 1
          return acc
        }, {}),
      })),
    )
  })

  /** 예: /api/debug/raw?path=/me/playlists?limit=5 */
  app.get('/raw', async (c) => {
    const role = c.req.query('role') ?? 'source'
    if (!isRole(role)) return c.json({ error: 'role 이 잘못됐다' }, 400)

    const path = c.req.query('path')
    if (!path?.startsWith('/')) return c.json({ error: "path 는 '/' 로 시작해야 한다" }, 400)

    const adapter = await adapterFor(c, env, role)
    // adapterFor 가 만든 http 를 그대로 쓰려고 어댑터를 통해 간다.
    const raw = await (adapter as unknown as { http: { get: (p: string) => Promise<unknown> } }).http.get(path)
    return c.json({ path, raw })
  })

  return app
}
