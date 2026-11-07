import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/brand/Logo'
import { BRAND, cn } from '@/lib/utils'

/** Soft white light falling from the top of the page. Shared by the signed-out screens and onboarding. */
export function TopGlow() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgb(255_255_255/0.07),transparent_70%)]"
    />
  )
}

/**
 * Frame for the signed-out screens: the logo, then a single centred ~400px card on the dark page,
 * with small text links underneath.
 */
export function AuthLayout({
  title,
  description,
  children,
  footer,
  docTitle,
}: {
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** browser tab title, e.g. "Sign in" */
  docTitle?: string
}) {
  useEffect(() => {
    if (!docTitle) return
    const prev = document.title
    document.title = `${docTitle} · ${BRAND.name}`
    return () => {
      document.title = prev
    }
  }, [docTitle])

  return (
    <div className="bg-ink-900 relative min-h-screen overflow-hidden">
      <TopGlow />
      <main className="relative flex min-h-screen flex-col items-center justify-center px-4 py-12 sm:py-16">
        <Link to="/" className="mb-8 rounded-lg p-1" aria-label={`${BRAND.name} home`}>
          <Logo />
        </Link>

        <div className="card animate-fade-in w-full max-w-[400px] p-6 sm:p-8">
          <h1 className="text-[24px] leading-tight tracking-[-0.025em]">{title}</h1>
          {description && (
            <div className="text-fg-muted mt-2 text-[14.5px] leading-relaxed">{description}</div>
          )}
          <div className="mt-7">{children}</div>
        </div>

        {footer && <div className="text-fg-muted mt-6 max-w-[400px] text-center text-[14px]">{footer}</div>}
      </main>
    </div>
  )
}

/** Inline text link used in auth copy. */
export function AuthLink({
  to,
  children,
  className,
}: {
  to: string
  children: ReactNode
  className?: string
}) {
  return (
    <Link
      to={to}
      className={cn(
        'text-fg hover:decoration-fg rounded-sm font-medium underline decoration-white/20 underline-offset-4 transition-colors duration-150',
        className,
      )}
    >
      {children}
    </Link>
  )
}
