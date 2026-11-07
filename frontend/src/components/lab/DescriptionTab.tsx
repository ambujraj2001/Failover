import { ChevronDown, Lock } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Markdown } from '@/components/Markdown'
import { Textarea } from '@/components/ui/primitives'
import type { LabDetail, Level } from '@/lib/types'
import { cn, fmtMs } from '@/lib/utils'

const METRIC_LABEL: Record<string, [string, string]> = {
  p99_ms: ['p99 latency', 'ms'],
  p50_ms: ['p50 latency', 'ms'],
  error_rate: ['Errors', '%'],
  cost_per_hr: ['Cost', '$/hr'],
  stale_read_rate: ['Stale reads', '%'],
  queue_lag_s: ['Queue lag', 's'],
  write_loss_rate: ['Lost writes', '%'],
}

function fmtTarget(metric: string, value: number) {
  const [, unit] = METRIC_LABEL[metric] ?? ['', '']
  if (unit === 'ms') return fmtMs(value)
  if (unit === '$/hr') return `$${value}/hr`
  return `${value}${unit}`
}

function Block({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[14px]">{title}</h3>
        {aside && <span className="text-[12.5px] text-fg-subtle">{aside}</span>}
      </div>
      {children}
    </section>
  )
}

function Collapsible({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-white/[0.07]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-[13.5px] text-fg-muted hover:text-fg"
      >
        {title}
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

export function DescriptionTab({
  lab,
  level,
  note,
  onNote,
  noteDisabled,
}: {
  lab: LabDetail
  level: Level
  note: string
  onNote: (v: string) => void
  noteDisabled?: boolean
}) {
  const [view, setView] = useState<'plain' | 'expert'>(level === 'expert' ? 'expert' : 'plain')
  const visible = lab.tests.filter((t) => !t.hidden)
  const hidden = lab.tests.filter((t) => t.hidden).length

  return (
    <div className="px-5 pt-5 pb-10">
      <div className="rounded-xl border border-crit/15 bg-crit/[0.05] px-4 py-3">
        <p className="flex items-center gap-2 text-[12.5px] font-medium text-crit">
          <span className="size-1.5 animate-pulse-dot rounded-full bg-crit" /> Live incident
        </p>
        <p className="mt-1 text-[13.5px] leading-snug text-fg">{lab.incident.replace(/^SEV-\d\s*·\s*/, '')}</p>
      </div>

      <div className="mt-6 inline-flex rounded-xl bg-white/[0.04] p-1 text-[13px]" role="tablist" aria-label="Explanation depth">
        {(['plain', 'expert'] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={cn(
              'rounded-lg px-3.5 py-1.5 transition-colors',
              view === v ? 'bg-white/[0.09] text-fg' : 'text-fg-subtle hover:text-fg',
            )}
          >
            {v === 'plain' ? 'Simple' : 'In depth'}
          </button>
        ))}
      </div>

      <Markdown className="mt-5 text-[14.5px] prose-p:leading-[1.7]">{view === 'plain' ? lab.brief_beginner : lab.brief_expert}</Markdown>

      <Block title="Your goal">
        <ul className="space-y-2.5">
          {lab.requirements.map((r) => (
            <li key={r} className="flex gap-3 text-[14px] text-fg-muted">
              <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-fg-faint" />
              {r}
            </li>
          ))}
        </ul>
      </Block>

      <Block title="Tests" aside={hidden ? `+ ${hidden} hidden on submit` : undefined}>
        <div className="space-y-2">
          {visible.map((t) => (
            <div key={t.id} className="card px-4 py-3.5">
              <p className="text-[14px] font-medium text-fg">{t.name}</p>
              <p className="mt-0.5 text-[13px] text-fg-subtle">{t.summary}</p>
              {t.assertions && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {t.assertions.map((a) => (
                    <span key={a.metric} className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[12px] text-fg-muted">
                      {METRIC_LABEL[a.metric]?.[0] ?? a.metric} {a.op === 'lte' ? '≤' : '≥'} {fmtTarget(a.metric, a.value)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {hidden > 0 && (
            <p className="flex items-center gap-2 px-1 pt-1 text-[12.5px] text-fg-subtle">
              <Lock className="size-3.5" /> Hidden tests check what breaks next. Failed ones are revealed.
            </p>
          )}
        </div>
      </Block>

      {lab.design_prompt && (
        <Block title="Written answers">
          <Markdown className="mb-3 text-[13.5px]">{lab.design_prompt}</Markdown>
          <Textarea
            value={note}
            onChange={(e) => onNote(e.target.value)}
            disabled={noteDisabled}
            rows={9}
            maxLength={12000}
            placeholder="Answer the questions above. Your answers are reviewed with your design."
            className="text-[13.5px] leading-relaxed"
          />
        </Block>
      )}

      <div className="mt-8 space-y-2">
        {view === 'plain' && lab.glossary.length > 0 && (
          <Collapsible title="Words used in this lab">
            <dl className="space-y-3">
              {lab.glossary.map((g) => (
                <div key={g.term} className="text-[13.5px]">
                  <dt className="font-medium text-fg">{g.term}</dt>
                  <dd className="mt-0.5 text-fg-muted">{g.meaning}</dd>
                </div>
              ))}
            </dl>
          </Collapsible>
        )}
        <Collapsible title={`Budget: $${lab.budget.toFixed(2)} per hour`}>
          <p className="text-[13.5px] text-fg-muted">
            Every component has an hourly price. Your design must cost less than this to pass. Topics:{' '}
            {lab.topics.join(', ')}.
          </p>
        </Collapsible>
      </div>
    </div>
  )
}
