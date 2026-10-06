import { Hono } from 'hono'
import {
  authorizeUrl,
  createPkce,
  createState,
  exchangeCode,
  SpotifyAdapter,
  SpotifyApiError,
  SpotifyHttp,
} from '@pm/adapter-spotify'
import { loadEnv, redirectUri, type Env } from '../lib/env'
import { clearSession, getSession, isRole, setPkce, setSession, takePkce, type Role } from '../lib/session'

/** 연결이 끝난 뒤 사용자를 어디로 돌려보낼지. 화면 흐름이 순차라서 역할마다 다르다. */
const landing: Record<Role, string> = { source: '/source', target: '/target' }

export function authRoutes(env: Env = loadEnv()) {
  const app = new Hono()

  /**
   * 브라우저를 Spotify 동의 화면으로 넘긴다.
   * fetch 가 아니라 `location.href` 로 와야 한다 — OAuth 는 페이지 이동이지 API 호출이 아니다.
   */
  app.get('/login', async (c) => {
    const role = c.req.query('role')
    if (!isRole(role)) return c.json({ error: 'role 은 source 또는 target 이어야 한다' }, 400)

    const platform = c.req.query('platform') ?? 'spotify'
    if (platform !== 'spotify') {
      return c.json({ error: `아직 지원하지 않는 플랫폼: ${platform}` }, 400)
    }

    const { verifier, challenge } = await createPkce()
    const state = createState()
    // verifier 는 서버만 안다. challenge 만 Spotify 로 가고,
    // 토큰 교환 때 둘이 맞아야 하므로 인가 코드를 가로채도 토큰으로 바꿀 수 없다.
    await setPkce(c, env, { verifier, state, role })

    return c.redirect(
      authorizeUrl({ clientId: env.spotifyClientId, redirectUri: redirectUri(env), state, challenge }),
    )
  })

  /** Spotify 가 사용자를 되돌려보내는 자리. 소스·타겟이 같은 URI 를 쓰고 역할은 쿠키가 기억한다. */
  app.get('/callback', async (c) => {
    const pkce = await takePkce(c, env)
    const error = c.req.query('error')
    if (error) return c.redirect(`/?error=${encodeURIComponent(error)}`)
    if (!pkce) return c.redirect('/?error=session_expired')

    // state 대조 = CSRF 방지. 이게 없으면 공격자가 자기 계정 코드를 남의 세션에 심을 수 있다.
    if (c.req.query('state') !== pkce.state) return c.redirect('/?error=state_mismatch')

    const code = c.req.query('code')
    if (!code) return c.redirect('/?error=no_code')

    const tokens = await exchangeCode({
      clientId: env.spotifyClientId,
      redirectUri: redirectUri(env),
      code,
      verifier: pkce.verifier,
    })

    /**
     * 동의까지 끝났는데 첫 API 호출이 403 이면 원인은 거의 하나다:
     * **그 계정이 앱의 허용목록(Dashboard → User Management)에 없다.**
     * 개발 모드 앱은 등록된 5명 외에는 토큰을 받고도 아무것도 못 읽는다.
     *
     * 이걸 일반 에러로 흘리면 화면에 `spotify_error 403` 만 떠서
     * "내가 뭘 잘못했지"를 알 수 없다. 사유를 붙여 첫 화면으로 돌려보낸다.
     */
    let profile
    try {
      profile = await new SpotifyAdapter(
        new SpotifyHttp({ clientId: env.spotifyClientId, tokens }),
      ).profile()
    } catch (err) {
      if (err instanceof SpotifyApiError && err.status === 403) {
        return c.redirect('/?error=not_allowlisted')
      }
      throw err
    }

    await setSession(c, env, pkce.role, {
      platform: 'spotify',
      tokens,
      account: {
        id: profile.id,
        displayName: profile.display_name ?? profile.id,
        avatar: profile.images?.[0]?.url ?? null,
      },
    })

    return c.redirect(landing[pkce.role])
  })

  /**
   * 연결된 계정 정보. 화면이 콜백에서 돌아온 뒤 이걸로 "누구로 연결됐는지"를 읽는다.
   *
   * 연결이 안 돼 있어도 **200 + connected:false** 로 답한다.
   * 이건 보호된 자원이 아니라 상태를 묻는 질문이고, 소스·타겟을 둘 다 물어보는
   * 정상 흐름에서 한쪽은 늘 비어 있다. 401 로 답하면 매 로딩마다 콘솔에 빨간 줄이 남아
   * 진짜 오류와 구분이 안 된다.
   */
  app.get('/me', async (c) => {
    const role = c.req.query('role')
    if (!isRole(role)) return c.json({ error: 'role 이 필요하다' }, 400)

    const session = await getSession(c, env, role)
    if (!session) return c.json({ connected: false })

    return c.json({ connected: true, platform: session.platform, account: session.account })
  })

  /** 계정 전환 — 같은 플랫폼의 다른 계정으로 바꿔 끼울 수 있어야 한다. */
  app.post('/logout', async (c) => {
    const role = c.req.query('role')
    if (!isRole(role)) return c.json({ error: 'role 이 필요하다' }, 400)
    clearSession(c, role)
    return c.json({ ok: true })
  })

  return app
}
