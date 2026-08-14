import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { BlockImg, BlockSection, FillImg } from '../blockPrimitives'
import { cn } from '@/lib/utils'

export const imageContentSchema = z.object({
  image: z.string().default(''),
  caption: z.string().max(200).default(''),
  width: z.enum(['contained', 'full']).default('contained'),
  size: z.enum(['small', 'medium', 'large', 'full']).default('large'),
  align: z.enum(['left', 'center', 'right']).default('center'),
  aspect: z
    .enum(['auto', 'square', 'landscape', 'portrait', 'wide'])
    .default('auto'),
  fit: z.enum(['cover', 'contain']).default('cover'),
  rounded: z.boolean().default(true),
})

export type ImageContent = z.infer<typeof imageContentSchema>

export const imageDefaultContent: ImageContent = imageContentSchema.parse({})

const IMG_MAXW: Record<string, number> = {
  small: 320,
  medium: 520,
  large: 760,
  full: 9999,
}

const IMG_ASPECT: Record<string, string> = {
  auto: '', // natural height
  square: 'aspect-square',
  landscape: 'aspect-[4/3]',
  portrait: 'aspect-[3/4]',
  wide: 'aspect-[16/9]',
}

const IMG_JUSTIFY: Record<string, string> = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
}

function ImageRenderer({
  content,
  config,
}: SectionRendererProps<ImageContent>) {
  if (!content.image) return null

  const full = content.width === 'full'
  const size = content.size || 'large'
  const aspect = IMG_ASPECT[content.aspect] ?? ''
  const fit = content.fit === 'contain' ? 'object-contain' : 'object-cover'
  const rounded = content.rounded !== false && !full ? 'rounded-2xl' : ''

  // "auto" shape → let the image set its own height (no fill); otherwise the
  // aspect box + object-fit crops or letterboxes it.
  const inner = aspect ? (
    <div className={cn('relative w-full overflow-hidden', aspect, rounded)}>
      <FillImg src={content.image} className={fit} />
    </div>
  ) : (
    <BlockImg
      src={content.image}
      className={cn(fit === 'object-contain' && 'object-contain', rounded)}
    />
  )

  const caption = content.caption ? (
    <p className="mt-3 text-center text-[12px] text-[color:var(--lp-text)]/50">
      {content.caption}
    </p>
  ) : null

  if (full) {
    return (
      <SectionWrapper config={config} defaultPadding={false}>
        <BlockSection full>
          {inner}
          {content.caption && (
            <p className="mt-3 px-4 text-center text-[12px] text-[color:var(--lp-text)]/50">
              {content.caption}
            </p>
          )}
        </BlockSection>
      </SectionWrapper>
    )
  }

  return (
    <SectionWrapper config={config} defaultPadding={false}>
      <BlockSection className="py-10">
        <div
          className={cn('flex', IMG_JUSTIFY[content.align] || 'justify-center')}
        >
          <div className="w-full" style={{ maxWidth: IMG_MAXW[size] || 760 }}>
            {inner}
            {caption}
          </div>
        </div>
      </BlockSection>
    </SectionWrapper>
  )
}

export const imageSection: SectionDefinition<ImageContent> = {
  key: 'image',
  name: 'Image',
  category: 'Content',
  description: 'A single image with an optional caption.',
  schema: imageContentSchema,
  defaultContent: imageDefaultContent,
  editorFields: [
    { type: 'image', name: 'image', label: 'Image' },
    { type: 'text', name: 'caption', label: 'Caption' },
    {
      type: 'select',
      name: 'width',
      label: 'Width',
      options: ['contained', 'full'],
    },
    {
      type: 'select',
      name: 'size',
      label: 'Size',
      options: ['small', 'medium', 'large', 'full'],
    },
    {
      type: 'select',
      name: 'align',
      label: 'Alignment',
      options: ['left', 'center', 'right'],
    },
    {
      type: 'select',
      name: 'aspect',
      label: 'Shape',
      options: ['auto', 'square', 'landscape', 'portrait', 'wide'],
    },
    {
      type: 'select',
      name: 'fit',
      label: 'Fit',
      options: ['cover', 'contain'],
    },
    { type: 'boolean', name: 'rounded', label: 'Rounded corners' },
  ],
  Renderer: ImageRenderer,
}
