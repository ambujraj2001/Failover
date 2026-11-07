import { ArrowRight, ChevronDown } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { DesignEditor } from '@/components/canvas/DesignEditor'
import { designCost } from '@/components/canvas/designOps'
import { nodeCost, useCatalog } from '@/components/canvas/meta'
import { SubmissionSummary } from '@/components/lab/Results'
import { Markdown } from '@/components/Markdown'
import { buttonVariants } from '@/components/ui/button'
import { ErrorBlock, Skeleton } from '@/components/ui/primitives'
import type { GradeResult } from '@/lib/types'
import { cn, fmtCost } from '@/lib/utils'
import { fmtDate, fmtDuration, MEETS_BAR, parseTime, ScoreRows, verdictLabel } from './shared'
import type { InterviewDetail, SimResult } from './types'

const VERDICT_NOTE: Record<string, string> = {
  strong_hire: 'Above the bar in most areas. Great work.',
  hire: 'You met the bar in every area that matters at this level.',
  lean_hire: 'Right at the bar. One stronger area would make it a clear hire.',
  lean_no_hire: 'Close, but below the bar in at least one important area.',
  no_hire: 'Below the bar for this level this time. The feedback shows where to focus.',
}

function toGrade(sim: SimResult): GradeResult {
  return {
    passed: sim.passed,
    within_budget: sim.within_budget ?? (sim.budget == null || (sim.cost_per_hr ?? 0) <= sim.budget),
    budget: sim.budget,
    cost_per_hr: sim.cost_per_hr ?? 0,
    results: sim.results ?? [],
    warnings: sim.warnings ?? [],
  }
}

function simMeta(sim: SimResult | null): string {
  if (!sim) return 'No simulator run recorded'
  if (sim.invalid?.length) return "Your design couldn't be run"
  const results = sim.results ?? []
  return `${results.filter((r) => r.passed).length} of ${results.length} tests passed`
}

/** A collapsed-by-default row inside the "More detail" card. Content mounts only when opened. */
function Disclosure({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div>
      <h3 className="font-sans">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-4 rounded-xl px-4 py-3.5 text-left transition-colors duration-150 hover:bg-white/[0.04]"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium text-fg">{title}</span>
            {meta && <span className="block text-[13px] font-normal tracking-normal text-fg-subtle">{meta}</span>}
          </span>
          <ChevronDown
            className={cn('size-4 shrink-0 text-fg-subtle transition-transform duration-200', open && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
      </h3>
      <div id={id} hidden={!open} className="animate-fade-in px-4 pt-1 pb-5">
        {open && children}
      </div>
    </div>
  )
}

function SimSection({ sim, twist }: { sim: SimResult | null; twist: string | null }) {
  if (!sim) return <p className="text-[14px] text-fg-muted">No simulator run was recorded for this interview.</p>
  if (sim.invalid?.length) {
    return (
      <div className="rounded-xl border border-crit/20 bg-crit/[0.05] p-4">
        <p className="text-[14px] font-medium text-fg">We couldn't run your final design.</p>
        <ul className="mt-2 space-y-1 text-[13.5px] text-fg-muted">
          {sim.invalid.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      {twist && (
        <p className="text-[13.5px] text-fg-muted">
          Includes the new requirement: <span className="text-fg">{twist}</span>
        </p>
      )}
      <SubmissionSummary result={toGrade(sim)} />
      {!!sim.warnings?.length && (
        <ul className="space-y-1.5 text-[13.5px] text-fg-muted">
          {sim.warnings.map((w) => (
            <li key={w} className="flex items-baseline gap-2.5">
              <span className="size-1.5 shrink-0 translate-y-[-1px] rounded-full bg-warn" aria-hidden="true" />
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FinalDesign({ iv }: { iv: InterviewDetail }) {
  const catalog = useCatalog()
  const design = iv.design ?? { nodes: [], edges: [] }
  if (catalog.isPending) return <Skeleton className="h-[300px] w-full sm:h-[380px]" />
  if (catalog.isError) return <ErrorBlock error={catalog.error} onRetry={() => catalog.refetch()} />
  const cost = designCost(design, catalog.data, nodeCost)
  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-ink-900">
        <DesignEditor design={design} catalog={catalog.data} readOnly className="grid-bg h-[300px] w-full sm:h-[380px]" />
      </div>
      <p className="mt-3 text-[13px] text-fg-subtle">
        Estimated cost <span className="num text-fg-muted">{fmtCost(cost)}</span>
        {iv.budget != null && (
          <>
            {' '}
            · budget <span className="num text-fg-muted">{fmtCost(iv.budget)}</span>
          </>
        )}
      </p>
    </div>
  )
}

function Transcript({ iv }: { iv: InterviewDetail }) {
  if (!iv.transcript.length) return <p className="text-[14px] text-fg-muted">No messages were sent.</p>
  return (
    <ol className="space-y-5">
      {iv.transcript.map((m, i) => (
        <li key={i}>
          <p className="mb-1 text-[12.5px] text-fg-subtle">{m.role === 'user' ? 'You' : 'Interviewer'}</p>
          {m.role === 'assistant' ? (
            <Markdown className="max-w-[68ch] text-[14px] prose-p:my-1.5 prose-ul:my-1.5">{m.content}</Markdown>
          ) : (
            <p className="max-w-[68ch] text-[14px] whitespace-pre-wrap text-fg">{m.content}</p>
          )}
        </li>
      ))}
    </ol>
  )
}

export function InterviewReport({ iv }: { iv: InterviewDetail }) {
  const duration = iv.finished_at ? parseTime(iv.finished_at) - parseTime(iv.created_at) : null
  const components = iv.design?.nodes.length ?? 0

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 lg:py-14">
      <header className="mb-10">
        <p className="text-[14px] text-fg-subtle">
          {iv.problem_title} · {fmtDate(iv.created_at)}
          {duration != null && <> · {fmtDuration(duration)}</>}
        </p>
        <h1 className="mt-2 text-[32px] leading-[1.1] tracking-[-0.035em] sm:text-[40px]">
          {iv.verdict ? `${verdictLabel(iv.verdict)} at ${iv.target_level}` : 'Not scored'}
        </h1>
        <p className="mt-3 max-w-xl text-[15.5px] leading-relaxed text-fg-muted">
          {iv.verdict ? VERDICT_NOTE[iv.verdict] : 'This interview finished without a score.'}
        </p>
      </header>

      {iv.scores && (
        <section aria-labelledby="report-scores" className="card p-6 sm:p-8">
          <div className="mb-7 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="report-scores" className="text-[17px]">
              Scores
            </h2>
            <p className="flex items-center gap-2 text-[13px] text-fg-subtle">
              <span className="inline-block h-3 w-px rounded-full bg-white/35" aria-hidden="true" />
              {MEETS_BAR} is the {iv.target_level} bar
            </p>
          </div>
          <ScoreRows scores={iv.scores} level={iv.target_level} />
        </section>
      )}

      {iv.feedback && (
        <section aria-labelledby="report-feedback" className="card mt-6 p-6 sm:p-8">
          <h2 id="report-feedback" className="mb-4 text-[17px]">
            Feedback
          </h2>
          <Markdown className="max-w-[68ch] text-[15px] prose-p:leading-relaxed">{iv.feedback}</Markdown>
        </section>
      )}

      <section aria-label="More detail" className="card mt-6 space-y-0.5 p-2">
        <Disclosure title="Simulator results" meta={simMeta(iv.sim_result)}>
          <SimSection sim={iv.sim_result} twist={iv.twist?.title ?? null} />
        </Disclosure>
        <Disclosure title="Your final design" meta={`${components} component${components === 1 ? '' : 's'}`}>
          <FinalDesign iv={iv} />
        </Disclosure>
        {iv.notes?.trim() && (
          <Disclosure title="Your notes">
            <p className="max-w-[68ch] text-[14px] leading-relaxed whitespace-pre-wrap text-fg-muted">{iv.notes}</p>
          </Disclosure>
        )}
        <Disclosure title="Transcript" meta={`${iv.transcript.length} message${iv.transcript.length === 1 ? '' : 's'}`}>
          <Transcript iv={iv} />
        </Disclosure>
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link to={`/app/interviews?problem=${encodeURIComponent(iv.problem_slug)}`} className={buttonVariants({ size: 'lg' })}>
          Try this problem again <ArrowRight />
        </Link>
        <Link to="/app/interviews" className={buttonVariants({ variant: 'ghost', size: 'lg' })}>
          All interviews
        </Link>
      </div>
    </div>
  )
}
