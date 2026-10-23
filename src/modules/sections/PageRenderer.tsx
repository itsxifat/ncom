import { getSectionDefinition, type StorefrontCommerce } from './registry'
import { FontStylesheet, PageThemeProvider } from './theme'
import {
  buildElementStylesheet,
  elementFontFamilies,
  pageUsesAnimation,
} from './elementStyle'
import { ScrollAnimations } from './ScrollAnimations'
import type { PageTheme, SectionConfig } from './types'
import type { StorefrontContext } from './storefront'

export interface RenderablePageSection {
  id: string
  order: number
  /** The block type, resolved against the in-code registry. */
  type?: string
  content: unknown
  config: unknown
  isVisible: boolean
  /**
   * How a section named its block before the catalogue moved into code.
   *
   * A PageVersion snapshot is immutable, so every page published before that
   * change still carries this shape — and the public site renders snapshots,
   * not live rows. Reading it here is what stops those pages going blank until
   * someone happens to republish them.
   */
  componentDefinition?: { key: string }
}

/** A section's block key, from either the current or the pre-registry shape. */
function sectionType(section: RenderablePageSection): string | undefined {
  return section.type ?? section.componentDefinition?.key
}

/** Block keys that were renamed when the catalogue moved into code. */
const RENAMED_KEYS: Record<string, string> = {
  'order-form': 'orderform',
  text: 'richtext',
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
  storefront,
  editing,
  bare = false,
}: {
  theme: PageTheme
  sections: RenderablePageSection[]
  /** The shop around the page, on an online store. */
  storefront?: StorefrontContext
  /**
   * Render the blocks without a theme wrapper of their own, because the
   * caller already provides one. A store page is several runs of blocks — the
   * header, the page, the footer — inside one themed document, and giving
   * each run its own wrapper would let them stretch apart on a short page.
   */
  bare?: boolean
  /** Passed down to blocks that call the commerce API (the order form). */
  storeId?: string
  /** What this page sells. Absent where there is no real page behind it. */
  commerce?: StorefrontCommerce
  /**
   * True only for the builder canvas, so a block that has nothing to show yet
   * can draw a placeholder there instead of disappearing. Left off everywhere
   * a real visitor is being served, including the preview routes.
   */
  editing?: boolean
}) {
  // The per-element design of every visible section, as one stylesheet.
  //
  // Built here rather than inside each section because the breakpoint overrides
  // are media queries, and media queries only cascade correctly when they are
  // in a known order in a single sheet. A `<style>` per section would let a
  // section's tablet rules land after a later section's mobile rules, and a
  // page would style differently depending on the order its blocks happen to
  // be in.
  const visible = sections.filter((section) => section.isVisible)
  const elementConfigs = visible.map((section) => ({
    id: section.id,
    elements: (section.config as SectionConfig | null)?.elements,
  }))
  const elementCss = buildElementStylesheet(elementConfigs)
  // Never in the builder: an editor where blocks fade out as you scroll past
  // them is an editor you cannot work in, and the merchant needs to see what
  // they are styling, not watch it play.
  const animates = !editing && pageUsesAnimation(elementConfigs)

  // The fonts these blocks name themselves — a section's typeface overrides,
  // and any element given a family of its own — loaded the way the theme's
  // are, in one stylesheet for the whole run of blocks (or a few, past the
  // number of families the proxy serves from one). The theme's two are left
  // out, whatever their letter case: `PageThemeProvider` already asks for
  // them, and naming them again here would only make a second stylesheet for
  // faces already loading. Names that are not Google families are dropped by
  // `fontStylesheetHrefs`, so they cost no request.
  const fontKey = (name: unknown) =>
    typeof name === 'string'
      ? name.trim().replace(/\s+/g, ' ').toLowerCase()
      : ''
  const themeFonts = new Set([
    fontKey(theme.headingFont),
    fontKey(theme.bodyFont),
  ])
  const sectionFonts = [
    ...visible.flatMap((section) => {
      const config = section.config as SectionConfig | null
      return [config?.headingFont, config?.bodyFont]
    }),
    ...elementFontFamilies(elementConfigs),
  ].filter((name) => fontKey(name) && !themeFonts.has(fontKey(name)))

  const blocks = (
    <>
      <FontStylesheet fonts={sectionFonts} />
      {elementCss && <style>{elementCss}</style>}
      {animates && <ScrollAnimations />}
      {visible.map((section) => {
        const key = sectionType(section)
        if (!key) return null
        const definition = getSectionDefinition(RENAMED_KEYS[key] ?? key)
        if (!definition) return null

        const parsed = definition.schema.safeParse(section.content)
        const content = parsed.success ? parsed.data : definition.defaultContent
        const config = (section.config ?? undefined) as
          SectionConfig | undefined

        const Renderer = definition.Renderer
        return (
          <div
            key={section.id}
            data-section-id={section.id}
            className={definition.wrapperClassName?.(content)}
          >
            <Renderer
              content={content}
              config={config}
              theme={theme}
              sectionId={section.id}
              storeId={storeId}
              commerce={commerce}
              storefront={storefront}
              editing={editing}
            />
          </div>
        )
      })}
    </>
  )

  if (bare) return blocks

  return (
    // `scroll-smooth` is what makes every CTA on the page glide to the order
    // form from a plain `#order` anchor, with no script involved.
    <PageThemeProvider theme={theme} className="scroll-smooth">
      {blocks}
    </PageThemeProvider>
  )
}
