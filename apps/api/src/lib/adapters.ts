import type { Context } from 'hono'
import { SpotifyAdapter, SpotifyHttp } from '@pm/adapter-spotify'
import type { Env } from './env'
import { getSession, setSession, type Role } from './session'

/** 세션이 없을 때 던지는 신호. 라우트가 401 로 바꾼다. */
export class NotConnectedError extends Error {
  constructor(readonly role: Role) {
    super(`${role} 계정이 연결되어 있지 않다`)
    this.name = 'NotConnectedError'
  }
}

/**
 * 세션의 토큰으로 어댑터를 만든다.
 *
 * 토큰이 갱신되면 **쿠키를 다시 심는다**(onTokens). 안 하면 갱신한 토큰이
 * 이 요청이 끝나는 순간 사라지고 다음 요청이 또 만료 토큰으로 시작한다.
 */
export async function adapterFor(c: Context, env: Env, role: Role): Promise<SpotifyAdapter> {
  const session = await getSession(c, env, role)
  if (!session) throw new NotConnectedError(role)

  const http = new SpotifyHttp({
    clientId: env.spotifyClientId,
    tokens: session.tokens,
    onTokens: async (tokens) => setSession(c, env, role, { ...session, tokens }),
  })
  return new SpotifyAdapter(http)
}
