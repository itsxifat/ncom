import { getSectionDefinition, type StorefrontCommerce } from './registry'
import { PageThemeProvider } from './theme'
import { StorefrontEnhancements } from './StorefrontEnhancements'
import type { PageTheme, SectionConfig } from './types'

export interface RenderablePageSection {
  id: string
  order: number
  content: unknown
  config: unknown
  isVisible: boolean
  componentDefinition: { key: string }
  /**
   * Set for sections whose ComponentDefinition.renderMode is LIQUID.
   *
   * Liquid is compiled to HTML on the server — at publish time for the public
   * site, and by a server action for the builder preview — and only the
   * resulting string reaches this component. That keeps liquidjs out of the
   * client bundle entirely (this renderer also runs inside the builder canvas,
   * which is a client component) and, more importantly, keeps untrusted
   * template execution on the server where the sandbox's limits actually
   * apply. A section with `html` set is rendered as-is; nothing here parses
   * Liquid.
   */
  html?: string | null
}

/**
 * Renders a page's sections through the same registry/Renderer components
 * used everywhere else a page is shown (builder canvas, authenticated
 * preview, and the public site) — one source of truth so the editor preview
 * can never drift from what actually gets published.
 */
export function PageRenderer({
  theme,
  sections,
  storeId,
  commerce,
}: {
  theme: PageTheme
  sections: RenderablePageSection[]
  /** Passed down to sections that call the commerce API (the order form). */
  storeId?: string
  /** What this page sells. Absent where there is no real page (template gallery). */
  commerce?: StorefrontCommerce
}) {
  return (
    <PageThemeProvider theme={theme}>
      <StorefrontEnhancements />
      {sections
        .filter((section) => section.isVisible)
        .map((section) => {
          // Liquid sections arrive pre-rendered. The HTML is tenant-authored
          // and deliberately not sanitized here: this is the customer's own
          // storefront and emitting arbitrary markup is the entire point of
          // the feature. The isolation that makes that safe is at the origin
          // level — tenant sites are served from a separate registrable
          // domain, and the builder canvas renders inside a sandboxed iframe —
          // not at the string level.
          if (typeof section.html === 'string') {
            return (
              <div
                key={section.id}
                data-section-id={section.id}
                dangerouslySetInnerHTML={{ __html: section.html }}
              />
            )
          }

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
