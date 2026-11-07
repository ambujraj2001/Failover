import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Layers } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { fmtDue, fmtInterval } from '@/components/learn/format'
import { qk, useFlashcardStats } from '@/components/learn/queries'
import type { Flashcard, FlashcardsDue, Grade } from '@/components/learn/types'
import { PageContainer } from '@/components/layout/AppShell'
import { Markdown } from '@/components/Markdown'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge, EmptyState, ErrorBlock, Skeleton } from '@/components/ui/primitives'
import { api } from '@/lib/api'

const GRADES: { grade: Grade; label: string; key: string }[] = [
  { grade: 'again', label: 'Again', key: '1' },
  { grade: 'hard', label: 'Hard', key: '2' },
  { grade: 'good', label: 'Good', key: '3' },
  { grade: 'easy', label: 'Easy', key: '4' },
]

/** Client-side preview of the SM-2 schedule in backend/app/services/srs.py (ease assumed 2.5). */
function nextInterval(card: Flashcard, grade: Grade): number {
  if (grade === 'again') return 0
  const i = card.interval_days
  let base: number
  if (card.new || i <= 0) base = 1
  else if (i <= 1.3) base = grade === 'hard' ? 2 : 3
  else base = i * 2.5
  if (grade === 'hard') base *= 0.8
  if (grade === 'easy') base *= 1.3
  return Math.min(base, 365)
}

interface Session {
  queue: Flashcard[]
  total: number
  reviewed: number
}

export default function Flashcards() {
  const qc = useQueryClient()
  const due = useQuery({
    queryKey: qk.flashcardsDue,
    queryFn: () => api<FlashcardsDue>('/flashcards/due?limit=30'),
    staleTime: 0,
  })
  const stats = useFlashcardStats()
  const [session, setSession] = useState<Session | null>(null)
  const [revealed, setRevealed] = useState(false)

  const start = useCallback((cards: Flashcard[]) => {
    setSession({ queue: cards, total: cards.length, reviewed: 0 })
    setRevealed(false)
  }, [])

  // start a session the first time cards arrive
  useEffect(() => {
    if (due.data && session === null && due.data.cards.length > 0) start(due.data.cards)
  }, [due.data, session, start])

  const review = useMutation({
    mutationFn: ({ card, grade }: { card: Flashcard; grade: Grade }) =>
      api<{ due_at: string; interval_days: number }>(`/flashcards/${card.id}/review`, { method: 'POST', body: { grade } }),
    onError: (err, { card }) => {
      toast.error(err instanceof Error ? err.message : 'Could not save that review.')
      setSession((s) => (s ? { ...s, queue: [card, ...s.queue], reviewed: Math.max(0, s.reviewed - 1) } : s))
    },
  })

  const current = session?.queue[0]
  const finished = session !== null && session.queue.length === 0

  // refresh counts once the session ends; until the refetch lands the old due list is stale
  const [endedAt, setEndedAt] = useState(0)
  useEffect(() => {
    if (!finished) return
    setEndedAt(Date.now())
    const t = setTimeout(() => {
      qc.invalidateQueries({ queryKey: ['flashcards'] })
      qc.invalidateQueries({ queryKey: qk.dashboard })
    }, 400)
    return () => clearTimeout(t)
  }, [finished, qc])

  const grade = useCallback(
    (g: Grade) => {
      if (!current || !revealed) return
      review.mutate({ card: current, grade: g })
      setSession((s) => {
        if (!s) return s
        const rest = s.queue.slice(1)
        // "again" cards come back at the end of this session (the server schedules them ~10 minutes out)
        const queue = g === 'again' ? [...rest, { ...current, new: false, interval_days: 0 }] : rest
        return { ...s, queue, reviewed: s.reviewed + (g === 'again' ? 0 : 1) }
      })
      setRevealed(false)
    },
    [current, revealed, review],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return
      if (!current) return
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        if (t?.tagName === 'BUTTON' && e.key === 'Enter') return
        e.preventDefault()
        setRevealed(true)
        return
      }
      if (revealed) {
        const g = GRADES.find((x) => x.key === e.key)
        if (g) {
          e.preventDefault()
          grade(g.grade)
        } else if (e.key === ' ') {
          e.preventDefault()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, revealed, grade])

  const fresh = !finished || (!due.isFetching && due.dataUpdatedAt > endedAt)
  const toReview = session && !finished ? session.queue.length : fresh ? (due.data?.cards.length ?? 0) : 0

  return (
    <PageContainer className="max-w-[784px]">
      <header className="mb-10 text-center">
        <h1 className="text-[30px] leading-[1.15] tracking-[-0.03em]">Flashcards</h1>
        <p className="mt-2 text-[15px] text-fg-muted" aria-live="polite">
          {due.isPending ? ' ' : toReview > 0 ? `${toReview} ${toReview === 1 ? 'card' : 'cards'} to review` : 'Nothing to review right now'}
        </p>
      </header>

      {due.isPending ? (
        <Skeleton className="h-[360px]" />
      ) : due.isError ? (
        <ErrorBlock error={due.error} onRetry={() => due.refetch()} />
      ) : current && session ? (
        <ReviewCard card={current} revealed={revealed} onReveal={() => setRevealed(true)} onGrade={grade} />
      ) : finished || (stats.data?.seen ?? 0) > 0 ? (
        <DoneState
          reviewed={session?.total ?? 0}
          data={fresh ? due.data : undefined}
          onRestart={(cards) => start(cards)}
        />
      ) : (
        <EmptyState
          icon={<Layers />}
          title="No cards yet"
          body="Cards appear as you finish lessons. Day 1 adds the first few."
          action={
            <Link to="/app/path" className={buttonVariants({ variant: 'secondary' })}>
              Open the learning path
            </Link>
          }
        />
      )}
    </PageContainer>
  )
}

function ReviewCard({
  card,
  revealed,
  onReveal,
  onGrade,
}: {
  card: Flashcard
  revealed: boolean
  onReveal: () => void
  onGrade: (g: Grade) => void
}) {
  return (
    <div>
      <div className="card flex min-h-[360px] flex-col px-6 py-8 sm:px-12 sm:py-12">
        <div className="flex min-h-[22px] items-center justify-center gap-3 text-[13px] text-fg-subtle">
          {card.new && <Badge>New</Badge>}
          {card.concept && (
            <Link
              to={`/app/concepts?q=${encodeURIComponent(card.concept.replace(/-/g, ' '))}`}
              className="min-w-0 truncate capitalize transition-colors hover:text-fg"
            >
              {card.concept.replace(/-/g, ' ')}
            </Link>
          )}
        </div>
        <div className="flex flex-1 flex-col justify-center py-8 text-center">
          <Markdown className="text-[22px] prose-p:text-[22px] prose-p:leading-snug prose-p:text-fg prose-strong:text-fg sm:text-[24px] sm:prose-p:text-[24px]">
            {card.front}
          </Markdown>
          {revealed && (
            <div className="mt-8 animate-fade-in border-t border-white/[0.06] pt-8" aria-live="polite">
              <Markdown className="text-[16px] prose-p:text-[16px] prose-p:leading-relaxed prose-li:text-[16px]">{card.back}</Markdown>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        {!revealed ? (
          <div className="flex flex-col items-center gap-3">
            <Button size="lg" className="w-full sm:w-56" onClick={onReveal} autoFocus>
              Show answer
            </Button>
            <p className="hidden text-[12.5px] text-fg-faint sm:block">or press space</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2 sm:gap-3" role="group" aria-label="How well did you remember it?">
              {GRADES.map((g) => (
                <button
                  key={g.grade}
                  type="button"
                  onClick={() => onGrade(g.grade)}
                  aria-keyshortcuts={g.key}
                  className="flex h-16 flex-col items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] transition-all duration-150 hover:border-white/15 hover:bg-white/[0.07] active:scale-[0.98]"
                >
                  <span className="text-[14px] font-medium text-fg">{g.label}</span>
                  <span className="num mt-0.5 text-[12.5px] text-fg-subtle">{fmtInterval(nextInterval(card, g.grade))}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 hidden text-center text-[12.5px] text-fg-faint sm:block">
              Press 1–4. “Again” shows the card once more before you finish.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function DoneState({
  reviewed,
  data,
  onRestart,
}: {
  reviewed: number
  data?: FlashcardsDue
  onRestart: (cards: Flashcard[]) => void
}) {
  const more = data?.cards.length ?? 0
  const reviewedLine = reviewed > 0 ? `You reviewed ${reviewed} ${reviewed === 1 ? 'card' : 'cards'}. ` : ''
  const nextLine = !data
    ? 'Updating your schedule…'
    : more > 0
      ? `${more} more ${more === 1 ? 'card is' : 'cards are'} ready.`
      : data.next_due_at
        ? `Your next card is due ${fmtDue(data.next_due_at)}.`
        : 'Finish more lessons to add new cards.'
  return (
    <EmptyState
      icon={<Check />}
      title="All done for now"
      body={reviewedLine + nextLine}
      action={
        more > 0 && data ? (
          <Button onClick={() => onRestart(data.cards)}>Review {more} more</Button>
        ) : (
          <Link to="/app" className={buttonVariants({ variant: 'secondary' })}>
            Back to home
          </Link>
        )
      }
    />
  )
}
