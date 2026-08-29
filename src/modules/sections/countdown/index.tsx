import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { BlockSection } from '../blockPrimitives'
import { CountdownBody } from './CountdownBody'
import {
  countdownContentSchema,
  countdownDefaultContent,
  resolveDeadline,
  type CountdownContent,
} from './content'

export {
  countdownContentSchema,
  countdownDefaultContent,
  type CountdownContent,
} from './content'

/**
 * Urgency timer counting down to a deadline.
 *
 * The block itself is a client component: the server has no idea what "now" is
 * for this visitor, so rendering a time here would guarantee a hydration
 * mismatch and a stale first paint — and an evergreen timer's deadline belongs
 * to one browser, not to the page.
 */
function CountdownRenderer({
  content,
  config,
  sectionId,
  editing,
}: SectionRendererProps<CountdownContent>) {
  const target = resolveDeadline(content)
  const unset = content.mode === 'deadline' && target === null

  // A deadline block with no date has nothing to promise a buyer, so it stays
  // off the published page. In the builder it becomes a placeholder instead of
  // vanishing: an invisible block reads as a broken one, and there is nothing
  // left on the canvas to click to open the inspector and set the date.
  if (unset && !editing) return null

  return (
    <SectionWrapper config={config} defaultPadding={false}>
      <BlockSection className="py-8">
        {unset ? (
          <CountdownPlaceholder />
        ) : (
          <CountdownBody
            content={content}
            target={target}
            sectionId={sectionId ?? ''}
            editing={Boolean(editing)}
          />
        )}
      </BlockSection>
    </SectionWrapper>
  )
}

/** What the merchant sees on the canvas before they have picked a date. */
function CountdownPlaceholder() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-[color-mix(in_oklab,currentColor_25%,transparent)] px-6 py-10 text-center">
      <p className="text-[13px] font-semibold text-[color:var(--lp-text)]/75">
        Countdown — no end time set
      </p>
      <p className="mt-1 text-[12px] text-[color:var(--lp-text)]/55">
        Pick when the offer ends in the Content tab, or switch it to a
        per-visitor timer. This block is hidden on the published page until
        then.
      </p>
    </div>
  )
}

export const countdownSection: SectionDefinition<CountdownContent> = {
  key: 'countdown',
  name: 'Countdown',
  category: 'Commerce',
  description:
    'Urgency timer counting down to a deadline, or a fresh window per visitor.',
  schema: countdownContentSchema,
  defaultContent: countdownDefaultContent,
  editorFields: [
    { type: 'heading', name: 'group:timer', label: 'Timer' },
    {
      type: 'select',
      name: 'mode',
      label: 'Counts down to',
      options: [
        { value: 'deadline', label: 'A fixed date and time' },
        { value: 'evergreen', label: 'A window per visitor' },
      ],
      description:
        'A fixed deadline ends for everyone at once. A per-visitor window starts when someone first opens the page and follows them back on their next visit.',
    },
    {
      type: 'datetime',
      name: 'endsAt',
      label: 'Ends at',
      showWhen: { field: 'mode', equals: 'deadline' },
    },
    {
      type: 'number',
      name: 'durationMinutes',
      label: 'Window length',
      min: 1,
      max: 20160,
      step: 5,
      suffix: 'minutes',
      showWhen: { field: 'mode', equals: 'evergreen' },
    },

    { type: 'heading', name: 'group:text', label: 'Text' },
    {
      type: 'text',
      name: 'title',
      label: 'Heading',
      placeholder: 'Offer ends in',
    },
    {
      type: 'text',
      name: 'subtitle',
      label: 'Line under the timer',
      placeholder: 'Free delivery on every order until then',
    },
    {
      type: 'text',
      name: 'ctaText',
      label: 'Button text',
      placeholder: 'Leave empty for no button',
      description:
        'Jumps to the order form, like the other buttons on the page.',
    },

    { type: 'heading', name: 'group:look', label: 'Look' },
    {
      type: 'select',
      name: 'style',
      label: 'Style',
      options: [
        { value: 'boxes', label: 'Boxes' },
        { value: 'pill', label: 'Outlined pills' },
        { value: 'minimal', label: 'Plain digits' },
      ],
    },
    {
      type: 'select',
      name: 'size',
      label: 'Size',
      options: ['small', 'medium', 'large'],
    },
    {
      type: 'select',
      name: 'align',
      label: 'Alignment',
      options: ['left', 'center', 'right'],
    },
    {
      type: 'select',
      name: 'units',
      label: 'Units',
      options: [
        { value: 'auto', label: 'Automatic (hide days until needed)' },
        { value: 'dhms', label: 'Days, hours, minutes, seconds' },
        { value: 'hms', label: 'Hours, minutes, seconds' },
        { value: 'ms', label: 'Minutes and seconds' },
      ],
    },
    { type: 'boolean', name: 'showLabels', label: 'Show unit labels' },
    {
      type: 'boolean',
      name: 'panel',
      label: 'Coloured panel',
      description: 'Off puts the timer straight on the page background.',
    },
    {
      type: 'color',
      name: 'accentColor',
      label: 'Panel colour',
      allowEmpty: true,
      description: 'Leave empty to follow the page theme.',
    },
    {
      type: 'number',
      name: 'urgentAtMinutes',
      label: 'Turn urgent at',
      min: 0,
      max: 1440,
      step: 5,
      suffix: 'minutes left',
      description: 'The timer reddens and pulses below this. 0 turns it off.',
    },

    { type: 'heading', name: 'group:expiry', label: 'When it runs out' },
    {
      type: 'select',
      name: 'onExpire',
      label: 'Then',
      options: [
        { value: 'message', label: 'Show a message' },
        { value: 'zeros', label: 'Keep showing 00:00' },
        { value: 'hide', label: 'Hide the whole block' },
      ],
    },
    {
      type: 'text',
      name: 'expiredText',
      label: 'Message',
      showWhen: { field: 'onExpire', equals: 'message' },
    },
  ],
  Renderer: CountdownRenderer,
}
