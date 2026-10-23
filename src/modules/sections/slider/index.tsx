import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { Extras } from '../elements'
import { SliderClient } from './SliderClient'

const slideSchema = z.object({
  image: z.string().default(''),
  mobileImage: z.string().default(''),
  eyebrow: z.string().max(120).default(''),
  title: z.string().max(200).default(''),
  subtitle: z.string().max(400).default(''),
  buttonText: z.string().max(80).default('Shop now'),
  buttonHref: z.string().max(500).default('/products'),
  align: z.enum(['left', 'center', 'right']).default('left'),
})

export type SliderSlide = z.infer<typeof slideSchema>

export const sliderContentSchema = z.object({
  // No minimum. A slider emptied in the inspector is a merchant halfway through
  // replacing their slides, and a schema that refused it would throw away the
  // height, timing and every other setting by falling back to the defaults.
  slides: z
    .array(slideSchema)
    .max(8)
    .default([
      {
        image: '',
        mobileImage: '',
        eyebrow: 'Just in',
        title: 'New season, new favourites',
        subtitle: 'Fresh styles, picked for everyday wear.',
        buttonText: 'Shop the collection',
        buttonHref: '/products',
        align: 'left',
      },
      {
        image: '',
        mobileImage: '',
        eyebrow: 'This week only',
        title: 'Up to 30% off this week',
        subtitle: 'Cash on delivery, everywhere in the country.',
        buttonText: 'See the offers',
        buttonHref: '/products',
        align: 'center',
      },
    ]),
  height: z.enum(['small', 'medium', 'large', 'full']).default('large'),
  overlay: z.number().min(0).max(80).default(30),
  autoplaySeconds: z.number().min(0).max(15).default(5),
  showArrows: z.boolean().default(true),
  showDots: z.boolean().default(true),
})

export type SliderContent = z.infer<typeof sliderContentSchema>

export const sliderDefaultContent: SliderContent = sliderContentSchema.parse({})

/**
 * The big sliding banners at the top of a shop's home page.
 *
 * A landing page leads with one hero because it sells one thing; a shop runs
 * several messages at once — this week's offer, the new arrivals, free
 * delivery — and the slider is how they share the most valuable space on the
 * page without stacking into a wall of banners.
 *
 * Every slide is in the page at once, stacked in the same spot, and only the
 * current one is shown. That is what lets the builder select and restyle the
 * third slide's button without the merchant having to wait for it to come
 * round, and what makes the slides readable to a search engine and to anyone
 * whose browser never runs the script.
 */
function SliderRenderer({
  content,
  config,
  storefront,
  editing,
}: SectionRendererProps<SliderContent>) {
  // A slider with no slides has nothing to show a shopper. In the builder it
  // stays as a placeholder instead: a block that vanished would leave the
  // merchant nothing to click to add a slide back.
  if (content.slides.length === 0 && !editing) return null

  return (
    <SectionWrapper config={config} defaultPadding={false}>
      <SliderClient
        content={content}
        linkBase={storefront?.linkBase ?? ''}
        editing={Boolean(editing)}
        extras={<Extras config={config} slot="content" />}
      />
    </SectionWrapper>
  )
}

export const sliderSection: SectionDefinition<SliderContent> = {
  key: 'slider',
  name: 'Image slider',
  category: 'Store',
  description: 'Big banners that slide — for offers, new arrivals and seasons.',
  sites: ['STORE'],
  keywords: ['carousel', 'slideshow', 'banner', 'hero'],
  schema: sliderContentSchema,
  defaultContent: sliderDefaultContent,
  translations: {
    bn: {
      slides: [
        {
          image: '',
          mobileImage: '',
          eyebrow: 'নতুন এসেছে',
          title: 'নতুন সিজন, নতুন পছন্দ',
          subtitle: 'প্রতিদিন পরার জন্য বাছাই করা নতুন ডিজাইন।',
          buttonText: 'কালেকশন দেখুন',
          buttonHref: '/products',
          align: 'left',
        },
        {
          image: '',
          mobileImage: '',
          eyebrow: 'শুধু এই সপ্তাহে',
          title: 'এই সপ্তাহে ৩০% পর্যন্ত ছাড়',
          subtitle: 'সারা দেশে ক্যাশ অন ডেলিভারি।',
          buttonText: 'অফারগুলো দেখুন',
          buttonHref: '/products',
          align: 'center',
        },
      ],
    },
  },
  editorFields: [
    {
      type: 'array',
      name: 'slides',
      label: 'Slides',
      itemFields: [
        { type: 'image', name: 'image', label: 'Picture' },
        {
          type: 'image',
          name: 'mobileImage',
          label: 'Picture for phones',
          description:
            'Optional. A tall picture reads better on a phone than a wide one cropped to fit.',
        },
        { type: 'richtext', name: 'eyebrow', label: 'Small text above' },
        { type: 'richtext', name: 'title', label: 'Headline' },
        {
          type: 'richtext',
          name: 'subtitle',
          label: 'Text under the headline',
          multiline: true,
        },
        { type: 'richtext', name: 'buttonText', label: 'Button text' },
        { type: 'link', name: 'buttonHref', label: 'Button goes to' },
        {
          type: 'select',
          name: 'align',
          label: 'Text position',
          options: ['left', 'center', 'right'],
        },
      ],
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
      label: 'Picture darkening',
      description: 'Darkens pictures so white text stays easy to read.',
      min: 0,
      max: 80,
      suffix: '%',
    },
    {
      type: 'number',
      name: 'autoplaySeconds',
      label: 'Move to the next slide every',
      description: 'Set to 0 to change slides only when a shopper does.',
      min: 0,
      max: 15,
      suffix: 'seconds',
    },
    { type: 'boolean', name: 'showArrows', label: 'Show arrows' },
    { type: 'boolean', name: 'showDots', label: 'Show dots' },
  ],
  elements: [
    { key: 'frame', label: 'Slider frame', kind: 'container', slot: true },
    { key: 'slide', label: 'Slide', kind: 'container', repeated: true },
    { key: 'image', label: 'Picture', kind: 'image', repeated: true },
    {
      key: 'mobileImage',
      label: 'Picture for phones',
      kind: 'image',
      repeated: true,
    },
    {
      key: 'overlay',
      label: 'Picture darkening',
      kind: 'container',
      repeated: true,
    },
    { key: 'content', label: 'Text stack', kind: 'container', repeated: true },
    {
      key: 'eyebrow',
      label: 'Small text above',
      kind: 'text',
      repeated: true,
      contentField: 'slides[].eyebrow',
    },
    {
      key: 'title',
      label: 'Headline',
      kind: 'heading',
      repeated: true,
      contentField: 'slides[].title',
    },
    {
      key: 'subtitle',
      label: 'Text under the headline',
      kind: 'text',
      repeated: true,
      contentField: 'slides[].subtitle',
    },
    {
      key: 'button',
      label: 'Button',
      kind: 'button',
      repeated: true,
      contentField: 'slides[].buttonText',
    },
    { key: 'arrow', label: 'Arrow', kind: 'icon', repeated: true },
    { key: 'dots', label: 'Dots', kind: 'container' },
    { key: 'dot', label: 'Dot', kind: 'container', repeated: true },
  ],
  slots: [{ key: 'content', label: 'Slider frame' }],
  Renderer: SliderRenderer,
}
