import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ArrowRight, BookOpen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useDebounced } from '@/components/learn/format'
import { qk } from '@/components/learn/queries'
import { PageIntro, Pill, SearchField } from '@/components/learn/shared'
import { CONCEPT_AREAS, type ConceptItem } from '@/components/learn/types'
import { PageContainer } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorBlock, Skeleton } from '@/components/ui/primitives'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

export default function Concepts() {
  const [params, setParams] = useSearchParams()
  const [text, setText] = useState(params.get('q') ?? '')
  const area = params.get('area') ?? ''
  const debounced = useDebounced(text.trim(), 200)

  // keep the URL in sync so searches are shareable and survive back/forward
  useEffect(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (debounced) next.set('q', debounced)
        else next.delete('q')
        return next
      },
      { replace: true },
    )
  }, [debounced, setParams])

  const setArea = (a: string) => {
    const next = new URLSearchParams(params)
    if (a) next.set('area', a)
    else next.delete('area')
    setParams(next, { replace: true })
  }

  const q = useQuery({
    queryKey: qk.concepts(debounced, area),
    queryFn: () => {
      const sp = new URLSearchParams()
      if (debounced) sp.set('q', debounced)
      if (area) sp.set('area', area)
      const s = sp.toString()
      return api<ConceptItem[]>(`/concepts${s ? `?${s}` : ''}`)
    },
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  })

  return (
    <PageContainer>
      <PageIntro title="Concepts">Every term from the course, explained in a sentence or two.</PageIntro>

      <SearchField
        value={text}
        onChange={setText}
        label="Search concepts"
        placeholder="Search a term, like caching or replication"
        size="lg"
        shortcut
      />

      <div
        role="group"
        aria-label="Filter by area"
        className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <Pill active={!area} onClick={() => setArea('')}>
          All
        </Pill>
        {CONCEPT_AREAS.map((a) => (
          <Pill key={a} active={area === a} onClick={() => setArea(area === a ? '' : a)}>
            {a}
          </Pill>
        ))}
      </div>

      <div className="mt-8">
        {q.isPending ? (
          <div className="grid gap-5 sm:grid-cols-2" aria-busy="true" aria-label="Loading concepts">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-36" />
            ))}
          </div>
        ) : q.isError ? (
          <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
        ) : q.data.length === 0 ? (
          <EmptyState
            icon={<BookOpen />}
            title={debounced ? `Nothing found for “${debounced}”` : 'No concepts here yet'}
            body={debounced ? 'Try a shorter or different word.' : undefined}
            action={
              (debounced || area) && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setText('')
                    setArea('')
                  }}
                >
                  Clear search
                </Button>
              )
            }
          />
        ) : (
          <ul className={cn('grid gap-5 transition-opacity sm:grid-cols-2', q.isFetching && 'opacity-70')}>
            {q.data.map((c) => (
              <li key={c.slug} className="card flex flex-col p-6">
                <h2 className="text-[16px]">{c.name}</h2>
                <p className="mt-1.5 text-[14px] leading-relaxed text-fg-muted">{c.short}</p>
                {c.lesson && c.day != null && (
                  <Link
                    to={`/app/lessons/${c.lesson}`}
                    title={c.lesson_title ?? undefined}
                    className="group mt-auto inline-flex items-center gap-1.5 self-start pt-4 text-[13px] text-fg-subtle transition-colors hover:text-fg"
                  >
                    Day {c.day} lesson
                    <ArrowRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageContainer>
  )
}
