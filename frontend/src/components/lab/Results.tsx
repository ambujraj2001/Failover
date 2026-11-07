import { AlertTriangle, CheckCircle2, CircleSlash, Lock, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { GradeResult, LogLine, TestResult } from '@/lib/types'
import { cn, fmtCost, fmtMs, fmtPct, fmtRps } from '@/lib/utils'

const PALETTE = ['#ececec', '#a1a1a1', '#d9a226', '#707070', '#f0524a', '#4d4d4d']
const axis = { stroke: '#404040', fontSize: 10.5, fontFamily: 'Geist Mono Variable, monospace', tickLine: false }

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <p className="mb-3 text-[13px] text-fg-muted">{title}</p>
      <div className="h-40">{children}</div>
    </div>
  )
}

function TooltipBox({ active, payload, label, unit }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: number; unit?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-ink-600 bg-ink-800 px-2.5 py-1.5 font-mono text-[11px] shadow-pop">
      <p className="mb-1 text-fg-subtle">t={label}s</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {unit === 'ms' ? fmtMs(p.value) : unit === '%' ? `${Math.round(p.value)}%` : Math.round(p.value).toLocaleString()}
        </p>
      ))}
    </div>
  )
}

function Charts({ r }: { r: TestResult }) {
  const series = r.series ?? []
  const busiest = useMemo(() => {
    const nodes = Object.entries(r.nodes ?? {})
      .filter(([, v]) => v.type !== 'users')
      .sort((a, b) => b[1].peak_busy - a[1].peak_busy)
      .slice(0, 4)
    return nodes.map(([id, v]) => ({ id, label: v.label }))
  }, [r.nodes])
  const busyData = useMemo(
    () => series.map((s) => ({ t: s.t, ...Object.fromEntries(busiest.map((b) => [b.label, Math.min(300, (s.nodes[b.id] ?? 0) * 100)])) })),
    [series, busiest],
  )
  if (!series.length) return null
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <ChartCard title="Latency (ms)">
        <ResponsiveContainer>
          <LineChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="#1f1f1f" vertical={false} />
            <XAxis dataKey="t" {...axis} />
            <YAxis {...axis} width={44} />
            <Tooltip content={<TooltipBox unit="ms" />} />
            <Line type="monotone" dataKey="p50" stroke="#a1a1a1" dot={false} strokeWidth={1.25} isAnimationActive={false} />
            <Line type="monotone" dataKey="p99" stroke="#d9a226" dot={false} strokeWidth={1.25} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Traffic (req/s) and errors (%)">
        <ResponsiveContainer>
          <LineChart data={series} margin={{ top: 4, right: 0, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="#1f1f1f" vertical={false} />
            <XAxis dataKey="t" {...axis} />
            <YAxis yAxisId="l" {...axis} width={44} />
            <YAxis yAxisId="r" orientation="right" {...axis} width={30} domain={[0, 100]} />
            <Tooltip content={<TooltipBox />} />
            <Line yAxisId="l" type="monotone" dataKey="rps" name="traffic" stroke="#ececec" dot={false} strokeWidth={1.25} isAnimationActive={false} />
            <Line yAxisId="l" type="monotone" dataKey="ok_rps" name="served" stroke="#3fb950" dot={false} strokeWidth={1.25} isAnimationActive={false} />
            <Line yAxisId="r" type="monotone" dataKey="err" name="errors %" stroke="#f0524a" dot={false} strokeWidth={1.25} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Busiest components (% of capacity)">
        <ResponsiveContainer>
          <LineChart data={busyData} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="#1f1f1f" vertical={false} />
            <XAxis dataKey="t" {...axis} />
            <YAxis {...axis} width={44} />
            <Tooltip content={<TooltipBox unit="%" />} />
            {busiest.map((b, i) => (
              <Line key={b.id} type="monotone" dataKey={b.label} stroke={PALETTE[i]} dot={false} strokeWidth={1.5} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}

function Metric({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/[0.04] px-3.5 py-3">
      <p className="text-[12px] text-fg-subtle">{label}</p>
      <p className={cn('num mt-1 truncate text-[18px] tracking-tight text-fg', bad && 'text-crit')}>{value}</p>
    </div>
  )
}

function fmtVal(v: number, unit: string) {
  if (unit === 'ms') return fmtMs(v)
  if (unit === '$/hr') return `$${v}/hr`
  return `${v}${unit}`
}

export function TestHeader({ r }: { r: TestResult }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2.5">
        {r.passed ? <CheckCircle2 className="size-[18px] text-ok" /> : <XCircle className="size-[18px] text-crit" />}
        <span className="text-[15px] font-medium text-fg">{r.name}</span>
        <span className={cn('rounded-full px-2.5 py-0.5 text-[12px] font-medium', r.passed ? 'bg-ok/10 text-ok' : 'bg-crit/10 text-crit')}>
          {r.passed ? 'Passed' : 'Failed'}
        </span>
        {r.hidden && <span className="text-[12.5px] text-fg-subtle">Hidden test, now revealed</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {r.checks.map((c) => (
          <span
            key={c.metric}
            className={cn('rounded-full px-3 py-1 text-[12.5px]', c.passed ? 'bg-white/[0.05] text-fg-muted' : 'bg-crit/[0.08] text-crit')}
          >
            {c.label}: <span className="font-medium">{fmtVal(c.got, c.unit)}</span>
            <span className="opacity-70"> (needs {c.op === 'lte' ? '≤' : '≥'} {fmtVal(c.target, c.unit)})</span>
          </span>
        ))}
      </div>
    </div>
  )
}

export function TestDetail({ r }: { r: TestResult }) {
  const s = r.summary
  if (!s) return null
  const failing = !r.passed
  return (
    <div className="space-y-4">
      <TestHeader r={r} />
      {r.diagnosis && (
        <div
          className={cn(
            'flex items-start gap-2.5 rounded-xl px-4 py-3 text-[14px] text-fg',
            failing ? 'bg-crit/[0.07]' : 'bg-ok/[0.07]',
          )}
        >
          {failing ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-crit" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />}
          {r.diagnosis}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <Metric label="p50" value={fmtMs(s.p50_ms)} />
        <Metric label="p99" value={fmtMs(s.p99_ms)} bad={r.checks.some((c) => c.metric === 'p99_ms' && !c.passed)} />
        <Metric label="errors" value={fmtPct(s.error_rate, 2)} bad={r.checks.some((c) => c.metric === 'error_rate' && !c.passed)} />
        <Metric label="cost" value={fmtCost(s.cost_per_hr)} />
        <Metric label={s.cache_hit_ratio != null ? 'cache hits' : 'stale reads'} value={s.cache_hit_ratio != null ? fmtPct(s.cache_hit_ratio * 100) : fmtPct(s.stale_read_rate, 2)} />
        <Metric label="throughput" value={fmtRps(s.throughput_rps)} />
      </div>
      {(s.queue_lag_s > 0 || s.stale_read_rate > 0) && (
        <div className="flex gap-4 font-mono text-[11.5px] text-fg-muted">
          {s.queue_lag_s > 0 && <span>queue lag peak {s.queue_lag_s}s</span>}
          {s.stale_read_rate > 0 && <span>stale reads {fmtPct(s.stale_read_rate, 2)}</span>}
        </div>
      )}
      <Charts r={r} />
      {!!r.failure_reasons?.length && (
        <div>
          <p className="mb-3 text-[14px] font-medium text-fg">Why requests failed</p>
          <div className="space-y-1.5">
            {r.failure_reasons.slice(0, 6).map((f) => (
              <div key={f.reason} className="flex items-center gap-3 text-[12.5px]">
                <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full bg-crit" style={{ width: `${Math.min(100, f.pct)}%` }} />
                </div>
                <span className="num w-14 shrink-0 text-right text-crit">{fmtPct(f.pct, 2)}</span>
                <span className="text-fg-muted">{f.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {!!r.warnings?.length && (
        <ul className="space-y-1 text-[12px] text-warn">
          {r.warnings.map((w) => (
            <li key={w}>· {w}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function Logs({ logs }: { logs: LogLine[] }) {
  if (!logs.length) return <p className="text-[13px] text-fg-subtle">No log lines yet. Run a test.</p>
  return (
    <div className="font-mono text-[12px] leading-relaxed">
      {logs.map((l, i) => (
        <div key={i} className="flex gap-3 border-b border-ink-800 py-1 last:border-0">
          <span className="w-12 shrink-0 text-fg-faint">t={l.t}s</span>
          <span className={cn('w-12 shrink-0 font-semibold', l.level === 'ERROR' ? 'text-crit' : l.level === 'WARN' ? 'text-warn' : 'text-info')}>
            {l.level}
          </span>
          <span className="text-fg-muted">{l.msg}</span>
        </div>
      ))}
    </div>
  )
}

export function SubmissionSummary({ result }: { result: GradeResult }) {
  const [open, setOpen] = useState<string | null>(() => result.results.find((r) => !r.passed && r.summary)?.test_id ?? null)
  const passedCount = result.results.filter((r) => r.passed).length
  return (
    <div className="space-y-3">
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 rounded-xl px-5 py-4',
          result.passed ? 'bg-ok/[0.07]' : 'bg-crit/[0.07]',
        )}
      >
        <div>
          <p className={cn('text-[18px] font-semibold tracking-[-0.02em]', result.passed ? 'text-ok' : 'text-crit')}>
            {result.passed ? 'Accepted' : 'Not yet'}
          </p>
          <p className="text-[12.5px] text-fg-muted">
            {passedCount} of {result.results.length} tests passed
            {!result.within_budget && result.budget != null && ' · over budget'}
          </p>
        </div>
        <p className={cn('num text-[13px]', result.within_budget ? 'text-fg-muted' : 'text-crit')}>
          {fmtCost(result.cost_per_hr)} of ${result.budget?.toFixed(2)}
        </p>
      </div>
      <div className="card divide-y divide-white/[0.06] overflow-hidden">
        {result.results.map((r) => (
          <div key={r.test_id}>
            <button
              type="button"
              disabled={!r.summary}
              onClick={() => setOpen(open === r.test_id ? null : r.test_id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-[14px] hover:bg-white/[0.03] disabled:hover:bg-transparent"
            >
              {r.passed ? <CheckCircle2 className="size-4 text-ok" /> : <XCircle className="size-4 text-crit" />}
              <span className="flex-1 text-fg">{r.name}</span>
              {r.hidden && !r.summary && <Lock className="size-3.5 text-fg-faint" />}
              {r.hidden && r.summary && <span className="font-mono text-[10.5px] text-crit">revealed</span>}
            </button>
            {open === r.test_id && r.summary && (
              <div className="border-t border-white/[0.06] p-4">
                <TestDetail r={r} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export function NoRunYet({ demo }: { demo?: boolean }) {
  return (
    <div className="flex items-center gap-3 text-[13px] text-fg-subtle">
      <CircleSlash className="size-4" />
      Pick a test and press Run to simulate traffic through your design. Nodes light up green, amber or red with load.
      {demo && ' This is the same simulator that grades every lab.'}
    </div>
  )
}
