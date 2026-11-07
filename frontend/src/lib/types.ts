export type Level = 'beginner' | 'intermediate' | 'expert'
export type Target = 'E4' | 'E5' | 'E6'
export type Difficulty = 'easy' | 'medium' | 'hard'

export interface User {
  id: string
  email: string
  name: string
  level: Level
  target_level: Target
  track: string | null
  timezone: string
  free_roam: boolean
  onboarded: boolean
  streak_current: number
  streak_best: number
  created_at: string
}

export interface AuthResponse {
  access_token: string
  token_type: string
  expires_in: number
  user: User
}

// ---- simulator / canvas ------------------------------------------------------------------------

export type ComponentType =
  | 'users'
  | 'cdn'
  | 'load_balancer'
  | 'app_server'
  | 'cache'
  | 'database'
  | 'queue'
  | 'worker'
  | 'object_storage'

export interface Knob {
  key: string
  label: string
  kind: 'select' | 'int' | 'bool' | 'text'
  options?: { value: string; label: string }[]
  min?: number
  max?: number
  unit?: string
  default: unknown
  help: string
  group: string
}

export interface CatalogItem {
  type: ComponentType
  label: string
  category: string
  summary: string
  description: string
  knobs: Knob[]
  connects_to: ComponentType[]
  default_config: Record<string, unknown>
  base_cost: number
}

export interface DesignNode {
  id: string
  type: ComponentType
  label?: string | null
  config: Record<string, unknown>
  position: { x: number; y: number }
}

export interface DesignEdge {
  id?: string | null
  source: string
  target: string
}

export interface Design {
  nodes: DesignNode[]
  edges: DesignEdge[]
}

export interface Check {
  metric: string
  label: string
  unit: string
  op: 'lte' | 'gte'
  target: number
  got: number
  passed: boolean
}

export interface SimSummary {
  p50_ms: number
  p99_ms: number
  error_rate: number
  cost_per_hr: number
  stale_read_rate: number
  queue_lag_s: number
  write_loss_rate: number
  throughput_rps: number
  peak_rps: number
  cache_hit_ratio: number | null
}

export interface SeriesPoint {
  t: number
  rps: number
  ok_rps: number
  p50: number
  p99: number
  err: number
  nodes: Record<string, number>
}

export interface NodeStat {
  label: string
  type: ComponentType
  load_rps: number
  capacity_rps: number | null
  busy: number
  peak_busy: number
  backlog_peak: number
  hit_ratio?: number
  instances_avg?: number
  instances_end?: number
}

export interface LogLine {
  t: number
  level: 'INFO' | 'WARN' | 'ERROR'
  msg: string
}

export interface TestResult {
  test_id: string
  name: string
  hidden: boolean
  passed: boolean
  checks: Check[]
  summary: SimSummary | null
  diagnosis: string | null
  series?: SeriesPoint[]
  nodes?: Record<string, NodeStat>
  failure_reasons?: { reason: string; pct: number }[]
  logs?: LogLine[]
  warnings?: string[]
}

export interface GradeResult {
  passed: boolean
  within_budget: boolean
  budget: number | null
  cost_per_hr: number
  results: TestResult[]
  warnings: string[]
  submission_id?: string
  newly_solved?: boolean
  unlocked_phase?: string | null
  attempts?: number
}

// ---- labs --------------------------------------------------------------------------------------

export interface PublicTest {
  id: string
  name: string
  hidden: boolean
  summary: string
  assertions?: { metric: string; op: 'lte' | 'gte'; value: number }[]
  scenario?: { base_rps: number; read_ratio: number; duration: number; spikes: unknown[]; events: unknown[] }
}

export interface LabDetail {
  slug: string
  kind: 'lab' | 'problem'
  title: string
  difficulty: Difficulty
  day: number | null
  checkpoint: boolean
  summary: string
  topics: string[]
  company_tags: string[]
  estimated_minutes: number
  incident: string
  brief_beginner: string
  brief_expert: string
  glossary: { term: string; meaning: string }[]
  requirements: string[]
  budget: number
  palette: ComponentType[]
  starter: Design
  tests: PublicTest[]
  hint_count: number
  design_prompt: string | null
  phase?: string | null
  progress?: {
    solved: boolean
    attempts: number
    runs: number
    hints_revealed: number
    best_cost: number | null
    editorial_unlocked: boolean
  }
  draft?: { design: Design | null; design_note: string | null; version: number } | null
}

export interface LabCard {
  slug: string
  kind: 'lab' | 'problem'
  title: string
  difficulty: Difficulty
  day: number | null
  phase: string | null
  summary: string
  topics: string[]
  company_tags: string[]
  checkpoint: boolean
  estimated_minutes: number
  unlocked: boolean
  solved: boolean
  attempts: number
  best_cost: number | null
  budget: number
}

export interface ChatMessage {
  id?: string
  role: 'user' | 'assistant'
  content: string
  created_at?: string
  at?: string
}

// ---- curriculum -------------------------------------------------------------------------------

export interface PathItem {
  kind: 'lesson' | 'lab' | 'problem'
  slug: string
  title: string
  minutes: number
  done: boolean
  difficulty?: Difficulty
  checkpoint?: boolean
  attempted?: boolean
}

export interface PathDay {
  day: number
  title: string
  theme: string
  items: PathItem[]
  done: number
  total: number
  complete: boolean
}

export interface PathPhase {
  id: string
  title: string
  description: string
  unlocked: boolean
  days: PathDay[]
}

export interface Curriculum {
  phases: PathPhase[]
  current_day: number
  completed_items: number
  total_items: number
}
