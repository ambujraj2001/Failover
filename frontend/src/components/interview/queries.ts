import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Target } from '@/lib/types'
import type { InterviewDetail, InterviewListItem, InterviewProblem } from './types'

export const interviewKey = (id: string) => ['interviews', id] as const

export function useInterviewProblems() {
  return useQuery({
    queryKey: ['interview-problems'],
    queryFn: () => api<InterviewProblem[]>('/interviews/problems'),
    staleTime: 5 * 60_000,
  })
}

export function useInterviews() {
  return useQuery({
    queryKey: ['interviews'],
    queryFn: () => api<InterviewListItem[]>('/interviews'),
  })
}

export function useInterview(id: string | undefined) {
  return useQuery({
    queryKey: interviewKey(id ?? ''),
    queryFn: () => api<InterviewDetail>(`/interviews/${id}`),
    enabled: !!id,
  })
}

export function useStartInterview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { problem_slug: string; target_level: Target }) =>
      api<InterviewDetail>('/interviews', { method: 'POST', body }),
    onSuccess: (iv) => {
      qc.setQueryData(interviewKey(iv.id), iv)
      qc.invalidateQueries({ queryKey: ['interviews'], exact: true })
    },
  })
}

export function useFinishInterview(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api<InterviewDetail>(`/interviews/${id}/finish`, { method: 'POST' }),
    onSuccess: (iv) => {
      qc.setQueryData(interviewKey(id), iv)
      qc.invalidateQueries({ queryKey: ['interviews'], exact: true })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useAbandonInterview(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api<{ status: string }>(`/interviews/${id}/abandon`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['interviews'] })
    },
  })
}
