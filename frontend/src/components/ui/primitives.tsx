import * as SwitchPrimitive from '@radix-ui/react-switch'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { forwardRef, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'h-10 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 text-[14px] text-fg placeholder:text-fg-faint',
        'transition-all outline-none hover:border-white/15 focus:border-white/25 focus:bg-white/[0.05] focus:ring-4 focus:ring-white/[0.04]',
        'disabled:opacity-50 aria-[invalid]:border-crit/70 aria-[invalid]:focus:ring-crit/20',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[14px] text-fg placeholder:text-fg-faint',
        'outline-none transition-all hover:border-white/15 focus:border-white/25 focus:ring-4 focus:ring-white/[0.04]',
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'

export function Label({ className, ...props }: HTMLAttributes<HTMLLabelElement> & { htmlFor?: string }) {
  return <label className={cn('mb-2 block text-[13px] font-medium text-fg-muted', className)} {...props} />
}

export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null
  return <p className="mt-1.5 text-[12px] text-crit">{children}</p>
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card', className)} {...props} />
}

type BadgeTone = 'neutral' | 'brand' | 'ok' | 'warn' | 'crit' | 'info'
const tones: Record<BadgeTone, string> = {
  neutral: 'bg-white/[0.06] text-fg-muted',
  brand: 'bg-brand-500/15 text-brand-300',
  ok: 'bg-ok/10 text-ok',
  warn: 'bg-warn/10 text-warn',
  crit: 'bg-crit/10 text-crit',
  info: 'bg-white/[0.06] text-info',
}

export function Badge({ tone = 'neutral', className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1 rounded-full px-2.5 text-[12px] font-medium capitalize',
        tones[tone],
        className,
      )}
      {...props}
    />
  )
}

export function DifficultyBadge({ level }: { level: string }) {
  const tone = level === 'easy' ? 'ok' : level === 'medium' ? 'warn' : 'crit'
  return (
    <Badge tone={tone} className="capitalize">
      {level}
    </Badge>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-white/[0.04]', className)} />
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-ink-600 bg-ink-800 px-1 font-mono text-[10.5px] text-fg-muted">
      {children}
    </kbd>
  )
}

export function Progress({ value, className, tone = 'brand' }: { value: number; className?: string; tone?: 'brand' | 'ok' }) {
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]', className)}>
      <div
        className={cn('h-full rounded-full transition-[width] duration-700', tone === 'ok' ? 'bg-ok' : 'bg-fg')}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}

export function Switch({ checked, onCheckedChange, disabled, id }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; id?: string }) {
  return (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className="relative h-5 w-9 shrink-0 rounded-full bg-white/10 transition-colors data-[state=checked]:bg-fg disabled:opacity-50"
    >
      <SwitchPrimitive.Thumb className="block size-4 translate-x-0.5 rounded-full bg-fg shadow transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-ink-950" />
    </SwitchPrimitive.Root>
  )
}

export function Tip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-64 animate-fade-in rounded-md border border-ink-600 bg-ink-750 px-2 py-1.5 text-[12px] leading-snug text-fg shadow-pop"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-4 grid size-10 place-items-center rounded-xl bg-white/[0.05] text-fg-muted [&_svg]:size-5">{icon}</div>}
      <p className="text-[15px] font-medium text-fg">{title}</p>
      {body && <p className="mt-1.5 max-w-sm text-[14px] text-fg-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
      <div className="min-w-0">
        {eyebrow && <p className="mb-2 text-[13px] text-fg-subtle">{eyebrow}</p>}
        <h1 className="text-[30px] leading-[1.15] tracking-[-0.025em]">{title}</h1>
        {description && <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : 'Something went wrong.'
  return (
    <div className="rounded-xl border border-crit/20 bg-crit/[0.04] px-4 py-3 text-[14px]">
      <p className="text-fg">{msg}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-1.5 text-fg-muted underline decoration-ink-500 underline-offset-4 hover:text-fg">
          Try again
        </button>
      )}
    </div>
  )
}
