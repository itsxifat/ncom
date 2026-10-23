import { getSectionDefinition } from '../sections/registry'
import { sanitizeCustomCode } from '../sections/customcode/sanitize'
import {
  countdownContentSchema,
  resolveDeadline,
} from '../sections/countdown/content'
import type { SiteKind } from '../sections/storefront'
import type { BuilderSection } from './store'
import { sectionLabel } from './sectionLabel'

/**
 * What to look at before a page goes live.
 *
 * A page an AI drafted, or a template a merchant filled in on their phone, is
 * usually nearly right — and the part that is not is the part a shopper
 * notices: "[Your phone number]" still in the footer, the example review NCOM
 * ships with, a countdown that ended last week, an order form with nothing to
 * sell. None of that stops a page from publishing, and none of it should: a
 * merchant may know better. Publish shows the list first, each line with a
 * way to jump to the block, and "Publish anyway".
 *
 * Pure and synchronous, run on the builder's own copy of the page, so it
 * checks exactly what is about to go live — including edits not saved yet.
 */
export interface PublishIssue {
  /** Stable across runs, for React keys. */
  key: string
  /** The block to show, or null for the page as a whole. */
  sectionId: string | null
  title: string
  detail: string
}

export interface PublishCheckContext {
  kind: SiteKind | null
  /**
   * A landing page's offers, read at the moment of publishing. Absent when
   * they could not be read, in which case nothing is said about them.
   */
  offers?: { key: string; label: string }[]
  /**
   * The example reviews the templates ship with (see `templateReviewTexts`),
   * when they were loaded. The block's own example is always known.
   */
  exampleReviews?: Set<string>
}

/**
 * "[Your phone number]" — the placeholder shape the AI guide tells every
 * model to use for a fact it was not given, and the one merchants copy.
 */
const PLACEHOLDER = /\[[^[\]\n]{2,80}\]/g

/** Content keys that hold addresses, never words a shopper reads. */
const NOT_WORDS = /(image|url|href|src|icon|video|logo|link)/i

/** The example reviews NCOM's testimonials block starts with, in any language. */
function sampleReviewTexts(): Set<string> {
  const definition = getSectionDefinition('testimonials')
  const texts = new Set<string>()
  const collect = (content: unknown) => {
    const items = (content as { items?: { text?: unknown }[] } | undefined)
      ?.items
    for (const item of items ?? []) {
      if (typeof item?.text === 'string' && item.text) texts.add(item.text)
    }
  }
  collect(definition?.defaultContent)
  for (const translation of Object.values(definition?.translations ?? {})) {
    collect(translation)
  }
  return texts
}

/**
 * The example reviews every template ships with, in both languages.
 *
 * A template's reviews are as made up as the block's own example — "Nusrat
 * J." never ordered anything — and publishing them unchanged puts invented
 * customers on a real shop. Loaded when Publish is pressed rather than
 * imported, so the builder does not carry every template's words for it.
 */
export async function templateReviewTexts(): Promise<Set<string>> {
  const { SITE_TEMPLATES } = await import('../templates')
  const texts = new Set<string>()
  const add = (value: unknown) => {
    if (typeof value === 'string') {
      if (value) texts.add(value)
    } else if (value && typeof value === 'object') {
      const localized = value as { en?: unknown; bn?: unknown }
      add(localized.en)
      add(localized.bn)
    }
  }
  for (const template of SITE_TEMPLATES) {
    for (const page of template.pages) {
      for (const section of page.sections) {
        if (section.type !== 'testimonials') continue
        const items = (section.content as { items?: unknown } | undefined)
          ?.items
        if (!Array.isArray(items)) continue
        for (const item of items) add((item as { text?: unknown })?.text)
      }
    }
  }
  return texts
}

export function publishChecks(
  sections: BuilderSection[],
  context: PublishCheckContext
): PublishIssue[] {
  const issues: PublishIssue[] = []
  const visible = sections.filter((section) => section.isVisible)
  const page = visible.filter((section) => section.scope !== 'layout')
  const samples = sampleReviewTexts()
  for (const text of context.exampleReviews ?? []) samples.add(text)

  if (page.length === 0) {
    issues.push({
      key: 'empty-page',
      sectionId: null,
      title: 'This page is empty',
      detail:
        'Add a block from the Add panel, or ask the AI to draft the page.',
    })
  }

  for (const section of visible) {
    const name = sectionLabel(section).name
    const content = section.content ?? {}

    const placeholders =
      section.type === 'customcode'
        ? placeholdersIn(designText(content))
        : placeholdersIn(wordsIn(content))
    if (placeholders.length) {
      const [first, ...rest] = placeholders
      issues.push({
        key: `placeholder:${section.id}`,
        sectionId: section.id,
        title: 'Placeholder text is still on the page',
        detail: `${name}: “${first}”${rest.length ? ` and ${rest.length} more` : ''} — replace ${rest.length ? 'them' : 'it'} with the real details.`,
      })
    }

    switch (section.type) {
      case 'testimonials': {
        const items = Array.isArray(content.items)
          ? (content.items as { text?: unknown }[])
          : []
        if (
          items.some(
            (item) => typeof item?.text === 'string' && samples.has(item.text)
          )
        ) {
          issues.push({
            key: `sample-review:${section.id}`,
            sectionId: section.id,
            title: 'The example review is still showing',
            detail: `${name}: an example review NCOM put there is still showing, not one from your customers. Replace it with a real review or remove it.`,
          })
        }
        break
      }
      case 'image':
        if (!stringField(content.image)) {
          issues.push(nothingToShow(section.id, name, 'no photo is chosen'))
        }
        break
      case 'gallery': {
        const items = Array.isArray(content.items)
          ? (content.items as { image?: unknown }[])
          : []
        if (!items.some((item) => stringField(item?.image))) {
          issues.push(nothingToShow(section.id, name, 'it has no photos'))
        }
        break
      }
      case 'video':
        if (!stringField(content.url)) {
          issues.push(nothingToShow(section.id, name, 'no video link is set'))
        }
        break
      case 'customcode':
        if (sanitizeCustomCode(content.html, content.css).empty) {
          issues.push(nothingToShow(section.id, name, 'it has no code yet'))
        } else if (context.kind === 'LANDING' && context.offers?.length) {
          // With no offers at all, "nothing to sell" below says it better.
          const unknown = unknownOfferRefs(
            stringField(content.html),
            context.offers
          )
          if (unknown.length) {
            issues.push({
              key: `hook:${section.id}`,
              sectionId: section.id,
              title: 'A button or price points at an offer that does not exist',
              detail: `${name}: no offer called “${unknown[0]}”. Use one of this page’s offers, or leave the value empty for the main one.`,
            })
          }
        }
        break
      case 'countdown': {
        const parsed = countdownContentSchema.safeParse(content)
        if (!parsed.success || parsed.data.mode !== 'deadline') break
        const deadline = resolveDeadline(parsed.data)
        if (deadline === null) {
          issues.push({
            key: `countdown:${section.id}`,
            sectionId: section.id,
            title: 'The countdown has no end date',
            detail: `${name}: it stays hidden on the live page until it has one.`,
          })
        } else if (deadline <= Date.now()) {
          issues.push({
            key: `countdown:${section.id}`,
            sectionId: section.id,
            title: 'The countdown has already ended',
            detail: `${name}: shoppers will see that the offer is over. Set a new date, or remove it.`,
          })
        }
        break
      }
      case 'orderform':
        if (context.kind === 'LANDING' && context.offers?.length === 0) {
          issues.push({
            key: 'no-offers',
            sectionId: section.id,
            title: 'The order form has nothing to sell',
            detail:
              'Add an offer under Delivery & offers, so buyers can choose what to order.',
          })
        }
        break
    }
  }

  return issues
}

function nothingToShow(
  sectionId: string,
  name: string,
  why: string
): PublishIssue {
  return {
    key: `empty:${sectionId}`,
    sectionId,
    title: 'A block has nothing to show',
    detail: `${name}: ${why}, so shoppers will not see it.`,
  }
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Every word a block's content shows, skipping the fields that are addresses. */
function wordsIn(value: unknown, key = ''): string {
  if (typeof value === 'string') return NOT_WORDS.test(key) ? '' : value
  if (Array.isArray(value)) {
    return value.map((item) => wordsIn(item, key)).join('\n')
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([field, item]) => wordsIn(item, field))
      .join('\n')
  }
  return ''
}

/**
 * The words of a custom-code design: its text between tags, not its CSS —
 * where `[data-state]` is a selector, not a placeholder.
 */
function designText(content: Record<string, unknown>): string {
  // A walk rather than a pattern: a lazy match to `</style>` retried at
  // every `<style` of a pasted design with none closed is quadratic.
  const html = stringField(content.html).slice(0, 60_000)
  const lower = html.toLowerCase()
  let out = ''
  let cursor = 0
  while (cursor < html.length) {
    const lt = html.indexOf('<', cursor)
    if (lt === -1) {
      out += html.slice(cursor)
      break
    }
    out += `${html.slice(cursor, lt)}\n`
    const gt = html.indexOf('>', lt)
    if (gt === -1) break
    const raw = /^<(style|script)\b/.exec(lower.slice(lt, lt + 8))?.[1]
    if (raw) {
      const close = lower.indexOf(`</${raw}`, gt)
      const end = close === -1 ? -1 : html.indexOf('>', close)
      cursor = end === -1 ? html.length : end + 1
    } else {
      cursor = gt + 1
    }
  }
  return out
}

function placeholdersIn(text: string): string[] {
  const found = new Set<string>()
  for (const match of text.matchAll(PLACEHOLDER)) {
    found.add(match[0])
    if (found.size >= 20) break
  }
  return [...found]
}

/** Offer names in a design's hooks that match none of the page's offers. */
function unknownOfferRefs(
  html: string,
  offers: { key: string; label: string }[]
): string[] {
  const known = new Set(
    offers.flatMap((offer) => [offer.key, offer.label.trim().toLowerCase()])
  )
  const unknown = new Set<string>()
  for (const match of html
    .slice(0, 60_000)
    .matchAll(
      /\bdata-ncom-(?:order|add-to-cart|buy-now|price|regular-price|saving|name|image)\s{0,8}=\s{0,8}(?:"([^"<>]{1,200})"|'([^'<>]{1,200})')/gi
    )) {
    const ref = (match[1] ?? match[2] ?? '').trim()
    if (ref && !known.has(ref) && !known.has(ref.toLowerCase()))
      unknown.add(ref)
  }
  return [...unknown]
}
