import { Fragment } from 'react'
import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionWrapper } from '../primitives'
import { El, Extras } from '../elements'
import { storeHref } from '../storefront'
import { richTextToPlain, safeHref } from '../sanitizeHtml'
import { cn } from '@/lib/utils'
import {
  AnnouncementRotator,
  type AnnouncementMessage,
} from './AnnouncementRotator'

export const announcementContentSchema = z.object({
  messages: z
    .array(
      z.object({
        text: z.string().max(300).default(''),
        /** Optional. Empty leaves the message as plain text. */
        href: z.string().max(500).default(''),
      })
    )
    .max(5)
    .default([
      { text: 'Cash on delivery all over the country', href: '/products' },
    ]),
  /** 0 shows every message at once instead of taking turns. */
  rotateSeconds: z.number().min(0).max(30).default(5),
})

export type AnnouncementContent = z.infer<typeof announcementContentSchema>

export const announcementDefaultContent: AnnouncementContent =
  announcementContentSchema.parse({})

/**
 * The thin strip above the header: free delivery, a sale, a new arrival.
 *
 * It sits on the store's layout page with the header, so one edit changes it
 * on every page at once — which is the point of an announcement. Several
 * messages take turns in the same strip, or sit side by side when the merchant
 * turns rotation off.
 *
 * In the builder every message is drawn at once, whatever the setting. A
 * rotating bar would move the text out from under the merchant's cursor, and a
 * paused one would leave every message but the first unreachable from the
 * page — the canvas is where they retype them, so all of them have to be there
 * to click.
 */
function AnnouncementRenderer({
  content,
  config,
  storefront,
  editing,
}: SectionRendererProps<AnnouncementContent>) {
  const linkBase = storefront?.linkBase ?? ''

  const messages: AnnouncementMessage[] = content.messages
    .map((message, index) => ({
      index,
      html: message.text,
      // A typed address goes through the same check every merchant link does,
      // so a pasted `javascript:` cannot ride into every page of the shop.
      href: message.href.trim()
        ? (safeHref(storeHref(message.href, linkBase)) ?? null)
        : null,
    }))
    .filter((message) => richTextToPlain(message.html))

  // Nothing to say is nothing to draw — except in the builder, where an empty
  // strip with nothing to click would read as a block that failed to appear.
  if (messages.length === 0 && !editing) return null

  const rotates = !editing && messages.length > 1 && content.rotateSeconds > 0

  return (
    <SectionWrapper config={config} defaultPadding={false}>
      <El
        as="div"
        part="bar"
        className="bg-[var(--page-text)] px-4 py-2.5 text-center text-[13px] leading-snug font-medium text-[var(--page-background)]"
      >
        {messages.length === 0 ? (
          <span className="opacity-60">Add a message in the panel</span>
        ) : rotates ? (
          <AnnouncementRotator
            messages={messages}
            seconds={content.rotateSeconds}
          />
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            {messages.map((message, position) => (
              <Fragment key={message.index}>
                {position > 0 && (
                  <span aria-hidden className="opacity-40">
                    ·
                  </span>
                )}
                <El
                  as={message.href ? 'a' : 'span'}
                  part="message"
                  index={message.index}
                  href={message.href ?? undefined}
                  html={message.html}
                  className={cn(
                    message.href && 'underline-offset-4 hover:underline'
                  )}
                />
              </Fragment>
            ))}
          </div>
        )}
        <Extras config={config} slot="content" />
      </El>
    </SectionWrapper>
  )
}

export const announcementSection: SectionDefinition<AnnouncementContent> = {
  key: 'announcement',
  name: 'Announcement bar',
  category: 'Layout',
  description: 'A thin strip above the header for offers and news.',
  sites: ['STORE'],
  pageRoles: ['LAYOUT'],
  placement: 'top',
  singleton: true,
  keywords: ['offer', 'promo bar', 'notice', 'free delivery', 'top bar'],
  schema: announcementContentSchema,
  defaultContent: announcementDefaultContent,
  translations: {
    bn: {
      messages: [{ text: 'সারা দেশে ক্যাশ অন ডেলিভারি', href: '/products' }],
    },
  },
  editorFields: [
    {
      type: 'array',
      name: 'messages',
      label: 'Messages',
      itemFields: [
        { type: 'richtext', name: 'text', label: 'Message' },
        {
          type: 'link',
          name: 'href',
          label: 'Goes to',
          description: 'Optional. Leave empty for plain text.',
        },
      ],
    },
    {
      type: 'number',
      name: 'rotateSeconds',
      label: 'Change message every',
      suffix: 'seconds',
      min: 0,
      max: 30,
      description: '0 shows every message at once, side by side.',
    },
  ],
  elements: [
    { key: 'bar', label: 'Announcement bar', kind: 'container', slot: true },
    {
      key: 'message',
      label: 'Message',
      kind: 'text',
      repeated: true,
      contentField: 'messages[].text',
    },
  ],
  slots: [{ key: 'content', label: 'Announcement bar' }],
  Renderer: AnnouncementRenderer,
}
