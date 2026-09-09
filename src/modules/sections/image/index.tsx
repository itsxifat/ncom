import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { BlockImg, BlockSection, FillImg } from '../blockPrimitives'
import { El, Extras } from '../elements'
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
  //
  // Fit is deliberately absent from the "auto" branch. With no fixed box the
  // image's height already follows its own proportions, so there is nothing to
  // crop into or letterbox against and `object-fit` paints identically either
  // way — which is why the Fit control is hidden for that shape rather than
  // offered and ignored.
  const inner = aspect ? (
    <div className={cn('relative w-full overflow-hidden', aspect, rounded)}>
      <FillImg part="image" src={content.image} className={fit} />
    </div>
  ) : (
    <BlockImg part="image" src={content.image} className={rounded} />
  )

  const caption = content.caption ? (
    <El
      as="p"
      part="caption"
      html={content.caption}
      className="mt-3 text-center text-[12px] text-[color:var(--lp-text)]/50"
    />
  ) : null

  if (full) {
    return (
      <SectionWrapper config={config} defaultPadding={false}>
        <BlockSection full>
          {inner}
          {content.caption && (
            <El
              as="p"
              part="caption"
              html={content.caption}
              className="mt-3 px-4 text-center text-[12px] text-[color:var(--lp-text)]/50"
            />
          )}
          <Extras config={config} slot="content" />
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
          {/*
            The chosen size arrives as a custom property read by a class rather
            than as an inline `max-width`. Inline wins over every selector, so
            an inline value here would have made the element's own width control
            in the design panel do nothing.
          */}
          <El
            as="div"
            part="frame"
            className="w-full [max-width:var(--img-maxw)]"
            style={
              {
                '--img-maxw': `${IMG_MAXW[size] || 760}px`,
              } as React.CSSProperties
            }
          >
            {inner}
            {caption}
            <Extras config={config} slot="content" />
          </El>
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
    { type: 'richtext', name: 'caption', label: 'Caption' },
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
      description: 'Whether the picture fills the shape or sits inside it.',
      // Only a fixed shape has a box to fit into. Shown for anything but
      // "auto", where the image sizes itself and the control could do nothing.
      showWhen: {
        field: 'aspect',
        equals: ['square', 'landscape', 'portrait', 'wide'],
      },
    },
    { type: 'boolean', name: 'rounded', label: 'Rounded corners' },
  ],
  elements: [
    { key: 'frame', label: 'Image frame', kind: 'container', slot: true },
    { key: 'image', label: 'Image', kind: 'image' },
    {
      key: 'caption',
      label: 'Caption',
      kind: 'text',
      contentField: 'caption',
    },
  ],
  slots: [{ key: 'content', label: 'Under the image' }],
  Renderer: ImageRenderer,
}
