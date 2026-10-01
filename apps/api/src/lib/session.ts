import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { SpotifyTokens } from '@pm/adapter-spotify'
import type { Env } from './env'
import { seal, unseal } from './seal'

/** 소스 계정과 타겟 계정을 따로 연결하므로 세션도 역할별로 따로 둔다. */
export type Role = 'source' | 'target'
export const ROLES: Role[] = ['source', 'target']
export const isRole = (v: unknown): v is Role => v === 'source' || v === 'target'

export type Session = {
  platform: 'spotify'
  tokens: SpotifyTokens
  account: { id: string; displayName: string; avatar: string | null }
}

/**
 * P1 은 DB 가 없으므로 토큰이 봉인된 쿠키에 산다.
 * P2 에서 워커는 HTTP 요청 맥락 밖에서 돌아 쿠키를 읽을 수 없으므로
 * 이 자리가 transfer_job 테이블로 옮겨간다 — ERD 에 적어둔 "선택이 아니다"가 이것.
 */
const cookieName = (role: Role) => `pm_${role}`

/** PKCE verifier 와 state 는 콜백까지만 살면 된다. 10분이면 넉넉하다. */
const PKCE_COOKIE = 'pm_pkce'
const PKCE_MAX_AGE = 600

export type PkceCookie = { verifier: string; state: string; role: Role }

export async function setSession(c: Context, env: Env, role: Role, session: Session) {
  setCookie(c, cookieName(role), await seal(session, env.sessionSecret), {
    httpOnly: true, // JS 가 못 읽는다 — XSS 로 토큰이 새는 길을 막는다
    secure: env.isProd, // 로컬은 http 라 켜면 쿠키가 아예 안 심긴다
    sameSite: 'Lax', // OAuth 콜백이 외부에서 돌아오므로 Strict 면 쿠키가 안 붙는다
    path: '/',
    maxAge: 2 * 60 * 60, // 토큰·개인정보 최소 보관 (ERD 의 2시간 TTL 과 같은 값)
  })
}

export async function getSession(c: Context, env: Env, role: Role): Promise<Session | null> {
  const raw = getCookie(c, cookieName(role))
  return raw ? unseal<Session>(raw, env.sessionSecret) : null
}

export function clearSession(c: Context, role: Role) {
  deleteCookie(c, cookieName(role), { path: '/' })
}

export async function setPkce(c: Context, env: Env, value: PkceCookie) {
  setCookie(c, PKCE_COOKIE, await seal(value, env.sessionSecret), {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'Lax',
    path: '/',
    maxAge: PKCE_MAX_AGE,
  })
}

export async function takePkce(c: Context, env: Env): Promise<PkceCookie | null> {
  const raw = getCookie(c, PKCE_COOKIE)
  deleteCookie(c, PKCE_COOKIE, { path: '/' }) // 한 번 쓰면 버린다 — 재사용 공격 방지
  return raw ? unseal<PkceCookie>(raw, env.sessionSecret) : null
}
