import { describe, expect, it } from 'vitest'
import { seal, unseal } from '../src/lib/seal'

const SECRET = 'test-secret-1234567890'

describe('seal / unseal', () => {
  it('봉인했다 풀면 원래 값이 나온다', async () => {
    const value = { tokens: { accessToken: 'at', refreshToken: 'rt', expiresAt: 1 } }
    expect(await unseal(await seal(value, SECRET), SECRET)).toEqual(value)
  })

  it('같은 값을 두 번 봉인해도 결과가 다르다 — IV 가 매번 새로 생긴다', async () => {
    expect(await seal({ a: 1 }, SECRET)).not.toBe(await seal({ a: 1 }, SECRET))
  })

  it('평문이 쿠키에 드러나지 않는다', async () => {
    const sealed = await seal({ accessToken: 'BQD-super-secret' }, SECRET)
    expect(sealed).not.toContain('BQD-super-secret')
    expect(sealed).not.toContain('accessToken')
  })

  it('한 글자라도 고치면 null — GCM 이 변조를 잡는다', async () => {
    const sealed = await seal({ a: 1 }, SECRET)
    const tampered = sealed.slice(0, -1) + (sealed.endsWith('A') ? 'B' : 'A')
    expect(await unseal(tampered, SECRET)).toBeNull()
  })

  it('다른 키로는 못 푼다 — 키를 갈면 기존 세션이 전부 무효가 된다', async () => {
    expect(await unseal(await seal({ a: 1 }, SECRET), 'other-secret')).toBeNull()
  })

  it('쓰레기 문자열을 넣어도 던지지 않고 null', async () => {
    expect(await unseal('not-sealed-at-all', SECRET)).toBeNull()
    expect(await unseal('', SECRET)).toBeNull()
  })
})
