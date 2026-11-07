import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { TopGlow } from '@/components/auth/AuthLayout'
import { FormAlert } from '@/components/auth/fields'
import { browserTimezone, errorMessage, fieldErrors } from '@/components/auth/helpers'
import { OptionList, OptionRow, StepIndicator } from '@/components/auth/OptionRow'
import { DEFAULT_PATH_LABEL, LEVEL_OPTIONS, TARGET_OPTIONS, type Track } from '@/components/auth/options'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/primitives'
import { setUser, useSignOut } from '@/hooks/useSession'
import { api } from '@/lib/api'
import type { Level, Target, User } from '@/lib/types'
import { BRAND } from '@/lib/utils'
import { useAuth } from '@/stores/auth'

const STEPS = ['Experience', 'Target', 'Plan']

interface Choices {
  level: Level
  target_level: Target
  track: string
}

export default function Onboarding() {
  const user = useAuth((s) => s.user)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const signOut = useSignOut()

  const [step, setStep] = useState(0)
  const [choices, setChoices] = useState<Choices>(() => ({
    level: user?.level ?? 'intermediate',
    target_level: user?.target_level ?? 'E5',
    track: user?.track ?? 'none',
  }))
  const headingRef = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)

  useEffect(() => {
    document.title = `Setup · ${BRAND.name}`
  }, [])

  // move focus to the new step's heading so keyboard and screen reader users land in the right place
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    headingRef.current?.focus()
  }, [step])

  const tracks = useQuery({
    queryKey: ['tracks'],
    queryFn: ({ signal }) => api<Track[]>('/tracks', { signal }),
    staleTime: 5 * 60_000,
  })

  const finish = useMutation({
    mutationFn: async (c: Choices) => {
      const body = { ...c, timezone: browserTimezone(), onboarded: true }
      try {
        return await api<User>('/me', { method: 'PATCH', body })
      } catch (err) {
        // an unrecognised browser time zone should never block onboarding
        if (fieldErrors(err).timezone) {
          return api<User>('/me', { method: 'PATCH', body: { ...body, timezone: undefined } })
        }
        throw err
      }
    },
    onSuccess: (u) => {
      setUser(u)
      qc.invalidateQueries()
      toast.success('You’re all set')
      navigate('/app', { replace: true })
    },
  })

  const next = (e: FormEvent) => {
    e.preventDefault()
    if (step < STEPS.length - 1) setStep(step + 1)
    else finish.mutate(choices)
  }
  const back = () => setStep((s) => Math.max(0, s - 1))
  const set = <K extends keyof Choices>(k: K, v: Choices[K]) => setChoices((c) => ({ ...c, [k]: v }))
  const last = step === STEPS.length - 1

  return (
    <div className="bg-ink-900 relative flex min-h-screen flex-col overflow-hidden">
      <TopGlow />

      <header className="relative">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-5 sm:px-8">
          <Logo />
          <div className="flex min-w-0 items-center gap-3">
            {user?.email && (
              <span className="text-fg-subtle hidden max-w-[220px] truncate text-[13px] sm:inline">
                {user.email}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-xl flex-1 px-5 pt-8 pb-16 sm:pt-14">
        <StepIndicator steps={STEPS} current={step} />

        <form onSubmit={next} className="mt-10" aria-labelledby="onboarding-title" key={step}>
          <div className="animate-fade-in">
            {step === 0 && (
              <StepFrame
                headingRef={headingRef}
                title="How familiar are you with system design?"
                description="Pick how deep you want explanations to go. You can change this any time in Settings."
              >
                <OptionList legend="Experience level">
                  {LEVEL_OPTIONS.map((o) => (
                    <OptionRow
                      key={o.value}
                      name="level"
                      value={o.value}
                      checked={choices.level === o.value}
                      onChange={(v) => set('level', v as Level)}
                      title={o.label}
                      description={o.description}
                    />
                  ))}
                </OptionList>
              </StepFrame>
            )}

            {step === 1 && (
              <StepFrame
                headingRef={headingRef}
                title="What level are you aiming for?"
                description="Mock interviews and design reviews give feedback at this level."
              >
                <OptionList legend="Target level">
                  {TARGET_OPTIONS.map((o) => (
                    <OptionRow
                      key={o.value}
                      name="target_level"
                      value={o.value}
                      checked={choices.target_level === o.value}
                      onChange={(v) => set('target_level', v as Target)}
                      title={o.label}
                      description={o.description}
                    />
                  ))}
                </OptionList>
              </StepFrame>
            )}

            {step === 2 && (
              <StepFrame
                headingRef={headingRef}
                title="How would you like to study?"
                description="Most people start with the 30-day path. Company plans focus on one company’s interviews."
              >
                <OptionList legend="Study plan" columns={2}>
                  <OptionRow
                    name="track"
                    value="none"
                    checked={choices.track === 'none'}
                    onChange={(v) => set('track', v)}
                    title={DEFAULT_PATH_LABEL}
                    badge="Recommended"
                    description="From the basics to full interview problems, one day at a time."
                  />
                  {tracks.isPending &&
                    Array.from({ length: 3 }).map((_, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-white/[0.06] px-5 py-4"
                        aria-hidden="true"
                      >
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="mt-2.5 h-3.5 w-full" />
                        <Skeleton className="mt-3 h-3 w-16" />
                      </div>
                    ))}
                  {tracks.isError && (
                    <div className="text-fg-muted flex items-center rounded-xl border border-white/[0.06] px-5 py-4 text-[14px]">
                      <p>
                        Couldn’t load company plans.{' '}
                        <button
                          type="button"
                          onClick={() => tracks.refetch()}
                          className="text-fg hover:decoration-fg rounded-sm font-medium underline decoration-white/20 underline-offset-4"
                        >
                          Try again
                        </button>
                      </p>
                    </div>
                  )}
                  {tracks.data?.map((t) => (
                    <OptionRow
                      key={t.slug}
                      name="track"
                      value={t.slug}
                      checked={choices.track === t.slug}
                      onChange={(v) => set('track', v)}
                      title={t.name}
                      description={t.tagline}
                      meta={`${t.weeks} weeks`}
                    />
                  ))}
                </OptionList>
              </StepFrame>
            )}
          </div>

          {finish.isError && (
            <FormAlert className="mt-6" title="Couldn’t save your choices.">
              {errorMessage(finish.error)}
            </FormAlert>
          )}

          <div className="mt-10 flex items-center justify-between gap-3">
            <div>
              {step > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={back}
                  disabled={finish.isPending}
                  className="h-10 px-4 text-[14px]"
                >
                  <ArrowLeft />
                  Back
                </Button>
              )}
            </div>
            <Button type="submit" loading={finish.isPending} className="h-10 px-5 text-[14px]">
              {last ? 'Start learning' : 'Continue'}
              {!finish.isPending && <ArrowRight />}
            </Button>
          </div>
        </form>
      </main>
    </div>
  )
}

function StepFrame({
  headingRef,
  title,
  description,
  children,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <>
      <h1
        id="onboarding-title"
        ref={headingRef}
        tabIndex={-1}
        className="text-[26px] leading-[1.2] tracking-[-0.03em] outline-none sm:text-[30px]"
      >
        {title}
      </h1>
      <p className="text-fg-muted mt-3 text-[15px] leading-relaxed">{description}</p>
      <div className="mt-8">{children}</div>
    </>
  )
}
