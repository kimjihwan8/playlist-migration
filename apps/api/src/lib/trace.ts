/**
 * 개발용 측정 기록. **추측하지 않고 재기 위한 것.**
 *
 * "느리다"는 신고를 받으면 먼저 알아야 할 것은 세 가지다:
 * 요청이 몇 번 왔는가 / 단계별로 얼마나 걸렸는가 / 외부 호출을 몇 번 했는가.
 * 셋 다 서버만 알 수 있고, 로그는 흘러가 버리므로 최근 것만 들고 있는다.
 */
import { appendFile, readFile } from 'node:fs/promises'

export type SpotifyCall = { method: string; path: string; ms: number; status: number }

export type Trace = {
  at: string
  /** 어느 요청이었나. 느린 구간을 찾으려면 이전 말고 다른 요청도 같이 봐야 한다. */
  route: string
  totalMs: number
  steps: Record<string, number>
  items: number
  tracks: number
  calls: SpotifyCall[]
}

const MAX = 20
const traces: Trace[] = []

/**
 * 파일에도 남긴다.
 *
 * 개발 서버는 코드가 바뀔 때마다 재시작하고, 그때 메모리에 있던 측정 기록이 통째로 날아간다.
 * 고치면서 재는 상황에서는 그게 치명적이다 — 잴 때마다 기록이 비어 있다.
 */
const FILE = '/tmp/pm-traces.jsonl'

export function record(trace: Trace) {
  traces.unshift(trace)
  if (traces.length > MAX) traces.length = MAX
  void appendFile(FILE, `${JSON.stringify(trace)}\n`).catch(() => {
    /* 기록 실패가 본 기능을 막아서는 안 된다 */
  })
}

/** 재시작으로 메모리가 비었으면 파일에서 되살린다. */
export async function restore() {
  if (traces.length > 0) return
  try {
    const text = await readFile(FILE, 'utf8')
    const lines = text.trim().split('\n').filter(Boolean).slice(-MAX)
    traces.push(...lines.reverse().map((l) => JSON.parse(l) as Trace))
  } catch {
    /* 파일이 없으면 그냥 빈 상태다 */
  }
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
