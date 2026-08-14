import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { ALIGN, FillImg, HERO_HEIGHTS } from '../blockPrimitives'
import { cn } from '@/lib/utils'

export const heroContentSchema = z.object({
  image: z.string().default(''),
  mobileImage: z.string().default(''),
  eyebrow: z.string().max(120).default(''),
  title: z.string().max(200).default('Your headline goes here'),
  subtitle: z
    .string()
    .max(400)
    .default('Say why they should buy, in one line.'),
  ctaText: z.string().max(80).default('Order now'),
  align: z.enum(['left', 'center', 'right']).default('center'),
  overlay: z.number().min(0).max(90).default(40),
  height: z.enum(['small', 'medium', 'large', 'full']).default('large'),
})

export type HeroContent = z.infer<typeof heroContentSchema>

export const heroDefaultContent: HeroContent = heroContentSchema.parse({})

function HeroRenderer({ content, config }: SectionRendererProps<HeroContent>) {
  const {
    image,
    mobileImage,
    eyebrow,
    title,
    subtitle,
    ctaText,
    align,
    overlay,
    height,
  } = content
  const hasImage = !!image || !!mobileImage

  return (
    <SectionWrapper config={config} defaultPadding={false}>
      <div
        className={cn(
          'relative flex flex-col justify-center overflow-hidden',
          HERO_HEIGHTS[height] || HERO_HEIGHTS.large
        )}
      >
        {hasImage && (
          <>
            {mobileImage && (
              <div className="absolute inset-0 sm:hidden">
                <FillImg src={mobileImage} loading="eager" />
              </div>
            )}
            <div
              className={cn(
                'absolute inset-0',
                mobileImage && 'hidden sm:block'
              )}
            >
              <FillImg src={image || mobileImage} loading="eager" />
            </div>
            <div
              className="absolute inset-0 bg-black"
              style={{ opacity: Math.min(90, Math.max(0, overlay)) / 100 }}
            />
          </>
        )}

        <div className="relative w-full px-4 sm:px-6">
          <div
            className={cn(
              'mx-auto flex max-w-3xl flex-col gap-4',
              ALIGN[align] || ALIGN.center
            )}
          >
            {eyebrow && (
              <span
                className="inline-block rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-[3px] uppercase"
                style={{ background: 'var(--lp-accent)', color: '#fff' }}
              >
                {eyebrow}
              </span>
            )}
            {title && (
              <h1
                className={cn(
                  'text-3xl leading-[1.1] font-bold tracking-tight sm:text-5xl',
                  hasImage ? 'text-white' : 'text-[color:var(--lp-text)]'
                )}
              >
                {title}
              </h1>
            )}
            {subtitle && (
              <p
                className={cn(
                  'max-w-xl text-base sm:text-lg',
                  hasImage ? 'text-white/85' : 'text-[color:var(--lp-text)]/70'
                )}
              >
                {subtitle}
              </p>
            )}
            {ctaText && (
              // An anchor rather than a scripted scroll: it lands on the order
              // form with smooth scrolling from CSS alone, so the one control
              // the whole page exists for still works before hydration.
              <a
                href="#order"
                className="mt-2 inline-flex w-fit items-center justify-center rounded-full px-8 py-3.5 text-sm font-semibold tracking-wide text-white shadow-lg transition-transform hover:scale-[1.03] active:scale-[0.99]"
                style={{ background: 'var(--lp-accent)' }}
              >
                {ctaText}
              </a>
            )}
          </div>
        </div>
      </div>
    </SectionWrapper>
  )
}

export const heroSection: SectionDefinition<HeroContent> = {
  key: 'hero',
  name: 'Hero',
  category: 'Content',
  description: 'Full-width banner with headline and call-to-action.',
  schema: heroContentSchema,
  defaultContent: heroDefaultContent,
  editorFields: [
    { type: 'image', name: 'image', label: 'Background image' },
    { type: 'image', name: 'mobileImage', label: 'Mobile image' },
    { type: 'text', name: 'eyebrow', label: 'Eyebrow' },
    { type: 'text', name: 'title', label: 'Headline' },
    { type: 'textarea', name: 'subtitle', label: 'Subheadline' },
    { type: 'text', name: 'ctaText', label: 'Button text' },
    {
      type: 'select',
      name: 'align',
      label: 'Text alignment',
      options: ['left', 'center', 'right'],
    },
    {
      type: 'select',
      name: 'height',
      label: 'Height',
      options: ['small', 'medium', 'large', 'full'],
    },
    {
      type: 'number',
      name: 'overlay',
      label: 'Image darkening (%)',
      min: 0,
      max: 90,
    },
  ],
  Renderer: HeroRenderer,
}
