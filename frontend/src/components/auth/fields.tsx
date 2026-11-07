import { ChevronDown, CircleAlert, CircleCheck, Eye, EyeOff, Info } from 'lucide-react'
import {
  forwardRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import { Input } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

/** Label above the control, an optional hint and a soft inline error below. */
export function Field({
  id,
  label,
  error,
  hint,
  aside,
  children,
  className,
}: {
  id: string
  label: ReactNode
  error?: ReactNode
  hint?: ReactNode
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-fg-muted block text-[13.5px] font-medium">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-fg-subtle mt-2 text-[13px] leading-snug">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-crit/90 mt-2 text-[13px] leading-snug">
          {error}
        </p>
      )}
    </div>
  )
}

/** Password input with a show / hide toggle. Forwards its ref for react-hook-form. */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(({ className, ...props }, ref) => {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input
        ref={ref}
        type={visible ? 'text' : 'password'}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        className={cn('pr-11', className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="text-fg-subtle hover:text-fg absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-md transition-colors duration-150 hover:bg-white/[0.06]"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        aria-controls={props.id}
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  )
})
PasswordInput.displayName = 'PasswordInput'

/** Native select styled to match Input (keyboard and mobile friendly). */
export const NativeSelect = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(({ className, invalid, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'text-fg h-10 w-full appearance-none truncate rounded-lg border border-white/10 bg-white/[0.03] pr-10 pl-3 text-[14px]',
        'transition-all outline-none hover:border-white/15 focus:border-white/25 focus:bg-white/[0.05] focus:ring-4 focus:ring-white/[0.04]',
        'aria-[invalid]:border-crit/70 [&>option]:bg-ink-850 disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      className="text-fg-subtle pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
      aria-hidden="true"
    />
  </div>
))
NativeSelect.displayName = 'NativeSelect'

const alertTone = {
  error: { box: 'border-crit/20 bg-crit/[0.06]', icon: <CircleAlert className="text-crit" /> },
  success: { box: 'border-ok/20 bg-ok/[0.06]', icon: <CircleCheck className="text-ok" /> },
  info: { box: 'border-white/10 bg-white/[0.03]', icon: <Info className="text-fg-subtle" /> },
} as const

/** Form-level message (server errors, confirmations) in a soft rounded box. */
export function FormAlert({
  tone = 'error',
  title,
  children,
  className,
}: {
  tone?: 'error' | 'success' | 'info'
  title?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'animate-fade-in flex gap-3 rounded-xl border px-4 py-3 text-[13.5px] leading-snug',
        alertTone[tone].box,
        className,
      )}
    >
      <span className="mt-px shrink-0 [&_svg]:size-4" aria-hidden="true">
        {alertTone[tone].icon}
      </span>
      <div className="min-w-0">
        {title && <p className="text-fg font-medium">{title}</p>}
        {children && <div className={cn('text-fg-muted', title && 'mt-1')}>{children}</div>}
      </div>
    </div>
  )
}
