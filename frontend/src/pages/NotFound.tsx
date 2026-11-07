import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/brand/Logo'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/stores/auth'

export default function NotFound() {
  const authed = useAuth((s) => s.status === 'authed')
  return (
    <div className="relative flex min-h-full flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_50%_50%_at_50%_0%,rgb(255_255_255/0.05),transparent_70%)]"
      />
      <header className="relative px-5 py-5 sm:px-8">
        <Link to={authed ? '/app' : '/'} aria-label="Failover home">
          <Logo />
        </Link>
      </header>
      <main className="relative flex flex-1 items-center justify-center px-5 pb-24">
        <div className="w-full max-w-md text-center">
          <p className="text-[14px] text-fg-subtle">404</p>
          <h1 className="mt-2 text-[30px] leading-[1.15] tracking-[-0.03em]">We couldn’t find that page</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">The link may be old, or the page may have moved.</p>
          <Link to={authed ? '/app' : '/'} className={cn(buttonVariants({ size: 'lg' }), 'mt-8')}>
            <ArrowLeft /> {authed ? 'Back to home' : 'Back to the homepage'}
          </Link>
        </div>
      </main>
    </div>
  )
}
