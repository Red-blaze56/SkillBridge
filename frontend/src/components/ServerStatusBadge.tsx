import { Badge } from '@/components/ui/badge'
import { useServerStatus, type ServerStatus } from '@/hooks/useServerStatus'
import { cn } from '@/lib/utils'

const STYLES: Record<ServerStatus, { label: string; badge: string; dot: string }> = {
  online: {
    label: 'Server online',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  offline: {
    label: 'Server offline',
    badge: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
    dot: 'bg-red-500',
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
