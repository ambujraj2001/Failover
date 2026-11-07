import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A roomy selectable card, backed by a native radio input so arrow keys, Tab and Space behave like
 * a normal radio group. Put cards inside <OptionList>; the selected card gets a brighter border,
 * a faint white fill and a filled radio circle on the right.
 */
export function OptionRow({
  name,
  value,
  checked,
  onChange,
  title,
  description,
  badge,
  meta,
}: {
  name: string
  value: string
  checked: boolean
  onChange: (value: string) => void
  title: ReactNode
  description?: ReactNode
  /** small pill next to the title, e.g. "Recommended" */
  badge?: ReactNode
  /** quiet line under the description, e.g. "6 weeks" */
  meta?: ReactNode
}) {
  return (
    <label
      className={cn(
        'relative flex cursor-pointer items-start gap-4 rounded-xl border px-5 py-4 transition-colors duration-150',
        'has-[:focus-visible]:outline-brand-500 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2',
        checked
          ? 'border-white/25 bg-white/[0.05]'
          : 'border-white/[0.08] bg-white/[0.015] hover:border-white/15 hover:bg-white/[0.03]',
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="sr-only"
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="text-fg text-[15px] font-medium">{title}</span>
          {badge && (
            <span className="text-fg-muted inline-flex h-[22px] items-center rounded-full bg-white/[0.07] px-2.5 text-[12px] font-medium">
              {badge}
            </span>
          )}
        </span>
        {description && (
          <span className="text-fg-muted mt-1 block text-[14px] leading-snug">{description}</span>
        )}
        {meta && <span className="text-fg-subtle mt-2 block text-[13px]">{meta}</span>}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-colors duration-150',
          checked ? 'border-fg' : 'border-white/20',
        )}
      >
        <span
          className={cn(
            'bg-fg size-2.5 rounded-full transition-transform duration-150',
            checked ? 'scale-100' : 'scale-0',
          )}
        />
      </span>
    </label>
  )
}

/** A radio group of option cards, one column or two from `sm` up. */
export function OptionList({
  legend,
  columns = 1,
  children,
}: {
  legend: string
  columns?: 1 | 2
  children: ReactNode
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{legend}</legend>
      <div className={cn('grid gap-3', columns === 2 && 'sm:grid-cols-2')}>{children}</div>
    </fieldset>
  )
}

/** Slim segmented progress bar for multi-step flows, with a "Step 1 of 3" caption. */
export function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <nav aria-label="Setup progress">
      <p className="text-fg-subtle mb-3 text-[13px]" aria-hidden="true">
        Step {current + 1} of {steps.length}
      </p>
      <ol className="flex gap-1.5">
        {steps.map((label, i) => {
          const state = i < current ? 'done' : i === current ? 'current' : 'todo'
          return (
            <li key={label} aria-current={state === 'current' ? 'step' : undefined} className="flex-1">
              <span
                aria-hidden="true"
                className={cn(
                  'block h-1 rounded-full transition-colors duration-200',
                  state === 'todo' ? 'bg-white/[0.08]' : 'bg-fg',
                )}
              />
              <span className="sr-only">
                {label} (step {i + 1} of {steps.length},{' '}
                {state === 'done' ? 'complete' : state === 'current' ? 'current' : 'not started'})
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
