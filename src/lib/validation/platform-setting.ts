import { z } from 'zod'

export const upsertPlatformSettingSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(
      /^[a-z0-9._-]+$/,
      'Lowercase letters, numbers, dots, dashes, underscores'
    ),
  value: z.string().trim().min(1).max(10000),
})

export type UpsertPlatformSettingInput = z.infer<
  typeof upsertPlatformSettingSchema
>
