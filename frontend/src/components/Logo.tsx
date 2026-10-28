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
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
        <defs>
          <linearGradient id="logo-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ec4899" />
            <stop offset="1" stopColor="#9333ea" />
          </linearGradient>
        </defs>
        {BARS.map(([x, h]) => (
          <rect key={x} x={x} y={(30 - h) / 2} width="3.5" height={h} rx="1.75" fill="url(#logo-gradient)" />
        ))}
      </svg>
      <span className={cn('text-xl font-bold tracking-tight whitespace-nowrap', compact && 'max-sm:sr-only')}>
        AI Interview Simulator
      </span>
    </div>
  )
}
