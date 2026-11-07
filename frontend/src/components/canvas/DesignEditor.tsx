import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/base.css'
import { useCallback, useEffect, useMemo, useRef, type DragEvent } from 'react'
import type { CatalogItem, ComponentType, Design } from '@/lib/types'
import { FlowNode, type FlowNodeType } from './FlowNode'

const nodeTypes = { component: FlowNode }
export const DRAG_MIME = 'application/x-failover-component'

export interface DesignEditorProps {
  design: Design
  onChange?: (d: Design) => void
  catalog: CatalogItem[]
  readOnly?: boolean
  busy?: Record<string, number> | null
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  onAdd?: (type: ComponentType, position: { x: number; y: number }) => void
  className?: string
}

export function edgeId(s: string, t: string) {
  return `${s}->${t}`
}

/** Would adding source→target create a loop? (true if source is reachable from target) */
function createsCycle(design: Design, source: string, target: string): boolean {
  const stack = [target]
  const seen = new Set<string>()
  while (stack.length) {
    const n = stack.pop()!
    if (n === source) return true
    if (seen.has(n)) continue
    seen.add(n)
    for (const e of design.edges) if (e.source === n) stack.push(e.target)
  }
  return false
}

export function canConnect(design: Design, catalog: CatalogItem[], source: string, target: string): boolean {
  if (source === target) return false
  const s = design.nodes.find((n) => n.id === source)
  const t = design.nodes.find((n) => n.id === target)
  if (!s || !t) return false
  const meta = catalog.find((c) => c.type === s.type)
  if (!meta?.connects_to.includes(t.type)) return false
  if (design.edges.some((e) => e.source === source && e.target === target)) return false
  return !createsCycle(design, source, target)
}

function Editor({ design, onChange, catalog, readOnly, busy, selectedId, onSelect, onAdd, className }: DesignEditorProps) {
  const rf = useReactFlow()
  const wrap = useRef<HTMLDivElement>(null)

  // keep the diagram in view when the canvas is resized (panels opening/closing, window resize)
  useEffect(() => {
    const el = wrap.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let t: ReturnType<typeof setTimeout> | undefined
    // compare sizes instead of skipping the first callback: the initial notification can arrive late
    let last = { w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) }
    const ro = new ResizeObserver(() => {
      const next = { w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) }
      if (next.w === last.w && next.h === last.h) return
      last = next
      clearTimeout(t)
      t = setTimeout(() => rf.fitView({ padding: 0.25, maxZoom: 1 }), 80)
    })
    ro.observe(el)
    return () => {
      clearTimeout(t)
      ro.disconnect()
    }
  }, [rf])

  const nodes: FlowNodeType[] = useMemo(
    () =>
      design.nodes.map((n) => ({
        id: n.id,
        type: 'component' as const,
        position: n.position,
        selected: n.id === selectedId,
        deletable: !readOnly && n.type !== 'users',
        data: {
          type: n.type,
          label: n.label || catalog.find((c) => c.type === n.type)?.label || n.type,
          config: { ...(catalog.find((c) => c.type === n.type)?.default_config ?? {}), ...n.config },
          busy: busy?.[n.id],
          connectable: !readOnly,
        },
      })),
    [design.nodes, selectedId, readOnly, busy, catalog],
  )

  const edges: Edge[] = useMemo(
    () =>
      design.edges.map((e) => {
        const load = busy?.[e.target]
        const hot = load != null && load >= 1
        return {
          id: edgeId(e.source, e.target),
          source: e.source,
          target: e.target,
          selected: selectedId === edgeId(e.source, e.target),
          deletable: !readOnly,
          animated: busy != null,
          style: hot ? { stroke: 'var(--color-crit)' } : undefined,
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: hot ? '#f0524a' : '#404040' },
        }
      }),
    [design.edges, busy, readOnly, selectedId],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNodeType>[]) => {
      let next = design
      let changed = false
      for (const c of changes) {
        if (c.type === 'position' && c.position && !readOnly) {
          next = { ...next, nodes: next.nodes.map((n) => (n.id === c.id ? { ...n, position: c.position! } : n)) }
          changed = true
        } else if (c.type === 'remove' && !readOnly) {
          const node = next.nodes.find((n) => n.id === c.id)
          if (node && node.type !== 'users') {
            next = {
              nodes: next.nodes.filter((n) => n.id !== c.id),
              edges: next.edges.filter((e) => e.source !== c.id && e.target !== c.id),
            }
            changed = true
            if (selectedId === c.id) onSelect?.(null)
          }
        } else if (c.type === 'select' && c.selected) {
          onSelect?.(c.id)
        }
      }
      if (changed) onChange?.(next)
    },
    [design, onChange, onSelect, readOnly, selectedId],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      let next = design
      let changed = false
      for (const c of changes) {
        if (c.type === 'remove' && !readOnly) {
          next = { ...next, edges: next.edges.filter((e) => edgeId(e.source, e.target) !== c.id) }
          changed = true
          if (selectedId === c.id) onSelect?.(null)
        } else if (c.type === 'select' && c.selected) {
          onSelect?.(c.id)
        }
      }
      if (changed) onChange?.(next)
    },
    [design, onChange, onSelect, readOnly, selectedId],
  )

  const onConnect = useCallback(
    (c: Connection) => {
      if (readOnly || !c.source || !c.target) return
      if (!canConnect(design, catalog, c.source, c.target)) return
      onChange?.({ ...design, edges: [...design.edges, { source: c.source, target: c.target }] })
    },
    [design, catalog, onChange, readOnly],
  )

  const isValidConnection = useCallback(
    (c: Connection | Edge) => !!c.source && !!c.target && canConnect(design, catalog, c.source, c.target),
    [design, catalog],
  )

  const onDragOver = (e: DragEvent) => {
    if (readOnly) return
    if (e.dataTransfer.types.includes(DRAG_MIME)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }
  const onDrop = (e: DragEvent) => {
    if (readOnly) return
    const type = e.dataTransfer.getData(DRAG_MIME) as ComponentType
    if (!type) return
    e.preventDefault()
    const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    onAdd?.(type, { x: p.x - 100, y: p.y - 30 })
  }

  return (
    <div ref={wrap} className={className} onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onPaneClick={() => onSelect?.(null)}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
        minZoom={0.3}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#262626" />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  )
}

export function DesignEditor(props: DesignEditorProps) {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  )
}
