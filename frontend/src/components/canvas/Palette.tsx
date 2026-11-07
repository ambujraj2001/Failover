import type { CatalogItem, ComponentType, Design } from '@/lib/types'
import { cn } from '@/lib/utils'
import { DRAG_MIME } from './DesignEditor'
import { CATEGORY_LABEL, CATEGORY_ORDER, TYPE_ICON, TYPE_TINT } from './meta'

export function Palette({
  catalog,
  allowed,
  design,
  onAdd,
  disabled,
}: {
  catalog: CatalogItem[]
  allowed: ComponentType[]
  design: Design
  onAdd: (type: ComponentType) => void
  disabled?: boolean
}) {
  const items = catalog.filter((c) => c.type !== 'users' && allowed.includes(c.type))
  const groups = CATEGORY_ORDER.map((cat) => ({ cat, items: items.filter((i) => i.category === cat) })).filter(
    (g) => g.items.length,
  )
  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-4 pb-2">
        <p className="text-[13.5px] font-medium text-fg">Add components</p>
        <p className="mt-1 text-[12px] leading-snug text-fg-subtle">Drag onto the canvas, or click to add.</p>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-2 py-2">
        {groups.map((g) => (
          <div key={g.cat}>
            <p className="mb-1 px-2 text-[12px] text-fg-faint">{CATEGORY_LABEL[g.cat] ?? g.cat}</p>
            <div className="space-y-1">
              {g.items.map((it) => {
                const Icon = TYPE_ICON[it.type]
                const count = design.nodes.filter((n) => n.type === it.type).length
                return (
                  <button
                    key={it.type}
                    type="button"
                    draggable={!disabled}
                    disabled={disabled}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_MIME, it.type)
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    onClick={() => onAdd(it.type)}
                    title={it.summary}
                    className={cn(
                      'group flex w-full cursor-grab items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors',
                      'hover:bg-white/[0.05] disabled:opacity-40 active:cursor-grabbing',
                    )}
                  >
                    <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg', TYPE_TINT[it.type])}>
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-fg">{it.label}</span>
                    </span>
                    {count > 0 && <span className="num text-[10.5px] text-fg-faint">{count}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
