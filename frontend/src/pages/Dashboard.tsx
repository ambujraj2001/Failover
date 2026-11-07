import { ArrowRight, BookOpen, Check, Flame, Layers, Puzzle, Target } from 'lucide-react'
import { Link } from 'react-router-dom'
import { itemHref, kindLabel, pct } from '@/components/learn/format'
import { useDashboard } from '@/components/learn/queries'
import type { DashboardData } from '@/components/learn/types'
import { PageContainer } from '@/components/layout/AppShell'
import { buttonVariants } from '@/components/ui/button'
import { ErrorBlock, Progress, Skeleton } from '@/components/ui/primitives'
import type { PathItem } from '@/lib/types'
import { cn, relTime } from '@/lib/utils'
import { useAuth } from '@/stores/auth'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

const KIND_ICON = { lesson: <BookOpen />, lab: <Puzzle />, problem: <Target /> } as const

function UpNext({ d }: { d: DashboardData }) {
  const item = d.next_item
  const today = d.today
  const done = today?.items.filter((i) => i.done).length ?? 0
  const total = today?.items.length ?? 0
  if (!item || !today) {
    return (
      <div className="card p-8">
        <p className="text-[13px] text-fg-subtle">All caught up</p>
        <h2 className="mt-2 text-[24px] tracking-[-0.025em]">You have finished the 30-day path</h2>
        <p className="mt-2 text-[15px] text-fg-muted">Keep sharp with flashcards and mock interviews.</p>
        <Link to="/app/interviews" className={cn(buttonVariants({ size: 'lg' }), 'mt-6')}>
          Start a mock interview <ArrowRight />
        </Link>
      </div>
    )
  }
  return (
    <div className="card relative overflow-hidden p-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 right-0 h-64 w-96 bg-[radial-gradient(closest-side,rgb(255_106_43/0.10),transparent)]"
      />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[13px] text-fg-subtle">
            <span className="size-1.5 rounded-full bg-brand-500" />
            Up next · {kindLabel(item.kind)} · {item.minutes} min
          </p>
          <h2 className="mt-3 text-[26px] leading-tight tracking-[-0.025em]">{item.title}</h2>
          <p className="mt-2 text-[15px] text-fg-muted">
            Day {today.day} · {today.title}
          </p>
        </div>
        <Link to={itemHref(item)} className={cn(buttonVariants({ size: 'lg' }), 'shrink-0')}>
          {d.completed_items === 0 ? 'Start' : 'Continue'} <ArrowRight />
        </Link>
      </div>
      <div className="relative mt-8">
        <div className="mb-2 flex justify-between text-[13px]">
          <span className="text-fg-muted">Today</span>
          <span className="text-fg-subtle">
            {done} of {total} done
          </span>
        </div>
        <Progress value={pct(done, total)} />
      </div>
    </div>
  )
}

function TodayPlan({ items }: { items: PathItem[] }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <h3 className="text-[15px]">Today's plan</h3>
        <Link to="/app/path" className="text-[13px] text-fg-subtle transition-colors hover:text-fg">
          Full path
        </Link>
      </div>
      <ul className="px-2 pb-2">
        {items.map((it) => (
          <li key={it.slug}>
            <Link
              to={itemHref(it)}
              className="flex items-center gap-4 rounded-xl px-4 py-3 transition-colors hover:bg-white/[0.04]"
            >
              <span
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-full [&_svg]:size-4',
                  it.done ? 'bg-ok/15 text-ok' : 'bg-white/[0.05] text-fg-subtle',
                )}
              >
                {it.done ? <Check /> : KIND_ICON[it.kind]}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate text-[14.5px]', it.done ? 'text-fg-subtle line-through decoration-fg-faint' : 'text-fg')}>
                  {it.title}
                </span>
                <span className="text-[12.5px] text-fg-subtle">
                  {kindLabel(it.kind)} · {it.minutes} min
                </span>
              </span>
              <ArrowRight className="size-4 text-fg-faint" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Stat({ icon, label, value, sub, to }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub: string; to?: string }) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-[13px] text-fg-subtle [&_svg]:size-4">
        {icon}
        {label}
      </div>
      <p className="mt-4 text-[30px] leading-none font-semibold tracking-[-0.03em]">{value}</p>
      <p className="mt-2 text-[13px] text-fg-subtle">{sub}</p>
    </>
  )
  return to ? (
    <Link to={to} className="card block p-6 transition-colors hover:border-white/[0.12]">
      {body}
    </Link>
  ) : (
    <div className="card p-6">{body}</div>
  )
}

function Recent({ d }: { d: DashboardData }) {
  if (!d.recent_submissions.length) return null
  return (
    <div className="card overflow-hidden">
      <h3 className="px-6 pt-5 pb-3 text-[15px]">Recent labs</h3>
      <ul className="px-2 pb-2">
        {d.recent_submissions.slice(0, 4).map((s, i) => (
          <li key={i}>
            <Link to={`/lab/${s.lab_slug}`} className="flex items-center gap-4 rounded-xl px-4 py-3 transition-colors hover:bg-white/[0.04]">
              <span className={cn('size-2 shrink-0 rounded-full', s.passed ? 'bg-ok' : 'bg-crit')} />
              <span className="min-w-0 flex-1 truncate text-[14.5px] text-fg">{s.lab_title}</span>
              <span className={cn('text-[13px]', s.passed ? 'text-ok' : 'text-fg-subtle')}>{s.passed ? 'Passed' : 'Not yet'}</span>
              <span className="w-16 text-right text-[12.5px] text-fg-subtle">{relTime(s.created_at)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function Dashboard() {
  const q = useDashboard()
  const user = useAuth((s) => s.user)

  if (q.isPending) {
    return (
      <PageContainer>
        <Skeleton className="h-9 w-72" />
        <Skeleton className="mt-10 h-52" />
        <div className="mt-6 grid gap-5 sm:grid-cols-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      </PageContainer>
    )
  }
  if (q.isError) {
    return (
      <PageContainer>
        <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
      </PageContainer>
    )
  }

  const d = q.data
  const first = user?.name.split(' ')[0]

  return (
    <PageContainer>
      <header className="mb-10">
        <p className="text-[14px] text-fg-subtle">Day {Math.min(d.current_day, 30)} of 30</p>
        <h1 className="mt-1 text-[32px] tracking-[-0.03em]">
          {greeting()}
          {first ? `, ${first}` : ''}
        </h1>
      </header>

      <UpNext d={d} />

      <div className="mt-5 grid gap-5 sm:grid-cols-3">
        <Stat
          icon={<Flame className={d.streak > 0 ? 'text-brand-500' : undefined} />}
          label="Streak"
          value={`${d.streak} ${d.streak === 1 ? 'day' : 'days'}`}
          sub={`Best: ${d.streak_best} ${d.streak_best === 1 ? 'day' : 'days'}`}
        />
        <Stat
          icon={<Layers />}
          label="Flashcards"
          value={d.cards_due}
          sub={d.cards_due ? 'Ready to review' : 'Nothing due right now'}
          to="/app/flashcards"
        />
        <Stat
          icon={<Puzzle />}
          label="Labs solved"
          value={
            <>
              {d.solved_labs}
              <span className="text-[18px] font-normal text-fg-subtle"> / {d.total_labs}</span>
            </>
          }
          sub={`${pct(d.completed_items, d.total_items)}% of the path complete`}
          to="/app/practice"
        />
      </div>

      <div className={cn('mt-5 grid gap-5', d.recent_submissions.length ? 'lg:grid-cols-2' : '')}>
        {d.today && <TodayPlan items={d.today.items} />}
        <Recent d={d} />
      </div>
    </PageContainer>
  )
}
