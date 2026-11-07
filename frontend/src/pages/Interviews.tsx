import { ArrowRight, Check, MessagesSquare } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useInterviewProblems, useInterviews, useStartInterview } from '@/components/interview/queries'
import { fmtDate, LEVELS, levelRole, ResultBadge, Segmented } from '@/components/interview/shared'
import type { InterviewListItem, InterviewProblem } from '@/components/interview/types'
import { PageContainer } from '@/components/layout/AppShell'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { DifficultyBadge, ErrorBlock, PageHeader, Skeleton } from '@/components/ui/primitives'
import { ApiError } from '@/lib/api'
import type { Target } from '@/lib/types'
import { cn, relTime } from '@/lib/utils'
import { useAuth } from '@/stores/auth'

/** Problems shown before "Show all". */
const FIRST_PROBLEMS = 6

export default function Interviews() {
  const user = useAuth((s) => s.user)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const problems = useInterviewProblems()
  const list = useInterviews()
  const start = useStartInterview()

  const [slug, setSlug] = useState<string | null>(() => params.get('problem'))
  const [level, setLevel] = useState<Target>(user?.target_level ?? 'E5')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const startRef = useRef<HTMLElement>(null)

  const active = list.data?.find((i) => i.status === 'active')
  const past = list.data?.filter((i) => i.status !== 'active')
  const selected = problems.data?.find((p) => p.slug === slug) ?? null
  const levelInfo = LEVELS.find((l) => l.value === level)

  // arriving with ?problem=… (from "Retry this problem"): bring the start card into view
  useEffect(() => {
    if (params.get('problem') && problems.data) startRef.current?.scrollIntoView({ block: 'start' })
  }, [params, problems.data])

  const conflictId =
    start.error instanceof ApiError && start.error.code === 'interview_active'
      ? ((start.error.details as { id?: string } | undefined)?.id ?? active?.id ?? null)
      : null

  function begin() {
    if (!selected) return
    start.mutate(
      { problem_slug: selected.slug, target_level: level },
      { onSuccess: (iv) => navigate(`/interview/${iv.id}`) },
    )
  }

  return (
    <PageContainer>
      <PageHeader title="Mock interviews" description="Practise a real 45-minute system design interview with an AI interviewer." />

      {active && <ResumeCard iv={active} />}

      <section ref={startRef} aria-labelledby="start-interview" className="card scroll-mt-20 p-6 sm:p-8">
        <h2 id="start-interview" className="text-[18px] tracking-[-0.02em]">
          Start an interview
        </h2>
        <p className="mt-1 text-[14.5px] text-fg-muted">Choose a problem and the level you are aiming for.</p>

        <fieldset className="mt-8 min-w-0">
          <legend className="mb-3 text-[14px] font-medium text-fg">Problem</legend>
          <ProblemGrid
            problems={problems.data}
            loading={problems.isPending}
            error={problems.isError ? problems.error : null}
            onRetry={() => problems.refetch()}
            value={slug}
            onChange={setSlug}
          />
        </fieldset>

        <div className="mt-8">
          <p className="mb-3 text-[14px] font-medium text-fg" aria-hidden="true">
            Level
          </p>
          <Segmented<Target>
            label="Level"
            value={level}
            onChange={setLevel}
            full
            className="sm:w-auto sm:inline-flex"
            options={LEVELS.map((l) => ({
              value: l.value,
              label: (
                <>
                  {l.title}
                  <span className="hidden font-normal text-fg-subtle sm:inline">{l.role}</span>
                </>
              ),
            }))}
          />
          {levelInfo && (
            <p className="mt-3 text-[14px] text-fg-muted" aria-live="polite">
              <span className="text-fg">{levelInfo.role}.</span> {levelInfo.body}
              {user?.target_level === level && <span className="text-fg-subtle"> Your target level.</span>}
            </p>
          )}
        </div>

        <div className="mt-8 flex flex-col-reverse gap-4 border-t border-white/[0.06] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 text-[13.5px] text-fg-subtle">
            {selected ? (
              <>
                <span className="text-fg-muted">{selected.title}</span> · {level} · 45 min
              </>
            ) : (
              'Choose a problem to begin.'
            )}
          </p>
          <Button
            size="lg"
            variant={active ? 'secondary' : 'primary'}
            className="w-full sm:w-auto"
            disabled={!selected}
            onClick={() => {
              start.reset()
              setConfirmOpen(true)
            }}
          >
            Start interview <ArrowRight />
          </Button>
        </div>
      </section>

      <PastInterviews list={past} loading={list.isPending} error={list.isError ? list.error : null} onRetry={() => list.refetch()} />

      <Dialog
        open={confirmOpen}
        onOpenChange={(v) => !start.isPending && setConfirmOpen(v)}
        title={conflictId ? 'You already have an interview running' : 'Ready to start?'}
        description={
          conflictId
            ? 'Only one interview can run at a time. Resume it, or abandon it from the interview room first.'
            : selected && (
                <>
                  <span className="text-fg">{selected.title}</span> at {level}. The 45-minute clock starts when you confirm.
                </>
              )
        }
        footer={
          conflictId ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(false)}>
                Close
              </Button>
              <Button size="sm" onClick={() => navigate(`/interview/${conflictId}`)}>
                Resume interview <ArrowRight />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" disabled={start.isPending} onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" loading={start.isPending} onClick={begin}>
                Start the clock
              </Button>
            </>
          )
        }
      >
        {!conflictId && (
          <ul className="space-y-2.5 text-[14px] text-fg-muted">
            {[
              'The interviewer starts with the problem. Ask questions before you design.',
              'Your canvas and notes save on their own, and the interviewer can see them.',
              'Leaving the page does not pause the clock.',
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <Check className="mt-1 size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                {t}
              </li>
            ))}
          </ul>
        )}
        {start.isError && !conflictId && (
          <div className="mt-4">
            <ErrorBlock error={start.error} />
          </div>
        )}
      </Dialog>
    </PageContainer>
  )
}

function ResumeCard({ iv }: { iv: InterviewListItem }) {
  return (
    <div className="card relative mb-6 overflow-hidden p-6 sm:p-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 right-0 h-64 w-96 bg-[radial-gradient(closest-side,rgb(255_106_43/0.10),transparent)]"
      />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[13px] text-fg-subtle">
            <span className="size-1.5 shrink-0 animate-pulse-dot rounded-full bg-brand-500" aria-hidden="true" />
            In progress · started {relTime(iv.created_at)}
          </p>
          <h2 className="mt-2 text-[22px] leading-tight tracking-[-0.025em]">{iv.problem_title}</h2>
          <p className="mt-1.5 text-[14.5px] text-fg-muted">
            {iv.target_level} · {levelRole(iv.target_level)}. The clock is still running.
          </p>
        </div>
        <Link to={`/interview/${iv.id}`} className={cn(buttonVariants({ size: 'lg' }), 'shrink-0')}>
          Resume <ArrowRight />
        </Link>
      </div>
    </div>
  )
}

function ProblemGrid({
  problems,
  loading,
  error,
  onRetry,
  value,
  onChange,
}: {
  problems?: InterviewProblem[]
  loading: boolean
  error: unknown
  onRetry: () => void
  value: string | null
  onChange: (slug: string) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const all = problems ?? []
  const shown = useMemo(() => {
    if (showAll) return all
    const first = all.slice(0, FIRST_PROBLEMS)
    const sel = all.find((p) => p.slug === value)
    return sel && !first.includes(sel) ? [...first, sel] : first
  }, [all, showAll, value])

  if (loading)
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[108px]" />
        ))}
      </div>
    )
  if (error) return <ErrorBlock error={error} onRetry={onRetry} />
  if (!all.length) return <p className="text-[14px] text-fg-muted">No interview problems are ready yet. Check back soon.</p>

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
        {shown.map((p) => {
          const on = value === p.slug
          const topics = p.topics.slice(0, 3).join(' · ')
          return (
            <label
              key={p.slug}
              title={p.summary}
              className={cn(
                'flex min-h-[108px] cursor-pointer flex-col gap-4 rounded-xl border p-4 transition-colors duration-150',
                'has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-brand-500',
                on
                  ? 'border-white/25 bg-white/[0.06]'
                  : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]',
              )}
            >
              <input
                type="radio"
                name="interview-problem"
                value={p.slug}
                checked={on}
                onChange={() => onChange(p.slug)}
                className="sr-only"
              />
              <span className="flex items-start justify-between gap-3">
                <span className="text-[15px] leading-snug font-medium text-fg">{p.title}</span>
                <span
                  className={cn(
                    'grid size-5 shrink-0 place-items-center rounded-full border transition-colors',
                    on ? 'border-fg bg-fg text-ink-950' : 'border-white/15',
                  )}
                  aria-hidden="true"
                >
                  {on && <Check className="size-3" strokeWidth={3} />}
                </span>
              </span>
              <span className="mt-auto flex min-w-0 items-center gap-2.5">
                <DifficultyBadge level={p.difficulty} />
                {topics && <span className="min-w-0 truncate text-[12.5px] text-fg-subtle">{topics}</span>}
              </span>
            </label>
          )
        })}
      </div>
      {all.length > FIRST_PROBLEMS && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-4 rounded-md text-[13.5px] text-fg-muted transition-colors hover:text-fg"
        >
          {showAll ? 'Show fewer' : `Show all ${all.length} problems`}
        </button>
      )}
    </>
  )
}

function PastInterviews({
  list,
  loading,
  error,
  onRetry,
}: {
  list?: InterviewListItem[]
  loading: boolean
  error: unknown
  onRetry: () => void
}) {
  return (
    <section aria-labelledby="past-interviews" className="card mt-10 overflow-hidden">
      <h2 id="past-interviews" className="px-6 pt-5 pb-3 text-[15px]">
        Past interviews
      </h2>
      {loading ? (
        <div className="space-y-2 px-6 pb-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : error ? (
        <div className="px-6 pb-6">
          <ErrorBlock error={error} onRetry={onRetry} />
        </div>
      ) : !list?.length ? (
        <p className="px-6 pb-6 text-[14px] text-fg-muted">No interviews yet. When you finish one, your result shows up here.</p>
      ) : (
        <ul className="px-2 pb-2">
          {list.map((iv) => (
            <li key={iv.id}>
              <Link
                to={`/interview/${iv.id}`}
                className="flex items-center gap-4 rounded-xl px-4 py-3 transition-colors hover:bg-white/[0.04]"
              >
                <span className="hidden size-8 shrink-0 place-items-center rounded-full bg-white/[0.05] text-fg-subtle sm:grid [&_svg]:size-4">
                  <MessagesSquare />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] text-fg">{iv.problem_title}</span>
                  <span className="text-[12.5px] text-fg-subtle">
                    {iv.target_level} · <span title={fmtDate(iv.created_at)}>{relTime(iv.created_at)}</span>
                  </span>
                </span>
                <ResultBadge status={iv.status} verdict={iv.verdict} className="shrink-0" />
                <ArrowRight className="hidden size-4 shrink-0 text-fg-faint sm:block" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
