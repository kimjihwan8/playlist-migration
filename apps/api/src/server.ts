import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { loadEnv } from './lib/env'

/**
 * 로컬 개발용. Lambda 와 **같은 app 객체**를 그냥 Node 로 띄운다
 * — sam local 이나 LocalStack 없이 평범한 서버처럼 디버깅할 수 있다.
 */

/**
 * .env 는 **여기서만** 읽는다.
 * Lambda 는 실행 환경이 환경변수를 직접 주므로 handler.ts 에는 이 코드가 없어야 한다
 * — 배포본에 로컬 설정 파일을 찾는 코드가 남아 있을 이유가 없다.
 */
const envFile = resolve(import.meta.dirname, '../../../.env')
if (existsSync(envFile)) {
  process.loadEnvFile(envFile) // Node 22 내장. dotenv 의존성이 필요 없다.
} else {
  console.warn(`.env 가 없다 (${envFile}) — .env.example 을 복사해서 채울 것`)
}

const env = loadEnv()
const port = Number(process.env.PORT ?? 8787)

serve({ fetch: createApp(env).fetch, port })

// 어떤 설정으로 떴는지 찍는다. "왜 client_id 가 이상하지?" 를 1초 만에 알 수 있게.
console.log(`api  → http://127.0.0.1:${port}/api/health`)
console.log(`      client_id=${mask(env.spotifyClientId)}  redirect=${env.appUrl}/api/auth/callback`)

/** 비밀은 아니지만(OAuth URL 에 그대로 실린다) 전체를 로그에 남길 이유도 없다. */
function mask(value: string): string {
  return value.length <= 10 ? value : `${value.slice(0, 6)}…${value.slice(-4)}`
}
