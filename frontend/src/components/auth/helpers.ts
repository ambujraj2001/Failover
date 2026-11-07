import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { applySession } from '@/hooks/useSession'
import { ApiError } from '@/lib/api'
import type { AuthResponse } from '@/lib/types'

/** A readable message for any error thrown by api(). */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'rate_limited') return 'Too many attempts. Wait a few minutes and try again.'
    return err.message
  }
  return 'Something went wrong. Please try again.'
}

export function errorCode(err: unknown): string | null {
  return err instanceof ApiError ? err.code : null
}

/** 422 field messages, or an empty object. */
export function fieldErrors(err: unknown): Record<string, string> {
  return err instanceof ApiError && err.status === 422 ? err.fieldErrors() : {}
}

/**
 * Store a fresh session and go to `to`.
 * Sign-in / sign-up live inside <RequireAnon>, which redirects to /app as soon as the session
 * lands; navigating on the next tick lets our destination (?next=, /welcome) win.
 */
export function useFinishAuth() {
  const navigate = useNavigate()
  return useCallback(
    (data: AuthResponse, to: string) => {
      applySession(data)
      setTimeout(() => navigate(to, { replace: true }), 0)
    },
    [navigate],
  )
}

export function browserTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}

/** ids used to wire a control to its hint and error for screen readers */
export function describedBy(id: string, opts: { error?: unknown; hint?: boolean; extra?: string }) {
  const ids = [opts.hint && `${id}-hint`, opts.extra, opts.error && `${id}-error`].filter(Boolean)
  return ids.length ? ids.join(' ') : undefined
}
