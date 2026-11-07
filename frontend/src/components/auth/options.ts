import type { Difficulty, Level, Target } from '@/lib/types'

export const LEVEL_OPTIONS: { value: Level; label: string; description: string }[] = [
  {
    value: 'beginner',
    label: 'New to system design',
    description: 'We explain every term and walk through the reasoning step by step.',
  },
  {
    value: 'intermediate',
    label: 'Backend engineer',
    description: 'You know HTTP, databases and caching. We focus on trade-offs at scale.',
  },
  {
    value: 'expert',
    label: 'Senior or staff engineer',
    description: 'Short briefs and harder questions about failure, capacity and operations.',
  },
]

export const TARGET_OPTIONS: { value: Target; label: string; description: string }[] = [
  {
    value: 'E4',
    label: 'Mid-level (E4)',
    description: 'A working design with sensible parts and a clear data flow.',
  },
  {
    value: 'E5',
    label: 'Senior (E5)',
    description: 'Lead the design end to end and defend your trade-offs.',
  },
  {
    value: 'E6',
    label: 'Staff (E6)',
    description: 'Plan for failure and growth, and steer the whole conversation.',
  },
]

/** Shape returned by GET /tracks */
export interface Track {
  slug: string
  name: string
  tagline: string
  description: string
  weeks: number
  focus: string[]
  sequence: string[]
  items: { slug: string; title: string; kind: 'lab' | 'problem'; difficulty: Difficulty }[]
}

export const DEFAULT_PATH_LABEL = 'Follow the 30-day path'
