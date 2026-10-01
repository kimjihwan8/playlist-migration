/**
 * 쿠키에 담을 값을 봉인한다(AES-256-GCM).
 *
 * 토큰을 평문 쿠키에 담으면 브라우저 확장·XSS·로그 어디에서든 새어나간다.
 * GCM 을 쓰는 이유는 비밀 유지뿐 아니라 **변조 감지**가 함께 오기 때문이다 —
 * 누가 쿠키를 한 바이트라도 고치면 복호화가 실패하고 우리는 그냥 "세션 없음"으로 본다.
 */

const IV_BYTES = 12

export async function seal(value: unknown, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const data = new TextEncoder().encode(JSON.stringify(value))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyOf(secret), data)
  const out = new Uint8Array(IV_BYTES + cipher.byteLength)
  out.set(iv)
  out.set(new Uint8Array(cipher), IV_BYTES)
  return base64url(out)
}

/** 복호화 실패는 예외가 아니라 null 이다 — 만료·변조·키 교체는 모두 "세션 없음"으로 처리한다. */
export async function unseal<T>(sealed: string, secret: string): Promise<T | null> {
  try {
    const raw = fromBase64url(sealed)
    if (raw.length <= IV_BYTES) return null
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: raw.slice(0, IV_BYTES) },
      await keyOf(secret),
      raw.slice(IV_BYTES),
    )
    return JSON.parse(new TextDecoder().decode(plain)) as T
  } catch {
    return null
  }
}

async function keyOf(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

function base64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}
