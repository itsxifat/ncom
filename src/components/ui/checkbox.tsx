'use client'

import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox'
import { CheckIcon, MinusIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * A checkbox drawn by us rather than by the operating system.
 *
 * A native checkbox input renders in the platform's own colours —
 * the default blue tick, on a white box — which reads as a stray piece of
 * someone else's interface on a dark, lime-accented page. `accent-color` can
 * recolour the fill but not the box, the border, or the focus ring.
 *
 * `name` and `value` still post with the form: Base UI keeps a hidden input in
 * sync, so a checkbox group reads back with `formData.getAll(name)` exactly as
 * the native one did.
 */
/**
 * `page` is for storefronts. Those render inside a merchant's own palette, so
 * the control borrows the surrounding text colour instead of the app's tokens —
 * otherwise a shop's checkout would sprout admin-green ticks.
 */
export type ControlTone = 'app' | 'page'

const CHECKBOX_TONE: Record<ControlTone, string> = {
  app: 'border-input bg-card data-checked:bg-primary data-checked:border-primary data-checked:text-primary-foreground data-indeterminate:bg-primary data-indeterminate:border-primary data-indeterminate:text-primary-foreground focus-visible:border-ring focus-visible:ring-ring/25 aria-invalid:border-destructive dark:bg-input/30 dark:data-checked:bg-primary',
  page: 'border-current/35 data-checked:bg-current data-checked:border-current data-indeterminate:bg-current focus-visible:ring-current/25',
}

export function Checkbox({
  className,
  tone = 'app',
  ...props
}: CheckboxPrimitive.Root.Props & { tone?: ControlTone }) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer size-4.5 shrink-0 rounded-[0.3rem] border transition-colors outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50',
        CHECKBOX_TONE[tone],
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className={cn(
          'flex items-center justify-center data-unchecked:hidden',
          // On a storefront the box fills with the text colour, so the tick has
          // to be punched out in the page's background instead.
          tone === 'app' ? 'text-current' : 'text-[var(--page-background,#fff)]'
        )}
      >
        {props.indeterminate ? (
          <MinusIcon className="size-3.5 stroke-3" />
        ) : (
          <CheckIcon className="size-3.5 stroke-3" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}
