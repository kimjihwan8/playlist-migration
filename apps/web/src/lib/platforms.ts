export type PlatformId = 'spotify' | 'apple' | 'youtube' | 'csv'

export type PlatformInfo = {
  id: PlatformId
  name: string
  /** 카드에 보여줄 한 줄 설명 */
  tagline: string
  accent: string
  /** 어댑터가 구현된 플랫폼만 true. P1은 Spotify 하나뿐이다. */
  available: boolean
  roles: Array<'source' | 'target'>
  /** 어떤 방식으로 연결되는지 — OAuth냐 파일 업로드냐 */
  connect: 'oauth' | 'file'
}

/**
 * 화면에 보이는 플랫폼 목록. 어댑터가 하나 늘면 여기 한 줄이 늘고
 * 화면 코드는 바뀌지 않는다 — 어댑터 패턴이 UI에 드러나는 지점.
 */
export const PLATFORMS: PlatformInfo[] = [
  {
    id: 'spotify',
    name: 'Spotify',
    tagline: 'ISRC를 제공해서 매칭 정확도가 가장 높아요',
    accent: '#1db954',
    available: true,
    roles: ['source', 'target'],
    connect: 'oauth',
  },
  {
    id: 'apple',
    name: 'Apple Music',
    tagline: '개발자 프로그램 등록이 필요해요',
    accent: '#fa2d48',
    available: false,
    roles: ['source', 'target'],
    connect: 'oauth',
  },
  {
    id: 'youtube',
    name: 'YouTube Music',
    tagline: 'ISRC가 없어 제목·아티스트로 매칭해요',
    accent: '#ff2d55',
    available: false,
    roles: ['source', 'target'],
    connect: 'oauth',
  },
  {
    id: 'csv',
    name: 'CSV 파일',
    // 로그인이 필요 없는 유일한 목적지라, 계정을 연결할 수 없는 사람도 결과를 받아갈 수 있다.
    tagline: '로그인 없이 파일로 내려받아요',
    accent: '#8a8496',
    available: true,
    // 소스로 읽는 것(파일 업로드)은 아직이다. 지금은 내보내기만.
    roles: ['target'],
    connect: 'file',
  },
]

export const platformById = (id: PlatformId): PlatformInfo =>
  PLATFORMS.find((p) => p.id === id)!
