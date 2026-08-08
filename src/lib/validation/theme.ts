import { z } from 'zod'

const hexColor = z
  .string()
  .regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i, 'Enter a hex color like #0e6b4f')

export const updateThemeSchema = z.object({
  primaryColor: hexColor,
  secondaryColor: hexColor,
  backgroundColor: hexColor,
  textColor: hexColor,
  headingFont: z.string().trim().min(1).max(60),
  bodyFont: z.string().trim().min(1).max(60),
  buttonStyle: z.enum(['SOLID', 'OUTLINE', 'GHOST']),
  borderRadius: z.enum(['none', 'sm', 'md', 'lg', 'full']),
  spacingScale: z.enum(['compact', 'comfortable', 'spacious']),
  containerWidth: z.string().trim().min(1).max(20),
})

export type UpdateThemeInput = z.infer<typeof updateThemeSchema>

// A template's defaultTheme is stored as loose Json (it has no ThemeSettings
// row of its own), so unlike updateThemeSchema this is used to *parse* that
// Json defensively rather than to validate a trusted form submission.
export const templateThemeSchema = updateThemeSchema.extend({
  customCss: z.string().max(20000).optional(),
})

export type ThemeFormState = { error?: string; success?: string } | undefined
