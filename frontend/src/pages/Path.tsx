import { ArrowRight, Check, ChevronDown, Lock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { itemHref, kindLabel, pct } from '@/components/learn/format'
import { useCurriculum } from '@/components/learn/queries'
import { IconTile, KIND_ICON, PageIntro } from '@/components/learn/shared'
import { PageContainer } from '@/components/layout/AppShell'
import { Badge, ErrorBlock, Progress, Skeleton } from '@/components/ui/primitives'
import type { PathDay, PathPhase } from '@/lib/types'
import { cn } from '@/lib/utils'

function dayFromHash(hash: string): number | null {
  const m = /^#day-(\d+)$/.exec(hash)
  return m ? Number(m[1]) : null
}

export default function Path() {
  const q = useCurriculum()
  const { hash } = useLocation()
  const [open, setOpen] = useState<Set<number> | null>(null)
  const scrolled = useRef(false)

  const hashDay = dayFromHash(hash)
  const openDays = open ?? new Set(q.data ? [hashDay ?? q.data.current_day] : [])

  const toggle = (day: number) =>
    setOpen(() => {
      const next = new Set(openDays)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })

  // bring the linked day (or today) into view once the path loads
  useEffect(() => {
    if (!q.data || scrolled.current) return
    const targetDay = hashDay ?? (q.data.current_day > 1 ? q.data.current_day : null)
    if (targetDay == null) return
    scrolled.current = true
    requestAnimationFrame(() =>
      document.getElementById(`day-${targetDay}`)?.scrollIntoView({ block: hashDay ? 'start' : 'center', behavior: 'smooth' }),
    )
  }, [q.data, hashDay])

  if (q.isPending)
    return (
      <PageContainer>
        <div aria-busy="true" aria-label="Loading your path">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="mt-3 h-5 w-96 max-w-full" />
          <Skeleton className="mt-6 h-1.5 w-full max-w-md" />
          <div className="mt-10 space-y-6">
            <Skeleton className="h-80" />
            <Skeleton className="h-28" />
          </div>
        </div>
      </PageContainer>
    )
  if (q.isError)
    return (
      <PageContainer>
        <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
      </PageContainer>
    )

  const c = q.data
  const overall = pct(c.completed_items, c.total_items)

  return (
    <PageContainer>
      <PageIntro title="Learning path" className="mb-6">
        Thirty short days, from the basics to full designs. Each day has a few lessons and one hands-on lab.
      </PageIntro>

      <div className="mb-10 max-w-md">
        <div className="mb-2 flex justify-between text-[13px]">
          <span className="text-fg-muted">Day {Math.min(c.current_day, 30)} of 30</span>
          <span className="text-fg-subtle">{overall}% complete</span>
        </div>
        <Progress value={overall} />
      </div>

      <div className="space-y-6">
        {c.phases.map((p, i) =>
          p.unlocked ? (
            <PhaseCard key={p.id} phase={p} index={i} currentDay={c.current_day} openDays={openDays} onToggle={toggle} />
          ) : (
            <LockedPhase key={p.id} phase={p} index={i} prev={c.phases[i - 1]} />
          ),
        )}
      </div>
    </PageContainer>
  )
}

function dayRange(phase: PathPhase): string {
  const first = phase.days[0]?.day
  const last = phase.days[phase.days.length - 1]?.day
  if (first == null) return ''
  return first === last ? `Day ${first}` : `Days ${first}–${last}`
}

function checkpointOf(phase: PathPhase | undefined): { day: number; title: string } | null {
  if (!phase) return null
  for (const d of [...phase.days].reverse()) {
    const cp = d.items.find((it) => it.checkpoint)
    if (cp) return { day: d.day, title: cp.title }
  }
  return null
}

function LockedPhase({ phase, index, prev }: { phase: PathPhase; index: number; prev?: PathPhase }) {
  const cp = checkpointOf(prev)
  return (
    <section aria-labelledby={`phase-${phase.id}`} className="card flex items-start gap-4 p-6 opacity-70 sm:p-8">
      <IconTile>
        <Lock />
      </IconTile>
      <div className="min-w-0">
        <p className="text-[13px] text-fg-subtle">
          Phase {index + 1} · {dayRange(phase)}
        </p>
        <h2 id={`phase-${phase.id}`} className="mt-1 text-[17px] text-fg-muted">
          {phase.title}
        </h2>
        <p className="mt-1.5 text-[14px] text-fg-subtle">
          {cp ? `Pass the “${cp.title}” lab on day ${cp.day} to unlock this phase.` : 'Finish the previous phase to unlock this one.'}
        </p>
      </div>
    </section>
  )
}

function PhaseCard({
  phase,
  index,
  currentDay,
  openDays,
  onToggle,
}: {
  phase: PathPhase
  index: number
  currentDay: number
  openDays: Set<number>
  onToggle: (day: number) => void
}) {
  const done = phase.days.reduce((a, d) => a + d.done, 0)
  const total = phase.days.reduce((a, d) => a + d.total, 0)
  const complete = total > 0 && done >= total

  return (
    <section aria-labelledby={`phase-${phase.id}`} className="card overflow-hidden">
      <header className="flex flex-col gap-3 px-6 pt-6 pb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8 sm:px-8 sm:pt-7">
        <div className="min-w-0">
          <p className="text-[13px] text-fg-subtle">
            Phase {index + 1} · {dayRange(phase)}
          </p>
          <h2 id={`phase-${phase.id}`} className="mt-1 text-[18px]">
            {phase.title}
          </h2>
          <p className="mt-1.5 max-w-xl text-[14.5px] text-fg-muted">{phase.description}</p>
        </div>
        {complete ? (
          <Badge tone="ok" className="shrink-0 self-start">
            <Check className="size-3" /> Complete
          </Badge>
        ) : (
          <span className="shrink-0 text-[13px] whitespace-nowrap text-fg-subtle">
            {done} of {total} done
          </span>
        )}
      </header>

      <ol className="px-2 pb-2 sm:px-4 sm:pb-4">
        {phase.days.map((d) => (
          <DayRow key={d.day} day={d} current={d.day === currentDay} open={openDays.has(d.day)} onToggle={() => onToggle(d.day)} />
        ))}
      </ol>
    </section>
  )
}

function DayRow({ day, current, open, onToggle }: { day: PathDay; current: boolean; open: boolean; onToggle: () => void }) {
  const panelId = `day-${day.day}-items`
  return (
    <li id={`day-${day.day}`} aria-current={current ? 'step' : undefined} className="scroll-mt-24">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          'flex w-full items-center gap-4 rounded-xl px-4 py-3 text-left transition-colors duration-150 hover:bg-white/[0.04]',
          open && 'bg-white/[0.03]',
        )}
      >
        <IconTile done={day.complete} className={cn(current && !day.complete && 'bg-white/[0.09] text-fg')}>
          <span className="num">{day.day}</span>
        </IconTile>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={cn('truncate text-[14.5px]', day.complete ? 'text-fg-muted' : 'text-fg')}>{day.title}</span>
            {current && (
              <span className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] text-fg-subtle">
                <span className="size-1.5 rounded-full bg-brand-500" />
                Today
              </span>
            )}
          </span>
        </span>
        <span className="shrink-0 text-[12.5px] text-fg-subtle">
          {day.complete ? 'Done' : day.done > 0 ? `${day.done} of ${day.total}` : `${day.total} ${day.total === 1 ? 'item' : 'items'}`}
        </span>
        <ChevronDown className={cn('size-4 shrink-0 text-fg-faint transition-transform duration-200', open && 'rotate-180')} />
      </button>

      {open && (
        <div id={panelId} className="animate-fade-in pt-1 pb-3 pl-8 sm:pl-12">
          {day.theme && <p className="px-4 pb-2 text-[13px] text-fg-subtle">{day.theme}</p>}
          <ul>
            {day.items.map((it) => (
              <li key={it.slug}>
                <Link
                  to={itemHref(it)}
                  className="group flex items-center gap-3.5 rounded-xl px-4 py-2.5 transition-colors duration-150 hover:bg-white/[0.04]"
                >
                  <IconTile size="sm" done={it.done}>
                    {KIND_ICON[it.kind]}
                  </IconTile>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-[14px]', it.done ? 'text-fg-subtle' : 'text-fg')}>{it.title}</span>
                    <span className="text-[12.5px] text-fg-subtle">
                      {kindLabel(it.kind)} · {it.minutes} min
                      {it.checkpoint && ' · Unlocks the next phase'}
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-fg-faint transition-colors group-hover:text-fg-subtle" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}
