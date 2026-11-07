import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowUp, LoaderCircle, Mic } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface AnswerInputProps {
  // Resolve when the answer was accepted. Reject to keep what the user typed.
  onSend: (text: string) => Promise<void>
  sending: boolean
  disabled?: boolean
}

export function AnswerInput({ onSend, sending, disabled = false }: AnswerInputProps) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const locked = sending || disabled

  // Back into the box as soon as the interviewer has replied.
  useEffect(() => {
    if (!locked) ref.current?.focus()
  }, [locked])

  async function submit() {
    const text = value.trim()
    if (!text || locked) return
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
        variant="outline"
        size="icon-lg"
        className="rounded-full"
        disabled
        aria-label="Voice answers (coming soon)"
        title="Voice answers are coming soon"
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
