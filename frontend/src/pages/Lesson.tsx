import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ExplainMenu, ExplainPanel } from '@/components/learn/ExplainMenu'
import { qk } from '@/components/learn/queries'
import { Segmented } from '@/components/learn/shared'
import type { ExplainMode, LessonDetail } from '@/components/learn/types'
import { PageContainer } from '@/components/layout/AppShell'
import { Markdown } from '@/components/Markdown'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState, ErrorBlock, Skeleton, Tip } from '@/components/ui/primitives'
import { api, ApiError } from '@/lib/api'
import type { Level } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAuth } from '@/stores/auth'

type View = 'plain' | 'deeper'

/** 680px reading measure plus the container's side padding. */
const READING = 'max-w-[776px]'
const PROSE =
  'text-[16px] prose-p:text-[16px] prose-p:leading-[1.8] prose-p:text-fg/80 prose-li:text-[16px] prose-li:leading-[1.75] prose-li:text-fg/80 prose-h3:text-[17px] prose-h3:mt-8'

function defaultView(level: Level | undefined): View {
  return level === 'beginner' || level == null ? 'plain' : 'deeper'
}

export default function Lesson() {
  const { slug = '' } = useParams()
  // remount per lesson so view / AI answers reset cleanly
  return <LessonView key={slug} slug={slug} />
}

function LessonView({ slug }: { slug: string }) {
  const level = useAuth((s) => s.user?.level)
  const qc = useQueryClient()
  const [view, setView] = useState<View>(() => defaultView(level))
  const [explain, setExplain] = useState<ExplainMode | null>(null)
  const [answers, setAnswers] = useState<Partial<Record<ExplainMode, string>>>({})

  const q = useQuery({ queryKey: qk.lesson(slug), queryFn: () => api<LessonDetail>(`/lessons/${slug}`), enabled: !!slug })

  const complete = useMutation({
    mutationFn: (done: boolean) =>
      api<{ completed: boolean }>(`/lessons/${slug}/complete`, { method: done ? 'POST' : 'DELETE' }),
    onMutate: async (done) => {
      await qc.cancelQueries({ queryKey: qk.lesson(slug) })
      const prev = qc.getQueryData<LessonDetail>(qk.lesson(slug))
      if (prev) qc.setQueryData<LessonDetail>(qk.lesson(slug), { ...prev, completed: done })
      return { prev }
    },
    onError: (err, _done, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.lesson(slug), ctx.prev)
      toast.error(err instanceof Error ? err.message : 'Could not update the lesson.')
    },
    onSuccess: (res) => {
      if (res.completed) toast.success('Lesson complete')
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.lesson(slug) })
      qc.invalidateQueries({ queryKey: qk.curriculum })
      qc.invalidateQueries({ queryKey: qk.dashboard })
      qc.invalidateQueries({ queryKey: ['flashcards'] })
    },
  })

  const explainM = useMutation({
    mutationFn: (mode: ExplainMode) =>
      api<{ content: string }>(`/lessons/${slug}/explain`, { method: 'POST', body: { mode } }),
    onSuccess: (res, mode) => setAnswers((a) => ({ ...a, [mode]: res.content })),
  })

  const pick = (mode: ExplainMode) => {
    setExplain(mode)
    if (answers[mode]) {
      explainM.reset()
      return
    }
    explainM.mutate(mode)
  }

  if (q.isPending) return <LessonSkeleton />
  if (q.isError) {
    const notFound = q.error instanceof ApiError && q.error.status === 404
    return (
      <PageContainer className={READING}>
        {notFound ? (
          <EmptyState
            title="We couldn’t find this lesson"
            body="The link may be old. Your learning path has every lesson."
            action={
              <Link to="/app/path" className={buttonVariants({ variant: 'secondary' })}>
                Open the learning path
              </Link>
            }
          />
        ) : (
          <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
        )}
      </PageContainer>
    )
  }

  const l = q.data
  const explainPending = explainM.isPending && explainM.variables === explain

  return (
    <PageContainer className={READING}>
      <Link
        to={`/app/path#day-${l.day}`}
        className="inline-flex max-w-full items-center gap-1.5 text-[13px] text-fg-subtle transition-colors hover:text-fg"
      >
        <ArrowLeft className="size-3.5 shrink-0" />
        <span className="truncate">
          Day {l.day}
          {l.day_title && ` · ${l.day_title}`}
        </span>
      </Link>

      <header className="mt-6">
        <h1 className="text-[32px] leading-[1.12] tracking-[-0.03em] sm:text-[38px]">{l.title}</h1>
        <p className="mt-3 flex items-center gap-2 text-[13px] text-fg-subtle">
          {l.minutes} min read
          {l.completed && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 text-ok">
                <Check className="size-3.5" /> Completed
              </span>
            </>
          )}
        </p>
        <p className="mt-5 text-[17px] leading-relaxed text-fg-muted">{l.summary}</p>
      </header>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="How much detail"
          value={view}
          onChange={setView}
          options={[
            { value: 'plain', label: 'Simple' },
            { value: 'deeper', label: 'In depth' },
          ]}
        />
        <ExplainMenu onPick={pick} busy={explainM.isPending} />
      </div>

      {explain && (
        <div className="mt-6">
          <ExplainPanel
            mode={explain}
            loading={explainPending}
            content={answers[explain]}
            error={explainM.variables === explain ? explainM.error : undefined}
            onClose={() => setExplain(null)}
            onRetry={() => explainM.mutate(explain)}
          />
        </div>
      )}

      <article key={view} className="mt-10 animate-fade-in">
        <h2 className="sr-only">{view === 'plain' ? 'The simple version' : 'In depth'}</h2>
        <Markdown className={PROSE}>{view === 'plain' ? l.plain : l.deeper}</Markdown>
      </article>

      {l.key_points.length > 0 && (
        <section aria-labelledby="kp-h" className="card mt-12 p-6 sm:p-8">
          <h2 id="kp-h" className="text-[16px]">
            Key points
          </h2>
          <ul className="mt-4 space-y-3.5">
            {l.key_points.map((k) => (
              <li key={k} className="flex gap-3 text-[15px] leading-relaxed text-fg-muted">
                <span className="mt-[3px] grid size-5 shrink-0 place-items-center rounded-full bg-white/[0.06] text-fg-subtle">
                  <Check className="size-3" />
                </span>
                <span>{k}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {l.concept_cards.length > 0 && (
        <section aria-labelledby="terms-h" className="mt-8">
          <h2 id="terms-h" className="text-[13px] font-normal text-fg-subtle">
            Terms in this lesson
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {l.concept_cards.map((c) => (
              <li key={c.slug}>
                <Tip content={c.short}>
                  <Link
                    to={`/app/concepts?q=${encodeURIComponent(c.name)}`}
                    className="inline-flex h-8 items-center rounded-full bg-white/[0.04] px-3.5 text-[13px] text-fg-muted transition-colors hover:bg-white/[0.07] hover:text-fg"
                  >
                    {c.name}
                  </Link>
                </Tip>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-14 border-t border-white/[0.06] pt-8">
        {l.completed ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <NextCta lesson={l} />
            <Button variant="ghost" size="sm" onClick={() => complete.mutate(false)} loading={complete.isPending} className="self-start sm:self-auto">
              Mark as not done
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button size="lg" onClick={() => complete.mutate(true)} loading={complete.isPending} className="self-start">
              {!complete.isPending && <Check />}
              Mark as complete
            </Button>
            <p className="text-[13px] text-fg-subtle">Done reading? This saves your progress.</p>
          </div>
        )}
      </footer>
    </PageContainer>
  )
}

function NextCta({ lesson }: { lesson: LessonDetail }) {
  const target = lesson.next_lesson
    ? { to: `/app/lessons/${lesson.next_lesson.slug}`, title: lesson.next_lesson.title }
    : lesson.day_lab
      ? { to: `/lab/${lesson.day_lab.slug}`, title: lesson.day_lab.title }
      : null
  if (!target)
    return (
      <Link to="/app/path" className={cn(buttonVariants({ size: 'lg' }), 'self-start')}>
        Back to the learning path <ArrowRight />
      </Link>
    )
  return (
    <Link to={target.to} className={cn(buttonVariants({ size: 'lg' }), 'max-w-full self-start')}>
      <span className="min-w-0 truncate">Next: {target.title}</span>
      <ArrowRight />
    </Link>
  )
}

function LessonSkeleton() {
  return (
    <PageContainer className={READING}>
      <div aria-busy="true" aria-label="Loading lesson">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-6 h-10 w-4/5" />
        <Skeleton className="mt-4 h-4 w-24" />
        <Skeleton className="mt-6 h-5 w-full" />
        <Skeleton className="mt-2 h-5 w-3/4" />
        <Skeleton className="mt-8 h-10 w-52" />
        <div className="mt-10 space-y-3">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className={cn('h-4', i % 3 === 2 ? 'w-2/3' : 'w-full')} />
          ))}
        </div>
      </div>
    </PageContainer>
  )
}
