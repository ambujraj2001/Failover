import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { AuthLayout, AuthLink } from '@/components/auth/AuthLayout'
import { Field, FormAlert, PasswordInput } from '@/components/auth/fields'
import {
  describedBy,
  browserTimezone,
  errorCode,
  errorMessage,
  fieldErrors,
  useFinishAuth,
} from '@/components/auth/helpers'
import { passwordProblem } from '@/components/auth/password'
import { PasswordStrength } from '@/components/auth/PasswordStrength'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/primitives'
import { api } from '@/lib/api'
import type { AuthResponse } from '@/lib/types'

const schema = z
  .object({
    name: z.string().trim().min(1, 'Enter your name.').max(80, 'Use at most 80 characters.'),
    email: z
      .string()
      .trim()
      .min(1, 'Enter your email address.')
      .pipe(z.email('Enter a valid email address.')),
    password: z.string().min(1, 'Choose a password.'),
  })
  .superRefine((v, ctx) => {
    const problem = v.password ? passwordProblem(v.password, v.email) : null
    if (problem) ctx.addIssue({ code: 'custom', path: ['password'], message: problem })
  })
type Values = z.infer<typeof schema>

export default function SignUp() {
  const finish = useFinishAuth()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', password: '' },
  })
  const [password, email] = useWatch({ control, name: ['password', 'email'] })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      const data = await api<AuthResponse>('/auth/register', {
        method: 'POST',
        auth: false,
        body: { ...values, timezone: browserTimezone() },
      })
      finish(data, '/welcome')
    } catch (err) {
      const code = errorCode(err)
      if (code === 'email_taken') {
        setError(
          'email',
          { type: 'email_taken', message: 'An account with this email already exists.' },
          { shouldFocus: true },
        )
        return
      }
      const fe = fieldErrors(err)
      let mapped = false
      for (const key of ['name', 'email', 'password'] as const) {
        if (fe[key]) {
          setError(key, { message: fe[key] }, { shouldFocus: !mapped })
          mapped = true
        }
      }
      if (!mapped) setFormError(errorMessage(err))
    }
  })

  const emailError =
    errors.email?.type === 'email_taken' ? (
      <>
        {errors.email.message} <AuthLink to="/signin">Sign in instead</AuthLink>
      </>
    ) : (
      errors.email?.message
    )

  return (
    <AuthLayout
      docTitle="Create account"
      title="Create your account"
      description="Free to start. Your progress is saved as you learn."
      footer={
        <>
          Already have an account? <AuthLink to="/signin">Sign in</AuthLink>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5" aria-label="Create account">
        {formError && <FormAlert title={formError} />}

        <Field id="name" label="Name" error={errors.name?.message}>
          <Input
            id="name"
            autoComplete="name"
            autoFocus
            maxLength={80}
            placeholder="Your name"
            invalid={!!errors.name}
            aria-describedby={describedBy('name', { error: errors.name })}
            {...register('name')}
          />
        </Field>

        <Field id="email" label="Email" error={emailError}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            invalid={!!errors.email}
            aria-describedby={describedBy('email', { error: errors.email })}
            {...register('email')}
          />
        </Field>

        <Field id="password" label="Password" error={errors.password?.message}>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            maxLength={128}
            invalid={!!errors.password}
            aria-describedby={describedBy('password', { error: errors.password, extra: 'password-rules' })}
            {...register('password')}
          />
          <PasswordStrength id="password-rules" password={password ?? ''} email={email} />
        </Field>

        <Button type="submit" className="h-10 w-full text-[14px]" loading={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>

        <p className="text-fg-subtle text-center text-[12.5px] leading-relaxed">
          By continuing you agree to the Terms of Service and Privacy Policy.
        </p>
      </form>
    </AuthLayout>
  )
}
