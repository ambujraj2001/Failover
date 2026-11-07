import { create } from 'zustand'
import type { User } from '@/lib/types'

type Status = 'loading' | 'authed' | 'anon'

interface AuthState {
  user: User | null
  status: Status
  setUser: (user: User) => void
  clear: () => void
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: 'loading',
  setUser: (user) => set({ user, status: 'authed' }),
  clear: () => set({ user: null, status: 'anon' }),
}))
