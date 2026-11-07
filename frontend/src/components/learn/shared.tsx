import { BookOpen, Check, Puzzle, Search, Target } from 'lucide-react'
import { forwardRef, useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Kbd } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

/** Quiet lucide icon per item kind, sized by the tile that holds it. */
export const KIND_ICON = { lesson: <BookOpen />, lab: <Puzzle />, problem: <Target /> } as const

/** Soft round icon tile used at the start of list rows. `done` swaps in a green check. */
export function IconTile({
  children,
  done,
  size = 'md',
  className,
}: {
  children?: ReactNode
  done?: boolean
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-full',
        size === 'sm' ? 'size-7 text-[12px] [&_svg]:size-3.5' : 'size-8 text-[13px] [&_svg]:size-4',
        done ? 'bg-ok/15 text-ok' : 'bg-white/[0.05] text-fg-subtle',
        className,
      )}
    >
      {done ? <Check /> : children}
    </span>
  )
}

/** Page title + one muted sentence, matching the dashboard header. */
export function PageIntro({ title, children, actions, className }: { title: string; children?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn('mb-10 flex flex-wrap items-end justify-between gap-6', className)}>
      <div className="min-w-0">
        <h1 className="text-[30px] leading-[1.15] tracking-[-0.03em]">{title}</h1>
        {children && <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-fg-muted">{children}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  )
}

const SEG_SIZE = {
  xs: 'h-7 px-2.5 text-[12.5px]',
  sm: 'h-8 px-3.5 text-[13.5px]',
  md: 'h-9 px-4 text-[14px]',
} as const

/** Accessible segmented control (radiogroup with arrow-key navigation). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'sm',
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; count?: number }[]
  label: string
  size?: keyof typeof SEG_SIZE
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
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex max-w-full rounded-xl bg-white/[0.04] p-1', className)}>
      {options.map((o, i) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors duration-150',
              SEG_SIZE[size],
              active ? 'bg-white/[0.08] text-fg shadow-[inset_0_1px_0_0_rgb(255_255_255/0.04)]' : 'text-fg-subtle hover:text-fg',
            )}
          >
            {o.label}
            {o.count != null && <span className={cn('num text-[12px] font-normal', active ? 'text-fg-muted' : 'text-fg-faint')}>{o.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** Soft rounded filter pill (toggle button). */
export function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-[13px] whitespace-nowrap transition-colors duration-150',
        active ? 'bg-white/[0.10] text-fg' : 'bg-white/[0.04] text-fg-muted hover:bg-white/[0.07] hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

/** Search input with a leading icon and an optional "/" focus shortcut. */
export const SearchField = forwardRef<
  HTMLInputElement,
  {
    value: string
    onChange: (v: string) => void
    placeholder: string
    label: string
    shortcut?: boolean
    size?: 'md' | 'lg'
    className?: string
  }
>(({ value, onChange, placeholder, label, shortcut, size = 'md', className }, ref) => {
  const inner = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (!shortcut) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return
      e.preventDefault()
      inner.current?.focus()
      inner.current?.select()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcut])
  const lg = size === 'lg'
  return (
    <div className={cn('relative', className)}>
      <Search
        className={cn('pointer-events-none absolute top-1/2 -translate-y-1/2 text-fg-subtle', lg ? 'left-4 size-[18px]' : 'left-3.5 size-4')}
        aria-hidden="true"
      />
      <input
        ref={(el) => {
          inner.current = el
          if (typeof ref === 'function') ref(el)
          else if (ref) ref.current = el
        }}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            if (value) onChange('')
            else (e.target as HTMLInputElement).blur()
          }
        }}
        placeholder={placeholder}
        aria-label={label}
        className={cn(
          'w-full rounded-xl border border-white/10 bg-white/[0.03] text-fg placeholder:text-fg-faint',
          'transition-all outline-none hover:border-white/15 focus:border-white/25 focus:bg-white/[0.05] focus:ring-4 focus:ring-white/[0.04]',
          '[&::-webkit-search-cancel-button]:hidden',
          lg ? 'h-12 pr-12 pl-11 text-[15px]' : 'h-10 pr-10 pl-10 text-[14px]',
        )}
      />
      {shortcut && !value && (
        <span className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 sm:block">
          <Kbd>/</Kbd>
        </span>
      )}
    </div>
  )
})
SearchField.displayName = 'SearchField'

/** Re-exported for modules that import it from here (interview pages). */
export { VERDICT_LABEL } from './format'
