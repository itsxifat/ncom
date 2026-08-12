'use client'

import * as React from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { ControlTone } from '@/components/ui/checkbox'

/**
 * A select that looks native from the outside and is ours on the inside.
 *
 * You hand it `<option>` children and a `name`, and it posts with the form —
 * but nothing in it is browser chrome. A native select paints its option list
 * with the operating system's own popup, which ignores the page's dark theme
 * entirely: light-on-white text on a white sheet, unreadable. That popup is
 * drawn outside the page, so no amount of CSS on the select can reach it.
 *
 * Keeping the `<option>` API means call sites read the way they always did and
 * the value still arrives in FormData (Base UI keeps a hidden input in sync),
 * while the list itself is ours to theme.
 */

/**
 * What a handler gets on change.
 *
 * Shaped like the native event because every call site only ever reads
 * `event.target.value`, and a straight swap beats rewriting them all.
 */
export interface FormSelectChangeEvent {
  target: { value: string; name: string }
}

export interface FormSelectProps {
  id?: string
  name?: string
  value?: string
  defaultValue?: string
  onChange?: (event: FormSelectChangeEvent) => void
  disabled?: boolean
  required?: boolean
  className?: string
  /** Shown when nothing is selected yet. */
  placeholder?: string
  'aria-label'?: string
  'aria-invalid'?: boolean
  /** `page` borrows the surrounding colours, for merchant storefronts. */
  tone?: ControlTone
  children?: React.ReactNode
}

const TRIGGER_TONE: Record<ControlTone, string> = {
  app: 'border-input bg-card focus-visible:border-ring focus-visible:ring-ring/15 disabled:bg-muted dark:bg-input/30',
  page: 'border-current/25 bg-transparent focus-visible:ring-current/20',
}

interface ParsedOption {
  value: string
  label: React.ReactNode
  disabled?: boolean
}

/**
 * Reads `<option>` children into plain data.
 *
 * `React.Children.toArray` flattens the array a `.map()` over options returns
 * and drops the nulls a conditional option leaves behind, but it does not look
 * inside a fragment — so a group of options wrapped in `<>…</>` needs the
 * recursion.
 */
function parseOptions(children: React.ReactNode): ParsedOption[] {
  const options: ParsedOption[] = []
  for (const child of React.Children.toArray(children)) {
    if (!React.isValidElement(child)) continue

    if (child.type === React.Fragment) {
      const props = child.props as { children?: React.ReactNode }
      options.push(...parseOptions(props.children))
      continue
    }
    if (child.type !== 'option') continue

    const props = child.props as React.ComponentProps<'option'>
    // An option with no value attribute submits its text, as in HTML.
    const value =
      props.value !== undefined
        ? String(props.value)
        : typeof props.children === 'string'
          ? props.children
          : ''
    options.push({
      value,
      label: props.children ?? value,
      disabled: props.disabled,
    })
  }
  return options
}

export function FormSelect({
  id,
  name,
  value,
  defaultValue,
  onChange,
  disabled,
  required,
  className,
  placeholder,
  tone = 'app',
  children,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
}: FormSelectProps) {
  const options = React.useMemo(() => parseOptions(children), [children])

  // Lets the trigger render the selected option's label rather than its value.
  const items = React.useMemo(() => {
    const map: Record<string, React.ReactNode> = {}
    for (const option of options) map[option.value] = option.label
    return map
  }, [options])

  // An uncontrolled native select shows its first option when no defaultValue
  // is given. Base UI would show the placeholder instead, so match the old
  // behaviour rather than silently changing what a form posts. A controlled
  // select gets no default at all — passing both makes Base UI complain, and
  // the parent's value is the answer either way.
  const initialValue =
    value !== undefined
      ? undefined
      : (defaultValue ?? (placeholder ? undefined : options[0]?.value))

  return (
    <Select
      items={items}
      name={name}
      value={value}
      defaultValue={initialValue}
      disabled={disabled}
      required={required}
      onValueChange={(next) =>
        onChange?.({ target: { value: String(next ?? ''), name: name ?? '' } })
      }
    >
      <SelectTrigger
        id={id}
        size="lg"
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        className={cn('min-w-0 text-sm', TRIGGER_TONE[tone], className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
