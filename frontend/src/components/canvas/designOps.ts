import type { CatalogItem, ComponentType, Design } from '@/lib/types'
import { uid } from '@/lib/utils'
import { canConnect } from './DesignEditor'

/**
 * Add a component. With no explicit position it is placed to the right of the selected node
 * (or the right-most node) and auto-connected from the selected node when that is a valid edge.
 */
export function addComponent(
  design: Design,
  type: ComponentType,
  catalog: CatalogItem[],
  selectedId: string | null,
  position?: { x: number; y: number },
): { design: Design; id: string } {
  const id = uid(type.split('_')[0])
  const sel = design.nodes.find((n) => n.id === selectedId)
  let pos = position
  if (!pos) {
    const anchor = sel ?? [...design.nodes].sort((a, b) => b.position.x - a.position.x)[0]
    const base = anchor ? { x: anchor.position.x + 260, y: anchor.position.y } : { x: 0, y: 120 }
    // avoid stacking exactly on top of another node
    let y = base.y
    while (design.nodes.some((n) => Math.abs(n.position.x - base.x) < 60 && Math.abs(n.position.y - y) < 70)) y += 90
    pos = { x: base.x, y }
  }
  const node = { id, type, config: {}, position: pos }
  let next: Design = { ...design, nodes: [...design.nodes, node] }
  if (sel && canConnect(next, catalog, sel.id, id)) {
    next = { ...next, edges: [...next.edges, { source: sel.id, target: id }] }
  }
  return { design: next, id }
}

export function designCost(design: Design, catalog: CatalogItem[], cost: (t: ComponentType, c: Record<string, unknown>) => number) {
  return design.nodes.reduce((sum, n) => {
    const meta = catalog.find((c) => c.type === n.type)
    return sum + cost(n.type, { ...(meta?.default_config ?? {}), ...n.config })
  }, 0)
}

/** Strip UI-only fields and round positions before sending to the API. */
export function cleanDesign(d: Design): Design {
  return {
    nodes: d.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      label: n.label ?? null,
      config: n.config,
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
    })),
    edges: d.edges.map((e) => ({ source: e.source, target: e.target })),
  }
}
