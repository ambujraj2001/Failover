import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Check, Design, Difficulty, NodeStat, SeriesPoint, SimSummary } from '@/lib/types'

// ---- API shapes (public, sign-in-free endpoints) ------------------------------------------------

export interface PublicStats {
  labs: number
  problems: number
  lessons: number
  concepts: number
  flashcards: number
  days: number
}

export interface RoadmapPhase {
  id: string
  title: string
  days: [number, number]
  topics: string[]
}

export interface MasteryArea {
  title: string
  items: string[]
}

export interface HeroRun {
  series: SeriesPoint[]
  summary: SimSummary
  nodes: Record<string, NodeStat>
  diagnosis: string | null
  checks: Check[]
}

export interface DemoHero {
  title: string
  before: HeroRun
  after: HeroRun
  starter: Design
  solution: Design
  /** cost ceiling for the lab, $/hr */
  budget?: number
}

const STALE = 10 * 60_000

export function usePublicStats() {
  return useQuery({
    queryKey: ['landing', 'stats'],
    queryFn: ({ signal }) => api<PublicStats>('/stats/public', { auth: false, signal }),
    staleTime: STALE,
  })
}

export function useRoadmap() {
  return useQuery({
    queryKey: ['landing', 'roadmap'],
    queryFn: ({ signal }) => api<RoadmapPhase[]>('/roadmap', { auth: false, signal }),
    staleTime: STALE,
  })
}

export function useMastery() {
  return useQuery({
    queryKey: ['landing', 'mastery'],
    queryFn: ({ signal }) => api<MasteryArea[]>('/mastery', { auth: false, signal }),
    staleTime: STALE,
  })
}

export function useDemoHero() {
  return useQuery({
    queryKey: ['landing', 'hero'],
    queryFn: ({ signal }) => api<DemoHero>('/demo/hero', { auth: false, signal }),
    staleTime: Infinity,
  })
}

// ---- static content -----------------------------------------------------------------------------

export interface ProblemCard {
  /** short name, e.g. "Chat app" */
  title: string
  /** as asked in the interview, e.g. "Design a chat app" */
  prompt: string
  difficulty: Difficulty
  tags: [string, string, string]
}

export const PROBLEMS: ProblemCard[] = [
  { title: 'URL shortener', prompt: 'Design a URL shortener', difficulty: 'easy', tags: ['cache-aside', 'id generation', 'read-heavy'] },
  { title: 'Chat app', prompt: 'Design a chat app', difficulty: 'medium', tags: ['websockets', 'message queue', 'ordering'] },
  { title: 'News feed', prompt: 'Design a news feed', difficulty: 'medium', tags: ['fan-out', 'timeline cache', 'hot keys'] },
  { title: 'Google Docs', prompt: 'Design Google Docs', difficulty: 'hard', tags: ['OT / CRDT', 'websockets', 'versioning'] },
  { title: 'Payment system', prompt: 'Design a payment system', difficulty: 'hard', tags: ['idempotency', 'ledger', 'outbox'] },
  { title: 'Live comments', prompt: 'Design live comments', difficulty: 'hard', tags: ['SSE', 'fan-out', 'multi-region'] },
  { title: 'Top-K trending', prompt: 'Design top-K trending', difficulty: 'hard', tags: ['stream processing', 'count-min sketch', 'sliding windows'] },
  { title: 'YouTube', prompt: 'Design YouTube', difficulty: 'hard', tags: ['transcoding', 'CDN', 'adaptive bitrate'] },
  { title: 'Uber', prompt: 'Design Uber', difficulty: 'hard', tags: ['geohash', 'matching', 'sharding'] },
]

export const STUDY_PLANS = [
  { name: 'Meta product and infra', weeks: 4, focus: 'Feeds, chat, real-time fan-out' },
  { name: 'Google scale and consistency', weeks: 4, focus: 'Collaboration, media, correctness' },
  { name: 'Amazon reliability and commerce', weeks: 4, focus: 'Payments, queues, peak days' },
  { name: 'Two-week crash course', weeks: 2, focus: 'Highest-yield labs only' },
]

/** Used while /roadmap loads or if it fails. Mirrors curriculum.yaml. */
export const FALLBACK_ROADMAP: RoadmapPhase[] = [
  {
    id: 'foundations',
    title: 'Foundations',
    days: [1, 5],
    topics: ['System design basics', 'Networking', 'Databases', 'Caching', 'Architecture checkpoint'],
  },
  {
    id: 'scaling',
    title: 'Scaling core',
    days: [6, 10],
    topics: ['Load and scaling', 'Database scaling', 'Replication and consistency', 'Advanced caching', 'Messaging'],
  },
  {
    id: 'production',
    title: 'Production readiness',
    days: [11, 13],
    topics: ['Reliability', 'API design and protection', 'Failure containment'],
  },
  { id: 'case-studies', title: 'Case studies', days: [14, 15], topics: ['Case study: chat', 'Case study: timeline'] },
  {
    id: 'advanced',
    title: 'Advanced',
    days: [16, 24],
    topics: [
      'Locks and consensus',
      'Sagas and the outbox',
      'Multi-region and fan-out',
      'Observability and streams',
      'Security',
      'Partitioning',
      'Media at scale',
      'Geo systems',
      'Performance review',
    ],
  },
  {
    id: 'interview',
    title: 'Interview mode',
    days: [25, 30],
    topics: [
      'The interview format',
      'Estimation',
      'Communication',
      'Mock practice I',
      'Mock practice II',
      'Final simulation',
    ],
  },
]

/** Used while /mastery loads or if it fails. Mirrors mastery.yaml. */
export const FALLBACK_MASTERY: MasteryArea[] = [
  { title: 'Fundamentals', items: ['Requirements', 'Latency and percentiles', 'Availability and the nines', 'Single points of failure', 'API design'] },
  { title: 'Networking', items: ['DNS, TCP and TLS', 'L4 and L7 load balancing', 'CDNs and edge caching', 'WebSockets, SSE, long polling', 'Geo routing'] },
  { title: 'Storage', items: ['SQL vs NoSQL', 'ACID transactions', 'Indexes and query plans', 'Connection pooling', 'Object storage'] },
  { title: 'Caching', items: ['Cache-aside', 'Write policies', 'Eviction and sizing', 'Invalidation', 'Stampedes and hot keys'] },
  { title: 'Scaling', items: ['Stateless services', 'Vertical vs horizontal', 'Autoscaling and headroom', 'Read replicas', 'Fan-out on write vs read'] },
  { title: 'Partitioning', items: ['Sharding and shard keys', 'Hash vs range', 'Hot partitions and skew', 'Consistent hashing'] },
  { title: 'Replication & Consistency', items: ['Sync vs async replication', 'Read-your-writes', 'Consistency models', 'CAP and PACELC', 'Quorums'] },
  { title: 'Async & Messaging', items: ['Queues and pub/sub', 'Kafka partitions', 'Back-pressure', 'Delivery semantics', 'Stream processing'] },
  { title: 'Reliability', items: ['Redundancy and failover', 'RTO and RPO', 'SLOs and error budgets', 'Timeouts and retries', 'Circuit breakers'] },
  { title: 'Distributed Systems', items: ['Locks and fencing', 'Leader election and Raft', 'OT and CRDTs', 'Sagas and the outbox', 'Idempotency'] },
  { title: 'Operations & Security', items: ['Metrics, logs and traces', 'Rate limiting', 'AuthN and AuthZ', 'Secrets management', 'Abuse defence'] },
  { title: 'Algorithms & Estimation', items: ['Back-of-the-envelope maths', "Little's law", 'Rate-limiting algorithms', 'Probabilistic sketches', 'Geospatial indexes'] },
]

// ---- hero fallback ------------------------------------------------------------------------------

const pos = (x: number, y: number) => ({ x, y })

/**
 * If /demo/hero is unreachable the live panel replays this approximation of the same run
 * (shape and summary values taken from the simulator's output for the day-4 lab).
 */
export function fallbackHero(): DemoHero {
  const before: SeriesPoint[] = Array.from({ length: 60 }, (_, t) => {
    const k = Math.exp(-t / 10)
    return {
      t,
      rps: 4000,
      ok_rps: Math.round(1485 - 550 * k),
      p50: Math.round(1000 + 2000 * k),
      p99: Math.round(1700 + 1470 * k),
      err: +(62 + 15 * k).toFixed(2),
      nodes: { users: 0, lb: 0.04, api: 0.671, db: +(1 + 1.69 * Math.exp(-t / 8)).toFixed(3) },
    }
  })
  const after: SeriesPoint[] = Array.from({ length: 60 }, (_, t) => ({
    t,
    rps: 4000,
    ok_rps: 4000,
    p50: 18,
    p99: 67.2,
    err: 0,
    nodes: { users: 0, lb: 0.04, api: 0.671, redis: 0.049, db: 0.121 },
  }))
  const node = (label: string, type: NodeStat['type'], busy: number, extra: Partial<NodeStat> = {}): NodeStat => ({
    label,
    type,
    load_rps: 0,
    capacity_rps: null,
    busy,
    peak_busy: busy,
    backlog_peak: 0,
    ...extra,
  })
  const summary = (p50: number, p99: number, err: number, cost: number, thr: number, hit: number | null): SimSummary => ({
    p50_ms: p50,
    p99_ms: p99,
    error_rate: err,
    cost_per_hr: cost,
    stale_read_rate: 0,
    queue_lag_s: 0,
    write_loss_rate: 0,
    throughput_rps: thr,
    peak_rps: 4000,
    cache_hit_ratio: hit,
  })
  const base = [
    { id: 'users', type: 'users' as const, config: {}, position: pos(0, 120) },
    { id: 'lb', type: 'load_balancer' as const, config: {}, position: pos(240, 120) },
    { id: 'api', type: 'app_server' as const, label: 'API', config: {}, position: pos(480, 120) },
  ]
  return {
    title: 'Redirects are melting the database',
    budget: 1.45,
    before: {
      series: before,
      summary: summary(971.9, 2510.2, 64.225, 1.29, 1431, null),
      nodes: {
        users: node('Users', 'users', 0),
        lb: node('Load Balancer', 'load_balancer', 0.04),
        api: node('API', 'app_server', 0.671),
        db: node('PostgreSQL', 'database', 1.003, { peak_busy: 2.693 }),
      },
      diagnosis: 'Requests are queueing at PostgreSQL (peak 269% busy).',
      checks: [
        { metric: 'p99_ms', label: 'p99 latency', unit: 'ms', op: 'lte', target: 80, got: 2510.2, passed: false },
        { metric: 'error_rate', label: 'error rate', unit: '%', op: 'lte', target: 0.2, got: 64.225, passed: false },
      ],
    },
    after: {
      series: after,
      summary: summary(18, 67.2, 0, 1.35, 4000, 0.984),
      nodes: {
        users: node('Users', 'users', 0),
        lb: node('Load Balancer', 'load_balancer', 0.04),
        api: node('API', 'app_server', 0.671),
        redis: node('Redis', 'cache', 0.049, { hit_ratio: 0.984 }),
        db: node('PostgreSQL', 'database', 0.121),
      },
      diagnosis: 'Healthy: every component kept headroom during this run.',
      checks: [
        { metric: 'p99_ms', label: 'p99 latency', unit: 'ms', op: 'lte', target: 80, got: 67.2, passed: true },
        { metric: 'error_rate', label: 'error rate', unit: '%', op: 'lte', target: 0.2, got: 0, passed: true },
      ],
    },
    starter: {
      nodes: [...base, { id: 'db', type: 'database', label: 'PostgreSQL', config: {}, position: pos(760, 120) }],
      edges: [
        { source: 'users', target: 'lb' },
        { source: 'lb', target: 'api' },
        { source: 'api', target: 'db' },
      ],
    },
    solution: {
      nodes: [
        ...base,
        { id: 'db', type: 'database', label: 'PostgreSQL', config: {}, position: pos(760, 200) },
        { id: 'redis', type: 'cache', label: 'Redis', config: {}, position: pos(760, 40) },
      ],
      edges: [
        { source: 'users', target: 'lb' },
        { source: 'lb', target: 'api' },
        { source: 'api', target: 'redis' },
        { source: 'api', target: 'db' },
      ],
    },
  }
}
