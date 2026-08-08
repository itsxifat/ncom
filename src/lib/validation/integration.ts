import { z } from 'zod'

export const updateIntegrationSchema = z.object({
  gaMeasurementId: z.string().trim().max(30).optional(),
  gtmContainerId: z.string().trim().max(30).optional(),
  metaPixelId: z.string().trim().max(30).optional(),
  customHeadScript: z.string().trim().max(5000).optional(),
})

export type UpdateIntegrationInput = z.infer<typeof updateIntegrationSchema>
