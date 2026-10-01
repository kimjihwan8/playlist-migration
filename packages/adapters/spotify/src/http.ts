import { backoffMs, classifyHttpStatus, type FailureKind } from '@pm/core'
import { refreshTokens, type SpotifyTokens } from './oauth'

/**
 * Spotify 호출에서 난 실패. **종류(kind)를 달고 다닌다** —
 * 상위에서 HTTP 상태코드를 다시 해석하지 않고 재시도/즉시실패를 가를 수 있게.
 */
export class SpotifyApiError extends Error {
  constructor(
    readonly status: number,
    readonly kind: FailureKind,
    readonly body: string,
  ) {
    super(`Spotify ${status}: ${body.slice(0, 200)}`)
    this.name = 'SpotifyApiError'
  }
}

export type TokenSink = (tokens: SpotifyTokens) => void | Promise<void>

const API = 'https://api.spotify.com/v1'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * 토큰 갱신과 재시도를 떠안는 얇은 계층.
 *
 * 레이트리밋이 **앱(client_id) 단위 30초 롤링**이라 사용자가 늘면 서로의 한도를 깎는다.
 * 그래서 429 는 피할 수 없는 정상 상황이고, 여기서 조용히 흡수하는 것이 맞다.
 * P2 에서 이 자리의 한계(한 Lambda 안에서만 조절 가능)가 SQS 의 중앙 동시성 제어 명분이 된다.
 */
export class SpotifyHttp {
  private tokens: SpotifyTokens
  private readonly clientId: string
  private readonly onTokens?: TokenSink
  private readonly maxAttempts: number
  private readonly wait: (ms: number) => Promise<unknown>

  constructor(opts: {
    clientId: string
    tokens: SpotifyTokens
    onTokens?: TokenSink
    /** 일시적 실패를 몇 번까지 다시 시도할지 */
    maxAttempts?: number
    wait?: (ms: number) => Promise<unknown>
  }) {
    this.clientId = opts.clientId
    this.tokens = opts.tokens
    this.onTokens = opts.onTokens
    this.maxAttempts = opts.maxAttempts ?? 4
    this.wait = opts.wait ?? sleep
  }

  currentTokens(): SpotifyTokens {
    return this.tokens
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body)
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, body)
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    await this.ensureFresh()

    let refreshedOn401 = false

    for (let attempt = 0; ; attempt++) {
      let res: Response
      try {
        res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
          method,
          headers: {
            authorization: `Bearer ${this.tokens.accessToken}`,
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        })
      } catch (cause) {
        // 응답조차 못 받았다 — 네트워크 실패는 언제나 일시적이다.
        if (attempt + 1 >= this.maxAttempts) throw cause
        await this.wait(backoffMs(attempt))
        continue
      }

      if (res.ok) return (await parse<T>(res))!

      // 401 은 재시도가 아니라 갱신이 답이다. 같은 토큰으로 다시 보내면 영원히 401.
      if (res.status === 401 && !refreshedOn401 && this.tokens.refreshToken) {
        refreshedOn401 = true
        await this.refresh()
        continue
      }

      const text = await res.text()
      const kind = classifyHttpStatus(res.status)
      if (kind === 'PERMANENT' || attempt + 1 >= this.maxAttempts) {
        throw new SpotifyApiError(res.status, kind, text)
      }

      // 서버가 Retry-After 를 줬으면 추측하지 않고 그대로 기다린다.
      const retryAfter = Number(res.headers.get('retry-after'))
      await this.wait(backoffMs(attempt, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined))
    }
  }

  /** 만료됐으면 미리 갱신한다 — 401 을 맞고 되돌아오는 왕복을 아낀다. */
  private async ensureFresh(): Promise<void> {
    if (Date.now() < this.tokens.expiresAt) return
    if (!this.tokens.refreshToken) return
    await this.refresh()
  }

  private async refresh(): Promise<void> {
    const refreshToken = this.tokens.refreshToken
    if (!refreshToken) return
    this.tokens = await refreshTokens({ clientId: this.clientId, refreshToken })
    await this.onTokens?.(this.tokens)
  }
}

async function parse<T>(res: Response): Promise<T | undefined> {
  if (res.status === 204) return undefined
  const text = await res.text()
  return text ? (JSON.parse(text) as T) : undefined
}
