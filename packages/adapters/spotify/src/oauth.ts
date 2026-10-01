/**
 * Spotify OAuth — Authorization Code + PKCE.
 *
 * client_secret 을 쓰지 않는다. PKCE 는 원래 비밀을 보관할 수 없는 클라이언트를 위한
 * 확장이지만, 서버에서 써도 유효하고 **보관할 비밀이 하나도 없다**는 이점이 그대로 남는다.
 * 유출될 수 없는 비밀이 가장 안전한 비밀이고, 배포 환경에 넣을 시크릿이 줄어든다.
 */

const ACCOUNTS = 'https://accounts.spotify.com'

/**
 * 요청하는 권한. 필요한 것만 받는다.
 *
 * `playlist-modify-public` 이 없는 이유: 만드는 재생목록을 전부 비공개로 고정했다.
 * 남의 개인 데이터를 옮기면서 기본 공개는 사고고, 덕분에 동의 화면에서
 * 요구하는 권한이 한 줄 줄어든다.
 */
export const SCOPES = [
  'playlist-read-private',
  'playlist-modify-private',
  'user-library-read',
  'user-library-modify',
] as const

export type SpotifyTokens = {
  accessToken: string
  /** Spotify 가 갱신 때 새 refresh_token 을 주지 않는 경우가 있어 nullable */
  refreshToken: string | null
  /** epoch ms. 만료 직전에 미리 갱신하려고 시각으로 보관한다(남은 초가 아니라). */
  expiresAt: number
}

/** PKCE 한 쌍. verifier 는 서버만 알고, challenge 만 Spotify 로 간다. */
export type Pkce = { verifier: string; challenge: string }

export async function createPkce(): Promise<Pkce> {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const verifier = base64url(bytes)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return { verifier, challenge: base64url(new Uint8Array(digest)) }
}

/** CSRF 방지용 state. 콜백에서 쿠키에 심어둔 값과 같은지 반드시 대조한다. */
export function createState(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(16)))
}

export function authorizeUrl(params: {
  clientId: string
  redirectUri: string
  state: string
  challenge: string
}): string {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: params.clientId,
    scope: SCOPES.join(' '),
    redirect_uri: params.redirectUri,
    state: params.state,
    code_challenge_method: 'S256',
    code_challenge: params.challenge,
  })
  return `${ACCOUNTS}/authorize?${q}`
}

export async function exchangeCode(params: {
  clientId: string
  redirectUri: string
  code: string
  verifier: string
}): Promise<SpotifyTokens> {
  return tokenRequest({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    code_verifier: params.verifier,
  })
}

export async function refreshTokens(params: {
  clientId: string
  refreshToken: string
}): Promise<SpotifyTokens> {
  const next = await tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: params.refreshToken,
    client_id: params.clientId,
  })
  // 새 refresh_token 을 안 줬으면 쓰던 것을 계속 쓴다 — null 로 덮으면 다음 갱신이 불가능해진다.
  return { ...next, refreshToken: next.refreshToken ?? params.refreshToken }
}

type TokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in: number
}

async function tokenRequest(body: Record<string, string>): Promise<SpotifyTokens> {
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  if (!res.ok) {
    throw new Error(`Spotify 토큰 요청 실패 (${res.status}): ${await res.text()}`)
  }
  const json = (await res.json()) as TokenResponse
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    // 30초 일찍 만료된 것으로 친다 — 요청이 날아가는 도중에 만료되는 창을 없앤다.
    expiresAt: Date.now() + (json.expires_in - 30) * 1000,
  }
}

function base64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
