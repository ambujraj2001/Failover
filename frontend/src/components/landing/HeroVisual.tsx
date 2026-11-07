import { useEffect, useMemo, useRef, useState } from 'react'
import { TYPE_ICON } from '@/components/canvas/meta'
import type { Design } from '@/lib/types'
import { cn, fmtMs, fmtPct } from '@/lib/utils'
import { fallbackHero, useDemoHero, type DemoHero } from './data'
import { useReducedMotion } from './motion'

const TICK = 110
const NICE: Record<string, string> = {
  users: 'Users', cdn: 'CDN', load_balancer: 'Load balancer', app_server: 'App server', cache: 'Redis',
  database: 'PostgreSQL', queue: 'Queue', worker: 'Worker', object_storage: 'Storage',
}
const PAUSE_TICKS = 14

type Phase = 'before' | 'deploy' | 'after'

function tone(busy: number | undefined) {
  if (busy == null) return { bar: 'bg-white/20', text: 'text-fg-subtle' }
  if (busy >= 1) return { bar: 'bg-crit', text: 'text-crit' }
  if (busy >= 0.75) return { bar: 'bg-warn', text: 'text-warn' }
  return { bar: 'bg-ok', text: 'text-fg-muted' }
}

function Nodes({ design, busy }: { design: Design; busy: Record<string, number> | null }) {
  // normalise canvas positions into the panel
  const xs = design.nodes.map((n) => n.position.x)
  const ys = design.nodes.map((n) => n.position.y)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const pos = (n: Design['nodes'][number]) => ({
    left: x1 === x0 ? 0 : ((n.position.x - x0) / (x1 - x0)) * 100,
    top: y1 === y0 ? 50 : 18 + ((n.position.y - y0) / (y1 - y0)) * 64,
  })
  const byId = Object.fromEntries(design.nodes.map((n) => [n.id, n]))
  return (
    <div className="relative h-full w-full">
      <svg className="absolute inset-0 h-full w-full overflow-visible" preserveAspectRatio="none" aria-hidden="true">
        {design.edges.map((e) => {
          const a = byId[e.source]
          const b = byId[e.target]
          if (!a || !b) return null
          const pa = pos(a)
          const pb = pos(b)
          const hot = (busy?.[e.target] ?? 0) >= 1
          return (
            <line
              key={`${e.source}-${e.target}`}
              x1={`${pa.left}%`}
              y1={`${pa.top}%`}
              x2={`${pb.left}%`}
              y2={`${pb.top}%`}
              stroke={hot ? 'rgb(248 113 113 / 0.55)' : 'rgb(255 255 255 / 0.12)'}
              strokeWidth={1.25}
              strokeDasharray={busy ? '4 4' : undefined}
              className={busy ? 'animate-[dash_1s_linear_infinite]' : undefined}
            />
          )
        })}
      </svg>
      {design.nodes.map((n) => {
        const p = pos(n)
        const Icon = TYPE_ICON[n.type]
        const b = n.type === 'users' ? undefined : busy?.[n.id]
        const t = tone(b)
        return (
          <div
            key={n.id}
            className="absolute w-[120px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/[0.08] bg-ink-800/95 p-2.5 shadow-[0_8px_24px_-12px_rgb(0_0_0/0.8)] transition-colors duration-300 sm:w-[136px]"
            style={{ left: `calc(${p.left}% * 0.84 + 8%)`, top: `${p.top}%` }}
          >
            <div className="flex items-center gap-2">
              <Icon className="size-3.5 text-fg-subtle" />
              <span className="truncate text-[12px] font-medium text-fg">{n.label || NICE[n.type] || n.type}</span>
            </div>
            {n.type !== 'users' && (
              <div className="mt-2">
                <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className={cn('h-full rounded-full transition-[width] duration-150', t.bar)} style={{ width: `${Math.min(100, (b ?? 0) * 100)}%` }} />
                </div>
                <p className={cn('mt-1 font-mono text-[10.5px]', t.text)}>{b == null ? '—' : `${Math.round(b * 100)}% busy`}</p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Panel({ data }: { data: DemoHero }) {
  const reduced = useReducedMotion()
  const n1 = data.before.series.length
  const n2 = data.after.series.length
  const total = n1 + PAUSE_TICKS + n2 + PAUSE_TICKS
  const [step, setStep] = useState(() => (reduced ? Math.floor(n1 * 0.6) : 0))
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (reduced || !visible) return
    const t = setInterval(() => setStep((s) => (s + 1) % total), TICK)
    return () => clearInterval(t)
  }, [reduced, visible, total])

  let phase: Phase
  let point
  if (step < n1) {
    phase = 'before'
    point = data.before.series[step]
  } else if (step < n1 + PAUSE_TICKS) {
    phase = 'deploy'
    point = data.before.series[n1 - 1]
  } else if (step < n1 + PAUSE_TICKS + n2) {
    phase = 'after'
    point = data.after.series[step - n1 - PAUSE_TICKS]
  } else {
    phase = 'after'
    point = data.after.series[n2 - 1]
  }
  const design = phase === 'after' ? data.solution : data.starter
  const busy = phase === 'deploy' ? null : point.nodes
  const failing = phase === 'before'

  const status =
    phase === 'before'
      ? { dot: 'bg-crit', text: 'Incident', detail: 'PostgreSQL is saturated' }
      : phase === 'deploy'
        ? { dot: 'bg-warn', text: 'Deploying', detail: 'Adding a Redis cache' }
        : { dot: 'bg-ok', text: 'Resolved', detail: 'Cache absorbs 97% of reads' }

  return (
    <div ref={ref} className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3.5">
        <p className="truncate text-[13px] text-fg-muted">{data.title}</p>
        <span className="flex shrink-0 items-center gap-2 rounded-full bg-white/[0.05] px-2.5 py-1 text-[12px]">
          <span className={cn('size-1.5 rounded-full', status.dot, failing && 'animate-pulse-dot')} />
          <span className="text-fg">{status.text}</span>
          <span className="hidden text-fg-subtle sm:inline">· {status.detail}</span>
        </span>
      </div>
      <div className="relative h-[230px] px-4 sm:h-[260px]">
        <Nodes design={design} busy={busy} />
      </div>
      <div className="grid grid-cols-3 border-t border-white/[0.06]">
        {[
          { k: 'p99 latency', v: fmtMs(point.p99), bad: point.p99 > 80 },
          { k: 'Errors', v: fmtPct(point.err), bad: point.err > 0.2 },
          { k: 'Traffic', v: `${(point.rps / 1000).toFixed(1)}k/s`, bad: false },
        ].map((m, i) => (
          <div key={m.k} className={cn('px-5 py-4', i > 0 && 'border-l border-white/[0.06]')}>
            <p className="text-[12px] text-fg-subtle">{m.k}</p>
            <p className={cn('mt-1 font-mono text-[20px] tracking-tight tabular-nums', m.bad && phase !== 'deploy' ? 'text-crit' : 'text-fg')}>{m.v}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function HeroVisual() {
  const q = useDemoHero()
  const fallback = useMemo(() => (q.isError ? fallbackHero() : null), [q.isError])
  const data = q.data ?? fallback
  if (!data) return <div className="card h-[360px] animate-pulse sm:h-[390px]" />
  return <Panel data={data} />
}
