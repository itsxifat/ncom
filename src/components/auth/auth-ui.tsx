'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  CircleAlert,
  CircleCheck,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The pieces every sign-in, sign-up and onboarding screen is built from, so
 * they read as one product: the same field, the same button, the same way of
 * saying something went wrong, and one progress line through the whole
 * signup.
 */

const FIELD =
  'h-12 w-full rounded-xl border border-input bg-card px-4 text-[15px] text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 focus:border-foreground/45 focus:ring-4 focus:ring-foreground/[0.07] aria-invalid:border-destructive dark:bg-input/30 dark:focus:ring-white/[0.06]'

export function AuthHeader({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string
  subtitle?: React.ReactNode
  icon?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="au-rise flex flex-col gap-3">
      {children}
      {icon && (
        <span className="bg-lime text-lime-foreground mb-1 flex size-12 items-center justify-center rounded-2xl">
          {icon}
        </span>
      )}
      <h1 className="font-display text-[clamp(28px,3.4vw,34px)] leading-[1.08] font-semibold tracking-[-0.025em] text-balance">
        {title}
      </h1>
      {subtitle && (
        <p className="text-muted-foreground text-[15px] leading-relaxed text-pretty">
          {subtitle}
        </p>
      )}
    </div>
  )
}

/**
 * "Step 2 of 4 · Confirm your email", over a bar per step. Used from the
 * first sign-up screen to the last onboarding one, so a new seller always
 * knows how much is left.
 */
export function StepIndicator({
  steps,
  current,
  className,
}: {
  steps: readonly string[]
  current: number
  className?: string
}) {
  return (
    <div
      className={cn('flex items-center gap-3', className)}
      aria-label={`Step ${current + 1} of ${steps.length}: ${steps[current]}`}
    >
      <div className="flex gap-1.5" aria-hidden="true">
        {steps.map((step, index) => (
          <span
            key={step}
            className={cn(
              'relative h-1.5 w-7 overflow-hidden rounded-full',
              index < current ? 'bg-foreground' : 'bg-foreground/12'
            )}
          >
            {index === current && (
              <span className="au-fill bg-foreground absolute inset-0 rounded-full" />
            )}
          </span>
        ))}
      </div>
      <span className="text-muted-foreground text-xs font-medium">
        Step {current + 1} of {steps.length}
        <span className="text-foreground/40"> · </span>
        <span className="text-foreground">{steps[current]}</span>
      </span>
    </div>
  )
}

export function Field({
  label,
  htmlFor,
  hint,
  aside,
  children,
}: {
  label: string
  htmlFor: string
  hint?: React.ReactNode
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {hint && <p className="text-muted-foreground text-[13px]">{hint}</p>}
    </div>
  )
}

export function TextInput({
  className,
  ...props
}: React.ComponentProps<'input'>) {
  return <input {...props} className={cn(FIELD, className)} />
}

export function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<'input'>, 'type'>) {
  const [shown, setShown] = useState(false)
  return (
    <div className="relative">
      <input
        {...props}
        type={shown ? 'text' : 'password'}
        className={cn(FIELD, 'pr-12', className)}
      />
      <button
        type="button"
        onClick={() => setShown((value) => !value)}
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-foreground/20 absolute top-1/2 right-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg transition-colors outline-none focus-visible:ring-2"
      >
        {shown ? (
          <EyeOff className="size-[18px]" />
        ) : (
          <Eye className="size-[18px]" />
        )}
      </button>
    </div>
  )
}

const RULES = [
  { label: '8 or more characters', test: (value: string) => value.length >= 8 },
  { label: 'A letter', test: (value: string) => /[a-zA-Z]/.test(value) },
  { label: 'A number', test: (value: string) => /[0-9]/.test(value) },
]

/** The password rule as you type it, instead of an error after submitting. */
export function PasswordRules({ value }: { value: string }) {
  return (
    <ul
      className="flex flex-wrap gap-x-4 gap-y-1.5"
      aria-label="Password needs"
    >
      {RULES.map((rule) => {
        const met = rule.test(value)
        return (
          <li
            key={rule.label}
            className={cn(
              'flex items-center gap-1.5 text-[13px] transition-colors',
              met ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            <span
              className={cn(
                'flex size-4 items-center justify-center rounded-full transition-colors',
                met
                  ? 'bg-emerald-600 text-white dark:bg-emerald-500'
                  : 'border-muted-foreground/40 border'
              )}
            >
              {met && <Check className="size-2.5" strokeWidth={3.5} />}
            </span>
            {rule.label}
            <span className="sr-only">{met ? ' — done' : ' — not yet'}</span>
          </li>
        )
      })}
    </ul>
  )
}

export function passwordMeetsRules(value: string): boolean {
  return RULES.every((rule) => rule.test(value))
}

/**
 * Six boxes for a six-digit code. Typing moves along, Backspace moves back,
 * and pasting the whole code (or the phone filling it in from the email)
 * fills every box. The joined value travels in a hidden input, and
 * `onComplete` fires once all six are in, so the form can submit itself.
 */
export function CodeInput({
  id,
  name,
  length = 6,
  disabled,
  invalid,
  onChange,
  onComplete,
}: {
  /** Given to the first box, for a label to point at. */
  id?: string
  name: string
  length?: number
  disabled?: boolean
  invalid?: boolean
  onChange?: (code: string) => void
  onComplete?: (code: string) => void
}) {
  const [digits, setDigits] = useState<string[]>(() => Array(length).fill(''))
  const boxes = useRef<(HTMLInputElement | null)[]>([])
  const completed = useRef('')
  const value = digits.join('')

  useEffect(() => {
    boxes.current[0]?.focus()
  }, [])

  useEffect(() => {
    onChange?.(value)
  }, [value, onChange])

  useEffect(() => {
    if (value.length === length && value !== completed.current) {
      completed.current = value
      onComplete?.(value)
    }
  }, [value, length, onComplete])

  function fill(from: number, text: string) {
    const incoming = text.replace(/\D/g, '').slice(0, length - from)
    if (!incoming) return
    setDigits((current) => {
      const next = [...current]
      incoming.split('').forEach((digit, offset) => {
        next[from + offset] = digit
      })
      return next
    })
    const target = Math.min(from + incoming.length, length - 1)
    boxes.current[target]?.focus()
  }

  function clear(index: number) {
    setDigits((current) => {
      const next = [...current]
      next[index] = ''
      return next
    })
  }

  return (
    <div className="flex justify-between gap-2 sm:gap-2.5">
      <input type="hidden" name={name} value={value} />
      {digits.map((digit, index) => (
        <input
          key={index}
          id={index === 0 ? id : undefined}
          ref={(element) => {
            boxes.current[index] = element
          }}
          value={digit}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-label={`Digit ${index + 1} of ${length}`}
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          // The first box takes the whole code, so a phone's "from Messages /
          // Mail" suggestion lands in one go.
          maxLength={index === 0 ? length : 1}
          onChange={(event) => {
            const text = event.target.value
            if (text === '') return clear(index)
            fill(index, text.length > 1 ? text : text.slice(-1))
          }}
          onPaste={(event) => {
            event.preventDefault()
            fill(index, event.clipboardData.getData('text'))
          }}
          onKeyDown={(event) => {
            if (event.key === 'Backspace' && !digits[index] && index > 0) {
              event.preventDefault()
              clear(index - 1)
              boxes.current[index - 1]?.focus()
            } else if (event.key === 'ArrowLeft' && index > 0) {
              boxes.current[index - 1]?.focus()
            } else if (event.key === 'ArrowRight' && index < length - 1) {
              boxes.current[index + 1]?.focus()
            }
          }}
          onFocus={(event) => event.target.select()}
          className={cn(
            'border-input bg-card text-foreground h-14 w-full min-w-0 rounded-xl border text-center font-mono text-2xl font-semibold tabular-nums transition-[border-color,box-shadow] outline-none sm:h-16',
            'focus:border-foreground/50 focus:ring-foreground/[0.07] dark:bg-input/30 focus:ring-4 dark:focus:ring-white/[0.06]',
            digit && 'border-foreground/30',
            invalid && 'border-destructive'
          )}
        />
      ))}
    </div>
  )
}

export function FormAlert({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'success'
  children: React.ReactNode
}) {
  const Icon = tone === 'error' ? CircleAlert : CircleCheck
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'au-rise flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm',
        tone === 'error'
          ? 'border-destructive/25 bg-destructive/[0.06] text-destructive'
          : 'border-emerald-600/25 bg-emerald-600/[0.07] text-emerald-700 dark:text-emerald-400'
      )}
    >
      <Icon className="mt-px size-4 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

export function SubmitButton({
  pending,
  pendingLabel,
  disabled,
  children,
  className,
}: {
  pending?: boolean
  pendingLabel?: string
  disabled?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={cn(
        'group bg-primary text-primary-foreground hover:bg-ink-raised dark:hover:bg-primary/85 focus-visible:ring-foreground/25 relative flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition-[background-color,transform,opacity] outline-none focus-visible:ring-4 active:translate-y-px disabled:pointer-events-none disabled:opacity-55',
        className
      )}
    >
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          {pendingLabel ?? children}
        </>
      ) : (
        <>
          {children}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </>
      )}
    </button>
  )
}

/** "or continue with email" between Google and the form. */
export function OrDivider({ label = 'or continue with email' }) {
  return (
    <div className="flex items-center gap-3">
      <span className="bg-border h-px flex-1" />
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      <span className="bg-border h-px flex-1" />
    </div>
  )
}
