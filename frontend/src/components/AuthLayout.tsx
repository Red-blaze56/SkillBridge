import type { ReactNode } from 'react'
import { AuthShowcase } from '@/components/AuthShowcase'
import { Logo } from '@/components/Logo'

interface AuthLayoutProps {
  title: string
  description: string
  children: ReactNode
}

// Shared frame for the logged-out pages: logo, title and the page's form on the left;
// on wide screens, a dark panel on the right showing what an interview looks like.
export function AuthLayout({ title, description, children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-svh gap-4 bg-background p-4">
      <main className="flex flex-1 items-center justify-center px-2 py-10 sm:px-6">
        <div className="w-full max-w-sm">
          <Logo />
          <h1 className="mt-12 font-heading text-4xl font-semibold">{title}</h1>
          <p className="mt-1.5 text-muted-foreground">{description}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>

      <AuthShowcase className="hidden lg:flex" />
    </div>
  )
}
