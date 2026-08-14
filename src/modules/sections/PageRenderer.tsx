import { getSectionDefinition, type StorefrontCommerce } from './registry'
import { PageThemeProvider } from './theme'
import type { PageTheme, SectionConfig } from './types'

export interface RenderablePageSection {
  id: string
  order: number
  /** The block type, resolved against the in-code registry. */
  type: string
  content: unknown
  config: unknown
  isVisible: boolean
}

/**
 * Renders a page's blocks through the same registry components used everywhere
 * a page is shown — builder canvas, authenticated preview, and the public site.
 * One source of truth, so the editor preview can never drift from what actually
 * gets published.
 */
export function PageRenderer({
  theme,
  sections,
  storeId,
  commerce,
}: {
  theme: PageTheme
  sections: RenderablePageSection[]
  /** Passed down to blocks that call the commerce API (the order form). */
  storeId?: string
  /** What this page sells. Absent where there is no real page behind it. */
  commerce?: StorefrontCommerce
}) {
  return (
    // `scroll-smooth` is what makes every CTA on the page glide to the order
    // form from a plain `#order` anchor, with no script involved.
    <PageThemeProvider theme={theme} className="scroll-smooth">
      {sections
        .filter((section) => section.isVisible)
        .map((section) => {
          const definition = getSectionDefinition(section.type)
          if (!definition) return null

          const parsed = definition.schema.safeParse(section.content)
          const content = parsed.success
            ? parsed.data
            : definition.defaultContent
          const config = (section.config ?? undefined) as
            SectionConfig | undefined

          const Renderer = definition.Renderer
          return (
            <div key={section.id} data-section-id={section.id}>
              <Renderer
                content={content}
                config={config}
                theme={theme}
                sectionId={section.id}
                storeId={storeId}
                commerce={commerce}
              />
            </div>
          )
        })}
    </PageThemeProvider>
  )
}
