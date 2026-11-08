'use server'

import { z } from 'zod'
import { getActiveOrganization } from '@/server/services/organizationService'
import { requireOrgAccess } from '@/server/auth/rbac'
import { checkRateLimit } from '@/lib/rate-limit'
import {
  aiBuilderAvailable,
  getAiConfig,
  type AiAction,
} from '@/server/services/aiSettingsService'
import {
  getAiCreditSummary,
  type AiCreditSummary,
} from '@/server/services/aiCreditService'
import {
  checkRoomForSite,
  pageForDesign,
  shopBrief,
} from '@/server/services/aiDesignService'
import {
  saveSiteDraft,
  SiteDraftTooLargeError,
} from '@/server/services/designDraftService'
import { CHANGE_PAGE_RULES, chatPrompt } from '@/modules/sitespec/guide'
import { exportPage } from '@/modules/sitespec/export'
import {
  readPageDesign,
  readSiteDesign,
  type PageDesignResult,
} from '@/modules/sitespec/read'
import type { DesignIssue } from '@/modules/sitespec/normalize'
import type { PageTheme, SectionConfig } from '@/modules/sections/types'

/**
 * "Use your own AI": the prompt a merchant copies into ChatGPT, Gemini or
 * Claude, and reading the answer they paste back.
 *
 * Needs no AI key of ours — the merchant's own assistant does the writing —
 * which is why this works on every NCOM installation, and why a merchant who
 * already pays for an AI they like can use it to build here.
 */

const languageSchema = z.enum(['en', 'bn'])
const kindSchema = z.enum(['LANDING', 'STORE'])

async function readLimit(organizationId: string) {
  const limit = await checkRateLimit(`design-read:${organizationId}`, 60, 60)
  return limit.allowed
}

/**
 * Tighter than reading: every pasted site is parked in Redis as a draft, and
 * a merchant pastes a whole site a few times at most, not once a second.
 */
async function draftLimit(organizationId: string) {
  const limit = await checkRateLimit(`design-draft:${organizationId}`, 10, 60)
  return limit.allowed
}

export interface AiBuilderStatus {
  /** Whether the AI builder is offered at all. */
  available: boolean
  /** Credits each kind of request costs. */
  costs: Record<AiAction, number>
  /** This workspace's credits. Null when the AI builder is not offered. */
  credits: AiCreditSummary | null
}

/**
 * What the AI screens show beside the button: whether there is an AI builder,
 * what a request costs, and how many credits the workspace has left.
 */
export async function aiBuilderStatusAction(): Promise<AiBuilderStatus> {
  if (!(await aiBuilderAvailable())) {
    return {
      available: false,
      costs: { site: 0, page: 0, section: 0 },
      credits: null,
    }
  }
  const { organization } = await getActiveOrganization()
  const [config, credits] = await Promise.all([
    getAiConfig(),
    getAiCreditSummary(organization.id),
  ])
  return { available: true, costs: config.costs, credits }
}

/** The prompt for designing a whole new site. */
export async function sitePromptAction(input: {
  kind: string
  language: string
  request: string
}): Promise<string> {
  const kind = kindSchema.parse(input.kind)
  const language = languageSchema.parse(input.language)
  const { organization } = await getActiveOrganization()
  const brief = await shopBrief(organization.id, {
    request: input.request.slice(0, 4000),
    language,
  })
  return chatPrompt({ kind, scope: 'site' }, brief)
}

export type PastedSiteResult =
  | {
      ok: true
      draftId: string
      suggestedName: string | null
      issues: DesignIssue[]
      pages: number
      sections: number
    }
  | { ok: false; message: string }

/** Reads a pasted whole-site design and parks it as a draft to preview. */
export async function readPastedSiteAction(input: {
  kind: string
  language: string
  text: string
}): Promise<PastedSiteResult> {
  const kind = kindSchema.parse(input.kind)
  const language = languageSchema.parse(input.language)
  const { organization } = await getActiveOrganization()
  await requireOrgAccess(organization.id, 'EDITOR')
  if (
    !(await readLimit(organization.id)) ||
    !(await draftLimit(organization.id))
  ) {
    return { ok: false, message: 'Too many tries in a row. Wait a minute.' }
  }
  if (input.text.length > 400_000) {
    return { ok: false, message: 'That answer is too long to be one website.' }
  }
  // Said now, not after the preview and naming, when "Create" would refuse.
  const room = await checkRoomForSite(organization.id)
  if (!room.ok) return room

  const result = readSiteDesign(input.text, {
    kind,
    language,
    source: 'pasted',
  })
  if (!result.ok) return result

  let draftId: string
  try {
    draftId = await saveSiteDraft({
      organizationId: organization.id,
      kind,
      language,
      source: 'pasted',
      template: result.template,
      suggestedName: result.suggestedName,
      issues: result.issues,
    })
  } catch (cause) {
    if (cause instanceof SiteDraftTooLargeError) {
      return { ok: false, message: cause.message }
    }
    throw cause
  }
  const standard = result.template.pages.filter((page) => !page.role)
  return {
    ok: true,
    draftId,
    suggestedName: result.suggestedName,
    issues: result.issues,
    pages: standard.length,
    sections: standard.reduce((sum, page) => sum + page.sections.length, 0),
  }
}

const sectionInput = z.object({
  id: z.string().max(100),
  type: z.string().max(40),
  content: z.unknown(),
  config: z.record(z.string(), z.unknown()).nullish(),
  isVisible: z.boolean().optional(),
})

/**
 * The site's theme as the builder has it, shown to the AI beside the page.
 * Only read into the prompt (export.ts picks the fields), so the bound is on
 * size: a theme is a few colours, fonts and at most the custom CSS.
 */
const themeInput = z
  .record(z.string(), z.unknown())
  .refine((theme) => JSON.stringify(theme).length <= 40_000)
  .nullish()

/**
 * The prompt for one page in the builder: either a new page, or — when the
 * page's sections are passed — a change to the page as it is, round-tripped by
 * section id so the answer updates what is there instead of starting over.
 */
export async function pagePromptAction(input: {
  storeId: string
  pageId: string
  request: string
  sections: unknown[]
  theme?: unknown
}): Promise<string> {
  const { organization } = await getActiveOrganization()
  const page = await pageForDesign(organization.id, input.storeId, input.pageId)
  if (!page) throw new Error('Page not found')
  const sections = z.array(sectionInput).max(60).parse(input.sections)
  const theme = themeInput.parse(input.theme)

  const brief = await shopBrief(organization.id, {
    request: input.request.slice(0, 4000),
    language: page.language,
    storeName: page.storeName,
  })
  const prompt = chatPrompt(
    { kind: page.kind, scope: 'page', role: page.role },
    brief
  )
  if (sections.length === 0) return prompt

  const current = exportPage({
    title: page.title,
    sections: sections.map((section) => ({
      ...section,
      config: (section.config ?? undefined) as SectionConfig | undefined,
    })),
    theme: theme as Partial<PageTheme> | null | undefined,
  })
  return `${prompt}\n## The page as it is now\n\nChange this page as the owner asked. ${CHANGE_PAGE_RULES}\n\n\`\`\`json\n${JSON.stringify(current, null, 1)}\n\`\`\`\n`
}

/** Reads a pasted page design for the builder to apply. */
export async function readPastedPageAction(input: {
  storeId: string
  pageId: string
  text: string
  /** Added to the end of the page rather than replacing it. */
  partial?: boolean
}): Promise<PageDesignResult | { ok: false; message: string }> {
  const { organization } = await getActiveOrganization()
  await requireOrgAccess(organization.id, 'EDITOR')
  if (!(await readLimit(organization.id))) {
    return { ok: false, message: 'Too many tries in a row. Wait a minute.' }
  }
  if (input.text.length > 400_000) {
    return { ok: false, message: 'That answer is too long to be one page.' }
  }
  const page = await pageForDesign(organization.id, input.storeId, input.pageId)
  if (!page) return { ok: false, message: 'Page not found.' }
  return readPageDesign(input.text, {
    kind: page.kind,
    role: page.role,
    language: page.language,
    partial: Boolean(input.partial),
  })
}
