import { Music2 } from 'lucide-react'

export function Logo() {
  return (
    <div className="logo">
      <span className="logo-mark">
        <Music2 size={17} strokeWidth={2.5} />
      </span>
      <span className="logo-text">Playlist Migrator</span>
    </div>
  )
}
