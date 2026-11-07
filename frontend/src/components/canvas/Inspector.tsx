import { Minus, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input, Switch, Tip } from '@/components/ui/primitives'
import type { CatalogItem, Design, DesignNode, Knob, NodeStat } from '@/lib/types'
import { cn, fmtRps } from '@/lib/utils'
import { edgeId } from './DesignEditor'
import { TYPE_ICON, TYPE_TINT, nodeCost } from './meta'

const EDGE_MEANING: Record<string, string> = {
  'users>cdn': 'Static files are served from the edge; dynamic requests continue behind the CDN.',
  'users>load_balancer': 'All dynamic traffic enters through the load balancer.',
  'users>app_server': 'Users hit one app instance directly. Without a load balancer only one instance gets traffic.',
  'cdn>load_balancer': 'Requests the CDN cannot serve go to your load balancer.',
  'cdn>app_server': 'Requests the CDN cannot serve go straight to the app.',
  'cdn>object_storage': 'Static misses are fetched from object storage (origin).',
  'load_balancer>app_server': 'Traffic is split across app servers in proportion to their capacity.',
  'app_server>cache': 'Cache-aside: the app checks the cache first and falls back to the database on a miss.',
  'app_server>database': 'Reads (misses) and writes go to the database.',
  'app_server>queue': 'Writes are acknowledged after enqueueing; workers persist them later.',
  'app_server>object_storage': 'Static files are served from object storage instead of app CPU.',
  'cache>database': 'Read-through: the cache itself loads misses from the database.',
  'queue>worker': 'Workers consume the queue at their own pace.',
  'worker>database': 'Workers write queued messages to the database.',
  'worker>cache': 'Workers can warm or update the cache.',
}

function NumberKnob({ knob, value, onCommit, disabled }: { knob: Knob; value: number; onCommit: (v: number) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const clamp = (v: number) => Math.max(knob.min ?? -Infinity, Math.min(knob.max ?? Infinity, Math.round(v)))
  const commit = () => {
    const v = Number(draft)
    if (Number.isFinite(v)) onCommit(clamp(v))
    else setDraft(String(value))
  }
  const step = (d: number) => onCommit(clamp(value + d))
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={disabled || value <= (knob.min ?? -Infinity)}
        onClick={() => step(-1)}
        className="grid size-8 place-items-center rounded-md border border-ink-600 text-fg-muted hover:bg-ink-750 disabled:opacity-40"
        aria-label={`Decrease ${knob.label}`}
      >
        <Minus className="size-3.5" />
      </button>
      <Input
        value={draft}
        disabled={disabled}
        inputMode="numeric"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className="h-8 text-center font-mono"
        aria-label={knob.label}
      />
      <button
        type="button"
        disabled={disabled || value >= (knob.max ?? Infinity)}
        onClick={() => step(1)}
        className="grid size-8 place-items-center rounded-md border border-ink-600 text-fg-muted hover:bg-ink-750 disabled:opacity-40"
        aria-label={`Increase ${knob.label}`}
      >
        <Plus className="size-3.5" />
      </button>
      {knob.unit && <span className="ml-1 font-mono text-[11px] text-fg-subtle">{knob.unit}</span>}
    </div>
  )
}

function TextKnob({ value, onCommit, disabled, label }: { value: string; onCommit: (v: string) => void; disabled?: boolean; label: string }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <Input
      value={draft}
      disabled={disabled}
      maxLength={200}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => e.key === 'Enter' && onCommit(draft)}
      className="h-8 font-mono text-[12.5px]"
      aria-label={label}
    />
  )
}

function KnobControl({ knob, value, onChange, disabled }: { knob: Knob; value: unknown; onChange: (v: unknown) => void; disabled?: boolean }) {
  if (knob.kind === 'bool')
    return <Switch checked={Boolean(value)} onCheckedChange={onChange} disabled={disabled} />
  if (knob.kind === 'int')
    return <NumberKnob knob={knob} value={Number(value ?? knob.default)} onCommit={onChange} disabled={disabled} />
  if (knob.kind === 'text')
    return <TextKnob value={String(value ?? '')} onCommit={onChange} disabled={disabled} label={knob.label} />
  return (
    <select
      value={String(value ?? knob.default)}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-[13.5px] text-fg outline-none hover:border-white/15 focus:border-white/25 disabled:opacity-50"
      aria-label={knob.label}
    >
      {knob.options?.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'crit' | 'warn' }) {
  return (
    <div className="rounded-xl bg-white/[0.04] px-2.5 py-2">
      <p className="text-[10.5px] text-fg-subtle">{label}</p>
      <p className={cn('num text-[13px] text-fg', tone === 'crit' && 'text-crit', tone === 'warn' && 'text-warn')}>{value}</p>
    </div>
  )
}

export function Inspector({
  design,
  catalog,
  selectedId,
  onChange,
  onSelect,
  stats,
  readOnly,
}: {
  design: Design
  catalog: CatalogItem[]
  selectedId: string | null
  onChange: (d: Design) => void
  onSelect: (id: string | null) => void
  stats?: Record<string, NodeStat> | null
  readOnly?: boolean
}) {
  const node = design.nodes.find((n) => n.id === selectedId)
  const edge = !node ? design.edges.find((e) => edgeId(e.source, e.target) === selectedId) : undefined

  if (edge) {
    const s = design.nodes.find((n) => n.id === edge.source)
    const t = design.nodes.find((n) => n.id === edge.target)
    const label = (n?: DesignNode) => n?.label || catalog.find((c) => c.type === n?.type)?.label || '?'
    return (
      <div className="p-4">
        <p className="mb-2 text-[12px] text-fg-subtle">Connection</p>
        <p className="text-[14px] font-medium text-fg">
          {label(s)} <span className="text-fg-subtle">→</span> {label(t)}
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-fg-muted">
          {EDGE_MEANING[`${s?.type}>${t?.type}`] ?? 'Requests flow along this connection.'}
        </p>
        {!readOnly && (
          <Button
            variant="danger"
            size="sm"
            className="mt-4"
            onClick={() => {
              onChange({ ...design, edges: design.edges.filter((e) => e !== edge) })
              onSelect(null)
            }}
          >
            <Trash2 /> Remove connection
          </Button>
        )}
      </div>
    )
  }

  if (!node) {
    return (
      <div className="p-4">
        <p className="mb-3 text-[12.5px] font-medium text-fg">Inspector</p>
        <p className="text-[13px] text-fg-muted">Select a component to configure it.</p>
        <ul className="mt-4 space-y-2.5 text-[12px] leading-snug text-fg-subtle">
          <li>Drag from a component's right handle to another's left handle to connect them.</li>
          <li>Select a connection or component and press Backspace to delete it.</li>
          <li>Run a test to see each component's load. Red means more than 100% busy.</li>
        </ul>
      </div>
    )
  }

  const meta = catalog.find((c) => c.type === node.type)
  if (!meta) return null
  const Icon = TYPE_ICON[node.type]
  const cfg = { ...meta.default_config, ...node.config }
  const st = stats?.[node.id]
  const update = (patch: Partial<DesignNode>) =>
    onChange({ ...design, nodes: design.nodes.map((n) => (n.id === node.id ? { ...n, ...patch } : n)) })
  const setKnob = (key: string, v: unknown) => update({ config: { ...node.config, [key]: v } })
  const groups = [...new Set(meta.knobs.map((k) => k.group))]
  const cost = nodeCost(node.type, cfg)

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink-700 p-4">
        <div className="flex items-center gap-2.5">
          <span className={cn('grid size-9 place-items-center rounded-xl', TYPE_TINT[node.type])}>
            <Icon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            {readOnly || node.type === 'users' ? (
              <p className="truncate font-medium">{node.label || meta.label}</p>
            ) : (
              <TextKnob value={node.label || meta.label} onCommit={(v) => update({ label: v.trim().slice(0, 60) || null })} label="Name" />
            )}
          </div>
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-fg-muted">{meta.description}</p>
        {st && (
          <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2">
            <Stat label="Load" value={fmtRps(st.load_rps)} />
            <Stat label="Capacity" value={st.capacity_rps ? fmtRps(st.capacity_rps) : '∞'} />
            <Stat
              label="Peak busy"
              value={`${Math.round(st.peak_busy * 100)}%`}
              tone={st.peak_busy >= 1 ? 'crit' : st.peak_busy >= 0.75 ? 'warn' : undefined}
            />
            {st.hit_ratio != null && <Stat label="Hit ratio" value={`${(st.hit_ratio * 100).toFixed(1)}%`} />}
            {st.instances_avg != null && <Stat label="Avg instances" value={String(st.instances_avg)} />}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {groups.map((g) => (
          <div key={g} className="border-b border-ink-700 px-4 py-3">
            <p className="mb-3 text-[13px] font-medium text-fg">{g}</p>
            <div className="space-y-3.5">
              {meta.knobs
                .filter((k) => k.group === g)
                .map((k) => (
                  <div key={k.key}>
                    <div className={cn('flex gap-3', k.kind === 'bool' ? 'items-center justify-between' : 'flex-col gap-1.5')}>
                      <Tip content={k.help} side="left">
                        <span className="cursor-help text-[12.5px] text-fg-muted decoration-ink-500 decoration-dotted underline-offset-4 hover:underline">
                          {k.label}
                        </span>
                      </Tip>
                      <KnobControl knob={k} value={cfg[k.key]} onChange={(v) => setKnob(k.key, v)} disabled={readOnly} />
                    </div>
                    {k.kind !== 'bool' && <p className="mt-1 text-[11px] leading-snug text-fg-faint">{k.help}</p>}
                  </div>
                ))}
            </div>
          </div>
        ))}
        {meta.knobs.length === 0 && node.type !== 'users' && (
          <p className="px-4 py-3 text-[12px] text-fg-subtle">Nothing to configure. It scales on its own.</p>
        )}
      </div>
      {node.type !== 'users' && (
        <div className="flex items-center justify-between border-t border-ink-700 px-4 py-3">
          <span className="num text-[12px] text-fg-muted">{cost > 0 ? `$${cost.toFixed(2)}/hr` : 'usage-based'}</span>
          {!readOnly && (
            <Button
              variant="ghost"
              size="xs"
              className="text-crit hover:bg-ink-800 hover:text-crit"
              onClick={() => {
                onChange({
                  nodes: design.nodes.filter((n) => n.id !== node.id),
                  edges: design.edges.filter((e) => e.source !== node.id && e.target !== node.id),
                })
                onSelect(null)
              }}
            >
              <Trash2 /> Delete
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
