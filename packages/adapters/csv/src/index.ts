import {
  toCsv,
  type CsvRow,
  type Destination,
  type TargetAdapter,
  type TargetTrack,
  type WrittenDestination,
} from '@pm/core'

/**
 * 파일로 내보내는 타겟.
 *
 * **이 어댑터의 존재가 어댑터 패턴의 증거다.** 코어를 한 줄도 고치지 않고 타겟이 하나 늘었고,
 * 심지어 성질이 전혀 다르다 — 계정도, 권한도, 네트워크 호출도 없다.
 * 거꾸로 말하면 코어가 "Spotify 를 전제하지 않았다"는 뜻이기도 하다.
 *
 * 그리고 실용적인 쓸모가 하나 더 있다: Spotify 개발 모드는 허용목록 5명 제한이 있어
 * 아무나 타겟 계정을 연결할 수 없다. CSV 타겟은 **로그인 없이 결과를 받아가는 유일한 경로**다.
 */
export class CsvTargetAdapter implements TargetAdapter {
  /** 대조할 카탈로그가 없다 — 매칭 단계를 건너뛴다. */
  readonly passthrough = true

  /**
   * 인터페이스를 지키되 늘 빈 배열이다.
   * YouTube 가 ISRC 검색을 지원하지 않는 것과 같은 자리고, 계단식이 자연스럽게 흡수한다.
   * (여기서는 passthrough 라 아예 호출되지 않는다.)
   */
  async searchByIsrc(): Promise<TargetTrack[]> {
    return []
  }

  async write(destination: Destination, tracks: readonly TargetTrack[]): Promise<WrittenDestination> {
    if (destination.type !== 'file') {
      throw new Error(`CSV 타겟은 파일 목적지만 받는다: ${destination.type}`)
    }

    const rows: CsvRow[] = tracks.map((t) => ({
      title: t.title,
      artist: t.artist,
      album: t.album,
      isrc: t.isrc,
      duration_ms: t.durationMs,
    }))

    return {
      id: null,
      label: destination.name,
      kind: 'file',
      url: '',
      download: {
        filename: safeFilename(destination.name),
        // charset 을 명시한다 — 한글 제목이 깨지는 가장 흔한 원인이다.
        mimeType: 'text/csv;charset=utf-8',
        content: toCsv(rows),
      },
    }
  }
}

/**
 * 재생목록 이름이 그대로 파일 이름이 된다. 경로 구분자와 OS 가 싫어하는 문자를 지운다
 * — 사용자가 재생목록 이름에 `/` 를 넣는 일은 생각보다 흔하다.
 */
export function safeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim()
  return `${cleaned || 'playlist'}.csv`
}
