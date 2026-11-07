import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Curriculum, LabCard } from '@/lib/types'
import type { DashboardData, FlashcardStats } from './types'

/** Shared query keys so mutations can invalidate everything that depends on progress. */
export const qk = {
  dashboard: ['dashboard'] as const,
  curriculum: ['curriculum'] as const,
  labs: (kind?: 'lab' | 'problem') => (kind ? (['labs', kind] as const) : (['labs'] as const)),
  lesson: (slug: string) => ['lesson', slug] as const,
  concepts: (q: string, area: string) => ['concepts', q, area] as const,
  cheatsheet: ['cheatsheet'] as const,
  tracks: ['tracks'] as const,
  flashcardsDue: ['flashcards', 'due'] as const,
  flashcardStats: ['flashcards', 'stats'] as const,
}

export function useDashboard() {
  return useQuery({ queryKey: qk.dashboard, queryFn: () => api<DashboardData>('/me/dashboard') })
}

export function useCurriculum() {
  return useQuery({ queryKey: qk.curriculum, queryFn: () => api<Curriculum>('/curriculum') })
}

export function useLabs(kind?: 'lab' | 'problem') {
  return useQuery({
    queryKey: qk.labs(kind),
    queryFn: () => api<LabCard[]>(kind ? `/labs?kind=${kind}` : '/labs'),
  })
}

export function useFlashcardStats() {
  return useQuery({ queryKey: qk.flashcardStats, queryFn: () => api<FlashcardStats>('/flashcards/stats') })
}
