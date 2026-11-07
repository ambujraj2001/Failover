import { Check, Lock, Puzzle, Target } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLabs } from '@/components/learn/queries'
import { PageIntro, SearchField, Segmented } from '@/components/learn/shared'
import { PageContainer } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { Badge, DifficultyBadge, EmptyState, ErrorBlock, Skeleton } from '@/components/ui/primitives'
import type { Difficulty, LabCard } from '@/lib/types'
import { cn } from '@/lib/utils'

type Kind = 'lab' | 'problem'
type DiffFilter = 'any' | Difficulty

export default function Practice() {
  const [params, setParams] = useSearchParams()
  const kind: Kind = params.get('tab') === 'problems' ? 'problem' : 'lab'
  const [diff, setDiff] = useState<DiffFilter>('any')
  const [search, setSearch] = useState('')
  const q = useLabs()

  const setKind = (k: Kind) => {
    const next = new URLSearchParams(params)
    if (k === 'problem') next.set('tab', 'problems')
    else next.delete('tab')
    setParams(next, { replace: true })
  }

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (q.data ?? []).filter((c) => {
      if (c.kind !== kind) return false
      if (diff !== 'any' && c.difficulty !== diff) return false
      if (needle) {
        const hay = [c.title, c.summary, ...c.topics, ...c.company_tags].join(' ').toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [q.data, kind, diff, search])

  const hasFilters = diff !== 'any' || !!search.trim()
  const clear = () => {
    setDiff('any')
    setSearch('')
  }
  const noun = kind === 'lab' ? 'labs' : 'problems'

  return (
    <PageContainer>
      <PageIntro title="Practice">
        {kind === 'lab'
          ? 'Something is broken in production. Find the cause and fix it in the simulator.'
          : 'Design a system the way an interviewer would ask, then test it under real load.'}
      </PageIntro>

      <Segmented
        size="md"
        label="What to practise"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'lab', label: 'Labs' },
          { value: 'problem', label: 'Interview problems' },
        ]}
      />

      <div className="mt-6 mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchField
          value={search}
          onChange={setSearch}
          label={`Search ${noun}`}
          placeholder={`Search ${noun}`}
          className="sm:w-80"
          shortcut
        />
        <Segmented<DiffFilter>
          size="xs"
          label="Difficulty"
          value={diff}
          onChange={setDiff}
          className="self-start sm:self-auto"
          options={[
            { value: 'any', label: 'All' },
            { value: 'easy', label: 'Easy' },
            { value: 'medium', label: 'Medium' },
            { value: 'hard', label: 'Hard' },
          ]}
        />
      </div>

      {q.isPending ? (
        <div className="grid gap-5 sm:grid-cols-2" aria-busy="true" aria-label="Loading">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={kind === 'lab' ? <Puzzle /> : <Target />}
          title={hasFilters ? `No ${noun} match your search` : `No ${noun} yet`}
          body={hasFilters ? 'Try a different word or difficulty.' : 'New ones are on the way.'}
          action={
            hasFilters && (
              <Button variant="secondary" onClick={clear}>
                Clear search
              </Button>
            )
          }
        />
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2" aria-label={kind === 'lab' ? 'Labs' : 'Interview problems'}>
          {filtered.map((c) => (
            <li key={c.slug} className="flex">
              <PracticeCard card={c} />
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  )
}

function PracticeCard({ card: c }: { card: LabCard }) {
  const locked = !c.unlocked
  const meta = [c.day != null ? `Day ${c.day}` : null, `${c.estimated_minutes} min`].filter(Boolean).join(' · ')
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <DifficultyBadge level={c.difficulty} />
        {locked ? (
          <Lock className="size-4 text-fg-faint" aria-label="Locked" />
        ) : c.solved ? (
          <Badge tone="ok">
            <Check className="size-3" /> Solved
          </Badge>
        ) : null}
      </div>
      <h2 className={cn('mt-5 text-[16px] leading-snug', locked ? 'text-fg-muted' : 'text-fg')}>{c.title}</h2>
      <p className="mt-1.5 line-clamp-2 text-[14px] leading-relaxed text-fg-muted">{c.summary}</p>
      <p className="mt-auto pt-5 text-[12.5px] text-fg-subtle">
        {locked ? 'Unlocks as you move through the path' : meta}
      </p>
    </>
  )
  const cls = 'card flex w-full flex-col p-6'
  if (locked)
    return (
      <div className={cn(cls, 'cursor-not-allowed opacity-60')} aria-disabled="true">
        {body}
      </div>
    )
  return (
    <Link
      to={`/lab/${c.slug}`}
      className={cn(cls, 'transition-colors duration-150 hover:border-white/[0.12] hover:from-ink-750')}
      aria-label={`${c.title}, ${c.difficulty}${c.solved ? ', solved' : ''}`}
    >
      {body}
    </Link>
  )
}
