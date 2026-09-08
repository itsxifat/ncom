import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { ALIGN, FillImg, HERO_HEIGHTS } from '../blockPrimitives'
import { El, Extras } from '../elements'
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
      <El
        as="div"
        part="frame"
        className={cn(
          'relative flex flex-col justify-center overflow-hidden',
          HERO_HEIGHTS[height] || HERO_HEIGHTS.large
        )}
      >
        {hasImage && (
          <>
            {mobileImage && (
              <div className="absolute inset-0 sm:hidden">
                <FillImg part="mobileImage" src={mobileImage} loading="eager" />
              </div>
            )}
            <div
              className={cn(
                'absolute inset-0',
                mobileImage && 'hidden sm:block'
              )}
            >
              <FillImg
                part="image"
                src={image || mobileImage}
                loading="eager"
              />
            </div>
            {/*
              The darkening is applied through a custom property read by a
              class, not as an inline `style`. Inline styles outrank every
              selector, so an inline opacity here would quietly beat whatever
              the merchant sets on this element in the design panel — the one
              control that is explicitly meant to override it.
            */}
            <El
              as="div"
              part="overlay"
              className="absolute inset-0 bg-black [opacity:var(--hero-overlay)]"
              style={
                {
                  '--hero-overlay': Math.min(90, Math.max(0, overlay)) / 100,
                } as React.CSSProperties
              }
            />
          </>
        )}

        <div className="relative w-full px-4 sm:px-6">
          <El
            as="div"
            part="content"
            className={cn(
              'mx-auto flex max-w-3xl flex-col gap-4',
              ALIGN[align] || ALIGN.center
            )}
          >
            {eyebrow && (
              <El
                as="span"
                part="eyebrow"
                html={eyebrow}
                className="inline-block rounded-full bg-[var(--lp-accent)] px-3 py-1.5 text-[11px] font-semibold tracking-[3px] text-white uppercase"
              />
            )}
            {title && (
              <El
                as="h1"
                part="title"
                html={title}
                className={cn(
                  'text-3xl leading-[1.1] font-bold tracking-tight sm:text-5xl',
                  hasImage ? 'text-white' : 'text-[color:var(--lp-text)]'
                )}
              />
            )}
            {subtitle && (
              <El
                as="p"
                part="subtitle"
                html={subtitle}
                className={cn(
                  'max-w-xl text-base sm:text-lg',
                  hasImage ? 'text-white/85' : 'text-[color:var(--lp-text)]/70'
                )}
              />
            )}
            {ctaText && (
              // An anchor rather than a scripted scroll: it lands on the order
              // form with smooth scrolling from CSS alone, so the one control
              // the whole page exists for still works before hydration.
              <El
                as="a"
                part="button"
                href="#order"
                html={ctaText}
                className="mt-2 inline-flex w-fit items-center justify-center rounded-full bg-[var(--lp-accent)] px-8 py-3.5 text-sm font-semibold tracking-wide text-white shadow-lg transition-transform hover:scale-[1.03] active:scale-[0.99]"
              />
            )}
            <Extras config={config} slot="content" />
          </El>
        </div>
      </El>
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
    { type: 'richtext', name: 'eyebrow', label: 'Eyebrow' },
    { type: 'richtext', name: 'title', label: 'Headline' },
    {
      type: 'richtext',
      name: 'subtitle',
      label: 'Subheadline',
      multiline: true,
    },
    { type: 'richtext', name: 'ctaText', label: 'Button text' },
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
  elements: [
    { key: 'frame', label: 'Banner frame', kind: 'container' },
    { key: 'image', label: 'Background image', kind: 'image' },
    { key: 'mobileImage', label: 'Mobile image', kind: 'image' },
    { key: 'overlay', label: 'Image darkening', kind: 'container' },
    { key: 'content', label: 'Text stack', kind: 'container', slot: true },
    { key: 'eyebrow', label: 'Eyebrow', kind: 'text', contentField: 'eyebrow' },
    { key: 'title', label: 'Headline', kind: 'heading', contentField: 'title' },
    {
      key: 'subtitle',
      label: 'Subheadline',
      kind: 'text',
      contentField: 'subtitle',
    },
    { key: 'button', label: 'Button', kind: 'button', contentField: 'ctaText' },
  ],
  slots: [{ key: 'content', label: 'Text stack' }],
  Renderer: HeroRenderer,
}
