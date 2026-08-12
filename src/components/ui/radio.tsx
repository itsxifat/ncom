'use client'

import { Radio as RadioPrimitive } from '@base-ui/react/radio'
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group'

import { cn } from '@/lib/utils'
import type { ControlTone } from '@/components/ui/checkbox'

/**
 * Radio buttons drawn by us, for the same reason as `Checkbox`: the native
 * control takes its colours from the platform, not the page.
 *
 * `RadioGroup` carries the `name`, so the chosen value posts with the form.
 */
export function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn('flex flex-col gap-2', className)}
      {...props}
    />
  )
}

const RADIO_TONE: Record<ControlTone, string> = {
  app: 'border-input bg-card data-checked:border-primary focus-visible:border-ring focus-visible:ring-ring/25 aria-invalid:border-destructive dark:bg-input/30',
  page: 'border-current/35 data-checked:border-current focus-visible:ring-current/25',
}

export function Radio({
  className,
  tone = 'app',
  ...props
}: RadioPrimitive.Root.Props & { tone?: ControlTone }) {
  return (
    <RadioPrimitive.Root
      data-slot="radio"
      className={cn(
        'flex size-4.5 shrink-0 items-center justify-center rounded-full border transition-colors outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50',
        RADIO_TONE[tone],
        className
      )}
      {...props}
    >
      <RadioPrimitive.Indicator
        data-slot="radio-indicator"
        className={cn(
          'size-2 rounded-full data-unchecked:hidden',
          tone === 'app' ? 'bg-primary' : 'bg-current'
        )}
      />
    </RadioPrimitive.Root>
  )
}
