import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { passwordRules } from './password'

/**
 * Calm checklist of the password rules, shown under a new-password field once the user starts
 * typing. Before that it stays in the DOM (visually hidden) so aria-describedby still announces
 * the requirements.
 */
export function PasswordStrength({ password, email, id }: { password: string; email?: string; id?: string }) {
  const rules = passwordRules(password, email)
  const typing = password.length > 0

  return (
    <div id={id} className={cn('@container', typing ? 'animate-fade-in mt-3' : 'sr-only')}>
      <ul
        className="grid gap-x-4 gap-y-1.5 text-[12.5px] @min-[340px]:grid-cols-2"
        aria-label="Password requirements"
      >
        {rules.map((r) => (
          <li
            key={r.id}
            className={cn(
              'flex items-center gap-2 transition-colors duration-150',
              r.met ? 'text-fg-muted' : 'text-fg-subtle',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'grid size-4 shrink-0 place-items-center rounded-full transition-colors duration-150',
                r.met ? 'bg-ok/15 text-ok' : 'border border-white/15',
              )}
            >
              {r.met && <Check className="size-2.5" strokeWidth={3} />}
            </span>
            <span>
              {r.label}
              <span className="sr-only">{r.met ? ' (met)' : ' (not met)'}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
