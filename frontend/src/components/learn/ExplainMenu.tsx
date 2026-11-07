import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, X } from 'lucide-react'
import { Markdown } from '@/components/Markdown'
import { Button } from '@/components/ui/button'
import { ErrorBlock, Skeleton } from '@/components/ui/primitives'
import { ApiError } from '@/lib/api'
import type { ExplainMode } from './types'

const EXPLAIN_MODES: { mode: ExplainMode; label: string; hint: string }[] = [
  { mode: 'simpler', label: 'More simply', hint: 'A new analogy and a small example' },
  { mode: 'deeper', label: 'In more depth', hint: 'What breaks, real numbers, an interview question' },
  { mode: 'example', label: 'With an example', hint: 'One concrete scenario, worked through' },
]

export function ExplainMenu({ onPick, busy }: { onPick: (m: ExplainMode) => void; busy?: boolean }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="secondary" size="sm" disabled={busy}>
          Explain it another way <ChevronDown className="!size-3.5 text-fg-subtle" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-72 animate-fade-in rounded-xl border border-white/10 bg-ink-800 p-1.5 shadow-pop"
        >
          {EXPLAIN_MODES.map((m) => (
            <DropdownMenu.Item
              key={m.mode}
              onSelect={() => onPick(m.mode)}
              className="block cursor-pointer rounded-lg px-3 py-2 outline-none data-[highlighted]:bg-white/[0.06]"
            >
              <span className="block text-[13.5px] text-fg">{m.label}</span>
              <span className="block text-[12.5px] text-fg-subtle">{m.hint}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

const ERROR_COPY: Record<string, string> = {
  ai_disabled: 'AI explanations are turned off on this server.',
  ai_quota: 'You have used today’s AI allowance. It resets tomorrow.',
}

export function ExplainPanel({
  mode,
  loading,
  content,
  error,
  onClose,
  onRetry,
}: {
  mode: ExplainMode
  loading: boolean
  content?: string
  error?: unknown
  onClose: () => void
  onRetry: () => void
}) {
  const meta = EXPLAIN_MODES.find((m) => m.mode === mode)!
  const errMsg =
    error instanceof ApiError
      ? error.message || ERROR_COPY[error.code] || 'Something went wrong. Please try again.'
      : error
        ? 'Something went wrong. Please try again.'
        : null
  const final = error instanceof ApiError && (error.code === 'ai_disabled' || error.code === 'ai_quota')
  return (
    <section aria-live="polite" aria-busy={loading} aria-label="Another explanation" className="card animate-fade-in p-6 sm:p-7">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px]">Explained {meta.label.toLowerCase()}</h3>
          <p className="mt-0.5 text-[13px] text-fg-subtle">{meta.hint}</p>
        </div>
        <button
          onClick={onClose}
          className="-mt-1 -mr-1 rounded-lg p-1.5 text-fg-subtle transition-colors hover:bg-white/[0.05] hover:text-fg"
          aria-label="Close explanation"
        >
          <X className="size-4" />
        </button>
      </header>
      {loading ? (
        <div className="space-y-3" aria-label="Writing an explanation">
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="mt-5 h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : errMsg ? (
        <ErrorBlock error={new Error(errMsg)} onRetry={final ? undefined : onRetry} />
      ) : content ? (
        <>
          <Markdown className="text-[15px] prose-p:text-[15px] prose-p:leading-[1.75] prose-li:text-[15px]">{content}</Markdown>
          <p className="mt-5 text-[12.5px] text-fg-subtle">Written by AI. Double-check any numbers before you rely on them.</p>
        </>
      ) : null}
    </section>
  )
}
