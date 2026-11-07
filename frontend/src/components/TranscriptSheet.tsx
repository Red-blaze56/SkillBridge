import { ScrollText } from 'lucide-react'
import type { Message } from '@/api/interviews'
import { RichText } from '@/components/RichText'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

// The whole conversation, for looking back at earlier questions.
export function TranscriptSheet({ messages, className }: { messages: Message[]; className?: string }) {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" size="sm" className={cn('rounded-full', className)} />}>
        <ScrollText />
        <span className="max-sm:sr-only">Transcript</span>
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Transcript</SheetTitle>
          <SheetDescription>{messages.length} messages</SheetDescription>
        </SheetHeader>

        <ol className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          {messages.map((message) => {
            const mine = message.sender === 'candidate'
            return (
              <li key={message.id} className={cn('flex flex-col gap-1', mine && 'items-end')}>
                <span className="text-xs font-medium text-muted-foreground">{mine ? 'You' : 'Interviewer'}</span>
                <p
                  className={cn(
                    'max-w-[90%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap',
                    mine ? 'bg-primary text-primary-foreground' : 'bg-muted',
                  )}
                >
                  {mine ? message.content : <RichText text={message.content} />}
                </p>
              </li>
            )
          })}
        </ol>
      </SheetContent>
    </Sheet>
  )
}
