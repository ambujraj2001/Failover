/**
 * Client-side mirror of the backend password policy (backend/app/core/security.py).
 * The server stays the source of truth; this only drives the live checklist and early validation.
 */

export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128

const COMMON = new Set(['password1', 'password123', 'qwerty123', '12345678a', 'letmein123'])

export interface PasswordRule {
  id: 'length' | 'mix' | 'email' | 'common'
  label: string
  met: boolean
}

export function passwordRules(password: string, email?: string): PasswordRule[] {
  const lower = password.toLowerCase()
  const rules: PasswordRule[] = [
    {
      id: 'length',
      label: `${PASSWORD_MIN}–${PASSWORD_MAX} characters`,
      met: password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX,
    },
    { id: 'mix', label: 'A letter and a number', met: /[A-Za-z]/.test(password) && /\d/.test(password) },
  ]
  const e = email?.trim().toLowerCase()
  if (e) rules.push({ id: 'email', label: 'Not your email address', met: password.length > 0 && lower !== e })
  rules.push({ id: 'common', label: 'Not a common password', met: password.length > 0 && !COMMON.has(lower) })
  return rules
}

/** First policy problem, phrased like the backend, or null when the password is acceptable. */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Include at least one letter and one number.'
  const e = email?.trim().toLowerCase()
  if (e && password.toLowerCase() === e) return 'Your password cannot be your email address.'
  if (COMMON.has(password.toLowerCase())) return 'That password is too common.'
  return null
}

export interface Strength {
  /** 0 = empty, 1 = does not meet policy, 2..4 = acceptable and increasingly strong */
  score: 0 | 1 | 2 | 3 | 4
  label: string
}

export function passwordStrength(password: string, email?: string): Strength {
  if (!password) return { score: 0, label: '' }
  if (passwordProblem(password, email)) return { score: 1, label: 'Too weak' }
  let score = 2
  if (password.length >= 12) score++
  const variety =
    Number(/[a-z]/.test(password)) +
    Number(/[A-Z]/.test(password)) +
    Number(/\d/.test(password)) +
    Number(/[^A-Za-z0-9]/.test(password))
  if (variety >= 3 && password.length >= 10) score++
  const s = Math.min(score, 4) as 2 | 3 | 4
  return { score: s, label: s === 2 ? 'Fair' : s === 3 ? 'Good' : 'Strong' }
}
