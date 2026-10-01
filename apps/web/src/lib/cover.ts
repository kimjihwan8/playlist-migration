import type { CSSProperties } from 'react'

/**
 * 재생목록 커버. 플랫폼이 이미지 URL 을 주기도 하고 안 주기도 한다
 * (새로 만든 재생목록, 곡이 없는 재생목록, "좋아하는 노래").
 *
 * 없을 때 색을 지어내지 않고 CSS 의 기본 배경이 그대로 보이게 둔다 —
 * 가짜 커버는 "이미지가 있다"는 잘못된 신호를 준다.
 */
export function coverStyle(cover: string | null): CSSProperties | undefined {
  if (!cover) return undefined
  return {
    backgroundImage: `url("${cover}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }
}
