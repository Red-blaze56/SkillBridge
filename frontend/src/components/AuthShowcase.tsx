import type { ReactNode } from 'react'
import { Activity, Check, MessageCircle, TrendingUp, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// Fade the cards out where they run off the panel's left and right edges.
const EDGE_FADE = 'linear-gradient(to right, transparent 0%, #000 13%, #000 87%, transparent 100%)'

interface ShowcaseCardProps {
  label: string
  footer: string
  icon: LucideIcon
  className?: string // the tilt and offset that make the row look laid down by hand
  children: ReactNode
}

function ShowcaseCard({ label, footer, icon: Icon, className, children }: ShowcaseCardProps) {
  return (
    <div
      className={cn(
        'w-72 shrink-0 rounded-2xl bg-card p-[18px] pb-3.5 text-card-foreground shadow-[0_18px_40px_-18px_rgba(0,0,0,0.5)]',
        className,
      )}
    >
      <span className="label-caps">{label}</span>
      {children}
      <div className="mt-4 flex items-center gap-2.5 border-t border-[#ece8de] pt-3 text-[13px]">
        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] border-[1.5px] border-primary">
          <Icon className="size-4 text-primary" aria-hidden="true" />
        </span>
        {footer}
      </div>
    </div>
  )
}

// The dark pine panel beside the login and register forms. It shows sample cards from the
// interview screen and report, so people see what the app does before signing up.
// Decorative: the text in it is illustrative, not real data.
export function AuthShowcase({ className }: { className?: string }) {
  return (
    <section
      aria-label="What an interview looks like"
      className={cn(
        'flex-[1.25] flex-col overflow-hidden rounded-3xl bg-showcase bg-[radial-gradient(70%_55%_at_85%_12%,rgba(120,160,135,0.22),transparent_70%)] pt-16 pl-16 text-[#f2eee4]',
        className,
      )}
    >
      <span className="self-start rounded-full border border-[#3d5446] px-3 py-1.5 text-xs font-semibold tracking-[0.12em] text-[#c9d3cb] uppercase">
        Mock interviews
      </span>
      <h2 className="mt-7 mr-16 max-w-[14em] font-heading text-5xl leading-[1.08] font-medium italic xl:text-[54px]">
        Practise the interview before it counts.
      </h2>
      <p className="mt-5 mr-16 max-w-[30em] text-[17px] text-[#c9d3cb]">
        An AI interviewer follows up on what you actually said, then hands back a scored report on how you did.
      </p>

      <div className="min-h-12 flex-1" />

      {/* Two cards whole in the middle; the outer two run off the panel and fade out. */}
      <div
        aria-hidden="true"
        className="mb-11 -ml-16 flex items-center justify-center gap-[22px] overflow-hidden py-6 pr-20"
        style={{ maskImage: EDGE_FADE, WebkitMaskImage: EDGE_FADE }}
      >
        <ShowcaseCard label="Overall score" footer="From your report" icon={TrendingUp} className="translate-y-2.5 -rotate-[2.5deg]">
          <p className="mt-1.5 font-heading">
            <span className="text-[44px] font-semibold text-positive">7.5</span>
            <span className="text-base text-muted-foreground"> / 10</span>
          </p>
        </ShowcaseCard>

        <ShowcaseCard label="Technical" footer="Your turn" icon={MessageCircle} className="-rotate-[1.5deg]">
          <p className="mt-3 font-heading text-xl leading-snug">How would you stop a cache from serving stale profile data?</p>
        </ShowcaseCard>

        <ShowcaseCard
          label="AI · Next question"
          footer="Written from your last answer"
          icon={Activity}
          className="-translate-y-3.5 rotate-[1.5deg] shadow-[0_22px_44px_-18px_rgba(0,0,0,0.55)]"
        >
          <p className="mt-2.5 font-medium">You said it got “a lot faster”. How much faster, and where did you measure it?</p>
        </ShowcaseCard>

        <ShowcaseCard label="Topics" footer="Updates as you answer" icon={Check} className="translate-y-1.5 rotate-[2.5deg]">
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {['REST APIs', 'Caching'].map((topic) => (
              <li key={topic} className="flex items-center gap-2.5 rounded-[10px] border px-2.5 py-2">
                <Check className="size-4 text-positive" />
                {topic}
              </li>
            ))}
            <li className="flex items-center gap-2.5 rounded-[10px] bg-accent px-2.5 py-2 font-medium">
              <span className="mx-1 size-2 rounded-full bg-primary" />
              Invalidation
            </li>
          </ul>
        </ShowcaseCard>
      </div>
    </section>
  )
}
