import { useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ChatPanel } from '@/components/ai/ChatPanel'
import { DesignEditor, edgeId } from '@/components/canvas/DesignEditor'
import { addComponent, cleanDesign, designCost } from '@/components/canvas/designOps'
import { Inspector } from '@/components/canvas/Inspector'
import { nodeCost, useCatalog } from '@/components/canvas/meta'
import { Palette } from '@/components/canvas/Palette'
import { Markdown } from '@/components/Markdown'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Badge, ErrorBlock, Skeleton } from '@/components/ui/primitives'
import { ApiError } from '@/lib/api'
import type { ChatMessage, ComponentType, Design } from '@/lib/types'
import { cn, fmtCost } from '@/lib/utils'
import { interviewKey, useAbandonInterview, useFinishInterview } from './queries'
import { Countdown, fmtDuration, GRACE_MS, parseTime, RoomBar, Segmented, useMediaQuery, useNow } from './shared'
import type { InterviewDetail } from './types'
import { useInterviewAutosave, type SaveState } from './useAutosave'

type Tab = 'brief' | 'canvas' | 'chat'
type Side = 'brief' | 'chat'
type Confirm = 'finish' | 'abandon' | 'timeup' | null

const EMPTY: Design = { nodes: [], edges: [] }
const TABS: { value: Tab; label: string }[] = [
  { value: 'brief', label: 'Brief' },
  { value: 'canvas', label: 'Canvas' },
  { value: 'chat', label: 'Interviewer' },
]
const SIDE_TABS: { value: Side; label: string }[] = [
  { value: 'chat', label: 'Interviewer' },
  { value: 'brief', label: 'Brief & notes' },
]

const SAVE_TEXT: Record<Exclude<SaveState, 'idle'>, string> = {
  pending: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'Saved',
  error: "Couldn't save, retrying",
}

function errMsg(e: unknown, fallback: string) {
  return e instanceof ApiError || e instanceof Error ? e.message : fallback
}

// ---- small pieces ------------------------------------------------------------------------------

/** Visual save state. Screen readers hear it once, from the live region in the room. */
function SaveIndicator({ state, className }: { state: SaveState; className?: string }) {
  if (state === 'idle') return null
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex items-center gap-1.5 text-[12.5px] whitespace-nowrap',
        state === 'error' ? 'text-crit' : 'text-fg-subtle',
        className,
      )}
    >
      {state === 'saved' ? (
        <Check className="size-3.5" />
      ) : state === 'saving' ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <span className={cn('size-1.5 rounded-full', state === 'error' ? 'bg-crit' : 'bg-fg-subtle')} />
      )}
      {SAVE_TEXT[state]}
    </span>
  )
}

function CostMeter({ cost, budget }: { cost: number; budget: number | null }) {
  const pct = budget ? Math.min(100, (cost / budget) * 100) : 0
  const over = budget != null && cost > budget + 1e-9
  return (
    <div className="flex min-w-0 items-center gap-2.5 text-[13px]" title="Estimated hourly cost of your design">
      <span className="text-fg-subtle">Cost</span>
      <span className={cn('num', over ? 'text-crit' : 'text-fg')}>{fmtCost(cost)}</span>
      {budget != null && (
        <>
          <span className="num hidden text-fg-subtle sm:inline">of {fmtCost(budget)}</span>
          <div
            className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-white/[0.06] sm:block"
            role="meter"
            aria-label="Cost against budget"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
          >
            <div
              className={cn('h-full rounded-full transition-[width] duration-300', over ? 'bg-crit' : pct > 85 ? 'bg-warn' : 'bg-fg')}
              style={{ width: `${pct}%` }}
            />
          </div>
          {over && (
            <Badge tone="crit" className="normal-case">
              Over budget
            </Badge>
          )}
        </>
      )}
    </div>
  )
}

function PanelHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-white/[0.06] px-4">
      <h2 className="font-sans text-[14px] font-medium tracking-[-0.01em]">{title}</h2>
      {children}
    </div>
  )
}

/** Brief / interviewer switch shown at the lg breakpoint, where both share the right column. */
function SideSwitch({ tab, onTab, ids }: { tab: Tab; onTab: (t: Side) => void; ids: Record<Tab, string> }) {
  return (
    <div className="hidden h-12 shrink-0 items-center border-b border-white/[0.06] px-2 lg:flex xl:hidden">
      <Segmented<Side>
        mode="tab"
        size="sm"
        full
        label="Side panel"
        value={tab === 'brief' ? 'brief' : 'chat'}
        onChange={onTab}
        options={SIDE_TABS}
        controls={{ brief: ids.brief, chat: ids.chat }}
      />
    </div>
  )
}

function TwistPill({ title, onClick, className }: { title: string | null; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? 'The interviewer changed a requirement'}
      aria-label={`New requirement${title ? `: ${title}` : ''}. Show the brief.`}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-warn/10 px-3 text-[12.5px] font-medium whitespace-nowrap text-warn transition-colors duration-150 hover:bg-warn/15',
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-warn" aria-hidden="true" />
      New requirement
    </button>
  )
}

const iconBtn = 'grid size-8 place-items-center rounded-lg text-fg-subtle transition-colors hover:bg-white/[0.05] hover:text-fg [&_svg]:size-4'

// ---- room --------------------------------------------------------------------------------------

export function ActiveRoom({ iv }: { iv: InterviewDetail }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const catalog = useCatalog()
  const wide = useMediaQuery('(min-width: 1280px)')
  const now = useNow(1000)
  const uid = useId()
  const ids: Record<Tab, string> = { brief: `${uid}-brief`, canvas: `${uid}-canvas`, chat: `${uid}-chat` }

  const [design, setDesign] = useState<Design>(() => iv.design ?? iv.starter ?? EMPTY)
  const [notes, setNotes] = useState(iv.notes ?? '')
  const [messages, setMessages] = useState<ChatMessage[]>(() => iv.transcript ?? [])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('canvas')
  const [briefCollapsed, setBriefCollapsed] = useState(false)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [twistSeen, setTwistSeen] = useState(false)
  const [ending, setEnding] = useState(false)

  const { state: saveState, queue, flush } = useInterviewAutosave(iv.id, {
    enabled: !ending,
    onEnded: () => qc.invalidateQueries({ queryKey: interviewKey(iv.id) }),
  })
  const finish = useFinishInterview(iv.id)
  const abandon = useAbandonInterview(iv.id)

  const endsAt = parseTime(iv.ends_at)
  const totalMs = endsAt - parseTime(iv.created_at)
  const remaining = endsAt - now
  const timeUp = remaining <= 0
  const pastGrace = remaining <= -GRACE_MS

  // prompt to finish once, the moment the clock runs out
  const prompted = useRef(false)
  useEffect(() => {
    if (timeUp && !prompted.current) {
      prompted.current = true
      setConfirm((c) => c ?? 'timeup')
    }
  }, [timeUp])

  const twistActive = !!iv.twist || twistSeen
  const twistTitle = iv.twist?.title ?? null
  // the budget-cut twist is applied server-side, so iv.budget is already the one the final run uses
  const budget = iv.budget
  const cost = catalog.data ? designCost(design, catalog.data, nodeCost) : 0

  const changeDesign = useCallback(
    (d: Design) => {
      setDesign(d)
      queue({ design: cleanDesign(d) })
    },
    [queue],
  )
  const changeNotes = (v: string) => {
    setNotes(v)
    queue({ notes: v })
  }
  const add = (type: ComponentType, position?: { x: number; y: number }) => {
    if (!catalog.data) return
    const r = addComponent(design, type, catalog.data, selectedId, position)
    changeDesign(r.design)
    setSelectedId(r.id)
  }
  const showBrief = () => {
    setTab('brief')
    setBriefCollapsed(false)
  }

  const hasSelection =
    !!selectedId &&
    (design.nodes.some((n) => n.id === selectedId) || design.edges.some((e) => edgeId(e.source, e.target) === selectedId))

  useEffect(() => {
    if (!hasSelection) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) setSelectedId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hasSelection])

  const designRef = useRef(design)
  useEffect(() => {
    designRef.current = design
  }, [design])

  const lastIsUser = messages.length > 0 && messages[messages.length - 1].role === 'user'

  async function doFinish() {
    await flush()
    finish.mutate(undefined, {
      onSuccess: () => {
        setEnding(true)
        toast.success('Interview scored')
      },
    })
  }

  function doAbandon() {
    abandon.mutate(undefined, {
      onSuccess: () => {
        setEnding(true)
        toast('Interview abandoned')
        navigate('/app/interviews')
      },
      onError: (e) => toast.error(errMsg(e, 'Could not abandon the interview.')),
    })
  }

  const inspector = hasSelection && catalog.data && (
    <div
      className={cn(
        'absolute z-20 flex flex-col bg-ink-850 animate-fade-in',
        wide ? 'inset-0' : 'inset-y-0 right-0 w-[300px] max-w-[88%] border-l border-white/[0.06] shadow-pop',
      )}
      role="region"
      aria-label="Inspector"
    >
      <PanelHeader title="Inspector">
        <button type="button" onClick={() => setSelectedId(null)} className={iconBtn} aria-label="Close inspector">
          <X />
        </button>
      </PanelHeader>
      <div className="min-h-0 flex-1 overflow-hidden">
        <Inspector design={design} catalog={catalog.data} selectedId={selectedId} onChange={changeDesign} onSelect={setSelectedId} />
      </div>
    </div>
  )

  const collapsed = wide && briefCollapsed
  const showMobileTwist = twistActive
  const panel = 'card min-h-0 flex-col overflow-hidden'

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-ink-900">
      <RoomBar heading title={iv.problem_title} level={iv.target_level}>
        {twistActive && <TwistPill title={twistTitle} onClick={showBrief} className="hidden md:inline-flex" />}
        <SaveIndicator state={saveState} className="hidden lg:inline-flex" />
        <Countdown remainingMs={remaining} />
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" onClick={() => setConfirm('finish')}>
            Finish
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm('abandon')}>
            Abandon
          </Button>
        </div>
      </RoomBar>
      <span className="sr-only" role="status">
        {saveState === 'idle' ? '' : SAVE_TEXT[saveState]}
      </span>

      {(timeUp || showMobileTwist) && (
        <div className={cn('flex shrink-0 flex-col gap-3 px-3 pt-3', !timeUp && 'md:hidden')}>
          {timeUp && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-crit/20 bg-crit/[0.06] px-4 py-2.5">
              <p className="min-w-0 text-[13.5px] text-fg-muted">
                <span className="font-medium text-crit">Time's up.</span>{' '}
                {pastGrace
                  ? 'The interviewer has stopped replying. Finish to get your scores.'
                  : 'Wrap up your last point, then finish to get your scores.'}
              </p>
              <Button size="sm" variant="secondary" onClick={() => setConfirm('finish')}>
                Finish and score
              </Button>
            </div>
          )}
          {showMobileTwist && (
            <div className="md:hidden">
              <TwistPill title={twistTitle} onClick={showBrief} />
            </div>
          )}
        </div>
      )}

      <div className="shrink-0 px-3 pt-3 lg:hidden">
        <Segmented<Tab> mode="tab" full label="Interview panels" value={tab} onChange={setTab} options={TABS} controls={ids} />
      </div>

      <div
        className={cn(
          'grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_360px]',
          collapsed ? 'xl:grid-cols-[56px_minmax(0,1fr)_360px]' : 'xl:grid-cols-[300px_minmax(0,1fr)_360px]',
        )}
      >
        {/* brief + notes */}
        <section
          id={ids.brief}
          aria-label="Brief and notes"
          className={cn(
            panel,
            'col-start-1 row-start-1 lg:col-start-2 xl:col-start-1',
            tab === 'brief' ? 'flex' : 'hidden',
            'xl:flex',
          )}
        >
          <SideSwitch tab={tab} onTab={setTab} ids={ids} />
          {collapsed ? (
            <div className="flex flex-1 flex-col items-center gap-4 py-3">
              <button
                type="button"
                onClick={() => setBriefCollapsed(false)}
                className={iconBtn}
                aria-label="Show brief and notes"
                title="Show brief and notes"
              >
                <PanelLeftOpen />
              </button>
              <span className="text-[13px] text-fg-subtle [writing-mode:vertical-rl]">Brief and notes</span>
              {twistActive && <span className="size-2 rounded-full bg-warn" title="New requirement" aria-hidden="true" />}
            </div>
          ) : (
            <>
              <div className="hidden xl:block">
                <PanelHeader title="Brief">
                  <button
                    type="button"
                    onClick={() => setBriefCollapsed(true)}
                    className={iconBtn}
                    aria-label="Collapse brief and notes"
                    title="Collapse"
                  >
                    <PanelLeftClose />
                  </button>
                </PanelHeader>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                {twistActive && (
                  <div className="mb-6 rounded-xl border border-warn/20 bg-warn/[0.06] px-4 py-3">
                    <p className="text-[13px] font-medium text-warn">New requirement</p>
                    <p className="mt-1 text-[14px] text-fg">{twistTitle ?? 'The interviewer changed a requirement.'}</p>
                    <p className="mt-1 text-[13px] text-fg-muted">Your final design is tested with this change.</p>
                  </div>
                )}
                {iv.brief ? (
                  <Markdown className="text-[14px] prose-p:my-2.5 prose-ul:my-2.5">{iv.brief}</Markdown>
                ) : (
                  <p className="text-[14px] text-fg-subtle">The brief for this problem isn't available.</p>
                )}
                {iv.design_prompt && (
                  <div className="mt-7">
                    <h3 className="mb-2 text-[14px] font-medium">Questions to cover</h3>
                    <Markdown className="text-[14px] prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5">{iv.design_prompt}</Markdown>
                  </div>
                )}
                <p className="mt-7 text-[13px] leading-relaxed text-fg-subtle">
                  You have {fmtDuration(totalMs)}. About halfway through, the interviewer changes one requirement.
                </p>
              </div>
              <div className="flex h-[38%] min-h-48 shrink-0 flex-col border-t border-white/[0.06] px-5 pt-4 pb-5">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <label htmlFor={`${uid}-notes`} className="text-[14px] font-medium text-fg">
                    Notes
                  </label>
                  <SaveIndicator state={saveState} />
                </div>
                <textarea
                  id={`${uid}-notes`}
                  value={notes}
                  onChange={(e) => changeNotes(e.target.value)}
                  maxLength={12000}
                  spellCheck={false}
                  placeholder={'Requirements, estimates, API ideas…\nThe interviewer can read these.'}
                  className="min-h-0 w-full flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-[13.5px] leading-relaxed text-fg outline-none transition-all placeholder:text-fg-faint hover:border-white/15 focus:border-white/25 focus:ring-4 focus:ring-white/[0.04]"
                />
              </div>
            </>
          )}
        </section>

        {/* canvas */}
        <section
          id={ids.canvas}
          aria-label="Design canvas"
          className={cn(
            panel,
            'relative col-start-1 row-start-1 min-w-0 flex-row lg:col-start-1 xl:col-start-2',
            tab === 'canvas' ? 'flex' : 'hidden',
            'lg:flex',
          )}
        >
          <aside className="flex w-36 shrink-0 flex-col border-r border-white/[0.06] sm:w-44">
            {catalog.data ? (
              <Palette catalog={catalog.data} allowed={iv.palette} design={design} onAdd={(t) => add(t)} disabled={ending} />
            ) : (
              <div className="space-y-2 p-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-8" />
                ))}
              </div>
            )}
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-12 shrink-0 items-center border-b border-white/[0.06] px-4">
              <CostMeter cost={cost} budget={budget} />
            </div>
            <div className="relative min-h-0 flex-1">
              {catalog.isError ? (
                <div className="p-4">
                  <ErrorBlock error={catalog.error} onRetry={() => catalog.refetch()} />
                </div>
              ) : catalog.data ? (
                <DesignEditor
                  design={design}
                  onChange={changeDesign}
                  catalog={catalog.data}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onAdd={(t, p) => add(t, p)}
                  readOnly={ending}
                  className="grid-bg absolute inset-0"
                />
              ) : (
                <div className="grid h-full place-items-center text-[14px] text-fg-subtle">Loading components…</div>
              )}
            </div>
          </div>
          {!wide && inspector}
        </section>

        {/* interviewer */}
        <section
          id={ids.chat}
          aria-label="Interviewer"
          className={cn(
            panel,
            'relative col-start-1 row-start-1 lg:col-start-2 xl:col-start-3',
            tab === 'chat' ? 'flex' : 'hidden',
            tab === 'canvas' && 'lg:flex',
            'xl:flex',
          )}
        >
          <SideSwitch tab={tab} onTab={setTab} ids={ids} />
          <div className="hidden xl:block">
            <PanelHeader title="Interviewer">
              <span className="truncate text-[12.5px] text-fg-subtle">Sees your canvas and notes</span>
            </PanelHeader>
          </div>
          {lastIsUser && (
            <p className="mx-3 mt-3 shrink-0 rounded-xl border border-warn/15 bg-warn/[0.06] px-3.5 py-2.5 text-[13px] leading-snug text-fg-muted">
              No reply from the interviewer. Keep designing, or send your message again.
            </p>
          )}
          <ChatPanel
            className="min-h-0 flex-1"
            endpoint={`/interviews/${iv.id}/message`}
            messages={messages}
            onMessages={setMessages}
            buildBody={(text) => ({ message: text, design: cleanDesign(designRef.current) })}
            assistantName="Interviewer"
            placeholder="Answer, ask a question, or explain your design"
            disabled={pastGrace || ending}
            disabledReason={pastGrace ? "Time's up. Finish the interview to get your scores." : undefined}
            onDone={(ev) => {
              if (ev.twist === true) {
                setTwistSeen(true)
                toast('New requirement', {
                  description: 'The interviewer changed a requirement. See the brief.',
                })
                qc.invalidateQueries({ queryKey: interviewKey(iv.id) })
              }
            }}
          />
          {wide && inspector}
        </section>
      </div>

      {/* finish / time's up */}
      <Dialog
        open={confirm === 'finish' || confirm === 'timeup'}
        onOpenChange={(v) => {
          if (!v && !finish.isPending) {
            setConfirm(null)
            finish.reset()
          }
        }}
        title={confirm === 'timeup' ? "Time's up" : 'Finish the interview?'}
        description={
          confirm === 'timeup'
            ? `Your ${fmtDuration(totalMs)} are over. Finish now to get your scores.`
            : `We'll test your design in the simulator${twistActive ? ', including the new requirement,' : ''} and score the conversation at ${iv.target_level}. You can't edit after this.`
        }
        footer={
          <>
            <Button variant="ghost" size="sm" disabled={finish.isPending} onClick={() => setConfirm(null)}>
              {confirm === 'timeup' ? 'Not yet' : 'Keep going'}
            </Button>
            <Button size="sm" loading={finish.isPending} onClick={doFinish}>
              {finish.isPending ? 'Scoring…' : 'Finish and score'}
            </Button>
          </>
        }
      >
        {finish.isPending && (
          <p className="text-[14px] text-fg-muted" role="status">
            Testing your design and scoring the conversation. This can take up to a minute.
          </p>
        )}
        {finish.isError && <ErrorBlock error={finish.error} />}
      </Dialog>

      {/* abandon */}
      <Dialog
        open={confirm === 'abandon'}
        onOpenChange={(v) => !v && !abandon.isPending && setConfirm(null)}
        title="Abandon this interview?"
        description="It ends without a score and can't be resumed. You can start a new one right away."
        footer={
          <>
            <Button variant="ghost" size="sm" disabled={abandon.isPending} onClick={() => setConfirm(null)}>
              Keep going
            </Button>
            <Button variant="danger" size="sm" loading={abandon.isPending} onClick={doAbandon}>
              Abandon
            </Button>
          </>
        }
      />
    </div>
  )
}
