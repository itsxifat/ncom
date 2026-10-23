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
 * It sits on the rail, which follows the theme like every other panel, so it
 * is drawn in page tokens: a muted track with the active segment raised out of
 * it as a card.
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
      <div aria-hidden className={cn('bg-muted h-9 rounded-lg', className)} />
    )
  }

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn(
        'bg-muted flex items-center gap-0.5 rounded-lg p-0.5',
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
              'flex h-8 flex-1 items-center justify-center rounded-md transition-colors',
              'focus-visible:ring-ring/25 focus-visible:ring-2 focus-visible:outline-none',
              isActive
                ? 'bg-card text-foreground shadow-puck'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="size-4" />
          </button>
        )
      })}
    </div>
  )
}
