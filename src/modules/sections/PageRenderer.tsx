import { getSectionDefinition } from './registry'
import { PageThemeProvider } from './theme'
import type { PageTheme, SectionConfig } from './types'

export interface RenderablePageSection {
  id: string
  order: number
  content: unknown
  config: unknown
  isVisible: boolean
  componentDefinition: { key: string }
}

/**
 * Renders a page's sections through the same registry/Renderer components
 * used everywhere else a page is shown (builder canvas, authenticated
 * preview, and eventually the public site) — one source of truth so the
 * editor preview can never drift from what actually gets published.
 */
export function PageRenderer({
  theme,
  sections,
}: {
  theme: PageTheme
  sections: RenderablePageSection[]
}) {
  return (
    <PageThemeProvider theme={theme}>
      {sections
        .filter((section) => section.isVisible)
        .map((section) => {
          const definition = getSectionDefinition(
            section.componentDefinition.key
          )
          if (!definition) return null

          const parsed = definition.schema.safeParse(section.content)
          const content = parsed.success
            ? parsed.data
            : definition.defaultContent
          const config = (section.config ?? undefined) as
            SectionConfig | undefined

          const Renderer = definition.Renderer
          return (
            <Renderer
              key={section.id}
              content={content}
              config={config}
              theme={theme}
            />
          )
        })}
    </PageThemeProvider>
  )
}
