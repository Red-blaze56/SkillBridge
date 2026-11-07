import { Badge } from '@/components/ui/badge'
import { useServerStatus, type ServerStatus } from '@/hooks/useServerStatus'
import { cn } from '@/lib/utils'

// Online stays quiet (only the dot is green); offline is the one that should catch the eye.
const STYLES: Record<ServerStatus, { label: string; badge: string; dot: string }> = {
  online: {
    label: 'Server online',
    badge: 'border-border bg-card text-muted-foreground',
    dot: 'bg-emerald-600',
  },
  offline: {
    label: 'Server offline',
    badge: 'border-destructive/40 bg-card text-destructive',
    dot: 'bg-destructive',
  },
  checking: {
    label: 'Checking…',
    badge: 'border-border bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground/60',
  },
}

export function ServerStatusBadge() {
  const status = useServerStatus()
  const { label, badge, dot } = STYLES[status]

  return (
    <Badge variant="outline" className={cn('h-7 gap-2 rounded-full px-3 text-xs font-medium', badge)} role="status">
      <span className={cn('size-2 rounded-full', dot)} aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </Badge>
  )
}
