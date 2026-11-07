import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { AuthLayout, AuthLink } from '@/components/auth/AuthLayout'
import { Field, FormAlert, PasswordInput } from '@/components/auth/fields'
import { describedBy, errorCode, errorMessage, fieldErrors, useFinishAuth } from '@/components/auth/helpers'
import { safeNext } from '@/components/layout/guards'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/primitives'
import { api } from '@/lib/api'
import type { AuthResponse } from '@/lib/types'

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email address.').pipe(z.email('Enter a valid email address.')),
  password: z.string().min(1, 'Enter your password.'),
})
type Values = z.infer<typeof schema>

export default function SignIn() {
  const [params] = useSearchParams()
  const finish = useFinishAuth()
  const [formError, setFormError] = useState<{ title: string; body?: string; locked?: boolean } | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      const data = await api<AuthResponse>('/auth/login', { method: 'POST', body: values, auth: false })
      finish(data, safeNext(params.get('next')))
    } catch (err) {
      const code = errorCode(err)
      if (code === 'invalid_credentials') {
        setFormError({ title: 'Incorrect email or password.' })
        resetField('password')
        setFocus('password')
      } else if (code === 'account_locked') {
        setFormError({ title: 'Sign-in is temporarily locked.', body: errorMessage(err), locked: true })
      } else if (code === 'rate_limited') {
        setFormError({ title: 'Too many attempts.', body: 'Wait a few minutes before trying again.' })
      } else if (code === 'network') {
        setFormError({ title: 'Can’t reach Failover right now.', body: errorMessage(err) })
      } else {
        const fe = fieldErrors(err)
        if (fe.email) setError('email', { message: fe.email })
        if (fe.password) setError('password', { message: fe.password })
        if (!fe.email && !fe.password) setFormError({ title: errorMessage(err) })
      }
    }
  })

  return (
    <AuthLayout
      docTitle="Sign in"
      title="Welcome back"
      description="Sign in to pick up where you left off."
      footer={
        <>
          New to Failover? <AuthLink to="/signup">Create an account</AuthLink>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5" aria-label="Sign in">
        {formError && (
          <FormAlert title={formError.title}>
            {(formError.body || formError.locked) && (
              <>
                {formError.body}
                {formError.locked && (
                  <>
                    {' '}
                    <AuthLink to="/forgot-password">Reset your password</AuthLink>
                  </>
                )}
              </>
            )}
          </FormAlert>
        )}

        <Field id="email" label="Email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            placeholder="you@example.com"
            invalid={!!errors.email}
            aria-describedby={describedBy('email', { error: errors.email })}
            {...register('email')}
          />
        </Field>

        <Field
          id="password"
          label="Password"
          error={errors.password?.message}
          aside={
            <Link
              to="/forgot-password"
              className="text-fg-subtle hover:text-fg rounded-sm text-[13px] transition-colors duration-150"
            >
              Forgot password?
            </Link>
          }
        >
          <PasswordInput
            id="password"
            autoComplete="current-password"
            invalid={!!errors.password}
            aria-describedby={describedBy('password', { error: errors.password })}
            {...register('password')}
          />
        </Field>

        <Button type="submit" className="h-10 w-full text-[14px]" loading={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  )
}
