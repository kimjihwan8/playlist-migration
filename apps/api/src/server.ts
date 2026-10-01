import { serve } from '@hono/node-server'
import { createApp } from './app'

/**
 * 로컬 개발용. Lambda 와 **같은 app 객체**를 그냥 Node 로 띄운다
 * — sam local 이나 LocalStack 없이 평범한 서버처럼 디버깅할 수 있다.
 */
const port = Number(process.env.PORT ?? 8787)
serve({ fetch: createApp().fetch, port })
console.log(`api → http://localhost:${port}/api/health`)
