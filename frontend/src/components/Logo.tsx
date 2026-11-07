import { cn } from '@/lib/utils'

// Waveform bars: [x, height]. Heights are what make it read as "voice".
const BARS: [number, number][] = [
  [3, 8],
  [8, 16],
  [13, 26],
  [18, 18],
  [23, 10],
]

// compact: on small screens show only the icon (the name stays for screen readers).
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true" className="text-foreground">
        {BARS.map(([x, h]) => (
          <rect key={x} x={x} y={(30 - h) / 2} width="3.5" height={h} rx="1.75" fill="currentColor" />
        ))}
      </svg>
      <span className={cn('font-heading text-xl font-semibold whitespace-nowrap', compact && 'max-sm:sr-only')}>
        AI Interview Simulator
      </span>
    </div>
  )
}
