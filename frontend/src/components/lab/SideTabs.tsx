import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Eye, Lightbulb, Pencil, Reply, Trash2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ChatPanel } from '@/components/ai/ChatPanel'
import { DesignEditor } from '@/components/canvas/DesignEditor'
import { Markdown } from '@/components/Markdown'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState, ErrorBlock, Skeleton, Textarea } from '@/components/ui/primitives'
import { ApiError, api } from '@/lib/api'
import type { CatalogItem, ChatMessage, Design, GradeResult } from '@/lib/types'
import { cn, fmtCost, relTime } from '@/lib/utils'
import { SubmissionSummary } from './Results'

// ---- hints ------------------------------------------------------------------------------------

export function HintsTab({ slug }: { slug: string }) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['hints', slug], queryFn: () => api<{ total: number; revealed: string[] }>(`/labs/${slug}/hints`) })
  const reveal = useMutation({
    mutationFn: () => api<{ total: number; revealed: string[] }>(`/labs/${slug}/hints/reveal`, { method: 'POST' }),
    onSuccess: (d) => qc.setQueryData(['hints', slug], d),
    onError: (e) => toast.error((e as Error).message),
  })
  if (q.isLoading) return <div className="space-y-2 p-4"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
  if (q.error) return <div className="p-4"><ErrorBlock error={q.error} onRetry={() => q.refetch()} /></div>
  const d = q.data!
  return (
    <div className="space-y-3 p-4">
      <p className="text-[12.5px] text-fg-subtle">Hints get more specific as you go. Try to solve it with as few as you can.</p>
      {d.revealed.map((h, i) => (
        <div key={i} className="card px-4 py-3.5">
          <p className="mb-1 text-[12.5px] text-fg-subtle">Hint {i + 1} of {d.total}</p>
          <p className="text-[13px] leading-relaxed text-fg">{h}</p>
        </div>
      ))}
      {d.revealed.length < d.total ? (
        <Button variant="secondary" size="sm" loading={reveal.isPending} onClick={() => reveal.mutate()}>
          <Lightbulb /> Reveal hint {d.revealed.length + 1} of {d.total}
        </Button>
      ) : (
        <p className="text-[12px] text-fg-subtle">That's every hint. The editorial unlocks after your first submission.</p>
      )}
    </div>
  )
}

// ---- editorial --------------------------------------------------------------------------------

export function EditorialTab({ slug, catalog, onLoadDesign }: { slug: string; catalog: CatalogItem[]; onLoadDesign: (d: Design) => void }) {
  const [show, setShow] = useState(false)
  const q = useQuery({
    queryKey: ['editorial', slug],
    queryFn: () => api<{ editorial: string; solution: Design }>(`/labs/${slug}/editorial`),
  })
  if (q.isLoading) return <div className="space-y-2 p-4"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-40" /></div>
  if (q.error) {
    if (q.error instanceof ApiError && q.error.code === 'editorial_locked')
      return (
        <div className="p-4">
          <EmptyState title="Editorial locked" body="Submit once to unlock the write-up and the reference design. A failed attempt counts." />
        </div>
      )
    return <div className="p-4"><ErrorBlock error={q.error} onRetry={() => q.refetch()} /></div>
  }
  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setShow(true)}>
          <Eye /> View reference design
        </Button>
      </div>
      <Markdown>{q.data!.editorial}</Markdown>
      <Dialog open={show} onOpenChange={setShow} title="Reference design" description="One design that passes every test within budget. Others exist." className="max-w-4xl">
        <DesignEditor design={q.data!.solution} catalog={catalog} readOnly className="h-[420px] rounded-md border border-ink-700 bg-ink-900" />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShow(false)}>Close</Button>
          <Button
            size="sm"
            onClick={() => {
              onLoadDesign(q.data!.solution)
              setShow(false)
              toast('Reference design loaded onto your canvas')
            }}
          >
            Load onto canvas
          </Button>
        </div>
      </Dialog>
    </div>
  )
}

// ---- submissions ------------------------------------------------------------------------------

interface SubRow { id: string; created_at: string; passed: boolean; cost: number; tests_passed: number; tests_total: number; has_review: boolean }
interface SubDetail { id: string; created_at: string; passed: boolean; cost: number; design: Design; design_note: string | null; result: GradeResult; review: string | null }

export function SubmissionsTab({ slug, onLoadDesign }: { slug: string; onLoadDesign: (d: Design) => void }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const q = useQuery({ queryKey: ['submissions', slug], queryFn: () => api<SubRow[]>(`/labs/${slug}/submissions`) })
  if (q.isLoading) return <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
  if (q.error) return <div className="p-4"><ErrorBlock error={q.error} onRetry={() => q.refetch()} /></div>
  if (!q.data!.length)
    return <div className="p-4"><EmptyState title="No attempts yet" body="Submit runs every test, including the hidden ones." /></div>
  return (
    <div className="p-2">
      {q.data!.map((s) => (
        <button
          key={s.id}
          onClick={() => setOpenId(s.id)}
          className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left hover:bg-ink-800"
        >
          {s.passed ? <CheckCircle2 className="size-4 text-ok" /> : <XCircle className="size-4 text-crit" />}
          <span className="flex-1">
            <span className={cn('block text-[13px]', s.passed ? 'text-ok' : 'text-crit')}>{s.passed ? 'Accepted' : 'Failed'}</span>
            <span className="block font-mono text-[11px] text-fg-subtle">
              {s.tests_passed}/{s.tests_total} tests · {fmtCost(s.cost)}
            </span>
          </span>
          {s.has_review && <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11.5px] text-fg-subtle">Reviewed</span>}
          <span className="text-[11.5px] text-fg-subtle">{relTime(s.created_at)}</span>
        </button>
      ))}
      {openId && <SubmissionDialog slug={slug} id={openId} onClose={() => setOpenId(null)} onLoadDesign={onLoadDesign} />}
    </div>
  )
}

function SubmissionDialog({ slug, id, onClose, onLoadDesign }: { slug: string; id: string; onClose: () => void; onLoadDesign: (d: Design) => void }) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['submission', id], queryFn: () => api<SubDetail>(`/labs/${slug}/submissions/${id}`) })
  const review = useMutation({
    mutationFn: () => api<{ review: string }>(`/labs/${slug}/submissions/${id}/review`, { method: 'POST' }),
    onSuccess: (d) => {
      qc.setQueryData(['submission', id], (old: SubDetail | undefined) => (old ? { ...old, review: d.review } : old))
      qc.invalidateQueries({ queryKey: ['submissions', slug] })
    },
  })
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title="Submission" description={q.data ? new Date(q.data.created_at).toLocaleString() : undefined} className="max-h-[88vh] max-w-3xl overflow-y-auto">
      {q.isLoading && <Skeleton className="h-40" />}
      {q.error && <ErrorBlock error={q.error} />}
      {q.data && (
        <div className="space-y-5">
          <SubmissionSummary result={q.data.result} />
          <div className="border-t border-ink-700 pt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[14px] font-medium">Design review</p>
              {!q.data.review && (
                <Button size="xs" variant="secondary" loading={review.isPending} onClick={() => review.mutate()}>
                  Get review
                </Button>
              )}
            </div>
            {q.data.review ? (
              <Markdown className="text-[13px]">{q.data.review}</Markdown>
            ) : (
              <p className="text-[12.5px] text-fg-subtle">
                A staff-level review of this design: what works, what breaks next, where the money goes.
              </p>
            )}
            {review.error && <p className="mt-2 text-[12.5px] text-crit">{(review.error as Error).message}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
            <Button size="sm" variant="secondary" onClick={() => { onLoadDesign(q.data!.design); onClose(); toast('Submission design loaded') }}>
              Load this design
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}

// ---- discussion -------------------------------------------------------------------------------

interface Post { id: string; parent_id: string | null; body: string; deleted: boolean; author: string; mine: boolean; created_at: string; edited_at: string | null; replies?: Post[] }

export function DiscussTab({ slug }: { slug: string }) {
  const qc = useQueryClient()
  const key = ['discussion', slug]
  const q = useQuery({ queryKey: key, queryFn: () => api<{ posts: Post[]; total: number }>(`/labs/${slug}/discussion`) })
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: key })
  const create = useMutation({
    mutationFn: (v: { body: string; parent_id?: string | null }) => api(`/labs/${slug}/discussion`, { method: 'POST', body: v }),
    onSuccess: () => { setBody(''); setReplyTo(null); refresh() },
    onError: (e) => toast.error((e as Error).message),
  })
  const edit = useMutation({
    mutationFn: (v: { id: string; body: string }) => api(`/labs/${slug}/discussion/${v.id}`, { method: 'PATCH', body: { body: v.body } }),
    onSuccess: () => { setEditing(null); refresh() },
    onError: (e) => toast.error((e as Error).message),
  })
  const del = useMutation({
    mutationFn: (id: string) => api(`/labs/${slug}/discussion/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: (e) => toast.error((e as Error).message),
  })

  const renderPost = (p: Post, depth = 0) => (
    <div key={p.id} className={cn(depth > 0 && 'ml-5 border-l border-ink-700 pl-3')}>
      <div className="py-2.5">
        <div className="flex items-center gap-2 text-[12px]">
          <span className={cn('font-medium', p.deleted ? 'text-fg-faint' : 'text-fg')}>{p.author}</span>
          <span className="text-fg-faint">{relTime(p.created_at)}{p.edited_at && ' · edited'}</span>
        </div>
        {editing?.id === p.id ? (
          <div className="mt-1.5 space-y-2">
            <Textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={3} maxLength={4000} />
            <div className="flex gap-2">
              <Button size="xs" loading={edit.isPending} onClick={() => edit.mutate(editing)} disabled={!editing.body.trim()}>Save</Button>
              <Button size="xs" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <p className={cn('mt-1 text-[13px] whitespace-pre-wrap', p.deleted ? 'text-fg-faint italic' : 'text-fg-muted')}>
            {p.deleted ? 'This comment was deleted.' : p.body}
          </p>
        )}
        {!p.deleted && editing?.id !== p.id && (
          <div className="mt-1.5 flex gap-3 text-[11.5px] text-fg-subtle">
            {depth === 0 && (
              <button className="inline-flex items-center gap-1 hover:text-fg" onClick={() => setReplyTo(replyTo === p.id ? null : p.id)}>
                <Reply className="size-3" /> Reply
              </button>
            )}
            {p.mine && (
              <>
                <button className="inline-flex items-center gap-1 hover:text-fg" onClick={() => setEditing({ id: p.id, body: p.body })}>
                  <Pencil className="size-3" /> Edit
                </button>
                <button className="inline-flex items-center gap-1 hover:text-crit" onClick={() => del.mutate(p.id)}>
                  <Trash2 className="size-3" /> Delete
                </button>
              </>
            )}
          </div>
        )}
        {replyTo === p.id && (
          <ReplyBox pending={create.isPending} onSend={(b) => create.mutate({ body: b, parent_id: p.id })} onCancel={() => setReplyTo(null)} />
        )}
      </div>
      {p.replies?.map((r) => renderPost(r, 1))}
    </div>
  )

  return (
    <div className="p-4">
      <form
        onSubmit={(e) => { e.preventDefault(); if (body.trim()) create.mutate({ body }) }}
        className="mb-4 space-y-2"
      >
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={4000} placeholder="Share an approach or ask a question. Avoid posting full solutions." />
        <div className="flex justify-end">
          <Button size="sm" type="submit" loading={create.isPending && !replyTo} disabled={!body.trim()}>Post</Button>
        </div>
      </form>
      {q.isLoading && <Skeleton className="h-24" />}
      {q.error && <ErrorBlock error={q.error} onRetry={() => q.refetch()} />}
      {q.data && q.data.posts.length === 0 && <p className="py-6 text-center text-[13px] text-fg-subtle">No comments yet.</p>}
      <div className="divide-y divide-ink-800">{q.data?.posts.map((p) => renderPost(p))}</div>
    </div>
  )
}

function ReplyBox({ onSend, onCancel, pending }: { onSend: (b: string) => void; onCancel: () => void; pending: boolean }) {
  const [v, setV] = useState('')
  return (
    <div className="mt-2 space-y-2">
      <Textarea value={v} onChange={(e) => setV(e.target.value)} rows={2} maxLength={4000} autoFocus placeholder="Write a reply" />
      <div className="flex gap-2">
        <Button size="xs" loading={pending} disabled={!v.trim()} onClick={() => onSend(v)}>Reply</Button>
        <Button size="xs" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

// ---- mentor -----------------------------------------------------------------------------------

export function MentorTab({ slug, getDesign }: { slug: string; getDesign: () => Design }) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['mentor', slug], queryFn: () => api<ChatMessage[]>(`/labs/${slug}/mentor`) })
  const [messages, setMessages] = useState<ChatMessage[] | null>(null)
  const clear = useMutation({
    mutationFn: () => api(`/labs/${slug}/mentor`, { method: 'DELETE' }),
    onSuccess: () => { setMessages([]); qc.setQueryData(['mentor', slug], []) },
  })
  const list = messages ?? q.data ?? []
  if (q.isLoading) return <div className="space-y-2 p-4"><Skeleton className="h-10" /><Skeleton className="h-20" /></div>
  return (
    <div className="flex h-full min-h-0 flex-col">
      {list.length > 0 && (
        <div className="flex justify-end border-b border-ink-700 px-3 py-1.5">
          <button className="text-[11.5px] text-fg-subtle hover:text-fg" onClick={() => clear.mutate()}>Clear conversation</button>
        </div>
      )}
      <ChatPanel
        endpoint={`/labs/${slug}/mentor`}
        messages={list}
        onMessages={setMessages}
        buildBody={(message) => ({ message, design: getDesign() })}
        placeholder="Ask the on-call mentor…"
        empty={
          <div>
            <p className="text-[13px] font-medium text-fg">On-call mentor</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-fg-muted">
              Reads the problem, your current canvas and a fresh run of the visible test. It points at evidence and asks questions; it gives the answer only if you ask for it.
            </p>
          </div>
        }
        suggestions={['Where is the bottleneck in my design?', 'What does the error breakdown tell me?', 'Am I close to the budget for the right reasons?']}
      />
    </div>
  )
}
