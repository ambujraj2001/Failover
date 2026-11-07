import type { ReactNode } from 'react'
import { Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { LogoMark } from '@/components/brand/Logo'
import { useAuth } from '@/stores/auth'

export function FullPageLoader() {
  return (
    <div className="grid min-h-screen place-items-center">
      <LogoMark className="size-8 animate-pulse" />
    </div>
  )
}

/** Signed-in only. New accounts are sent through onboarding first. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, user } = useAuth()
  const loc = useLocation()
  if (status === 'loading') return <FullPageLoader />
  if (status === 'anon') return <Navigate to={`/signin?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  if (user && !user.onboarded && loc.pathname !== '/welcome') return <Navigate to="/welcome" replace />
  return <>{children}</>
}

/** Signed-out only (sign-in, sign-up). Signed-in users go to the app. */
export function RequireAnon({ children }: { children: ReactNode }) {
  const { status, user } = useAuth()
  const [params] = useSearchParams()
  if (status === 'loading') return <FullPageLoader />
  if (status === 'authed')
    return <Navigate to={user && !user.onboarded ? '/welcome' : safeNext(params.get('next'))} replace />
  return <>{children}</>
}

/** Safe redirect target from ?next= (same-origin paths only). */
export function safeNext(raw: string | null, fallback = '/app'): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return fallback
  return raw
}
