/**
 * Spotify 의 재생목록 추가는 한 번에 100곡까지다. 어댑터가 아니라 코어에 두는 이유:
 * "한 번에 N개씩 나눠 보낸다"는 정책이고, N 이 플랫폼마다 다를 뿐이다.
 */
export const DEFAULT_BATCH_SIZE = 100

export function chunk<T>(items: readonly T[], size: number = DEFAULT_BATCH_SIZE): T[][] {
  if (size < 1) throw new RangeError(`배치 크기는 1 이상이어야 한다: ${size}`)
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}
