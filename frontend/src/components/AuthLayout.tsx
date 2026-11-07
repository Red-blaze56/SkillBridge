import type { ReactNode } from 'react'
import { Logo } from '@/components/Logo'

// Shared frame for the logged-out pages: patterned panel, logo on top,
// the page's card in the middle, tagline at the bottom.
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh bg-background p-2 sm:p-3">
      <div className="bg-plus-pattern flex min-h-[calc(100svh-1rem)] flex-col rounded-2xl border sm:min-h-[calc(100svh-1.5rem)]">
        <header className="flex justify-center px-4 pt-8 sm:pt-10">
          <Logo />
        </header>

        <main className="flex flex-1 items-center justify-center px-4 py-8">{children}</main>

        <footer className="px-4 pb-8 text-center text-xs text-muted-foreground">
          <p className="font-semibold">AI Interview Simulator: practice the real thing</p>
          <p className="mx-auto mt-1 max-w-md">
            Answer questions from an AI interviewer that follows up on what you say, then get a scored
            report with your strengths and what to work on.
          </p>
        </footer>
      </div>
    </div>
  )
}
