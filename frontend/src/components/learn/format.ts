import { useEffect, useState } from 'react'

export function itemHref(item: { kind: string; slug: string }): string {
  return item.kind === 'lesson' ? `/app/lessons/${item.slug}` : `/lab/${item.slug}`
}

export function kindLabel(kind: string): string {
  return kind === 'lesson' ? 'Lesson' : kind === 'lab' ? 'Lab' : 'Problem'
}

export function useDebounced<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function pct(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0
}

export function fmtInterval(days: number): string {
  if (days <= 0) return '<10m'
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h`
  if (days < 30) return `${Math.round(days)}d`
  if (days < 365) return `${Math.round(days / 30)}mo`
  return `${(days / 365).toFixed(1)}y`
}

export function fmtDue(iso: string): string {
  const d = new Date(iso)
  const diff = d.getTime() - Date.now()
  if (diff <= 0) return 'now'
  const mins = Math.round(diff / 60000)
  if (mins < 60) return `in ${mins} min`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `in ${hrs} h`
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export const VERDICT_LABEL: Record<string, { label: string; tone: 'ok' | 'brand' | 'warn' | 'crit' | 'neutral' }> = {
  strong_hire: { label: 'Strong hire', tone: 'ok' },
  hire: { label: 'Hire', tone: 'ok' },
  lean_hire: { label: 'Lean hire', tone: 'neutral' },
  lean_no_hire: { label: 'Lean no hire', tone: 'warn' },
  no_hire: { label: 'No hire', tone: 'crit' },
}
