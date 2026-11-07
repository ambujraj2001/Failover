import { useAuth } from '@/stores/auth'
import type { AuthResponse } from './types'

export const API_BASE = '/api/v1'

export class ApiError extends Error {
  status: number
  code: string
  details: unknown
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
  /** field-level messages from a 422 response, keyed by field name */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {}
    if (Array.isArray(this.details)) {
      for (const d of this.details as { field?: string; message?: string }[]) {
        if (d?.field && d.message && !out[d.field]) out[d.field] = d.message
      }
    }
    return out
  }
}

let accessToken: string | null = null
let refreshing: Promise<boolean> | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

async function parseError(res: Response): Promise<ApiError> {
  let body: { error?: { code?: string; message?: string; details?: unknown } } = {}
  try {
    body = await res.json()
  } catch {
    /* non-JSON */
  }
  const fallback =
    res.status >= 500 ? 'Something went wrong on our side. Please try again.' : `Request failed (${res.status})`
  return new ApiError(
    res.status,
    body.error?.code ?? 'http_error',
    body.error?.message ?? fallback,
    body.error?.details,
  )
}

/** Exchange the httpOnly refresh cookie for a new access token. Deduplicated across callers. */
export function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
        if (!res.ok) {
          setAccessToken(null)
          useAuth.getState().clear()
          return false
        }
        const data = (await res.json()) as AuthResponse
        setAccessToken(data.access_token)
        useAuth.getState().setUser(data.user)
        return true
      } catch {
        return false
      } finally {
        setTimeout(() => (refreshing = null), 0)
      }
    })()
  }
  return refreshing
}

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  auth?: boolean
}

export async function rawFetch(path: string, opts: Options = {}, retry = true): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'include',
      signal: opts.signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError(0, 'network', 'Can’t reach the server. Check your connection and try again.')
  }
  if (res.status === 401 && opts.auth !== false && retry && !path.startsWith('/auth/')) {
    const ok = await refreshSession()
    if (ok) return rawFetch(path, opts, false)
  }
  return res
}

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const res = await rawFetch(path, opts)
  if (!res.ok) throw await parseError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export { parseError }
