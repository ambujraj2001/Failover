import { ArrowLeft, Clock } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { VERDICT_LABEL } from '@/components/learn/shared'
import { buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import type { Axis, InterviewStatus, Scores, Verdict } from './types'

export const MEETS_BAR = 70
/** Server keeps an interview finishable (and chat open) for this long past the deadline. */
export const GRACE_MS = 3 * 60_000

export const AXES: { key: Axis; label: string; help: string }[] = [
  { key: 'problem_navigation', label: 'Problem navigation', help: 'Asking the right questions, setting the scope and leading the conversation.' },
  { key: 'solution_design', label: 'Solution design', help: 'A design that meets the requirements and passes the simulator.' },
  { key: 'technical_excellence', label: 'Technical excellence', help: 'Depth on trade-offs, bottlenecks, failures and cost.' },
  { key: 'communication', label: 'Communication', help: 'Clear reasoning and direct answers to follow-up questions.' },
]

export const LEVELS = [
  { value: 'E4', title: 'E4', role: 'Mid-level', body: 'Build a complete design that works, with sensible components and numbers.' },
  { value: 'E5', title: 'E5', role: 'Senior', body: 'Lead the scope, estimate the load and defend your trade-offs.' },
  { value: 'E6', title: 'E6', role: 'Staff', body: 'Handle ambiguity, failures and cost as first-class concerns.' },
] as const

export function levelRole(level: string): string | undefined {
  return LEVELS.find((l) => l.value === level)?.role
}

export function avgScore(scores: Scores | null | undefined): number | null {
  if (!scores) return null
  const v = Object.values(scores)
  if (!v.length) return null
  return Math.round(v.reduce((a, b) => a + b, 0) / v.length)
}

export function verdictLabel(verdict: Verdict | null): string {
  return verdict ? (VERDICT_LABEL[verdict]?.label ?? verdict) : 'Not scored'
}

/** Verdict as a soft pill. Status colours only; a lean hire sits on the bar, so it stays neutral. */
export function VerdictBadge({ verdict, className }: { verdict: Verdict; className?: string }) {
  const tone = VERDICT_LABEL[verdict]?.tone ?? 'neutral'
  return (
    <Badge tone={tone === 'brand' ? 'neutral' : tone} className={cn('normal-case', className)}>
      {verdictLabel(verdict)}
    </Badge>
  )
}

const STATUS: Record<InterviewStatus, { label: string; tone: 'neutral' | 'warn' | 'brand' }> = {
  active: { label: 'In progress', tone: 'brand' },
  completed: { label: 'Not scored', tone: 'neutral' },
  abandoned: { label: 'Abandoned', tone: 'neutral' },
  expired: { label: 'Time ran out', tone: 'neutral' },
}

/** Result of an interview as a soft pill: the verdict when there is one, otherwise the status. */
export function ResultBadge({ status, verdict, className }: { status: InterviewStatus; verdict: Verdict | null; className?: string }) {
  if (verdict) return <VerdictBadge verdict={verdict} className={className} />
  const s = STATUS[status] ?? { label: status, tone: 'neutral' as const }
  return (
    <Badge tone={s.tone} className={cn('normal-case', className)}>
      {s.label}
    </Badge>
  )
}

/**
 * Calm segmented control. `mode="radio"` for a choice, `mode="tab"` to switch panels
 * (pass `controls` with the panel ids). Arrow keys move between options.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  mode = 'radio',
  controls,
  full = false,
  size = 'md',
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
  label: string
  mode?: 'radio' | 'tab'
  controls?: Partial<Record<T, string>>
  full?: boolean
  size?: 'sm' | 'md'
  className?: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length
    onChange(options[n].value)
    refs.current[n]?.focus()
  }
  const tab = mode === 'tab'
  return (
    <div
      role={tab ? 'tablist' : 'radiogroup'}
      aria-label={label}
      className={cn('gap-1 rounded-xl bg-white/[0.04] p-1', full ? 'flex w-full' : 'inline-flex', className)}
    >
      {options.map((o, i) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role={tab ? 'tab' : 'radio'}
            aria-checked={tab ? undefined : active}
            aria-selected={tab ? active : undefined}
            aria-controls={controls?.[o.value]}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors duration-150',
              size === 'sm' ? 'h-7 px-3 text-[13px]' : 'h-9 px-4 text-[13.5px]',
              full && 'min-w-0 flex-1',
              active ? 'bg-white/[0.08] text-fg shadow-[inset_0_1px_0_0_rgb(255_255_255/0.05)]' : 'text-fg-subtle hover:text-fg',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Top bar of the interview room and its result pages. */
export function RoomBar({
  title,
  level,
  heading = false,
  children,
}: {
  title?: string
  level?: string
  /** Render the title as the page's h1 (the live room); result pages carry their own h1. */
  heading?: boolean
  children?: ReactNode
}) {
  const Title = heading ? 'h1' : 'p'
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.06] bg-ink-950/80 px-3 backdrop-blur-xl sm:gap-3 sm:px-4">
      <Link
        to="/app/interviews"
        aria-label="Back to interviews"
        className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'shrink-0')}
      >
        <ArrowLeft />
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {title ? (
          <Title className="truncate font-sans text-[14.5px] font-medium tracking-[-0.01em] text-fg">{title}</Title>
        ) : (
          <p className="text-[14.5px] text-fg-subtle">Mock interview</p>
        )}
        {level && (
          <Badge className="hidden shrink-0 sm:inline-flex" title={levelRole(level)}>
            {level}
          </Badge>
        )}
      </div>
      {children}
    </header>
  )
}

/** The four scores as rows: label, a rounded bar with a subtle marker at the bar, the score. */
export function ScoreRows({ scores, level }: { scores: Scores; level: string }) {
  return (
    <ul className="space-y-7">
      {AXES.map((a) => {
        const v = Math.max(0, Math.min(100, Math.round(scores[a.key] ?? 0)))
        const meets = v >= MEETS_BAR
        return (
          <li key={a.key}>
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[15px] font-medium text-fg">{a.label}</span>
              <span className="num text-[15px] text-fg">{v}</span>
            </div>
            <p className="mt-0.5 text-[13px] text-fg-subtle">{a.help}</p>
            <div
              className="relative mt-3"
              role="meter"
              aria-label={`${a.label}: ${v} out of 100. The ${level} bar is ${MEETS_BAR}.`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={v}
            >
              <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className={cn('h-full rounded-full transition-[width] duration-700', meets ? 'bg-fg' : 'bg-warn/70')}
                  style={{ width: `${v}%` }}
                />
              </div>
              <span
                className="absolute -top-1 h-4 w-px rounded-full bg-white/35"
                style={{ left: `${MEETS_BAR}%` }}
                aria-hidden="true"
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Parse a server timestamp; tolerate a missing timezone by treating it as UTC. */
export function parseTime(iso: string): number {
  const hasTz = /([zZ]|[+-]\d\d:?\d\d)$/.test(iso)
  return new Date(hasTz ? iso : `${iso}Z`).getTime()
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(t)
  }, [intervalMs])
  return now
}

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function fmtDuration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000))
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

export function fmtDate(iso: string): string {
  return new Date(parseTime(iso)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const TIMER_TONE = {
  calm: 'bg-white/[0.05] text-fg',
  warn: 'bg-warn/10 text-warn',
  crit: 'bg-crit/10 text-crit',
} as const

/** Timer pill: neutral, amber in the last 10 minutes, red in the last 3. */
export function Countdown({ remainingMs }: { remainingMs: number }) {
  const up = remainingMs <= 0
  const tone = up || remainingMs < 3 * 60_000 ? 'crit' : remainingMs < 10 * 60_000 ? 'warn' : 'calm'
  const mins = Math.max(0, Math.ceil(remainingMs / 60_000))
  return (
    <div
      role="timer"
      aria-label={up ? 'Time is up' : `${mins} minute${mins === 1 ? '' : 's'} left`}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 transition-colors duration-200',
        TIMER_TONE[tone],
      )}
    >
      <Clock className="hidden size-3.5 opacity-70 sm:block" aria-hidden="true" />
      <span className="font-mono text-[14px] leading-none font-medium tabular-nums" aria-hidden="true">
        {fmtClock(remainingMs)}
      </span>
    </div>
  )
}
