import { describe, expect, it } from 'vitest'
import type { TargetTrack } from '@pm/core'
import { CsvTargetAdapter, safeFilename } from '../src/index'

const track = (over: Partial<TargetTrack> = {}): TargetTrack => ({
  id: 't1',
  uri: 'spotify:track:t1',
  title: '밤편지',
  artist: 'IU',
  album: 'Palette',
  durationMs: 254_000,
  isrc: 'KRA382000001',
  cover: null,
  url: '',
  ...over,
})

const write = (tracks: TargetTrack[], name = '출근길') =>
  new CsvTargetAdapter().write({ type: 'file', format: 'csv', name }, tracks)

describe('CsvTargetAdapter', () => {
  it('헤더와 행을 쓴다', async () => {
    const out = await write([track()])
    const [header, row] = out.download!.content.trim().split('\r\n')

    expect(header).toBe('title,artist,album,isrc,duration_ms')
    expect(row).toBe('밤편지,IU,Palette,KRA382000001,254000')
  })

  it('쉼표·따옴표가 든 제목을 깨지 않는다', async () => {
    const out = await write([track({ title: 'Hello, Goodbye', artist: '"Heroes"' })])

    expect(out.download!.content).toContain('"Hello, Goodbye","""Heroes"""')
  })

  it('없는 값은 빈 칸으로 둔다 — 0 이나 "null" 로 지어내지 않는다', async () => {
    const out = await write([track({ album: null, isrc: null, durationMs: null })])
    const row = out.download!.content.trim().split('\r\n')[1]

    expect(row).toBe('밤편지,IU,,,')
  })

  it('곡이 없어도 헤더는 남긴다 — 빈 파일은 "실패"처럼 보인다', async () => {
    const out = await write([])
    expect(out.download!.content.trim()).toBe('title,artist,album,isrc,duration_ms')
  })

  it('한글이 깨지지 않도록 charset 을 밝힌다', async () => {
    const out = await write([track()])
    expect(out.download!.mimeType).toContain('charset=utf-8')
  })

  it('매칭할 카탈로그가 없다고 선언한다', () => {
    expect(new CsvTargetAdapter().passthrough).toBe(true)
  })

  it('파일 목적지가 아니면 거절한다', async () => {
    await expect(
      new CsvTargetAdapter().write({ type: 'liked' }, [track()]),
    ).rejects.toThrow()
  })
})

describe('safeFilename', () => {
  it('재생목록 이름을 파일 이름으로 쓴다', () => {
    expect(safeFilename('출근길')).toBe('출근길.csv')
  })

  it('경로 구분자를 지운다 — 이름에 / 를 넣는 사람이 생각보다 많다', () => {
    expect(safeFilename('2026/01 겨울')).toBe('2026_01 겨울.csv')
  })

  it('이름이 비면 기본값을 쓴다', () => {
    expect(safeFilename('   ')).toBe('playlist.csv')
  })
})
