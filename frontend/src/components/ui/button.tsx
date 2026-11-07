import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const button = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-fg text-ink-950 shadow-[0_1px_0_0_rgb(255_255_255/0.3)_inset] hover:bg-white active:scale-[0.98]',
        accent: 'bg-brand-500 text-white hover:bg-brand-400 active:scale-[0.98]',
        secondary: 'border border-white/10 bg-white/[0.04] text-fg hover:border-white/15 hover:bg-white/[0.07]',
        ghost: 'text-fg-muted hover:bg-white/[0.05] hover:text-fg',
        outline: 'border border-white/10 text-fg hover:bg-white/[0.05]',
        danger: 'border border-crit/30 text-crit hover:border-crit/60 hover:bg-crit/[0.06]',
        success: 'bg-ok text-ink-950 hover:bg-ok/90',
        link: 'h-auto px-0 text-fg underline decoration-white/20 underline-offset-4 hover:decoration-fg',
      },
      size: {
        xs: 'h-7 px-2.5 text-[12.5px] rounded-md',
        sm: 'h-8 px-3 text-[13px]',
        md: 'h-9 px-4 text-[13.5px]',
        lg: 'h-11 px-5 text-[15px] rounded-xl',
        icon: 'size-8',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(button({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" />}
      {children}
    </button>
  ),
)
Button.displayName = 'Button'

export { button as buttonVariants }
