import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { Field, FormAlert } from '@/components/auth/fields'
import { describedBy, errorCode, errorMessage, fieldErrors } from '@/components/auth/helpers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/primitives'
import { api } from '@/lib/api'

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email address.').pipe(z.email('Enter a valid email address.')),
})
type Values = z.infer<typeof schema>

interface ForgotResponse {
  message: string
  data?: { dev_reset_link?: string } | null
}

const SUCCESS = 'If there’s an account for that email, we’ve sent it a link to reset your password.'

const back = (
  <Link
    to="/signin"
    className="text-fg-muted hover:text-fg inline-flex items-center gap-1.5 rounded-sm transition-colors duration-150"
  >
    <ArrowLeft className="size-4" aria-hidden="true" />
    Back to sign in
  </Link>
)

export default function ForgotPassword() {
  const [sent, setSent] = useState<{ devLink?: string } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '' } })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      const res = await api<ForgotResponse>('/auth/forgot-password', {
        method: 'POST',
        body: values,
        auth: false,
      })
      const link = res.data?.dev_reset_link
      setSent({ devLink: typeof link === 'string' ? link : undefined })
    } catch (err) {
      const fe = fieldErrors(err)
      if (fe.email) setError('email', { message: fe.email })
      else if (errorCode(err) === 'rate_limited')
        setFormError('Too many reset requests. Wait a few minutes and try again.')
      else setFormError(errorMessage(err))
    }
  })

  if (sent) {
    return (
      <AuthLayout
        docTitle="Check your email"
        title="Check your email"
        description={<p role="status">{SUCCESS}</p>}
        footer={back}
      >
        <div className="space-y-5">
          {sent.devLink && (
            <div className="border-warn/20 bg-warn/[0.05] rounded-xl border p-4">
              <p className="text-warn flex items-center gap-2 text-[13px] font-medium">
                <span className="bg-warn size-1.5 rounded-full" aria-hidden="true" />
                Development only
              </p>
              <p className="text-fg-muted mt-1.5 text-[13px] leading-snug">
                Email isn’t set up here, so the link is shown instead. Production never shows it.
              </p>
              <a
                href={sent.devLink}
                className="text-fg hover:decoration-fg mt-3 inline-block rounded-sm text-[13.5px] font-medium underline decoration-white/20 underline-offset-4"
              >
                Development: open reset link
              </a>
            </div>
          )}

          <p className="text-fg-subtle text-[13.5px] leading-relaxed">
            Nothing after a few minutes? Check your spam folder, or{' '}
            <button
              type="button"
              onClick={() => setSent(null)}
              className="text-fg-muted hover:text-fg hover:decoration-fg rounded-sm underline decoration-white/20 underline-offset-4 transition-colors"
            >
              try a different email
            </button>
            .
          </p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      docTitle="Reset password"
      title="Forgot your password?"
      description="Enter your email and we’ll send you a link to set a new one."
      footer={back}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5" aria-label="Request password reset">
        {formError && <FormAlert title={formError} />}
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
        <Button type="submit" className="h-10 w-full text-[14px]" loading={isSubmitting}>
          {isSubmitting ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
    </AuthLayout>
  )
}
