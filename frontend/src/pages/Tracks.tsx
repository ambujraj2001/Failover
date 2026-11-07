import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Check, ChevronDown, Lock, Map as MapIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { kindLabel } from '@/components/learn/format'
import { qk, useLabs } from '@/components/learn/queries'
import { IconTile, PageIntro } from '@/components/learn/shared'
import type { StudyTrack } from '@/components/learn/types'
import { PageContainer } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { Badge, DifficultyBadge, EmptyState, ErrorBlock, Skeleton } from '@/components/ui/primitives'
import { setUser } from '@/hooks/useSession'
import { api } from '@/lib/api'
import type { LabCard, User } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useAuth } from '@/stores/auth'

export default function Tracks() {
  const qc = useQueryClient()
  const active = useAuth((s) => s.user?.track ?? null)
  const tracks = useQuery({ queryKey: qk.tracks, queryFn: () => api<StudyTrack[]>('/tracks'), staleTime: 10 * 60_000 })
  const labs = useLabs()
  const bySlug = new Map((labs.data ?? []).map((l) => [l.slug, l]))
  const [picked, setPicked] = useState<string | null | undefined>(undefined)
  // until the learner picks one, show the plan they follow
  const selected = picked === undefined ? active : picked

  const follow = useMutation({
    mutationFn: (track: string | null) => api<User>('/me', { method: 'PATCH', body: { track: track ?? 'none' } }),
    onSuccess: (user, track) => {
      setUser(user)
      qc.invalidateQueries({ queryKey: qk.dashboard })
      const name = tracks.data?.find((t) => t.slug === track)?.name
      toast.success(track ? `Following ${name ?? 'plan'}` : 'You stopped following this plan')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not update your plan.'),
  })

  const selectedTrack = tracks.data?.find((t) => t.slug === selected)

  return (
    <PageContainer>
      <PageIntro title="Study plans">
        Getting ready for a specific interview? Pick a plan. It runs alongside your 30-day path.
      </PageIntro>

      {tracks.isPending ? (
        <div className="grid gap-5 sm:grid-cols-2" aria-busy="true" aria-label="Loading study plans">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-52" />
          ))}
        </div>
      ) : tracks.isError ? (
        <ErrorBlock error={tracks.error} onRetry={() => tracks.refetch()} />
      ) : tracks.data.length === 0 ? (
        <EmptyState icon={<MapIcon />} title="No study plans yet" body="New plans are on the way." />
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            {tracks.data.map((t) => {
              const isActive = active === t.slug
              const isOpen = selected === t.slug
              return (
                <TrackCard
                  key={t.slug}
                  track={t}
                  isActive={isActive}
                  isOpen={isOpen}
                  onOpen={() => setPicked(isOpen ? null : t.slug)}
                  pending={follow.isPending && follow.variables === t.slug}
                  disabled={follow.isPending}
                  onFollow={() => {
                    setPicked(t.slug)
                    follow.mutate(t.slug)
                  }}
                />
              )
            })}
          </div>

          {selectedTrack && (
            <TrackDetail
              key={selectedTrack.slug}
              track={selectedTrack}
              labs={bySlug}
              labsLoading={labs.isPending}
              isActive={active === selectedTrack.slug}
              stopping={follow.isPending && follow.variables === null}
              disabled={follow.isPending}
              onStop={() => follow.mutate(null)}
            />
          )}
        </>
      )}
    </PageContainer>
  )
}

function TrackCard({
  track: t,
  isActive,
  isOpen,
  onOpen,
  pending,
  disabled,
  onFollow,
}: {
  track: StudyTrack
  isActive: boolean
  isOpen: boolean
  onOpen: () => void
  pending: boolean
  disabled: boolean
  onFollow: () => void
}) {
  return (
    <div className={cn('card flex flex-col transition-colors duration-150', isOpen ? 'border-white/[0.16]' : 'hover:border-white/[0.12]')}>
      <button
        type="button"
        onClick={onOpen}
        aria-expanded={isOpen}
        aria-controls="plan-detail"
        className="flex-1 rounded-xl p-6 pb-0 text-left sm:p-7 sm:pb-0"
      >
        <h2 className="text-[17px]">{t.name}</h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-fg-muted">{t.tagline}</p>
      </button>
      <div className="flex items-center justify-between gap-3 px-6 pt-6 pb-6 sm:px-7 sm:pb-7">
        <button
          type="button"
          onClick={onOpen}
          tabIndex={-1}
          aria-hidden="true"
          className="inline-flex items-center gap-1.5 text-[13px] text-fg-subtle transition-colors hover:text-fg"
        >
          {t.weeks} weeks · {t.items.length} steps
          <ChevronDown className={cn('size-3.5 transition-transform duration-200', isOpen && 'rotate-180')} />
        </button>
        {isActive ? (
          <Badge tone="ok">
            <Check className="size-3" /> Following
          </Badge>
        ) : (
          <Button variant="secondary" size="sm" onClick={onFollow} loading={pending} disabled={disabled}>
            Follow
          </Button>
        )}
      </div>
    </div>
  )
}

function TrackDetail({
  track: t,
  labs,
  labsLoading,
  isActive,
  stopping,
  disabled,
  onStop,
}: {
  track: StudyTrack
  labs: Map<string, LabCard>
  labsLoading: boolean
  isActive: boolean
  stopping: boolean
  disabled: boolean
  onStop: () => void
}) {
  const solved = t.items.filter((i) => labs.get(i.slug)?.solved).length
  return (
    <section id="plan-detail" aria-labelledby="plan-detail-h" className="card mt-6 animate-fade-in overflow-hidden">
      <header className="flex flex-col gap-4 px-6 pt-6 pb-4 sm:flex-row sm:items-start sm:justify-between sm:px-8 sm:pt-7">
        <div className="min-w-0">
          <h2 id="plan-detail-h" className="text-[18px]">
            {t.name}
          </h2>
          <p className="mt-1.5 max-w-xl text-[14.5px] leading-relaxed text-fg-muted">{t.description}</p>
          {!labsLoading && (
            <p className="mt-3 text-[13px] text-fg-subtle">
              {solved} of {t.items.length} solved
            </p>
          )}
        </div>
        {isActive && (
          <Button variant="ghost" size="sm" onClick={onStop} loading={stopping} disabled={disabled} className="shrink-0 self-start">
            Stop following
          </Button>
        )}
      </header>

      <ol className="px-2 pb-2 sm:px-4 sm:pb-4" aria-label={`${t.name} labs`}>
        {t.items.map((it, i) => {
          const card = labs.get(it.slug)
          const locked = card ? !card.unlocked : false
          const solvedIt = !!card?.solved
          const row = (
            <>
              <IconTile done={solvedIt}>
                <span className="num">{i + 1}</span>
              </IconTile>
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate text-[14.5px]', solvedIt || locked ? 'text-fg-muted' : 'text-fg')}>{it.title}</span>
                <span className="text-[12.5px] text-fg-subtle">{kindLabel(it.kind)}</span>
              </span>
              {locked ? <Lock className="size-4 shrink-0 text-fg-faint" aria-label="Locked" /> : <DifficultyBadge level={it.difficulty} />}
              {!locked && <ArrowRight className="hidden size-4 shrink-0 text-fg-faint sm:block" />}
            </>
          )
          const cls = 'flex items-center gap-4 rounded-xl px-4 py-3'
          return (
            <li key={it.slug}>
              {locked ? (
                <div className={cn(cls, 'cursor-not-allowed opacity-60')} aria-disabled="true">
                  {row}
                </div>
              ) : (
                <Link to={`/lab/${it.slug}`} className={cn(cls, 'transition-colors duration-150 hover:bg-white/[0.04]')}>
                  {row}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
