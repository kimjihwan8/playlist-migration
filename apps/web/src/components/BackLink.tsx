import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'

export function BackLink({ to, children }: { to: string; children: string }) {
  return (
    <Link to={to} className="back-link">
      <ArrowLeft size={14} /> {children}
    </Link>
  )
}
