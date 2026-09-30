import type { ReactNode } from 'react'
import { Logo } from './Logo'

export function TopBar({ children }: { children?: ReactNode }) {
  return (
    <header className="topbar">
      <Logo />
      {children ?? (
        <span className="topbar-note">
          토큰은 세션에만 보관돼요 <span className="topbar-dot" />
        </span>
      )}
    </header>
  )
}
