/**
 * CSV 직렬화 (RFC 4180).
 *
 * 라이브러리를 쓰지 않는 이유: 코어는 의존성이 0 이어야 "플랫폼·인프라 무관"이 말이 아니라
 * 증거가 된다. 그리고 우리가 쓰는 규칙은 세 줄이면 끝난다.
 */

/** 내보내는 컬럼. 우리 CSV 소스 어댑터가 그대로 다시 읽을 수 있는 모양으로 맞춘다. */
export const CSV_COLUMNS = ['title', 'artist', 'album', 'isrc', 'duration_ms'] as const

export type CsvRow = Record<(typeof CSV_COLUMNS)[number], string | number | null>

export function toCsv(rows: readonly CsvRow[], columns: readonly string[] = CSV_COLUMNS): string {
  const lines = [columns.join(',')]
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCell((row as Record<string, unknown>)[c])).join(','))
  }
  // 끝에 줄바꿈을 둔다 — 없으면 일부 도구가 마지막 줄을 흘린다.
  return `${lines.join('\r\n')}\r\n`
}

/**
 * 쉼표·따옴표·줄바꿈이 들어 있으면 따옴표로 감싸고, 안의 따옴표는 두 번 쓴다.
 * 곡 제목에 쉼표와 따옴표가 들어가는 일은 드물지 않다 — `Hello, Goodbye`, `"Heroes"`.
 */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
