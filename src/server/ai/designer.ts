import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import type { SiteLanguage } from '@/modules/sections/language'
import type { PageRole, SiteKind } from '@/modules/sections/storefront'
import { sectionRegistry } from '@/modules/sections/registry'
import {
  briefText,
  CHANGE_PAGE_RULES,
  designGuide,
  type BusinessBrief,
} from '@/modules/sitespec/guide'
import { readPageDesign, readSiteDesign } from '@/modules/sitespec/read'
import type { PageSpec } from '@/modules/sitespec/format'
import { askClaude, AiDesignError, type Effort } from './claude'

/**
 * What the AI builder can do, as three requests to Claude.
 *
 * Each one is the design guide as the system prompt and the business as the
 * message, and each answer goes through the same reader a pasted design does —
 * so the AI builder cannot produce anything the paste box would refuse, and a
 * fix to how designs are read is a fix to both.
 *
 * When the answer is not usable JSON, the model is shown why and asked once
 * more. That second turn sends its first answer back exactly as it came, which
 * is what the API needs to keep its reasoning valid.
 */

export interface Progress {
  /** Characters of the answer received so far. */
  characters: number
  /** Sections started so far — a rough count, for the progress line. */
  sections: number
}

/**
 * A `"type"` naming a block. Elements added to a block carry a `"type"` too
 * ("button", "text"), and counting those made a six-section page read
 * "Designing section 14…".
 */
const SECTION_TYPE = new RegExp(
  `"type"\\s*:\\s*"(?:${Object.keys(sectionRegistry).join('|')})"`,
  'g'
)

function progressCounter(onProgress?: (progress: Progress) => void) {
  let characters = 0
  let sections = 0
  let tail = ''
  return (delta: string) => {
    characters += delta.length
    // Count block types across chunk boundaries: each section has one.
    const window = tail + delta
    sections +=
      (window.match(SECTION_TYPE) ?? []).length -
      (tail.match(SECTION_TYPE) ?? []).length
    tail = window.slice(-40)
    onProgress?.({ characters, sections })
  }
}

async function askWithRetry<T>(input: {
  system: string
  prompt: string
  effort: Effort
  read: (text: string) => ({ ok: true } & T) | { ok: false; message: string }
  onProgress?: (progress: Progress) => void
  signal?: AbortSignal
}): Promise<{ ok: true } & T> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: 'user', content: input.prompt },
  ]
  for (let attempt = 0; attempt < 2; attempt++) {
    const answer = await askClaude({
      system: input.system,
      messages,
      effort: input.effort,
      // A fresh count per answer: the second one is the whole design again
      // from the top, not more sections after the first.
      onText: progressCounter(input.onProgress),
      signal: input.signal,
    })
    const result = input.read(answer.text)
    if (result.ok) return result
    messages.push(
      { role: 'assistant', content: answer.content },
      {
        role: 'user',
        content: `NCOM could not use that answer: ${result.message} Send the complete design again as one valid JSON object, with nothing else.`,
      }
    )
  }
  throw new AiDesignError(
    'The AI’s design came back incomplete. Try again, or describe a smaller page.',
    'failed'
  )
}

export async function designSiteWithAi(input: {
  kind: SiteKind
  brief: BusinessBrief
  onProgress?: (progress: Progress) => void
  signal?: AbortSignal
}) {
  return askWithRetry({
    system: designGuide({ kind: input.kind, scope: 'site', channel: 'api' }),
    prompt: `${briefText(input.brief)}\n\nDesign the whole ${input.kind === 'STORE' ? 'online store' : 'landing page'} now.`,
    effort: 'medium',
    read: (text) =>
      readSiteDesign(text, {
        kind: input.kind,
        language: input.brief.language,
        source: 'ai',
      }),
    onProgress: input.onProgress,
    signal: input.signal,
  })
}

/**
 * Writes or changes one page. With `current`, the model edits that page and
 * returns the whole of it, keeping section ids for what it keeps.
 */
export async function designPageWithAi(input: {
  kind: SiteKind
  role: PageRole
  language: SiteLanguage
  brief: BusinessBrief
  current?: PageSpec
  /** The answer replaces one section, not the whole page. */
  partial?: boolean
  onProgress?: (progress: Progress) => void
  signal?: AbortSignal
  effort?: Effort
}) {
  const current = input.current
    ? `\n\nThe page as it is now:\n${JSON.stringify(input.current)}\n\n${CHANGE_PAGE_RULES} Change only what the owner asked for.`
    : '\n\nWrite this page now.'
  return askWithRetry({
    system: designGuide({
      kind: input.kind,
      scope: 'page',
      role: input.role,
      channel: 'api',
    }),
    prompt: `${briefText(input.brief)}${current}`,
    effort: input.effort ?? 'medium',
    read: (text) =>
      readPageDesign(text, {
        kind: input.kind,
        role: input.role,
        language: input.language,
        partial: input.partial,
      }),
    onProgress: input.onProgress,
    signal: input.signal,
  })
}
