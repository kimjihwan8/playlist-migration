import { handle } from 'hono/aws-lambda'
import { createApp } from './app'

/** Lambda 진입점. CDK 의 NodejsFunction entry 가 이 파일을 가리킨다. */
export const handler = handle(createApp())
