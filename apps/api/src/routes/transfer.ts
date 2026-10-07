import { Hono } from 'hono'
import {
  exportResults,
  matchAll,
  sourceNote,
  type Destination,
  type MatchResult,
  type SourceTrack,
  type TargetTrack,
  type WrittenDestination,
} from '@pm/core'
import { adapterFor, targetAdapterFor } from '../lib/adapters'
import { record, step, type SpotifyCall } from '../lib/trace'
import { loadEnv, type Env } from '../lib/env'

/** 화면이 그대로 렌더링하는 모양. 내부 용어(ISRC)는 라벨링을 프론트에 맡긴다. */
type TrackView = { title: string; artist: string; cover: string | null }

type TrackResult =
  | {
      status: 'MATCHED'
      method: string
      source: TrackView
      target: TrackView & { album: string | null; url: string }
    }
  | { status: 'FAILED'; reason: string; source: TrackView }

type TransferItem = {
  playlistId: string
  trackIds: 'all' | string[]
  destination: { type: 'new'; name: string } | { type: 'liked' } | { type: 'file'; name: string }
}

export function transferRoutes(env: Env = loadEnv()) {
  const app = new Hono()

  /**
   * P1 은 동기 한 방이다. **작은 재생목록에서만 끝까지 간다** —
   * API Gateway 의 29초 하드리밋이 있고, 곡마다 검색 1회 + 쓰기 배치가 붙기 때문이다.
   * 이 한계에 실제로 부딪히는 것이 P2(비동기 워커 + 폴링)의 명분이므로 지금 피해가지 않는다.
   */
  app.post('/', async (c) => {
    const body = await c.req.json<{ items: TransferItem[]; targetPlatform?: string }>()
    const items = body.items ?? []
    if (items.length === 0) return c.json({ error: '옮길 재생목록이 없다' }, 400)

    const startedAt = Date.now()
    const steps: Record<string, number> = {}
    const calls: SpotifyCall[] = []
    const onCall = (method: string, path: string, ms: number, status: number) =>
      void calls.push({ method, path, ms, status })

    const source = await adapterFor(c, env, 'source', onCall)
    const target = await targetAdapterFor(c, env, body.targetPlatform ?? 'spotify', onCall)

    // 설명에 넣을 원본 이름·소유자를 알아야 해서 목록을 한 번 읽는다.
    const playlists = await step(steps, 'listPlaylists', () => source.listPlaylists())

    const destinations: WrittenDestination[] = []
    const tracks: TrackResult[] = []

    for (const item of items) {
      const playlist = playlists.find((p) => p.id === item.playlistId)
      if (!playlist) return c.json({ error: `재생목록을 찾을 수 없다: ${item.playlistId}` }, 404)

      // 화면이 이미 막지만, 저장해 둔 선택이 남아 다시 올라올 수 있다.
      // 여기서 걸러야 "읽을 수 없는 재생목록" 하나가 작업 전체를 503 으로 끌어내리지 않는다.
      if (!playlist.owned) {
        return c.json(
          { error: 'not_readable', playlistId: playlist.id, name: playlist.name },
          400,
        )
      }

      const all = await step(steps, 'listTracks', () => source.listTracks(item.playlistId))
      const picked: SourceTrack[] =
        item.trackIds === 'all' ? all : all.filter((t) => item.trackIds.includes(t.id))

      /**
       * 대조할 카탈로그가 없는 타겟(CSV)은 매칭을 건너뛴다.
       * 돌려봐야 전부 NOT_FOUND_IN_TARGET 으로 떨어지는데, 그건 거짓이다 —
       * 못 찾은 게 아니라 찾을 곳이 없는 것이다.
       */
      const results = await step(steps, 'match', async () =>
        target.passthrough ? exportResults(picked) : matchAll(picked, target),
      )
      tracks.push(...results.map(toTrackResult))

      // 찾은 곡만, 원래 순서대로 쓴다.
      const found = results.flatMap((r) => (r.status === 'MATCHED' ? [r.target] : []))
      if (found.length > 0) {
        destinations.push(
          await step(steps, 'write', () =>
            target.write(destinationFor(item, playlist.name, playlist.owner, playlist.kind), found),
          ),
        )
      }
    }

    if (!env.isProd) {
      record({
        at: new Date().toISOString(),
        route: 'POST /transfer',
        totalMs: Date.now() - startedAt,
        steps,
        items: items.length,
        tracks: tracks.length,
        calls,
      })
    }

    return c.json({ destinations, tracks })
  })

  return app
}

function destinationFor(
  item: TransferItem,
  name: string,
  owner: string,
  kind: 'playlist' | 'liked',
): Destination {
  if (item.destination.type === 'liked') return { type: 'liked' }
  if (item.destination.type === 'file') {
    return { type: 'file', format: 'csv', name: item.destination.name || name }
  }
  return {
    type: 'new',
    name: item.destination.name,
    // 출처를 자동으로 남긴다. 편집 UI 는 없다 — 설명 칸은 홍보 자리가 아니다.
    description: sourceNote({ name, owner, kind }, 'Spotify'),
  }
}

function toTrackResult(r: MatchResult): TrackResult {
  const source = { title: r.source.title, artist: r.source.artist, cover: r.source.cover }
  if (r.status === 'FAILED') return { status: 'FAILED', reason: r.reason, source }
  return { status: 'MATCHED', method: r.method, source, target: view(r.target) }
}

const view = (t: TargetTrack) => ({
  title: t.title,
  artist: t.artist,
  album: t.album,
  cover: t.cover,
  url: t.url,
})
