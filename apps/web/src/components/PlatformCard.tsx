import { ArrowRight, Check, Loader2 } from 'lucide-react'
import { Music2 } from 'lucide-react'
import type { PlatformInfo } from '../lib/platforms'
import './PlatformCard.css'

export function PlatformCard({
  platform,
  state = 'idle',
  onClick,
}: {
  platform: PlatformInfo
  state?: 'idle' | 'connecting' | 'selected'
  onClick: () => void
}) {
  const disabled = !platform.available || state === 'connecting'

  return (
    <button
      className={`platform-card${state === 'selected' ? ' selected' : ''}`}
      disabled={disabled}
      onClick={onClick}
      aria-label={`${platform.name} 선택`}
    >
      <span className="platform-mark" style={{ background: platform.accent }}>
        <Music2 size={22} strokeWidth={2.2} />
      </span>

      <span className="platform-body">
        <span className="platform-name">
          {platform.name}
          {!platform.available && <span className="platform-badge">준비 중</span>}
        </span>
        <span className="platform-tagline">{platform.tagline}</span>
      </span>

      <span className="platform-tail">
        {state === 'connecting' ? (
          <Loader2 size={18} className="spin" />
        ) : state === 'selected' ? (
          <Check size={18} color="var(--accent)" />
        ) : (
          <ArrowRight size={18} />
        )}
      </span>
    </button>
  )
}
