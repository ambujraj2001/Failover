import { ArrowUp, Square } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Markdown } from '@/components/Markdown'
import { ApiError } from '@/lib/api'
import { streamPost } from '@/lib/sse'
import type { ChatMessage } from '@/lib/types'
import { cn } from '@/lib/utils'

export interface ChatPanelProps {
  endpoint: string
  messages: ChatMessage[]
  onMessages: (m: ChatMessage[]) => void
  buildBody: (text: string) => Record<string, unknown>
  placeholder?: string
  empty?: ReactNode
  suggestions?: string[]
  disabled?: boolean
  disabledReason?: string
  onDone?: (event: Record<string, unknown>) => void
  assistantName?: string
  className?: string
}

export function ChatPanel({
  endpoint,
  messages,
  onMessages,
  buildBody,
  placeholder = 'Ask a question…',
  empty,
  suggestions,
  disabled,
  disabledReason,
  onDone,
  assistantName = 'Mentor',
  className,
}: ChatPanelProps) {
  const [draft, setDraft] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const latest = useRef(messages)
  latest.current = messages

  useEffect(() => () => abort.current?.abort(), [])
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  async function send(text: string) {
    const msg = text.trim()
    if (!msg || streaming || disabled) return
    if (msg.length > 2000) {
      setError('Keep messages under 2,000 characters.')
      return
    }
    setError(null)
    setDraft('')
    const base: ChatMessage[] = [...latest.current, { role: 'user', content: msg }]
    onMessages([...base, { role: 'assistant', content: '' }])
    setStreaming(true)
    const ctrl = new AbortController()
    abort.current = ctrl
    let acc = ''
    try {
      await streamPost(endpoint, buildBody(msg), {
        signal: ctrl.signal,
        onDelta: (d) => {
          acc += d
          onMessages([...base, { role: 'assistant', content: acc }])
        },
        onDone,
      })
      if (!acc) onMessages(base)
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        onMessages(acc ? [...base, { role: 'assistant', content: acc }] : base)
      } else {
        onMessages(acc ? [...base, { role: 'assistant', content: acc }] : base)
        setError(e instanceof ApiError ? e.message : 'The assistant could not answer. Try again.')
      }
    } finally {
      setStreaming(false)
      abort.current = null
    }
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-4">
            {empty}
            {suggestions && !disabled && (
              <div className="flex flex-col gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-xl border border-white/[0.08] px-3.5 py-2.5 text-left text-[13px] text-fg-muted transition-colors hover:border-white/15 hover:bg-white/[0.03] hover:text-fg"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn('flex flex-col', m.role === 'user' ? 'items-end' : 'items-start')}>
            {m.role === 'assistant' && <span className="mb-1.5 text-[12px] text-fg-subtle">{assistantName}</span>}
            <div
              className={cn(
                'max-w-[92%] rounded-lg text-[13px]',
                m.role === 'user' ? 'rounded-2xl rounded-br-md bg-white/[0.08] px-3.5 py-2.5 whitespace-pre-wrap text-fg' : 'text-fg',
              )}
            >
              {m.role === 'assistant' ? (
                m.content ? (
                  <Markdown className="prose-p:my-1.5 prose-ul:my-1.5 text-[13px]">{m.content}</Markdown>
                ) : (
                  <span className="inline-flex gap-1 py-1">
                    {[0, 1, 2].map((d) => (
                      <span key={d} className="size-1.5 animate-pulse-dot rounded-full bg-fg-subtle" style={{ animationDelay: `${d * 160}ms` }} />
                    ))}
                  </span>
                )
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}
        {error && <p className="rounded-xl bg-crit/[0.07] px-3.5 py-2.5 text-[13px] text-fg">{error}</p>}
        <div ref={bottom} />
      </div>
      <form
        className="border-t border-ink-700 p-3"
        onSubmit={(e) => {
          e.preventDefault()
          send(draft)
        }}
      >
        {disabled && disabledReason && <p className="mb-2 text-[12px] text-fg-subtle">{disabledReason}</p>}
        <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2 focus-within:border-white/20">
          <textarea
            value={draft}
            disabled={disabled}
            rows={1}
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(draft)
              }
            }}
            placeholder={placeholder}
            className="max-h-32 min-h-8 flex-1 resize-none bg-transparent px-2 py-1.5 text-[13px] text-fg outline-none placeholder:text-fg-faint disabled:opacity-50"
            aria-label="Message"
          />
          {streaming ? (
            <button
              type="button"
              onClick={() => abort.current?.abort()}
              className="grid size-8 place-items-center rounded-md bg-ink-700 text-fg hover:bg-ink-600"
              aria-label="Stop"
            >
              <Square className="size-3.5" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!draft.trim() || disabled}
              className="grid size-8 place-items-center rounded-full bg-fg text-ink-950 hover:bg-white disabled:bg-white/10 disabled:text-fg-faint"
              aria-label="Send"
            >
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
