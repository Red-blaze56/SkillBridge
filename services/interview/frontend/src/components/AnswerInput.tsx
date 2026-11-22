import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowUp, LoaderCircle, Mic } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useDictation } from '@/hooks/useSpeech'
import { cn } from '@/lib/utils'

interface AnswerInputProps {
  // Resolve when the answer was accepted. Reject to keep what the user typed.
  onSend: (text: string) => Promise<void>
  sending: boolean
  disabled?: boolean
}

export function AnswerInput({ onSend, sending, disabled = false }: AnswerInputProps) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const baseRef = useRef('') // whatever was already typed when dictation started
  const locked = sending || disabled

  // Voice answers flow straight into the textarea; the user can still edit before sending.
  const { start, stop, listening, supported: micSupported } = useDictation({
    onTranscript: (text) => {
      const base = baseRef.current
      setValue(base ? `${base} ${text}` : text)
    },
  })

  // Back into the box as soon as the interviewer has replied.
  useEffect(() => {
    if (!locked) ref.current?.focus()
  }, [locked])

  // If the turn locks (sending / finishing) mid-recording, stop listening.
  useEffect(() => {
    if (locked && listening) stop()
  }, [locked, listening, stop])

  function toggleMic() {
    if (listening) {
      stop()
      return
    }
    baseRef.current = value.trim()
    start()
  }

  async function submit() {
    const text = value.trim()
    if (!text || locked) return
    if (listening) stop()
    try {
      await onSend(text)
      setValue('')
    } catch {
      // The page shows the error. The text stays so nothing is lost.
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter adds a line. Ignore the Enter that confirms an IME composition.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void submit()
    }
  }

  return (
    <div className="flex items-end gap-2">
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={locked}
        rows={2}
        placeholder="Type your answer. Enter to send, Shift+Enter for a new line."
        aria-label="Your answer"
        className="max-h-48 min-h-14 rounded-xl bg-card"
      />

      <Button
        type="button"
        variant={listening ? 'default' : 'outline'}
        size="icon-lg"
        className={cn('rounded-full', listening && 'animate-pulse')}
        onClick={toggleMic}
        disabled={locked || !micSupported}
        aria-pressed={listening}
        aria-label={
          !micSupported ? 'Voice input not supported in this browser' : listening ? 'Stop voice input' : 'Answer by voice'
        }
        title={
          !micSupported ? 'Voice input needs Chrome or Edge' : listening ? 'Stop recording' : 'Answer by voice'
        }
      >
        <Mic />
      </Button>

      <Button
        type="button"
        size="icon-lg"
        className="rounded-full"
        onClick={() => void submit()}
        disabled={locked || !value.trim()}
        aria-label="Send answer"
      >
        {sending ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
      </Button>
    </div>
  )
}
