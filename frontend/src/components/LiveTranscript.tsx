import { useEffect, useRef } from 'react'
import type { Message } from '@/api/interviews'
import { RichText } from '@/components/RichText'
import { cn } from '@/lib/utils'

// The conversation so far, always visible beside the question. The newest interviewer
// message is boxed and says where it came from. Only the opening question is fixed text:
// every later one is written by the AI from the transcript, which is what the caption says.
export function LiveTranscript({ messages }: { messages: Message[] }) {
  const listRef = useRef<HTMLOListElement>(null)
  const latestQuestionId = messages.findLast((m) => m.sender === 'interviewer')?.id
  const openingId = messages[0]?.id

  // Keep the newest message in view without scrolling the whole page.
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages.length])

  return (
    <section aria-label="Live transcript">
      <h2 className="label-caps border-b pb-2">Live transcript</h2>

      <ol ref={listRef} className="mt-4 flex max-h-[min(46svh,28rem)] flex-col gap-5 overflow-y-auto pr-1">
        {messages.map((message) => {
          const mine = message.sender === 'candidate'
          const latest = message.id === latestQuestionId

          if (latest) {
            const opening = message.id === openingId
            return (
              <li key={message.id} className="rounded-xl border bg-card px-4 py-3">
                <span className="label-caps text-foreground">{opening ? 'Opening question' : 'AI · Next question'}</span>
                <p className="mt-1 text-sm font-medium whitespace-pre-wrap">
                  <RichText text={message.content} />
                </p>
                {!opening && (
                  <p className="mt-2 text-xs text-muted-foreground italic">Written from your last answer.</p>
                )}
              </li>
            )
          }

          return (
            <li key={message.id} className="flex flex-col gap-1">
              <span className="label-caps">{mine ? 'You' : 'Interviewer'}</span>
              <p className={cn('text-sm whitespace-pre-wrap', mine ? 'text-muted-foreground' : 'text-foreground')}>
                {mine ? message.content : <RichText text={message.content} />}
              </p>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
