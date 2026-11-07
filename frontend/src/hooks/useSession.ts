import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, setAccessToken } from '@/lib/api'
import type { AuthResponse, User } from '@/lib/types'
import { useAuth } from '@/stores/auth'

/** Store a fresh session returned by login / register / change-password. */
export function applySession(data: AuthResponse) {
  setAccessToken(data.access_token)
  useAuth.getState().setUser(data.user)
}

export function useSignOut() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  return useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' })
    } catch {
      /* already signed out server-side */
    }
    setAccessToken(null)
    useAuth.getState().clear()
    qc.clear()
    navigate('/signin', { replace: true })
  }, [qc, navigate])
}

/** Update the cached user after a profile change. */
export function setUser(user: User) {
  useAuth.getState().setUser(user)
}
