import { useQuery } from '@tanstack/react-query'
import {
  Archive,
  Cpu,
  Database,
  Globe2,
  Inbox,
  Network,
  Server,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { CatalogItem, ComponentType } from '@/lib/types'

export const TYPE_ICON: Record<ComponentType, LucideIcon> = {
  users: Users,
  cdn: Globe2,
  load_balancer: Network,
  app_server: Server,
  cache: Zap,
  database: Database,
  queue: Inbox,
  worker: Cpu,
  object_storage: Archive,
}

/** Accent per category, used for the small icon tile on nodes and palette items. */
/** Component icon tile. Deliberately neutral: colour on the canvas is reserved for load/state. */
const NEUTRAL_TILE = 'text-fg-muted bg-white/[0.06]'
export const TYPE_TINT: Record<ComponentType, string> = {
  users: NEUTRAL_TILE,
  cdn: NEUTRAL_TILE,
  load_balancer: NEUTRAL_TILE,
  app_server: NEUTRAL_TILE,
  cache: NEUTRAL_TILE,
  database: NEUTRAL_TILE,
  queue: NEUTRAL_TILE,
  worker: NEUTRAL_TILE,
  object_storage: NEUTRAL_TILE,
}

export const CATEGORY_ORDER = ['edge', 'routing', 'compute', 'cache', 'data', 'async']
export const CATEGORY_LABEL: Record<string, string> = {
  edge: 'Edge',
  routing: 'Routing',
  compute: 'Compute',
  cache: 'Cache',
  data: 'Data',
  async: 'Async',
}

export function useCatalog() {
  return useQuery({
    queryKey: ['catalog'],
    queryFn: () => api<CatalogItem[]>('/components', { auth: false }),
    staleTime: Infinity,
  })
}

// ---- client-side cost estimate (mirrors backend/app/simulator/catalog.py) -----------------------

const APP_COST: Record<string, number> = { small: 0.04, medium: 0.085, large: 0.17, xlarge: 0.34 }
const DB_COST: Record<string, number> = { small: 0.09, medium: 0.18, large: 0.36, xlarge: 0.72 }
const CACHE_COST: Record<string, number> = { '1': 0.03, '4': 0.06, '16': 0.22, '32': 0.44, '64': 0.88 }

export function nodeCost(type: ComponentType, c: Record<string, unknown>): number {
  const n = (k: string, d = 1) => Number(c[k] ?? d)
  switch (type) {
    case 'cdn':
      return 0.05
    case 'load_balancer':
      return 0.025
    case 'app_server':
    case 'worker':
      return (APP_COST[String(c.size ?? 'medium')] ?? 0.085) * n('instances', 2)
    case 'cache':
      return (CACHE_COST[String(c.memory_gb ?? '4')] ?? 0.06) * n('nodes', 1)
    case 'database':
      return ((DB_COST[String(c.size ?? 'medium')] ?? 0.18) * (1 + n('replicas', 0)) + 0.03) * n('shards', 1)
    case 'queue':
      return 0.04 + 0.01 * n('partitions', 4)
    case 'object_storage':
      return 0.02
    default:
      return 0
  }
}

const SIZE_SHORT: Record<string, string> = { small: 'small', medium: 'medium', large: 'large', xlarge: 'xlarge' }

/** One-line description of a node's configuration, shown under its label. */
export function configSummary(type: ComponentType, c: Record<string, unknown>): string {
  switch (type) {
    case 'users':
      return 'traffic from the scenario'
    case 'cdn':
      return 'edge cache · static files'
    case 'load_balancer': {
      const parts = ['L7']
      if (c.rate_limit) parts.push(`limit ${c.rate_limit_rps}/s`)
      if (c.health_checks === false) parts.push('no health checks')
      return parts.join(' · ')
    }
    case 'app_server': {
      const s = `${c.instances ?? 2} × ${SIZE_SHORT[String(c.size ?? 'medium')]}`
      const extra = []
      if (c.autoscaling) extra.push(`auto ≤${c.max_instances}`)
      if (Number(c.retries ?? 0) > 0) extra.push(`${c.retries} retries`)
      if (c.circuit_breaker) extra.push('breaker')
      return [s, ...extra].join(' · ')
    }
    case 'cache': {
      const parts = [`${Number(c.nodes ?? 1) > 1 ? `${c.nodes} × ` : ''}${c.memory_gb ?? 4} GB`, `ttl ${fmtTtl(Number(c.ttl_s ?? 300))}`]
      if (c.stampede_protection) parts.push('coalescing')
      return parts.join(' · ')
    }
    case 'database': {
      const parts = [String(c.size ?? 'medium')]
      if (Number(c.replicas ?? 0) > 0) parts.push(`${c.replicas} replica${Number(c.replicas) > 1 ? 's' : ''}`)
      if (Number(c.shards ?? 1) > 1) parts.push(`${c.shards} shards`)
      parts.push(`idx: ${String(c.indexes ?? 'id').replace(/\s+/g, '')}`)
      return parts.join(' · ')
    }
    case 'queue':
      return `${c.partitions ?? 4} partitions`
    case 'worker':
      return `${c.instances ?? 2} × ${c.size ?? 'medium'}`
    case 'object_storage':
      return 'S3-style blobs'
  }
}

function fmtTtl(s: number): string {
  if (s >= 86400) return `${Math.round(s / 86400)}d`
  if (s >= 3600) return `${Math.round(s / 3600)}h`
  if (s >= 60) return `${Math.round(s / 60)}m`
  return `${s}s`
}
