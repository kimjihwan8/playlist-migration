export type {
  Destination,
  PlaylistKind,
  SearchPort,
  SourceAdapter,
  SourcePlaylist,
  TargetAdapter,
  WrittenDestination,
} from './domain/adapter'
export type { FailureReason, MatchMethod, MatchResult } from './domain/result'
export type { SourceTrack, TargetTrack } from './domain/track'

export { isrcStrategy, normalizeIsrc } from './matching/isrc'
export { DEFAULT_STRATEGIES, failureReason, matchAll, matchTrack } from './matching/match'
export type { Candidate, MatchStrategy } from './matching/strategy'

export { chunk, DEFAULT_BATCH_SIZE } from './transfer/batch'
export { sourceNote } from './transfer/description'
export {
  backoffMs,
  classifyHttpStatus,
  NETWORK_FAILURE,
  type FailureKind,
  type TransferStatus,
} from './transfer/failure'
