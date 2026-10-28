import { useEffect, useState } from 'react'
import { request } from '@/api/client'

export type ServerStatus = 'checking' | 'online' | 'offline'

// Polls the backend's /health (which also checks the database), so the badge
// reflects reality instead of being a hard-coded green dot.
export function useServerStatus(intervalMs = 30_000): ServerStatus {
  const [status, setStatus] = useState<ServerStatus>('checking')

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        await request('/health', { auth: false })
        if (!cancelled) setStatus('online')
      } catch {
        if (!cancelled) setStatus('offline')
      }
    }

    void check()
    const id = setInterval(check, intervalMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [intervalMs])

  return status
}
