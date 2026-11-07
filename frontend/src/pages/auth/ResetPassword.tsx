import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { AuthLayout, AuthLink } from '@/components/auth/AuthLayout'
import { Field, FormAlert, PasswordInput } from '@/components/auth/fields'
import { describedBy, errorCode, errorMessage, fieldErrors } from '@/components/auth/helpers'
import { passwordProblem } from '@/components/auth/password'
import { PasswordStrength } from '@/components/auth/PasswordStrength'
import { Button, buttonVariants } from '@/components/ui/button'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

const schema = z
  .object({
    password: z.string().min(1, 'Choose a new password.'),
    confirm: z.string().min(1, 'Confirm your new password.'),
  })
  .superRefine((v, ctx) => {
    const problem = v.password ? passwordProblem(v.password) : null
    if (problem) ctx.addIssue({ code: 'custom', path: ['password'], message: problem })
    if (v.confirm && v.password !== v.confirm) {
      ctx.addIssue({ code: 'custom', path: ['confirm'], message: 'Passwords don’t match.' })
    }
  })
type Values = z.infer<typeof schema>

const backLink = (
  <Link
    to="/signin"
    className="text-fg-muted hover:text-fg inline-flex items-center gap-1.5 rounded-sm transition-colors duration-150"
  >
    <ArrowLeft className="size-4" aria-hidden="true" />
    Back to sign in
  </Link>
)

function InvalidLink({ reason }: { reason: string }) {
  return (
    <AuthLayout
      docTitle="Reset link invalid"
      title="This link doesn’t work"
      description={<p role="alert">{reason}</p>}
      footer={backLink}
    >
      <Link to="/forgot-password" className={cn(buttonVariants(), 'h-10 w-full text-[14px]')}>
        Request a new link
      </Link>
    </AuthLayout>
  )
}

export default function ResetPassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token')?.trim() ?? ''
  const [formError, setFormError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: '', confirm: '' } })
  const password = useWatch({ control, name: 'password' })

  if (!token || token.length < 20) {
    return (
      <InvalidLink reason="Open the reset link exactly as it appears in your email, or ask for a new one." />
    )
  }
  if (expired) {
    return <InvalidLink reason="This reset link has expired or was already used. Each link works once." />
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await api('/auth/reset-password', {
        method: 'POST',
        auth: false,
        body: { token, password: values.password },
      })
      toast.success('Password updated', { description: 'Sign in with your new password.' })
      navigate('/signin', { replace: true })
    } catch (err) {
      const code = errorCode(err)
      if (code === 'invalid_reset_token') {
        setExpired(true)
        return
      }
      const fe = fieldErrors(err)
      if (fe.password) setError('password', { message: fe.password }, { shouldFocus: true })
      else if (fe.token) setExpired(true)
      else setFormError(errorMessage(err))
    }
  })

  return (
    <AuthLayout
      docTitle="Choose a new password"
      title="Choose a new password"
      description="You’ll be signed out on your other devices once it’s saved."
      footer={
        <>
          Link not working? <AuthLink to="/forgot-password">Get a new one</AuthLink>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5" aria-label="Choose a new password">
        {formError && <FormAlert title={formError} />}

        <Field id="password" label="New password" error={errors.password?.message}>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            autoFocus
            maxLength={128}
            invalid={!!errors.password}
            aria-describedby={describedBy('password', { error: errors.password, extra: 'password-rules' })}
            {...register('password')}
          />
          <PasswordStrength id="password-rules" password={password ?? ''} />
        </Field>

        <Field id="confirm" label="Confirm new password" error={errors.confirm?.message}>
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            maxLength={128}
            invalid={!!errors.confirm}
            aria-describedby={describedBy('confirm', { error: errors.confirm })}
            {...register('confirm')}
          />
        </Field>

        <Button type="submit" className="h-10 w-full text-[14px]" loading={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save new password'}
        </Button>
      </form>
    </AuthLayout>
  )
}
