import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  CloudOff,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  RotateCcw,
  Send,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { DesignEditor } from '@/components/canvas/DesignEditor'
import { addComponent, cleanDesign, designCost } from '@/components/canvas/designOps'
import { Inspector } from '@/components/canvas/Inspector'
import { nodeCost, useCatalog } from '@/components/canvas/meta'
import { Palette } from '@/components/canvas/Palette'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Badge, DifficultyBadge, ErrorBlock, Kbd, Skeleton, Tip } from '@/components/ui/primitives'
import { ApiError, api } from '@/lib/api'
import type { ComponentType, Design, GradeResult, LabDetail, TestResult } from '@/lib/types'
import { cn, fmtCost } from '@/lib/utils'
import { useAuth } from '@/stores/auth'
import { DescriptionTab } from './DescriptionTab'
import { Logs, NoRunYet, SubmissionSummary, TestDetail } from './Results'
import { DiscussTab, EditorialTab, HintsTab, MentorTab, SubmissionsTab } from './SideTabs'

type SideTab = 'description' | 'hints' | 'editorial' | 'submissions' | 'discuss' | 'mentor'
type BottomTab = 'run' | 'submission' | 'logs'

const TICK_MS = 70

function useDebounced(fn: () => void, delay: number, deps: unknown[]) {
  const saved = useRef(fn)
  saved.current = fn
  useEffect(() => {
    const t = setTimeout(() => saved.current(), delay)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

function SignUpGate({ what }: { what: string }) {
  return (
    <div className="p-6 text-center">
      <p className="font-medium text-fg">{what} are for members</p>
      <p className="mt-1 text-[12.5px] text-fg-muted">Create a free account to unlock hints, the editorial, submissions, discussion and the AI mentor.</p>
      <Link to="/signup" className={cn(buttonVariants({ size: 'sm' }), 'mt-4')}>
        Create free account
      </Link>
    </div>
  )
}

export default function LabWorkspace({ mode, slug, embedded }: { mode: 'demo' | 'lab'; slug?: string; embedded?: boolean }) {
  const demo = mode === 'demo'
  const qc = useQueryClient()
  const user = useAuth((s) => s.user)
  const catalog = useCatalog()
  const labKey = demo ? ['demo-lab'] : ['lab', slug]
  const labQ = useQuery({
    queryKey: labKey,
    queryFn: () => (demo ? api<LabDetail>('/demo/lab', { auth: false }) : api<LabDetail>(`/labs/${slug}`)),
    staleTime: 60_000,
  })
  const lab = labQ.data

  const [design, setDesignState] = useState<Design | null>(null)
  const [note, setNote] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [side, setSide] = useState<SideTab>('description')
  const [sideOpen, setSideOpen] = useState(true)
  const [bottom, setBottom] = useState<BottomTab>('run')
  const [bottomOpen, setBottomOpen] = useState(false)
  const [testId, setTestId] = useState<string | null>(null)
  const [run, setRun] = useState<TestResult | null>(null)
  const [submission, setSubmission] = useState<GradeResult | null>(null)
  const [stale, setStale] = useState(false)
  const [tick, setTick] = useState<number | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const version = useRef<number | null>(null)
  const dirty = useRef(false)
  const designRef = useRef<Design | null>(null)
  designRef.current = design

  // initialise from draft or starter once the lab loads
  useEffect(() => {
    if (!lab || design) return
    setDesignState(lab.draft?.design ?? lab.starter)
    setNote(lab.draft?.design_note ?? '')
    version.current = lab.draft?.version ?? 0
    setTestId(lab.tests.find((t) => !t.hidden)?.id ?? null)
    if (window.innerWidth < 1024) setSideOpen(false)
  }, [lab, design])

  const setDesign = useCallback((d: Design) => {
    setDesignState(d)
    dirty.current = true
    setStale(true)
    setTick(null)
  }, [])

  // ---- autosave (signed-in labs only)
  const save = useCallback(async () => {
    if (demo || !slug || !dirty.current || !designRef.current) return
    dirty.current = false
    setSaveState('saving')
    try {
      const r = await api<{ version: number }>(`/labs/${slug}/draft`, {
        method: 'PUT',
        body: { design: cleanDesign(designRef.current), design_note: note, version: version.current },
      })
      version.current = r.version
      setSaveState('saved')
    } catch (e) {
      setSaveState('error')
      if (e instanceof ApiError && e.code === 'draft_conflict') {
        toast.error('This lab was changed in another tab.', {
          action: { label: 'Reload', onClick: () => window.location.reload() },
          duration: 10000,
        })
      }
    }
  }, [demo, slug, note])
  useDebounced(save, 1200, [design, note])

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current && !demo) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [demo])

  // ---- run
  const runM = useMutation({
    mutationFn: async () => {
      const body = { design: cleanDesign(designRef.current!), test_id: testId }
      return demo
        ? api<GradeResult>('/demo/run', { method: 'POST', body, auth: false })
        : api<GradeResult>(`/labs/${slug}/run`, { method: 'POST', body })
    },
    onSuccess: (r) => {
      const res = r.results[0]
      setRun(res)
      setStale(false)
      setBottom('run')
      setBottomOpen(true)
      setTick(0)
    },
    onError: (e) => toast.error((e as Error).message, { description: errorDetails(e) }),
  })

  // replay the run tick by tick on the canvas
  useEffect(() => {
    if (tick == null || !run?.series) return
    if (tick >= run.series.length - 1) return
    const t = setTimeout(() => setTick((x) => (x == null ? null : x + 1)), TICK_MS)
    return () => clearTimeout(t)
  }, [tick, run])

  const busy = useMemo(() => {
    if (!run?.series || stale) return null
    if (tick != null && tick < run.series.length) return run.series[tick].nodes
    return null
  }, [run, tick, stale])

  // ---- submit
  const submitM = useMutation({
    mutationFn: () =>
      api<GradeResult>(`/labs/${slug}/submit`, {
        method: 'POST',
        body: { design: cleanDesign(designRef.current!), design_note: lab?.design_prompt ? note : null },
      }),
    onSuccess: (r) => {
      setSubmission(r)
      setBottom('submission')
      setBottomOpen(true)
      dirty.current = false
      qc.invalidateQueries({ queryKey: ['lab', slug] })
      qc.invalidateQueries({ queryKey: ['submissions', slug] })
      qc.invalidateQueries({ queryKey: ['editorial', slug] })
      qc.invalidateQueries({ queryKey: ['curriculum'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['labs'] })
      if (r.passed) {
        toast.success(r.newly_solved ? 'Accepted. Lab solved.' : 'Accepted.', {
          description: r.unlocked_phase ? `New phase unlocked: ${r.unlocked_phase.replace('-', ' ')}` : undefined,
        })
      } else {
        const failedHidden = r.results.filter((x) => x.hidden && !x.passed).length
        toast.error('Not accepted yet', {
          description: failedHidden ? `${failedHidden} hidden test${failedHidden > 1 ? 's' : ''} failed and ${failedHidden > 1 ? 'are' : 'is'} now revealed.` : !r.within_budget ? 'Over budget.' : undefined,
        })
      }
    },
    onError: (e) => toast.error((e as Error).message, { description: errorDetails(e) }),
  })

  // keyboard shortcuts: ⌘/Ctrl+Enter run, ⌘/Ctrl+Shift+Enter submit
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'Enter') return
      e.preventDefault()
      if (e.shiftKey && !demo) submitM.mutate()
      else runM.mutate()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [demo, runM, submitM])

  const add = (type: ComponentType, position?: { x: number; y: number }) => {
    if (!design || !catalog.data) return
    const r = addComponent(design, type, catalog.data, selected, position)
    setDesign(r.design)
    setSelected(r.id)
  }

  const reset = async () => {
    if (!lab) return
    setDesign(lab.starter)
    setSelected(null)
    setRun(null)
    setSubmission(null)
    setConfirmReset(false)
    if (!demo && slug) {
      try {
        const r = await api<{ version: number }>(`/labs/${slug}/draft`, { method: 'DELETE' })
        version.current = r.version
        dirty.current = false
      } catch {
        /* autosave will retry */
      }
    }
  }

  // ---- render
  if (labQ.error) {
    const locked = labQ.error instanceof ApiError && labQ.error.code === 'locked'
    return (
      <div className={cn('grid place-items-center p-6', embedded ? 'h-full' : 'min-h-screen')}>
        <div className="max-w-md text-center">
          <p className="font-display text-lg font-semibold">{locked ? 'This lab is locked' : 'Could not load this lab'}</p>
          <div className="mt-3">
            <ErrorBlock error={labQ.error} onRetry={locked ? undefined : () => labQ.refetch()} />
          </div>
          {!demo && (
            <Link to="/app/path" className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'mt-4')}>
              Back to the path
            </Link>
          )}
        </div>
      </div>
    )
  }
  if (!lab || !design || !catalog.data) {
    return (
      <div className={cn('flex flex-col gap-3 p-4', embedded ? 'h-full' : 'h-screen')}>
        <Skeleton className="h-10" />
        <div className="flex flex-1 gap-3">
          <Skeleton className="w-80" />
          <Skeleton className="flex-1" />
        </div>
      </div>
    )
  }

  const cost = designCost(design, catalog.data, nodeCost)
  const over = cost > lab.budget + 1e-9
  const visibleTests = lab.tests.filter((t) => !t.hidden)
  const solved = lab.progress?.solved || submission?.passed
  const logs = run?.logs ?? []
  const sideTabs: { id: SideTab; label: string }[] = [
    { id: 'description', label: 'Brief' },
    { id: 'hints', label: 'Hints' },
    { id: 'mentor', label: 'Mentor' },
    { id: 'editorial', label: 'Solution' },
    { id: 'submissions', label: 'Attempts' },
    { id: 'discuss', label: 'Discuss' },
  ]

  return (
    <div className={cn('flex flex-col overflow-hidden bg-ink-900', embedded ? 'h-full' : 'h-screen')}>
      {/* top bar */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.06] bg-ink-950 px-3 sm:px-4">
        {!demo && (
          <Link to={lab.kind === 'problem' ? '/app/practice' : '/app/path'} className="grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-white/[0.05] hover:text-fg" aria-label="Back">
            <ArrowLeft className="size-4" />
          </Link>
        )}
        <button
          onClick={() => setSideOpen(!sideOpen)}
          className="grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-white/[0.05] hover:text-fg"
          aria-label={sideOpen ? 'Hide description' : 'Show description'}
        >
          {sideOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
        </button>
        <div className="ml-1 flex min-w-0 flex-1 items-center gap-2.5">
          <div className="min-w-0">
            <h1 className="truncate text-[14.5px] font-semibold tracking-[-0.01em]">{lab.title}</h1>
            <p className="hidden truncate text-[12px] text-fg-subtle sm:block">
              {lab.day ? `Day ${lab.day} · ` : ''}
              {lab.kind === 'problem' ? 'Interview problem' : lab.checkpoint ? 'Checkpoint lab' : 'Lab'}
            </p>
          </div>
          <DifficultyBadge level={lab.difficulty} />
          {solved && (
            <Badge tone="ok" className="hidden sm:inline-flex">
              <Check className="size-3" /> Solved
            </Badge>
          )}
        </div>
        {!demo && <SaveIndicator state={saveState} />}
        <Tip content={over ? 'Over budget: submissions will fail.' : 'Estimated hourly cost of your design vs the budget.'}>
          <span
            className={cn(
              'hidden rounded-full px-3 py-1 text-[12.5px] md:inline',
              over ? 'bg-crit/10 text-crit' : 'bg-white/[0.05] text-fg-muted',
            )}
          >
            <span className="font-mono">{fmtCost(cost).replace('/hr', '')}</span>
            <span className={over ? 'text-crit/70' : 'text-fg-subtle'}> / ${lab.budget.toFixed(2)} per hr</span>
          </span>
        </Tip>
        {visibleTests.length > 1 && (
          <select
            value={testId ?? ''}
            onChange={(e) => setTestId(e.target.value)}
            className="hidden h-8 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-[13px] text-fg md:block"
            aria-label="Test case"
          >
            {visibleTests.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
        <Tip content={<span>Run the visible test <Kbd>⌘</Kbd> <Kbd>↵</Kbd></span>}>
          <Button variant="secondary" size="sm" onClick={() => runM.mutate()} loading={runM.isPending}>
            {!runM.isPending && <Play />} {run && !stale ? 'Re-run' : 'Run'}
          </Button>
        </Tip>
        {demo ? (
          <Link to="/signup" className={buttonVariants({ size: 'sm' })}>
            <Send /> <span className="hidden sm:inline">Sign up to submit</span><span className="sm:hidden">Submit</span>
          </Link>
        ) : (
          <Tip content={<span>Run every test, including hidden ones <Kbd>⌘</Kbd> <Kbd>⇧</Kbd> <Kbd>↵</Kbd></span>}>
            <Button size="sm" onClick={() => submitM.mutate()} loading={submitM.isPending}>
              {!submitM.isPending && <Send />} Submit
            </Button>
          </Tip>
        )}
        <Tip content="Reset to the starting design">
          <Button variant="ghost" size="icon" onClick={() => setConfirmReset(true)} aria-label="Reset design">
            <RotateCcw />
          </Button>
        </Tip>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* left: problem + tabs */}
        {sideOpen && (
          <aside className="absolute inset-y-0 left-0 z-20 flex w-[min(400px,92vw)] flex-col border-r border-white/[0.06] bg-ink-900 lg:static lg:z-auto">
            <nav className="flex shrink-0 items-center gap-1 px-3 pt-3 pb-2" role="tablist">
              {sideTabs.slice(0, 4).map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={side === t.id}
                  onClick={() => setSide(t.id)}
                  className={cn(
                    'shrink-0 rounded-lg px-3 py-1.5 text-[13px] transition-colors',
                    side === t.id ? 'bg-white/[0.08] text-fg' : 'text-fg-subtle hover:bg-white/[0.04] hover:text-fg',
                  )}
                >
                  {t.label}
                </button>
              ))}
              <DropdownMenu.Root>
                <DropdownMenu.Trigger
                  className={cn(
                    'ml-auto flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] outline-none transition-colors',
                    side === 'submissions' || side === 'discuss'
                      ? 'bg-white/[0.08] text-fg'
                      : 'text-fg-subtle hover:bg-white/[0.04] hover:text-fg',
                  )}
                >
                  {side === 'submissions' ? 'Attempts' : side === 'discuss' ? 'Discuss' : 'More'}
                  <ChevronDown className="size-3.5" />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content align="end" sideOffset={6} className="z-50 w-44 animate-fade-in rounded-xl border border-white/10 bg-ink-800 p-1.5 shadow-pop">
                    {sideTabs.slice(4).map((t) => (
                      <DropdownMenu.Item
                        key={t.id}
                        onSelect={() => setSide(t.id)}
                        className="flex h-9 cursor-pointer items-center rounded-lg px-2.5 text-[13.5px] text-fg-muted outline-none data-[highlighted]:bg-white/[0.06] data-[highlighted]:text-fg"
                      >
                        {t.label}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </nav>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {side === 'description' && (
                <DescriptionTab lab={lab} level={user?.level ?? 'beginner'} note={note} onNote={(v) => { setNote(v); dirty.current = true }} noteDisabled={demo} />
              )}
              {side !== 'description' && demo && <SignUpGate what={sideTabs.find((t) => t.id === side)!.label.replace(/ \(.*/, '')} />}
              {!demo && slug && side === 'hints' && <HintsTab slug={slug} />}
              {!demo && slug && side === 'editorial' && <EditorialTab slug={slug} catalog={catalog.data} onLoadDesign={setDesign} />}
              {!demo && slug && side === 'submissions' && <SubmissionsTab slug={slug} onLoadDesign={setDesign} />}
              {!demo && slug && side === 'discuss' && <DiscussTab slug={slug} />}
              {!demo && slug && side === 'mentor' && <MentorTab slug={slug} getDesign={() => cleanDesign(designRef.current!)} />}
            </div>
          </aside>
        )}

        {/* palette */}
        <div className="hidden w-[200px] shrink-0 border-r border-white/[0.06] bg-ink-900 md:block">
          <Palette catalog={catalog.data} allowed={lab.palette} design={design} onAdd={(t) => add(t)} />
        </div>

        {/* canvas + results */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <DesignEditor
              design={design}
              onChange={setDesign}
              catalog={catalog.data}
              busy={busy}
              selectedId={selected}
              onSelect={setSelected}
              onAdd={add}
              className="absolute inset-0"
            />
            {/* mobile palette */}
            <div className="absolute top-2 left-2 flex gap-1 md:hidden">
              <select
                value=""
                onChange={(e) => e.target.value && add(e.target.value as ComponentType)}
                className="h-8 rounded-md border border-ink-600 bg-ink-850 px-2 text-[12.5px] text-fg"
                aria-label="Add component"
              >
                <option value="">+ Add component</option>
                {catalog.data.filter((c) => lab.palette.includes(c.type)).map((c) => (
                  <option key={c.type} value={c.type}>{c.label}</option>
                ))}
              </select>
            </div>
            {run?.series && !stale && tick != null && (
              <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 rounded-full border border-white/[0.08] bg-ink-800/90 px-4 py-1.5 text-[12.5px] text-fg-muted shadow-pop backdrop-blur">
                {tick < run.series.length - 1 ? 'Replaying' : 'Finished'} · {run.series[Math.min(tick, run.series.length - 1)].t}s ·{' '}
                {run.series[Math.min(tick, run.series.length - 1)].rps.toLocaleString()} req/s ·{' '}
                <span className={run.series[Math.min(tick, run.series.length - 1)].err > 0.5 ? 'text-crit' : ''}>
                  {run.series[Math.min(tick, run.series.length - 1)].err.toFixed(1)}% errors
                </span>
              </div>
            )}
            {stale && run && (
              <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 rounded-full border border-white/[0.08] bg-ink-800/90 px-4 py-1.5 text-[12.5px] text-fg-subtle backdrop-blur">
                Design changed since the last run
              </div>
            )}
          </div>

          {/* bottom results drawer */}
          <div className={cn('shrink-0 border-t border-white/[0.06] bg-ink-900', bottomOpen ? (embedded ? 'h-[46%]' : 'h-[min(48vh,440px)]') : 'h-11')}>
            <div className="flex h-11 items-center gap-1 border-b border-white/[0.06] px-3">
              {(['run', 'submission', 'logs'] as BottomTab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => { setBottom(t); setBottomOpen(true) }}
                  className={cn(
                    'my-1.5 h-8 rounded-lg px-3 text-[13px] capitalize',
                    bottom === t && bottomOpen ? 'bg-white/[0.08] text-fg' : 'text-fg-subtle hover:bg-white/[0.04] hover:text-fg',
                  )}
                >
                  {t}
                  {t === 'logs' && logs.length > 0 && <span className="ml-1 font-mono text-[10.5px] text-fg-faint">({logs.length})</span>}
                  {t === 'run' && run && <StatusDot ok={run.passed} />}
                  {t === 'submission' && submission && <StatusDot ok={submission.passed} />}
                </button>
              ))}
              <div className="flex-1" />
              {run?.series && bottomOpen && bottom === 'run' && !stale && (
                <button onClick={() => setTick(0)} className="mr-1 text-[11.5px] text-fg-subtle hover:text-fg">
                  Replay on canvas
                </button>
              )}
              <button onClick={() => setBottomOpen(!bottomOpen)} className="rounded p-1 text-fg-subtle hover:bg-ink-800 hover:text-fg" aria-label={bottomOpen ? 'Collapse results' : 'Expand results'}>
                {bottomOpen ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
              </button>
            </div>
            {bottomOpen && (
              <div className="h-[calc(100%-2.75rem)] overflow-y-auto p-5">
                {bottom === 'run' && (runM.isPending ? <Running /> : run ? <TestDetail r={run} /> : <NoRunYet demo={demo} />)}
                {bottom === 'submission' &&
                  (submitM.isPending ? <Running label="Running every test, including hidden ones…" /> : submission ? (
                    <SubmissionSummary result={submission} />
                  ) : (
                    <p className="text-[13px] text-fg-subtle">{demo ? 'Create a free account to submit against the hidden tests.' : 'Submit to run every test, including the hidden ones.'}</p>
                  ))}
                {bottom === 'logs' && <Logs logs={logs} />}
              </div>
            )}
          </div>
        </div>

        {/* inspector */}
        <aside
          className={cn(
            'w-[300px] shrink-0 border-l border-ink-700 bg-ink-900',
            'max-2xl:absolute max-2xl:inset-y-0 max-2xl:right-0 max-2xl:z-20 max-2xl:shadow-pop',
            !selected && 'max-2xl:hidden',
          )}
        >
          {selected && (
            <button onClick={() => setSelected(null)} className="absolute top-3 right-3 z-10 rounded p-1 text-fg-subtle hover:bg-ink-800 2xl:hidden" aria-label="Close inspector">
              <X className="size-4" />
            </button>
          )}
          <Inspector design={design} catalog={catalog.data} selectedId={selected} onChange={setDesign} onSelect={setSelected} stats={stale ? null : run?.nodes} />
        </aside>
      </div>

      <Dialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset to the starting design?"
        description="Your canvas goes back to the broken system you started with. Submissions are kept."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={reset}>Reset design</Button>
          </>
        }
      />
    </div>
  )
}

function errorDetails(e: unknown): string | undefined {
  if (e instanceof ApiError && Array.isArray(e.details) && typeof e.details[0] === 'string' && e.details.length > 1) {
    return (e.details as string[]).slice(1, 4).join(' ')
  }
  return undefined
}

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={cn('ml-1.5 inline-block size-1.5 rounded-full align-middle', ok ? 'bg-ok' : 'bg-crit')} />
}

function Running({ label = 'Simulating 60 seconds of traffic…' }: { label?: string }): ReactNode {
  return (
    <div className="flex items-center gap-2 text-[13px] text-fg-muted">
      <Loader2 className="size-4 animate-spin" /> {label}
    </div>
  )
}

function SaveIndicator({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (state === 'idle') return null
  return (
    <span className="hidden items-center gap-1 text-[11px] text-fg-subtle lg:inline-flex">
      {state === 'saving' && <><Loader2 className="size-3 animate-spin" /> Saving</>}
      {state === 'saved' && <><Check className="size-3" /> Saved</>}
      {state === 'error' && <><CloudOff className="size-3 text-warn" /> Not saved</>}
    </span>
  )
}
