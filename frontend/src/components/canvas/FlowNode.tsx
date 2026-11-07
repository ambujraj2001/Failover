import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { memo } from 'react'
import { cn, loadColor } from '@/lib/utils'
import type { ComponentType } from '@/lib/types'
import { TYPE_ICON, TYPE_TINT, configSummary, nodeCost } from './meta'

export interface FlowNodeData extends Record<string, unknown> {
  type: ComponentType
  label: string
  config: Record<string, unknown>
  busy?: number
  connectable: boolean
}

export type FlowNodeType = Node<FlowNodeData, 'component'>

const ring = {
  idle: 'border-white/[0.08]',
  ok: 'border-ok/40',
  warn: 'border-warn/60',
  crit: 'border-crit/80'
}
const bar = { idle: 'bg-ink-500', ok: 'bg-ok', warn: 'bg-warn', crit: 'bg-crit' }

function FlowNodeImpl({ data, selected }: NodeProps<FlowNodeType>) {
  const Icon = TYPE_ICON[data.type]
  const state = loadColor(data.busy)
  const cost = nodeCost(data.type, data.config)
  const isSource = data.type === 'users'
  const isSink = data.type === 'database' || data.type === 'object_storage'
  return (
    <div
      className={cn(
        'w-[208px] rounded-2xl border bg-gradient-to-b from-ink-750 to-ink-800 shadow-[0_12px_32px_-16px_rgb(0_0_0/0.9)] transition-[border-color,box-shadow] duration-200',
        ring[state],
        selected && 'ring-2 ring-white/25 ring-offset-2 ring-offset-ink-900',
      )}
    >
      {!isSource && (
        <Handle type="target" position={Position.Left} isConnectable={data.connectable} className="!-left-[5px]" />
      )}
      <div className="flex items-center gap-3 px-3 py-3">
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-xl', TYPE_TINT[data.type])}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] leading-tight font-medium text-fg">{data.label}</p>
          <p className="mt-1 truncate text-[11.5px] leading-tight text-fg-subtle">
            {configSummary(data.type, data.config)}
          </p>
        </div>
      </div>
      {data.busy != null && !isSource ? (
        <div className="px-3 pb-3">
          <div className="flex items-center justify-between text-[11.5px]">
            <span className={cn(state === 'crit' ? 'text-crit' : state === 'warn' ? 'text-warn' : 'text-fg-muted')}>
              {Math.round(data.busy * 100)}% busy
            </span>
            {cost > 0 && <span className="text-fg-faint">${cost.toFixed(2)}/hr</span>}
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className={cn('h-full rounded-full transition-[width] duration-150', bar[state])}
              style={{ width: `${Math.min(100, data.busy * 100)}%` }}
            />
          </div>
        </div>
      ) : (
        !isSource && (
          <div className="px-3 pb-2.5 -mt-1 text-[11.5px] text-fg-faint">
            {cost > 0 ? `$${cost.toFixed(2)}/hr` : 'usage-based'}
          </div>
        )
      )}
      {!isSink && (
        <Handle type="source" position={Position.Right} isConnectable={data.connectable} className="!-right-[5px]" />
      )}
    </div>
  )
}

export const FlowNode = memo(FlowNodeImpl)
