import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { BlockSection } from '../blockPrimitives'
import { CountdownClock } from './CountdownClock'

export const countdownContentSchema = z.object({
  title: z.string().max(200).default('Offer ends in'),
  endsAt: z.string().default(''),
  expiredText: z.string().max(200).default('This offer has ended.'),
})

export type CountdownContent = z.infer<typeof countdownContentSchema>

export const countdownDefaultContent: CountdownContent =
  countdownContentSchema.parse({})

/**
 * Urgency timer counting down to a deadline.
 *
 * The ticking half is a client component: the server has no idea what "now" is
 * for this visitor, so rendering a time here would guarantee a hydration
 * mismatch and a stale first paint.
 */
function CountdownRenderer({
  content,
  config,
}: SectionRendererProps<CountdownContent>) {
  const target = content.endsAt ? new Date(content.endsAt).getTime() : 0
  if (!target || Number.isNaN(target)) return null

  return (
    <SectionWrapper config={config} defaultPadding={false}>
      <BlockSection className="py-8">
        <div
          className="rounded-2xl px-6 py-8 text-center"
          style={{ background: 'var(--lp-accent)' }}
        >
          {content.title && (
            <p className="mb-4 text-[12px] tracking-[3px] text-white/85 uppercase">
              {content.title}
            </p>
          )}
          <CountdownClock target={target} expiredText={content.expiredText} />
        </div>
      </BlockSection>
    </SectionWrapper>
  )
}

export const countdownSection: SectionDefinition<CountdownContent> = {
  key: 'countdown',
  name: 'Countdown',
  category: 'Commerce',
  description: 'Urgency timer counting down to a deadline.',
  schema: countdownContentSchema,
  defaultContent: countdownDefaultContent,
  editorFields: [
    { type: 'text', name: 'title', label: 'Heading' },
    { type: 'text', name: 'endsAt', label: 'Ends at' },
    { type: 'text', name: 'expiredText', label: 'Text after it expires' },
  ],
  Renderer: CountdownRenderer,
}
