import { cn } from '@/lib/utils'

/**
 * The Failover mark: a primary that has failed (hollow, dim) above the standby that took over
 * (solid signal orange). Two shapes, no gradients; legible at 16px.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={cn('size-6 shrink-0', className)} aria-hidden="true">
      <rect x="2.75" y="3.75" width="14.5" height="4.5" rx="1" fill="none" stroke="#6b6b6b" strokeWidth="1.5" strokeDasharray="2.2 1.6" />
      <rect x="2" y="10.5" width="16" height="6.5" rx="1.5" fill="#FF6A2B" />
    </svg>
  )
}

const SIZES = {
  sm: { mark: 'size-5', text: 'text-[15px]', gap: 'gap-2' },
  md: { mark: 'size-6', text: 'text-[18px]', gap: 'gap-2.5' },
  lg: { mark: 'size-8', text: 'text-[22px]', gap: 'gap-3' },
} as const

export function Logo({ className, compact, size = 'md' }: { className?: string; compact?: boolean; size?: keyof typeof SIZES }) {
  const s = SIZES[size]
  return (
    <span className={cn('inline-flex items-center leading-none', s.gap, className)}>
      <LogoMark className={s.mark} />
      {!compact && <span className={cn('font-semibold tracking-[-0.025em] text-fg', s.text)}>Failover</span>}
    </span>
  )
}
