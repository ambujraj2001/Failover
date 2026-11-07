import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const BRAND = {
  name: 'Failover',
  tagline: 'Learn system design by fixing outages.',
}

export function fmtMs(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return '—'
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)} s`
  if (ms >= 100) return `${Math.round(ms)} ms`
  return `${ms.toFixed(ms < 10 ? 1 : 0)} ms`
}

export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return '—'
  if (v > 0 && v < 0.01) return '<0.01%'
  return `${v.toFixed(v >= 10 ? 0 : digits)}%`
}

export function fmtRps(v: number | null | undefined): string {
  if (v == null) return '—'
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k/s`
  return `${Math.round(v)}/s`
}

export function fmtCost(v: number | null | undefined): string {
  if (v == null) return '—'
  return `$${v.toFixed(2)}/hr`
}

export function relTime(iso: string): string {
  const d = new Date(iso).getTime()
  const s = Math.round((Date.now() - d) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function loadColor(busy: number | undefined): 'idle' | 'ok' | 'warn' | 'crit' {
  if (busy == null) return 'idle'
  if (busy >= 1) return 'crit'
  if (busy >= 0.75) return 'warn'
  return 'ok'
}

export const difficultyStyle: Record<string, string> = {
  easy: 'text-ok',
  medium: 'text-warn',
  hard: 'text-crit',
}

export function uid(prefix = 'n'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`
}
