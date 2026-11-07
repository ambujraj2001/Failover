import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { Field, FormAlert, NativeSelect, PasswordInput } from '@/components/auth/fields'
import { describedBy, browserTimezone, errorCode, errorMessage, fieldErrors } from '@/components/auth/helpers'
import { DEFAULT_PATH_LABEL, LEVEL_OPTIONS, TARGET_OPTIONS, type Track } from '@/components/auth/options'
import { passwordProblem } from '@/components/auth/password'
import { PasswordStrength } from '@/components/auth/PasswordStrength'
import { PageContainer } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input, PageHeader, Switch } from '@/components/ui/primitives'
import { applySession, setUser, useSignOut } from '@/hooks/useSession'
import { api, setAccessToken } from '@/lib/api'
import type { AuthResponse, Level, Target, User } from '@/lib/types'
import { BRAND, cn } from '@/lib/utils'
import { useAuth } from '@/stores/auth'

export default function Settings() {
  const user = useAuth((s) => s.user)

  useEffect(() => {
    document.title = `Settings · ${BRAND.name}`
  }, [])

  if (!user) return null

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Settings" description="Manage your profile, how you learn and your account." />
      <div className="space-y-6">
        <ProfileSection user={user} />
        <LearningSection user={user} />
        <PasswordSection user={user} />
        <DangerSection />
      </div>
    </PageContainer>
  )
}

// ---- layout -------------------------------------------------------------------------------------

/** One settings card: a title, a one-line description, then the controls. */
function Section({
  id,
  title,
  description,
  children,
  tone,
}: {
  id: string
  title: string
  description?: ReactNode
  children: ReactNode
  tone?: 'danger'
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="card p-6 sm:p-8">
      <h2
        id={`${id}-title`}
        className={cn('text-[17px] tracking-[-0.02em]', tone === 'danger' && 'text-crit')}
      >
        {title}
      </h2>
      {description && <p className="text-fg-muted mt-1.5 text-[14.5px] leading-relaxed">{description}</p>}
      <div className="mt-7">{children}</div>
    </section>
  )
}

/**
 * Right-aligned save button, enabled only when something changed. It turns white while there are
 * unsaved changes, so at rest no settings card shows a primary button.
 */
function SaveRow({ dirty, pending, label }: { dirty: boolean; pending: boolean; label: string }) {
  return (
    <div className="mt-7 flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
      {dirty && !pending && <span className="text-fg-subtle text-[13px]">Unsaved changes</span>}
      <Button
        type="submit"
        variant={dirty || pending ? 'primary' : 'secondary'}
        loading={pending}
        disabled={!dirty}
      >
        {label}
      </Button>
    </div>
  )
}

/** Title and one line on the left, an action on the right (stacks on small screens). */
function ActionRow({
  title,
  description,
  children,
}: {
  title: string
  description: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="min-w-0">
        <h3 className="text-fg text-[14.5px] font-medium">{title}</h3>
        <p className="text-fg-muted mt-1 text-[14px] leading-snug">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/** Returns the patched user and keeps the store and cached queries in sync. */
function usePatchMe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: object) => api<User>('/me', { method: 'PATCH', body }),
    onSuccess: (u) => {
      setUser(u)
      qc.invalidateQueries()
    },
  })
}

// ---- profile ------------------------------------------------------------------------------------

const profileSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(80, 'Use at most 80 characters.'),
  timezone: z.string().min(1),
})
type ProfileValues = z.infer<typeof profileSchema>

function timezoneOptions(current: string): string[] {
  let zones: string[] = []
  try {
    zones = Intl.supportedValuesOf('timeZone')
  } catch {
    /* older browsers */
  }
  const extra = [current, browserTimezone(), 'UTC'].filter((z): z is string => !!z && !zones.includes(z))
  return [...extra, ...zones]
}

function ProfileSection({ user }: { user: User }) {
  const patch = usePatchMe()
  const zones = useMemo(() => timezoneOptions(user.timezone), [user.timezone])
  const detected = browserTimezone()
  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    control,
    formState: { errors, isDirty },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user.name, timezone: user.timezone },
  })
  const tz = useWatch({ control, name: 'timezone' })

  const onSubmit = handleSubmit((values) =>
    patch.mutate(values, {
      onSuccess: (u) => {
        reset({ name: u.name, timezone: u.timezone })
        toast.success('Profile saved')
      },
      onError: (err) => {
        const fe = fieldErrors(err)
        if (fe.name) setError('name', { message: fe.name })
        if (fe.timezone) setError('timezone', { message: fe.timezone })
      },
    }),
  )
  const showError = patch.isError && !Object.keys(fieldErrors(patch.error)).length

  return (
    <Section
      id="profile"
      title="Profile"
      description="How you appear in Failover, and the time zone your day follows."
    >
      <form onSubmit={onSubmit} noValidate aria-labelledby="profile-title" className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="profile-name" label="Name" error={errors.name?.message}>
            <Input
              id="profile-name"
              autoComplete="name"
              maxLength={80}
              invalid={!!errors.name}
              aria-describedby={describedBy('profile-name', { error: errors.name })}
              {...register('name')}
            />
          </Field>
          <Field id="profile-email" label="Email" hint="Email can’t be changed yet.">
            <Input
              id="profile-email"
              type="email"
              value={user.email}
              readOnly
              aria-readonly="true"
              aria-describedby="profile-email-hint"
              className="text-fg-muted cursor-default border-white/[0.06] bg-transparent hover:border-white/[0.06] focus:border-white/[0.06] focus:bg-transparent"
            />
          </Field>
        </div>
        <Field
          id="profile-tz"
          label="Time zone"
          error={errors.timezone?.message}
          hint="Your day and streak roll over at midnight here."
          aside={
            detected && detected !== tz ? (
              <button
                type="button"
                onClick={() => setValue('timezone', detected, { shouldDirty: true })}
                className="text-fg-subtle hover:text-fg hover:decoration-fg rounded-sm text-[13px] underline decoration-white/20 underline-offset-4 transition-colors"
              >
                Use {detected}
              </button>
            ) : null
          }
        >
          <NativeSelect
            id="profile-tz"
            invalid={!!errors.timezone}
            aria-describedby={describedBy('profile-tz', { error: errors.timezone, hint: !errors.timezone })}
            {...register('timezone')}
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, ' ')}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {showError && <FormAlert title="Couldn’t save your profile.">{errorMessage(patch.error)}</FormAlert>}
        <SaveRow dirty={isDirty} pending={patch.isPending} label="Save profile" />
      </form>
    </Section>
  )
}

// ---- learning -----------------------------------------------------------------------------------

interface LearningValues {
  level: Level
  target_level: Target
  track: string
  free_roam: boolean
}

function LearningSection({ user }: { user: User }) {
  const patch = usePatchMe()
  const tracks = useQuery({
    queryKey: ['tracks'],
    queryFn: ({ signal }) => api<Track[]>('/tracks', { signal }),
    staleTime: 5 * 60_000,
  })
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { isDirty },
  } = useForm<LearningValues>({
    defaultValues: {
      level: user.level,
      target_level: user.target_level,
      track: user.track ?? 'none',
      free_roam: user.free_roam,
    },
  })
  const [level, target] = useWatch({ control, name: ['level', 'target_level'] })

  const onSubmit = handleSubmit((values) =>
    patch.mutate(values, {
      onSuccess: (u) => {
        reset({
          level: u.level,
          target_level: u.target_level,
          track: u.track ?? 'none',
          free_roam: u.free_roam,
        })
        toast.success('Learning preferences saved')
      },
    }),
  )

  const levelHint = LEVEL_OPTIONS.find((o) => o.value === level)?.description
  const targetHint = TARGET_OPTIONS.find((o) => o.value === target)?.description
  const knownTrack = !user.track || tracks.data?.some((t) => t.slug === user.track)

  return (
    <Section
      id="learning"
      title="Learning"
      description="Pick how deep you want explanations to go and what level you’re aiming for."
    >
      <form onSubmit={onSubmit} noValidate aria-labelledby="learning-title" className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="learning-level" label="Experience level" hint={levelHint}>
            <NativeSelect id="learning-level" aria-describedby="learning-level-hint" {...register('level')}>
              {LEVEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="learning-target" label="Target level" hint={targetHint}>
            <NativeSelect
              id="learning-target"
              aria-describedby="learning-target-hint"
              {...register('target_level')}
            >
              {TARGET_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <Field
          id="learning-track"
          label="Study plan"
          hint={
            tracks.isError
              ? 'Couldn’t load study plans. Your current plan is kept.'
              : 'Company plans reorder labs around one company’s interviews.'
          }
        >
          <NativeSelect
            id="learning-track"
            aria-describedby="learning-track-hint"
            disabled={tracks.isPending}
            {...register('track')}
          >
            <option value="none">{DEFAULT_PATH_LABEL} (default)</option>
            {!knownTrack && user.track && <option value={user.track}>{user.track}</option>}
            {tracks.data?.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name} · {t.weeks} weeks
              </option>
            ))}
          </NativeSelect>
        </Field>

        <div className="flex items-start justify-between gap-6 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <label htmlFor="learning-free-roam" className="text-fg text-[14.5px] font-medium">
              Free roam
            </label>
            <p id="learning-free-roam-desc" className="text-fg-muted mt-1 text-[13.5px] leading-snug">
              Open every lesson and lab without passing checkpoints first. Progress and streaks still count.
            </p>
          </div>
          <Controller
            control={control}
            name="free_roam"
            render={({ field }) => (
              <span className="pt-0.5">
                <Switch id="learning-free-roam" checked={field.value} onCheckedChange={field.onChange} />
              </span>
            )}
          />
        </div>

        {patch.isError && (
          <FormAlert title="Couldn’t save your preferences.">{errorMessage(patch.error)}</FormAlert>
        )}
        <SaveRow dirty={isDirty} pending={patch.isPending} label="Save preferences" />
      </form>
    </Section>
  )
}

// ---- password -----------------------------------------------------------------------------------

function PasswordSection({ user }: { user: User }) {
  const [formError, setFormError] = useState<string | null>(null)
  const schema = useMemo(
    () =>
      z
        .object({
          current_password: z.string().min(1, 'Enter your current password.'),
          new_password: z.string().min(1, 'Choose a new password.'),
        })
        .superRefine((v, ctx) => {
          const problem = v.new_password ? passwordProblem(v.new_password, user.email) : null
          if (problem) ctx.addIssue({ code: 'custom', path: ['new_password'], message: problem })
          else if (v.new_password && v.new_password === v.current_password) {
            ctx.addIssue({
              code: 'custom',
              path: ['new_password'],
              message: 'Choose a password you haven’t used here before.',
            })
          }
        }),
    [user.email],
  )
  type Values = z.infer<typeof schema>
  const {
    register,
    handleSubmit,
    reset,
    setError,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { current_password: '', new_password: '' },
  })
  const newPassword = useWatch({ control, name: 'new_password' })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      const data = await api<AuthResponse>('/auth/change-password', { method: 'POST', body: values })
      applySession(data)
      reset({ current_password: '', new_password: '' })
      toast.success('Password changed', { description: 'Other devices have been signed out.' })
    } catch (err) {
      const code = errorCode(err)
      const fe = fieldErrors(err)
      if (code === 'invalid_credentials') {
        setError(
          'current_password',
          { message: 'Your current password is incorrect.' },
          { shouldFocus: true },
        )
      } else if (code === 'same_password') {
        setError('new_password', { message: errorMessage(err) }, { shouldFocus: true })
      } else if (fe.password || fe.new_password) {
        setError('new_password', { message: fe.password ?? fe.new_password }, { shouldFocus: true })
      } else {
        setFormError(errorMessage(err))
      }
    }
  })

  return (
    <Section
      id="password"
      title="Password"
      description="Changing it signs you out on your other devices. You stay signed in here."
    >
      <form onSubmit={onSubmit} noValidate aria-labelledby="password-title" className="space-y-5">
        {/* lets password managers attach the new password to the right account */}
        <input type="email" name="username" autoComplete="username" value={user.email} readOnly hidden />

        {formError && <FormAlert title={formError} />}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="current-password" label="Current password" error={errors.current_password?.message}>
            <PasswordInput
              id="current-password"
              autoComplete="current-password"
              invalid={!!errors.current_password}
              aria-describedby={describedBy('current-password', { error: errors.current_password })}
              {...register('current_password')}
            />
          </Field>
          <Field id="new-password" label="New password" error={errors.new_password?.message}>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              maxLength={128}
              invalid={!!errors.new_password}
              aria-describedby={describedBy('new-password', {
                error: errors.new_password,
                extra: 'new-password-rules',
              })}
              {...register('new_password')}
            />
            <PasswordStrength id="new-password-rules" password={newPassword ?? ''} email={user.email} />
          </Field>
        </div>
        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            variant={isDirty || isSubmitting ? 'primary' : 'secondary'}
            loading={isSubmitting}
            disabled={!isDirty}
          >
            Update password
          </Button>
        </div>
      </form>

      <div className="mt-8 border-t border-white/[0.06] pt-7">
        <SignOutEverywhere />
      </div>
    </Section>
  )
}

// ---- sessions -----------------------------------------------------------------------------------

function SignOutEverywhere() {
  const signOut = useSignOut()
  const [open, setOpen] = useState(false)
  const logoutAll = useMutation({
    mutationFn: () => api('/auth/logout-all', { method: 'POST' }),
    onSuccess: async () => {
      toast.success('Signed out on every device')
      setOpen(false)
      await signOut()
    },
  })

  return (
    <>
      <ActionRow
        title="Sign out everywhere"
        description="Ends every session, this one included. Handy after using a shared or lost device."
      >
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Sign out of all devices
        </Button>
      </ActionRow>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (logoutAll.isPending) return
          setOpen(v)
          if (!v) logoutAll.reset()
        }}
        title="Sign out of all devices?"
        description="You’ll be signed out here too and will need to sign in again."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={logoutAll.isPending}>
              Cancel
            </Button>
            <Button onClick={() => logoutAll.mutate()} loading={logoutAll.isPending}>
              Sign out everywhere
            </Button>
          </>
        }
      >
        {logoutAll.isError && <FormAlert title={errorMessage(logoutAll.error)} />}
      </Dialog>
    </>
  )
}

// ---- danger zone --------------------------------------------------------------------------------

function DangerSection() {
  const [open, setOpen] = useState(false)
  return (
    <Section
      id="danger"
      title="Danger zone"
      tone="danger"
      description="Changes here are permanent and can’t be undone."
    >
      <ActionRow
        title="Delete account"
        description="Removes your account, progress, labs and interview history for good."
      >
        <Button variant="danger" onClick={() => setOpen(true)}>
          Delete account
        </Button>
      </ActionRow>
      <DeleteAccountDialog open={open} onOpenChange={setOpen} />
    </Section>
  )
}

const deleteSchema = z.object({ password: z.string().min(1, 'Enter your password to confirm.') })
type DeleteValues = z.infer<typeof deleteSchema>

function DeleteAccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DeleteValues>({ resolver: zodResolver(deleteSchema), defaultValues: { password: '' } })

  const close = (v: boolean) => {
    if (isSubmitting) return
    onOpenChange(v)
    if (!v) {
      reset({ password: '' })
      setFormError(null)
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await api('/auth/account', { method: 'DELETE', body: values })
    } catch (err) {
      if (errorCode(err) === 'invalid_credentials') {
        setError('password', { message: 'Password is incorrect.' }, { shouldFocus: true })
      } else {
        setFormError(errorMessage(err))
      }
      return
    }
    toast.success('Your account has been deleted')
    // leave the guarded app first so the auth guard doesn't bounce us to /signin, then drop the session
    await navigate('/', { replace: true, flushSync: true })
    setAccessToken(null)
    useAuth.getState().clear()
    qc.clear()
  })

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Delete your account?"
      description="This can’t be undone. Your progress, labs and interview history will be removed."
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="delete-account-form" variant="danger" loading={isSubmitting}>
            Delete account
          </Button>
        </>
      }
    >
      <form id="delete-account-form" onSubmit={onSubmit} noValidate className="space-y-3">
        {formError && <FormAlert title={formError} />}
        <Field id="delete-password" label="Enter your password to confirm" error={errors.password?.message}>
          <PasswordInput
            id="delete-password"
            autoComplete="current-password"
            autoFocus
            invalid={!!errors.password}
            aria-describedby={describedBy('delete-password', { error: errors.password })}
            {...register('password')}
          />
        </Field>
      </form>
    </Dialog>
  )
}
