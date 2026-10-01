import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import type { Env } from '../src/lib/env'

const env: Env = {
  spotifyClientId: 'test-client-id',
  appUrl: 'http://localhost:5174',
  sessionSecret: 'test-secret',
  isProd: false,
}

const app = createApp(env)

describe('GET /api/health', () => {
  it('살아있다', async () => {
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)
  })
})

describe('연결 전 접근', () => {
  it('세션 없이 재생목록을 요청하면 401 not_connected', async () => {
    const res = await app.request('/api/playlists')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'not_connected', role: 'source' })
  })

  it('없는 경로는 404 JSON — HTML 오류 페이지를 흘리지 않는다', async () => {
    const res = await app.request('/api/nope')
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('application/json')
  })
})

describe('GET /api/auth/login', () => {
  it('Spotify 동의 화면으로 넘기면서 PKCE 쿠키를 심는다', async () => {
    const res = await app.request('/api/auth/login?platform=spotify&role=source')

    expect(res.status).toBe(302)
    const location = new URL(res.headers.get('location')!)
    expect(location.origin).toBe('https://accounts.spotify.com')
    expect(location.searchParams.get('code_challenge_method')).toBe('S256')
    expect(location.searchParams.get('code_challenge')).toBeTruthy()
    expect(location.searchParams.get('client_id')).toBe('test-client-id')
    expect(location.searchParams.get('redirect_uri')).toBe('http://localhost:5174/api/auth/callback')

    // 공개 재생목록을 만들지 않기로 했으므로 그 권한은 요구하지 않는다
    expect(location.searchParams.get('scope')).not.toContain('playlist-modify-public')

    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('pm_pkce=')
    expect(cookie).toContain('HttpOnly')
  })

  it('verifier 는 브라우저로 나가지 않는다 — challenge 만 간다', async () => {
    const res = await app.request('/api/auth/login?role=source')
    expect(res.headers.get('location')).not.toContain('code_verifier')
  })

  it('role 이 없거나 이상하면 400', async () => {
    expect((await app.request('/api/auth/login')).status).toBe(400)
    expect((await app.request('/api/auth/login?role=admin')).status).toBe(400)
  })

  it('아직 없는 플랫폼은 400 으로 분명히 거절한다', async () => {
    const res = await app.request('/api/auth/login?role=source&platform=apple')
    expect(res.status).toBe(400)
  })
})

describe('GET /api/auth/callback', () => {
  it('PKCE 쿠키가 없으면(만료·직접 접근) 첫 화면으로 돌려보낸다', async () => {
    const res = await app.request('/api/auth/callback?code=abc&state=xyz')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/?error=session_expired')
  })

  it('사용자가 동의를 거절하면 사유를 달고 돌아간다', async () => {
    const res = await app.request('/api/auth/callback?error=access_denied')
    expect(res.headers.get('location')).toContain('error=access_denied')
  })
})

describe('GET /api/auth/me', () => {
  it('연결 전에는 401', async () => {
    expect((await app.request('/api/auth/me?role=target')).status).toBe(401)
  })
})
