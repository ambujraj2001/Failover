import type { Difficulty, PathItem, Target } from '@/lib/types'

/** Response shapes for the learning endpoints (mirrors backend/app/api/routes). */

export interface DashboardPhase {
  id: string
  title: string
  unlocked: boolean
  done: number
  total: number
}

export interface DashboardData {
  streak: number
  streak_best: number
  current_day: number
  today: { day: number; title: string; theme: string; items: PathItem[] } | null
  next_item: PathItem | null
  completed_items: number
  total_items: number
  phases: DashboardPhase[]
  solved_labs: number
  solved_problems: number
  total_labs: number
  total_problems: number
  lessons_done: number
  cards_due: number
  activity: { day: string; count: number }[]
  recent_submissions: { lab_slug: string; lab_title: string; passed: boolean; cost: number | null; created_at: string }[]
  recent_interviews: {
    id: string
    problem_slug: string
    verdict: string | null
    target_level: Target
    created_at: string
    scores: Record<string, unknown> | null
  }[]
}

export interface ConceptItem {
  slug: string
  name: string
  short: string
  area: string
  aliases: string[]
  lesson: string | null
  day?: number | null
  lesson_title?: string | null
}

export interface LessonDetail {
  slug: string
  day: number
  title: string
  minutes: number
  summary: string
  plain: string
  deeper: string
  key_points: string[]
  concepts: string[]
  completed: boolean
  day_title: string | null
  next_lesson: { slug: string; title: string } | null
  day_lab: { slug: string; title: string; kind: 'lab' | 'problem' } | null
  concept_cards: ConceptItem[]
}

export type ExplainMode = 'simpler' | 'deeper' | 'example'

export interface CheatSection {
  title: string
  rows: { label: string; value: string; note?: string | null }[]
}

export interface TrackItem {
  slug: string
  title: string
  kind: 'lab' | 'problem'
  difficulty: Difficulty
}

export interface StudyTrack {
  slug: string
  name: string
  tagline: string
  description: string
  weeks: number
  focus: string[]
  sequence: string[]
  items: TrackItem[]
}

export interface Flashcard {
  id: string
  front: string
  back: string
  concept: string | null
  day: number | null
  new: boolean
  interval_days: number
}

export interface FlashcardsDue {
  cards: Flashcard[]
  due_count: number
  new_available: number
  next_due_at: string | null
}

export interface FlashcardStats {
  total: number
  learning: number
  mature: number
  due: number
  seen: number
}

export type Grade = 'again' | 'hard' | 'good' | 'easy'

export const CONCEPT_AREAS = [
  'Fundamentals',
  'Networking',
  'Storage',
  'Caching',
  'Scaling',
  'Replication & Consistency',
  'Partitioning',
  'Async & Messaging',
  'Reliability',
  'Distributed Systems',
  'Operations & Security',
  'Algorithms & Estimation',
] as const
