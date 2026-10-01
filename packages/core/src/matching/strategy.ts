import type { SearchPort } from '../domain/adapter'
import type { MatchMethod } from '../domain/result'
import type { SourceTrack, TargetTrack } from '../domain/track'

/** 전략이 곡을 찾아냈을 때의 결과. 못 찾으면 null 을 돌려 다음 전략으로 넘긴다. */
export type Candidate = {
  target: TargetTrack
  /** 0~1 */
  confidence: number
}

/**
 * 매칭 전략 하나.
 *
 * 전략은 "찾았다/못 찾았다"만 말하고 **실패 사유를 정하지 않는다.**
 * 사유 판정은 모든 전략이 끝난 뒤 matchTrack 이 한 곳에서 한다 —
 * 전략마다 사유를 돌려주면 계단식에서 어느 사유를 채택할지가 모호해진다.
 */
export interface MatchStrategy {
  readonly method: MatchMethod
  attempt(source: SourceTrack, port: SearchPort): Promise<Candidate | null>
}
