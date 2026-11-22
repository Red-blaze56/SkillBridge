import { useEffect, useRef, useState } from 'react'
import { Video, VideoOff } from 'lucide-react'
import { Button } from '@/components/ui/button'

function cameraErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError') return "Camera access was blocked. Allow it in your browser's site settings, then try again."
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device.'
  if (name === 'NotReadableError') return 'Your camera is being used by another app.'
  return "Your camera couldn't be started."
}

// Optional self-view, so practice feels like a video interview. The picture stays in this
// tab: nothing is recorded or sent anywhere. Off until the user turns it on.
export function CameraPreview() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const mounted = useRef(true)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Browsers only offer the camera on HTTPS and localhost.
  const supported = Boolean(navigator.mediaDevices?.getUserMedia)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // Show the stream, and switch the camera off when it's turned off or the page closes.
  useEffect(() => {
    if (!stream) return
    if (videoRef.current) videoRef.current.srcObject = stream
    return () => stream.getTracks().forEach((track) => track.stop())
  }, [stream])

  async function turnOn() {
    setError(null)
    setStarting(true)
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      // Left the page while the permission prompt was open: don't leave the camera light on.
      if (!mounted.current) {
        media.getTracks().forEach((track) => track.stop())
        return
      }
      setStream(media)
    } catch (err) {
      if (mounted.current) setError(cameraErrorMessage(err))
    } finally {
      if (mounted.current) setStarting(false)
    }
  }

  return (
    <section aria-label="Your camera">
      <div className="flex min-h-8 items-center justify-between gap-2 border-b pb-2">
        <h2 className="label-caps">Your camera</h2>
        {stream && (
          <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setStream(null)}>
            <VideoOff />
            Turn off
          </Button>
        )}
      </div>

      {stream ? (
        <figure className="mt-3">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            aria-label="Your camera"
            className="aspect-video w-full -scale-x-100 rounded-xl border bg-muted object-cover"
          />
          <figcaption className="mt-2 text-xs text-muted-foreground">Only you can see this. Nothing is recorded.</figcaption>
        </figure>
      ) : (
        <div className="mt-3 flex flex-col items-start gap-3 rounded-xl border border-dashed px-4 py-4">
          <p className="text-sm text-muted-foreground">
            Answer on camera to get used to being watched. Only you can see it, and nothing is recorded.
          </p>
          {supported ? (
            <Button variant="outline" size="sm" className="rounded-full" disabled={starting} onClick={() => void turnOn()}>
              <Video />
              {starting ? 'Starting camera…' : 'Turn on camera'}
            </Button>
          ) : (
            <p className="text-sm">The camera needs a secure (HTTPS) connection, which this page doesn't have.</p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
