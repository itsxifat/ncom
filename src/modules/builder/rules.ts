import { getSectionDefinition, blockFitsPage } from '../sections/registry'
import type { SectionDefinition } from '../sections/registry'
import type { PageRole, SiteKind } from '../sections/storefront'
import { isLayoutSection, type BuilderSection } from './store'

/**
 * What a merchant may do to a block where it is.
 *
 * In one place so the layers list, the canvas toolbar, the inspector and the
 * keyboard all give the same answer — a delete button that works in one of
 * them and not another is the kind of inconsistency that makes an editor feel
 * broken rather than careful.
 */

export interface PageContext {
  site: SiteKind
  role: PageRole
}

/** The header and footer every store page wears; the bar above is optional. */
const REQUIRED_LAYOUT = new Set(['header', 'footer'])

export function canRemove(
  section: BuilderSection,
  context: PageContext | null
): { ok: boolean; reason?: string } {
  const definition = getSectionDefinition(section.type)
  if (isLayoutSection(section)) {
    return REQUIRED_LAYOUT.has(section.type)
      ? {
          ok: false,
          reason: 'Every page of your store has one. Hide it if you need to.',
        }
      : { ok: true }
  }
  if (context && definition?.requiredOn === context.role) {
    return {
      ok: false,
      reason:
        context.role === 'PRODUCT'
          ? 'Your product page shows the product here. You can move and restyle it.'
          : 'This page lists your products here. You can move and restyle it.',
    }
  }
  if (section.type === 'orderform') {
    return {
      ok: false,
      reason: 'A landing page needs its order form — it is how people buy.',
    }
  }
  return { ok: true }
}

export function canDuplicate(section: BuilderSection): boolean {
  if (isLayoutSection(section)) return false
  return !getSectionDefinition(section.type)?.singleton
}

/**
 * Whether a block can be saved to the library to use again.
 *
 * Only blocks that could be inserted somewhere. The layout's are already on
 * every page; the order form and a product page's details are the one-of-each
 * blocks every page of their kind already has, so a saved copy could never
 * be put down anywhere.
 */
export function canSaveAsBlock(section: BuilderSection): boolean {
  if (isLayoutSection(section)) return false
  const definition = getSectionDefinition(section.type)
  if (!definition || definition.placement) return false
  return !definition.singleton && !definition.requiredOn
}

/** Blocks the library offers on this page, in the library's order. */
export function libraryBlocks(
  all: SectionDefinition[],
  context: PageContext | null
): SectionDefinition[] {
  return all.filter((definition) => {
    // Layout blocks are added from the layers list, where the layout lives.
    if (definition.placement) return false
    if (!context)
      return !definition.sites || definition.sites.includes('LANDING')
    return blockFitsPage(definition, context.site, context.role)
  })
}
