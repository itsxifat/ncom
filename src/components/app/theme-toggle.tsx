'use client'

import { useSyncExternalStore } from 'react'
import { useTheme } from 'next-themes'
import { Monitor, Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const

// Never fires, because the answer only changes once and React already
// re-renders at that moment: `getServerSnapshot` is what the server and the
// hydrating client render agree on, and `getSnapshot` is what every render
// after hydration sees. That difference is the whole signal.
//
// This is deliberately not `useState` + `useEffect(() => setMounted(true))`.
// That sets state during an effect purely to trigger a second render, which is
// the pattern React Compiler's lint rule rejects — and rightly, since it makes
// the component render twice on every mount forever to answer a question React
// can answer directly.
const subscribe = () => () => {}
const getSnapshot = () => true
const getServerSnapshot = () => false

/**
 * The theme switch, as a three-way segmented control.
 *
 * It offers System as a peer of Light and Dark rather than being a two-state
 * flip, because "follow my phone" is a real answer and a toggle cannot express
 * it — a merchant whose device switches at sunset would otherwise have to come
 * back here twice a day.
 *
 * It lives in the rail, which is black in both themes, so it is styled against
 * ink and not against the page: `bg-white/8` for the track, white for the
 * active chip. Those are literal rather than tokens on purpose — the tokens
 * around it describe the *page's* surface, which is the one surface this
 * control is guaranteed not to be sitting on.
 *
 * Nothing real renders until after hydration. `theme` comes from localStorage,
 * so on the server it is undefined and every segment would render inactive;
 * committing that and then correcting it is a visible flicker on every load.
 * The placeholder is the same height as the control, so nothing below it moves
 * when the real thing arrives.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const hydrated = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  )

  if (!hydrated) {
    return (
      <div
        aria-hidden
        className={cn('h-9 rounded-full bg-white/8', className)}
      />
    )
  }

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn(
        'flex items-center gap-0.5 rounded-full bg-white/8 p-0.5',
        className
      )}
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon
        const isActive = theme === option.value

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={option.label}
            title={option.label}
            onClick={() => setTheme(option.value)}
            className={cn(
              'flex h-8 flex-1 items-center justify-center rounded-full transition-colors',
              'focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none',
              isActive
                ? 'bg-white text-[#0b0b0c]'
                : 'text-ink-muted hover:bg-white/10 hover:text-white'
            )}
          >
            <Icon className="size-4" />
          </button>
        )
      })}
    </div>
  )
}
