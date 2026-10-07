/**
 * 개발용 측정 기록. **추측하지 않고 재기 위한 것.**
 *
 * "느리다"는 신고를 받으면 먼저 알아야 할 것은 세 가지다:
 * 요청이 몇 번 왔는가 / 단계별로 얼마나 걸렸는가 / 외부 호출을 몇 번 했는가.
 * 셋 다 서버만 알 수 있고, 로그는 흘러가 버리므로 최근 것만 들고 있는다.
 */
export type SpotifyCall = { method: string; path: string; ms: number; status: number }

export type Trace = {
  at: string
  totalMs: number
  steps: Record<string, number>
  items: number
  tracks: number
  calls: SpotifyCall[]
}

const MAX = 20
const traces: Trace[] = []

export function record(trace: Trace) {
  traces.unshift(trace)
  if (traces.length > MAX) traces.length = MAX
}

export function recent(): Trace[] {
  return traces
}

/** 한 구간의 소요시간을 재서 steps 에 적는다. */
export async function step<T>(steps: Record<string, number>, name: string, run: () => Promise<T>): Promise<T> {
  const t = Date.now()
  try {
    return await run()
  } finally {
    steps[name] = (steps[name] ?? 0) + (Date.now() - t)
  }
}
