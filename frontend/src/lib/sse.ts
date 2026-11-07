import { ApiError, parseError, rawFetch } from './api'

interface StreamHandlers {
  onDelta: (text: string) => void
  onDone?: (event: Record<string, unknown>) => void
  signal?: AbortSignal
}

/** POST to an endpoint that answers with `text/event-stream` and `data: {...}` events. */
export async function streamPost(path: string, body: unknown, h: StreamHandlers): Promise<void> {
  const res = await rawFetch(path, { method: 'POST', body, signal: h.signal })
  if (!res.ok) throw await parseError(res)
  if (!res.body) throw new ApiError(0, 'stream', 'Streaming is not supported in this browser.')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 2)
      if (!chunk.startsWith('data:')) continue
      let event: Record<string, unknown>
      try {
        event = JSON.parse(chunk.slice(5).trim())
      } catch {
        continue
      }
      if (typeof event.error === 'string') throw new ApiError(502, 'ai_error', event.error)
      if (typeof event.delta === 'string') h.onDelta(event.delta)
      if (event.done) h.onDone?.(event)
    }
  }
}
