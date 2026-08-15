import { z } from 'zod'

/**
 * A stored secret the merchant is not re-typing.
 *
 * The form renders saved credentials as a masked placeholder rather than the
 * real value — a page that prints an access token in an input is a page that
 * prints it into every screen recording and browser autofill store. Submitting
 * that placeholder back therefore has to mean "leave it alone", which is what
 * this sentinel is for. It is checked before the value is encrypted, so it can
 * never itself be saved as a token.
 */
export const UNCHANGED_SECRET = '__ncom_unchanged__'

export const updateIntegrationSchema = z.object({
  gaMeasurementId: z.string().trim().max(30).optional(),
  gtmContainerId: z.string().trim().max(30).optional(),
  metaPixelId: z.string().trim().max(30).optional(),
  customHeadScript: z.string().trim().max(5000).optional(),

  // ── Server-side tracking ──
  //
  // Generous length caps rather than format checks. A Meta system-user token is
  // ~200 characters today and has changed length twice; rejecting a valid
  // credential because it does not match a guessed pattern is a worse failure
  // than letting the platform's own API reject it with a message that says so —
  // which is what the "Send test event" button surfaces.
  metaAccessToken: z.string().trim().max(500).optional(),
  metaTestEventCode: z.string().trim().max(40).optional(),
  ga4ApiSecret: z.string().trim().max(200).optional(),
})

export type UpdateIntegrationInput = z.infer<typeof updateIntegrationSchema>
