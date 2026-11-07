import { useEffect, useState } from 'react'

// Seconds since this page opened, while `running`. It measures time on this page, not the
// age of the interview, so resuming one from History starts again at 00:00.
export function useSessionTimer(running: boolean): number {
  const [startedAt] = useState(() => Date.now())
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!running) return
    // Derived from the clock each tick, so a throttled background tab doesn't drift.
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [running, startedAt])

  return elapsed
}
