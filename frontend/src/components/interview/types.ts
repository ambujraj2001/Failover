import type { ChatMessage, ComponentType, Design, Difficulty, Target, TestResult } from '@/lib/types'

export interface InterviewProblem {
  slug: string
  title: string
  difficulty: Difficulty
  topics: string[]
  company_tags: string[]
  summary: string
}

export type InterviewStatus = 'active' | 'completed' | 'abandoned' | 'expired'
export type Verdict = 'strong_hire' | 'hire' | 'lean_hire' | 'lean_no_hire' | 'no_hire'
export type Axis = 'problem_navigation' | 'solution_design' | 'technical_excellence' | 'communication'
export type Scores = Record<Axis, number>

export interface InterviewListItem {
  id: string
  problem_slug: string
  problem_title: string
  target_level: Target
  status: InterviewStatus
  verdict: Verdict | null
  scores: Scores | null
  created_at: string
}

/** Simulator result stored on a finished interview. `invalid` replaces `results` when the design could not run. */
export interface SimResult {
  passed: boolean
  results: TestResult[]
  cost_per_hr: number | null
  budget: number | null
  within_budget?: boolean
  warnings?: string[]
  invalid?: string[]
}

export interface InterviewDetail {
  id: string
  problem_slug: string
  problem_title: string
  target_level: Target
  status: InterviewStatus
  created_at: string
  ends_at: string
  finished_at: string | null
  design: Design | null
  notes: string | null
  transcript: ChatMessage[]
  twist: { title: string } | null
  scores: Scores | null
  verdict: Verdict | null
  feedback: string | null
  sim_result: SimResult | null
  brief: string | null
  palette: ComponentType[]
  starter: Design | null
  design_prompt: string | null
  budget: number | null
}
