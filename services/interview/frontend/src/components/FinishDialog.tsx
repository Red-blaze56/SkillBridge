import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface FinishDialogProps {
  answered: number // how many answers the candidate has given so far
  highlight?: boolean // true once the interviewer has said it is wrapping up
  disabled?: boolean
  label?: string
  className?: string
  onConfirm: () => void
}

// Finishing ends the interview and asks the AI for the report, so it is confirmed first.
export function FinishDialog({
  answered,
  highlight = false,
  disabled = false,
  label = 'Finish',
  className,
  onConfirm,
}: FinishDialogProps) {
  const [open, setOpen] = useState(false)

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        disabled={disabled}
        render={<Button variant={highlight ? 'default' : 'outline'} size="sm" className={cn('rounded-full', className)} />}
      >
        {label}
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Finish this interview?</AlertDialogTitle>
          <AlertDialogDescription>
            {answered === 0
              ? "You haven't answered anything yet, so the report will have little to go on. "
              : `You've given ${answered} ${answered === 1 ? 'answer' : 'answers'}. `}
            The interviewer will stop and write your report. You can't continue afterwards.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep going</AlertDialogCancel>
          <AlertDialogAction
            className="rounded-full"
            onClick={() => {
              setOpen(false)
              onConfirm()
            }}
          >
            Finish and get report
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
