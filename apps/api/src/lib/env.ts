/**
 * 설정은 전부 환경변수에서 온다. 없으면 **시작할 때** 터지는 게 맞다 —
 * 요청이 들어온 뒤에 "client_id 가 undefined" 로 실패하면 원인을 찾기 어렵다.
 */
export type Env = {
  spotifyClientId: string
  /** 앱이 서비스되는 주소. 쿠키 도메인과 OAuth 리다이렉트의 기준. */
  appUrl: string
  /** 세션 쿠키 암호화 키의 원본 문자열 */
  sessionSecret: string
  isProd: boolean
}

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const appUrl = required(source, 'APP_URL').replace(/\/$/, '')
  return {
    spotifyClientId: required(source, 'SPOTIFY_CLIENT_ID'),
    appUrl,
    sessionSecret: required(source, 'SESSION_SECRET'),
    isProd: source.NODE_ENV === 'production',
  }
}

/** Spotify Dashboard 에 등록하는 Redirect URI 와 **한 글자도 다르면 안 된다.** */
export const redirectUri = (env: Env) => `${env.appUrl}/api/auth/callback`

function required(source: Record<string, string | undefined>, key: string): string {
  const value = source[key]
  if (!value) throw new Error(`환경변수 ${key} 가 필요하다`)
  return value
}
