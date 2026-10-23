import 'server-only'
import { prisma } from '@/server/db/client'
import { env } from '@/lib/env'
import { getSectionDefinition } from '@/modules/sections/registry'
import { PageRenderer } from '@/modules/sections/PageRenderer'
import { PageThemeProvider } from '@/modules/sections/theme'
import type { PageTheme } from '@/modules/sections/types'
import { productQueryKey } from '@/modules/sections/storefront'
import { sectionProductQuery } from '@/server/services/storefrontService'
import { builderStorefront } from './builder'

type Section = {
  id: string
  order: number
  type: string
  content: unknown
  config: unknown
  isVisible: boolean
}

/**
 * A store page as a shopper will see it once published: the draft header and
 * footer around the draft page, with the shop's real products — or the
 * samples, before it has any.
 */
export async function StoreDraftPreview({
  page,
}: {
  page: {
    role: 'STANDARD' | 'PRODUCT' | 'CATALOG' | 'LAYOUT'
    storeId: string
    sections: Section[]
    store: {
      name: string
      subdomain: string
      organizationId: string
      theme: PageTheme | null
    }
  }
}) {
  const layout = await prisma.page.findFirst({
    where: { storeId: page.storeId, role: 'LAYOUT' },
    include: { sections: { orderBy: { order: 'asc' } } },
  })
  const layoutSections = (layout?.sections ?? []) as Section[]
  const placed = (where: 'top' | 'bottom') =>
    layoutSections.filter(
      (section) =>
        section.isVisible &&
        (getSectionDefinition(section.type)?.placement ?? 'bottom') === where
    )
  const top = placed('top')
  const bottom = placed('bottom')

  const { storefront, products } = await builderStorefront({
    organizationId: page.store.organizationId,
    storeName: page.store.name,
    liveUrl: `http://${page.store.subdomain}.${env.ROOT_DOMAIN}`,
    role: page.role,
    sections: [...top, ...page.sections, ...bottom],
  })

  // Each block's answer, by section, the way the live site hands them over.
  for (const section of [...top, ...page.sections, ...bottom]) {
    const query = sectionProductQuery(section)
    if (query)
      storefront.sectionProducts[section.id] =
        products[productQueryKey(query)] ?? []
  }

  const theme = page.store.theme!
  const run = (sections: Section[]) => (
    <PageRenderer
      bare
      theme={theme}
      sections={sections}
      storeId={page.storeId}
      storefront={storefront}
    />
  )

  return (
    <PageThemeProvider theme={theme} className="flex min-h-svh flex-col">
      {run(top)}
      <main className="flex flex-1 flex-col">{run(page.sections)}</main>
      {run(bottom)}
    </PageThemeProvider>
  )
}
