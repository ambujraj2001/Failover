import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ActiveRoom } from '@/components/interview/ActiveRoom'
import { useFinishInterview, useInterview } from '@/components/interview/queries'
import { InterviewReport } from '@/components/interview/Report'
import { fmtDate, RoomBar } from '@/components/interview/shared'
import type { InterviewDetail } from '@/components/interview/types'
import { Button, buttonVariants } from '@/components/ui/button'
import { ErrorBlock, Skeleton } from '@/components/ui/primitives'
import { ApiError } from '@/lib/api'

function Frame({ iv, children }: { iv?: InterviewDetail; children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col bg-ink-900">
      <RoomBar title={iv?.problem_title} level={iv?.target_level} />
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}

function EndedState({ title, body, actions }: { title: string; body: ReactNode; actions: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-lg px-5 py-14 sm:py-24">
      <div className="card p-6 sm:p-8">
        <h1 className="text-[24px] leading-tight tracking-[-0.025em]">{title}</h1>
        <div className="mt-2 text-[15px] leading-relaxed text-fg-muted">{body}</div>
        <div className="mt-7 flex flex-wrap gap-3">{actions}</div>
      </div>
    </div>
  )
}

function ExpiredState({ iv }: { iv: InterviewDetail }) {
  const finish = useFinishInterview(iv.id)
  return (
    <EndedState
      title="Time ran out"
      body={
        <>
          <p>
            Your interview on <span className="text-fg">{iv.problem_title}</span> ended before you finished. You can still
            get scores for the design on your canvas, or start fresh.
          </p>
          {finish.isError && (
            <div className="mt-4">
              <ErrorBlock error={finish.error} />
            </div>
          )}
        </>
      }
      actions={
        <>
          <Button
            loading={finish.isPending}
            onClick={() => finish.mutate(undefined, { onSuccess: () => toast.success('Interview scored') })}
          >
            {finish.isPending ? 'Scoring…' : 'Get my scores'}
          </Button>
          <Link to={`/app/interviews?problem=${encodeURIComponent(iv.problem_slug)}`} className={buttonVariants({ variant: 'ghost' })}>
            Start another
          </Link>
        </>
      }
    />
  )
}

function RoomSkeleton() {
  return (
    <div className="flex h-dvh flex-col bg-ink-900" aria-busy="true" aria-label="Loading interview">
      <div className="flex h-14 items-center gap-3 border-b border-white/[0.06] bg-ink-950/80 px-4">
        <Skeleton className="size-8 rounded-lg" />
        <Skeleton className="h-4 w-48" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="grid flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[300px_minmax(0,1fr)_360px]">
        <div className="card hidden space-y-3 p-5 xl:block">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-4/6" />
        </div>
        <div className="card grid-bg" />
        <div className="card hidden space-y-3 p-5 lg:block">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-10 w-4/5" />
        </div>
      </div>
    </div>
  )
}

export default function InterviewRoom() {
  const { id } = useParams<{ id: string }>()
  const q = useInterview(id)

  if (q.isPending) return <RoomSkeleton />

  if (q.isError) {
    const notFound = q.error instanceof ApiError && (q.error.status === 404 || q.error.status === 422)
    return (
      <Frame>
        {notFound ? (
          <EndedState
            title="Interview not found"
            body="This link doesn't match any of your interviews."
            actions={
              <Link to="/app/interviews" className={buttonVariants()}>
                Go to interviews
              </Link>
            }
          />
        ) : (
          <div className="mx-auto max-w-lg px-5 py-16">
            <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
          </div>
        )}
      </Frame>
    )
  }

  const iv = q.data
  if (iv.status === 'active') return <ActiveRoom key={iv.id} iv={iv} />

  if (iv.status === 'completed')
    return (
      <Frame iv={iv}>
        <InterviewReport iv={iv} />
      </Frame>
    )

  if (iv.status === 'expired')
    return (
      <Frame iv={iv}>
        <ExpiredState iv={iv} />
      </Frame>
    )

  return (
    <Frame iv={iv}>
      <EndedState
        title="Interview abandoned"
        body={
          <p>
            Your interview on <span className="text-fg">{iv.problem_title}</span> ({fmtDate(iv.created_at)}) ended early, so it
            has no score.
          </p>
        }
        actions={
          <>
            <Link to={`/app/interviews?problem=${encodeURIComponent(iv.problem_slug)}`} className={buttonVariants()}>
              Start another
            </Link>
            <Link to="/app/interviews" className={buttonVariants({ variant: 'ghost' })}>
              All interviews
            </Link>
          </>
        }
      />
    </Frame>
  )
}
