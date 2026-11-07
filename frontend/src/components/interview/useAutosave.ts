import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import type { Design } from '@/lib/types'

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

interface Patch {
  design?: Design
  notes?: string
}

const DEBOUNCE_MS = 1500
const RETRY_MS = 5000

/**
 * Debounced PUT /interviews/:id for design and notes. Later edits overwrite pending ones,
 * failed saves are retried, and `flush()` saves immediately (used before finishing).
 */
export function useInterviewAutosave(id: string, opts: { enabled: boolean; onEnded?: () => void }) {
  const pending = useRef<Patch>({})
  const timer = useRef<number | undefined>(undefined)
  const inflight = useRef<Promise<void> | null>(null)
  const [state, setState] = useState<SaveState>('idle')
  const enabled = useRef(opts.enabled)
  const onEnded = useRef(opts.onEnded)
  const retry = useRef<() => void>(() => {})
  useEffect(() => {
    enabled.current = opts.enabled
    onEnded.current = opts.onEnded
  })

  const flush = useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current)
    if (inflight.current) await inflight.current
    const body = pending.current
    if (!enabled.current || (body.design === undefined && body.notes === undefined)) return
    pending.current = {}
    setState('saving')
    const run = api(`/interviews/${id}`, { method: 'PUT', body })
      .then(() => {
        const more = pending.current.design !== undefined || pending.current.notes !== undefined
        setState(more ? 'pending' : 'saved')
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 409) {
          setState('idle')
          onEnded.current?.()
          return
        }
        // keep the failed payload unless something newer replaced it
        pending.current = { ...body, ...pending.current }
        setState('error')
        timer.current = window.setTimeout(() => retry.current(), RETRY_MS)
      })
      .finally(() => {
        inflight.current = null
      })
    inflight.current = run
    await run
  }, [id])

  useEffect(() => {
    retry.current = () => void flush()
  }, [flush])

  const queue = useCallback(
    (patch: Patch) => {
      if (!enabled.current) return
      pending.current = { ...pending.current, ...patch }
      setState('pending')
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void flush(), DEBOUNCE_MS)
    },
    [flush],
  )

  // save on unmount; warn before closing the tab with unsaved edits
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (pending.current.design !== undefined || pending.current.notes !== undefined) {
        void flush()
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      void flush()
    }
  }, [flush])

  return { state, queue, flush }
}
