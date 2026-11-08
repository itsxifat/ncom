import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getActiveOrganization } from '@/server/services/organizationService'
import { isTrustedOrigin } from '@/lib/security'
import { AiDesignError } from '@/server/ai/claude'
import {
  aiBuilderAvailable,
  getAiConfig,
} from '@/server/services/aiSettingsService'
import {
  NotEnoughCreditsError,
  refundAiCredits,
  spendAiCredits,
  type CreditCharge,
} from '@/server/services/aiCreditService'
import {
  designPageWithAi,
  designSiteWithAi,
  type Progress,
} from '@/server/ai/designer'
import {
  checkAiAllowance,
  checkRoomForSite,
  pageForDesign,
  shopBrief,
} from '@/server/services/aiDesignService'
import {
  saveSiteDraft,
  SiteDraftTooLargeError,
} from '@/server/services/designDraftService'
import { exportPage } from '@/modules/sitespec/export'
import type { PageTheme } from '@/modules/sections/types'

/**
 * `POST /api/ai/design` — the AI builder.
 *
 * A route handler rather than a server action because the answer streams: a
 * whole store takes Claude a minute or two to write, and the merchant watches
 * "Designing section 6…" rather than a frozen button. The response is one JSON
 * object per line — progress, then the result or an error.
 *
 * Two jobs. `site` designs a new site and parks it as a draft for the wizard to
 * preview and create. `page` writes, changes or translates the page open in the
 * builder; the result goes back to the builder, which applies it as one undoable
 * step and saves it like any other edit. Nothing is written to a live site here.
 *
 * Each request is paid for in the workspace's AI credits before Claude is
 * asked, at the price the platform team set for its kind, and given back if no
 * design comes out of it — a failure, or the merchant pressing Stop. The last
 * line of the answer says how many credits are left, for the screen to show.
 */

/**
 * The most of a page Claude is shown, as JSON. It has to send the whole page
 * back inside one answer, which has a length limit, so a page past this could
 * not come back whole anyway — and every character is paid for, twice when
 * the answer needs a second try. A long page with a couple of custom-code
 * blocks still fits.
 */
const MAX_PAGE_CHARACTERS = 200_000

const sectionInput = z.object({
  id: z.string().max(100),
  type: z.string().max(40),
  content: z.unknown(),
  config: z.record(z.string(), z.unknown()).nullish(),
  isVisible: z.boolean().optional(),
})

const bodySchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('site'),
    kind: z.enum(['LANDING', 'STORE']),
    language: z.enum(['en', 'bn']),
    request: z.string().trim().min(3).max(4000),
    storeName: z.string().trim().max(100).optional(),
  }),
  z.object({
    mode: z.literal('page'),
    storeId: z.string().max(100),
    pageId: z.string().max(100),
    request: z.string().trim().min(2).max(4000),
    /** The sections to work on — the whole page, or just the selected one. */
    sections: z.array(sectionInput).max(60),
    scope: z.enum(['page', 'section']),
    /**
     * The site's theme as the builder has it, shown to Claude beside a whole
     * page so it can keep the look or change it. Read into the prompt only
     * (export.ts picks the fields); the bound is on size.
     */
    theme: z
      .record(z.string(), z.unknown())
      .refine((theme) => JSON.stringify(theme).length <= 40_000)
      .nullish(),
  }),
])

export async function POST(request: Request) {
  if (!isTrustedOrigin(request)) {
    return NextResponse.json(
      { error: 'Invalid request origin' },
      { status: 403 }
    )
  }
  // The screens do not offer the AI builder when it is off; this is for a tab
  // left open across the change.
  if (!(await aiBuilderAvailable())) {
    return NextResponse.json(
      { error: 'AI design isn’t available right now. Try again later.' },
      { status: 503 }
    )
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Tell the AI a little more about what you want.' },
      { status: 422 }
    )
  }
  const body = parsed.data
  const { organization, session } = await getActiveOrganization()

  // Both refusals come before the allowance, which counts the request, and
  // before Claude, which is paid for.
  if (
    body.mode === 'page' &&
    JSON.stringify(body.sections).length > MAX_PAGE_CHARACTERS
  ) {
    return NextResponse.json(
      {
        error:
          body.scope === 'section'
            ? 'This section is too big for the AI to change.'
            : 'This page is too big for the AI to change in one go. Select one section and ask about that.',
      },
      { status: 413 }
    )
  }
  if (body.mode === 'site') {
    // A design the plan has no room for would only be refused at "Create".
    const room = await checkRoomForSite(organization.id)
    if (!room.ok) {
      return NextResponse.json({ error: room.message }, { status: 403 })
    }
  }

  const allowance = await checkAiAllowance(organization.id, session.user.id)
  if (!allowance.ok) {
    return NextResponse.json({ error: allowance.message }, { status: 429 })
  }

  const page =
    body.mode === 'page'
      ? await pageForDesign(organization.id, body.storeId, body.pageId)
      : null
  if (body.mode === 'page' && !page) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 })
  }

  // Paid for last, after everything that could still refuse the request.
  const { costs } = await getAiConfig()
  const action = body.mode === 'site' ? 'site' : body.scope
  let charge: CreditCharge
  try {
    charge = await spendAiCredits(organization.id, costs[action], {
      description:
        body.mode === 'site'
          ? `AI design: a new ${body.kind === 'STORE' ? 'online store' : 'landing page'}`
          : body.scope === 'section'
            ? `AI design: a section of “${page!.title}”`
            : `AI design: the “${page!.title}” page`,
      userId: session.user.id,
    })
  } catch (cause) {
    if (cause instanceof NotEnoughCreditsError) {
      return NextResponse.json(
        { error: cause.message, credits: cause.available, needCredits: true },
        { status: 402 }
      )
    }
    throw cause
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))

      let last = 0
      const onProgress = (progress: Progress) => {
        const now = Date.now()
        if (now - last < 400) return
        last = now
        send({ type: 'progress', ...progress })
      }

      try {
        if (body.mode === 'site') {
          const brief = await shopBrief(organization.id, {
            request: body.request,
            language: body.language,
            storeName: body.storeName,
          })
          const result = await designSiteWithAi({
            kind: body.kind,
            brief,
            onProgress,
            signal: request.signal,
          })
          const draftId = await saveSiteDraft({
            organizationId: organization.id,
            kind: body.kind,
            language: body.language,
            source: 'ai',
            template: result.template,
            suggestedName: result.suggestedName,
            issues: result.issues,
          })
          send({
            type: 'done',
            draftId,
            suggestedName: result.suggestedName,
            issues: result.issues,
            credits: charge.availableAfter,
          })
        } else {
          const site = page!
          const brief = await shopBrief(organization.id, {
            request:
              body.scope === 'section'
                ? `${body.request}\n\n(This is about one section of the page: the owner selected it. Return a page with just that one section, changed. Keep its "id" and its block type unless the owner asked for a different kind of block.)`
                : body.request,
            language: site.language,
            storeName: site.storeName,
          })
          const current =
            body.sections.length > 0
              ? exportPage({
                  title: site.title,
                  sections: body.sections.map((section) => ({
                    ...section,
                    config: section.config ?? undefined,
                  })),
                  // A question about one block is not one about the site's
                  // look, and the builder does not apply a theme from it.
                  theme:
                    body.scope === 'page'
                      ? (body.theme as Partial<PageTheme> | null | undefined)
                      : undefined,
                })
              : undefined
          const result = await designPageWithAi({
            kind: site.kind,
            role: site.role,
            language: site.language,
            brief,
            current,
            partial: body.scope === 'section',
            onProgress,
            signal: request.signal,
            effort: body.scope === 'section' ? 'low' : 'medium',
          })
          send({ type: 'done', result, credits: charge.availableAfter })
        }
      } catch (cause) {
        const known =
          cause instanceof AiDesignError ||
          cause instanceof SiteDraftTooLargeError
            ? cause
            : null
        const message =
          known?.message ?? 'Something went wrong while designing. Try again.'
        if (!known) {
          console.error('[ai] design failed', cause)
        }
        // No design, no charge. A refund that fails is logged rather than
        // shown: the merchant's problem is the design, and support can see
        // the charge in the workspace's credit history.
        const credits = await refundAiCredits(
          charge,
          'Refund: the AI design did not finish'
        ).catch((error: unknown) => {
          console.error('[ai] refunding credits failed', error)
          return undefined
        })
        send({ type: 'error', message, credits })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  })
}

export const runtime = 'nodejs'
// A whole store can take a couple of minutes to write.
export const maxDuration = 300
