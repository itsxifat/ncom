'use client'

import { useActionState, useEffect, useTransition } from 'react'
import { Loader2, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  loginAction,
  logoutAction,
  registerAction,
  type AccountFormState,
} from './account-actions'
import { fieldLabel, headingFont, muted, primaryButton, textField } from './ui'
import { useStoreText } from './StoreTextProvider'

/**
 * Sign in and create-account forms for a store's shoppers.
 *
 * Plain forms posting to server actions, so they work before the page's
 * scripts arrive; the redirect afterwards is a full page load, because the
 * header's account icon and the account page are server-rendered from the
 * session cookie that was just set.
 */
function useRedirect(state: AccountFormState) {
  useEffect(() => {
    if (state?.ok && state.redirect) window.location.href = state.redirect
  }, [state])
}

export function LoginForm({
  next,
  registerHref,
}: {
  next: string
  registerHref: string
}) {
  const [state, action, pending] = useActionState(loginAction, undefined)
  const { words } = useStoreText()
  useRedirect(state)

  return (
    <AccountCard title={words.signIn} subtitle={words.signInSubtitle}>
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        <LabeledInput
          name="email"
          type="email"
          label={words.email}
          autoComplete="email"
        />
        <LabeledInput
          name="password"
          type="password"
          label={words.password}
          autoComplete="current-password"
        />
        {state?.error && (
          <p role="alert" className="text-sm font-medium text-red-600">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending || state?.ok}
          className={cn(primaryButton, 'w-full')}
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {words.signIn}
        </button>
      </form>
      <p className={cn('text-center text-sm', muted)}>
        {words.newHere}{' '}
        <a
          href={registerHref}
          className="font-semibold text-[var(--page-text)] underline-offset-4 hover:underline"
        >
          {words.createAnAccount}
        </a>
      </p>
    </AccountCard>
  )
}

export function RegisterForm({
  next,
  loginHref,
}: {
  next: string
  loginHref: string
}) {
  const [state, action, pending] = useActionState(registerAction, undefined)
  const { words } = useStoreText()
  useRedirect(state)

  return (
    <AccountCard
      title={words.createYourAccount}
      subtitle={words.createAccountSubtitle}
    >
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        <LabeledInput name="name" label={words.fullName} autoComplete="name" />
        <LabeledInput
          name="email"
          type="email"
          label={words.email}
          autoComplete="email"
        />
        <LabeledInput
          name="phone"
          type="tel"
          label={words.mobileOptional}
          autoComplete="tel"
          required={false}
        />
        <LabeledInput
          name="password"
          type="password"
          label={words.password}
          autoComplete="new-password"
          hint={words.passwordHint}
        />
        {state?.error && (
          <p role="alert" className="text-sm font-medium text-red-600">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending || state?.ok}
          className={cn(primaryButton, 'w-full')}
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {words.createAccount}
        </button>
      </form>
      <p className={cn('text-center text-sm', muted)}>
        {words.alreadyHaveAccount}{' '}
        <a
          href={loginHref}
          className="font-semibold text-[var(--page-text)] underline-offset-4 hover:underline"
        >
          {words.signIn}
        </a>
      </p>
    </AccountCard>
  )
}

export function LogoutButton() {
  const [pending, startTransition] = useTransition()
  const { words } = useStoreText()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await logoutAction()
          window.location.href = result.redirect
        })
      }
      className={cn(
        'inline-flex items-center gap-2 text-sm font-medium underline-offset-4 hover:underline',
        muted
      )}
    >
      <LogOut className="size-4" />
      {words.signOut}
    </button>
  )
}

function AccountCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-5 py-14">
      <div className="flex flex-col gap-1.5 text-center">
        <h1
          className={cn('text-3xl font-semibold tracking-tight', headingFont)}
        >
          {title}
        </h1>
        <p className={muted}>{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

function LabeledInput({
  name,
  label,
  type = 'text',
  autoComplete,
  hint,
  required = true,
}: {
  name: string
  label: string
  type?: string
  autoComplete?: string
  hint?: string
  required?: boolean
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={fieldLabel}>{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        className={textField}
      />
      {hint && <span className={cn('text-xs', muted)}>{hint}</span>}
    </label>
  )
}
