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

const server = serve({ fetch: createApp(env).fetch, port })

/**
 * 포트가 이미 물려 있으면 스택트레이스 대신 할 일을 알려준다.
 *
 * 이게 중요한 이유: 먼저 뜬 서버가 그대로 요청을 받아버리기 때문에 **겉으로는 멀쩡해 보인다.**
 * 그 서버가 옛 설정(.env 반영 전)이나 옛 코드로 떠 있으면, 고친 내용이 반영되지 않는데도
 * 원인을 찾을 단서가 없다. 실제로 이 프로젝트에서 두 번 겪었다.
 */
server.on?.('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n포트 ${port} 를 이미 다른 프로세스가 쓰고 있다.`)
    console.error(`지금 요청을 받고 있는 것은 이 서버가 아니라 그쪽이다 — 먼저 정리할 것:`)
    console.error(`  lsof -ti TCP:${port} -sTCP:LISTEN | xargs kill -9\n`)
    process.exit(1)
  }
  throw err
})

// 어떤 설정으로 떴는지 찍는다. "왜 client_id 가 이상하지?" 를 1초 만에 알 수 있게.
console.log(`api  → http://127.0.0.1:${port}/api/health`)
console.log(`      client_id=${mask(env.spotifyClientId)}  redirect=${env.appUrl}/api/auth/callback`)

/** 비밀은 아니지만(OAuth URL 에 그대로 실린다) 전체를 로그에 남길 이유도 없다. */
function mask(value: string): string {
  return value.length <= 10 ? value : `${value.slice(0, 6)}…${value.slice(-4)}`
}
