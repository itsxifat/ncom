import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PanelTop } from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getStore } from '@/server/services/storeService'
import { PAGE_STARTERS } from '@/modules/templates/page-starters'
import { textIn } from '@/modules/templates/localize'
import { siteLanguage } from '@/modules/sections/language'
import { prisma } from '@/server/db/client'
import { Button } from '@/components/ui/button'
import { NewPageForm } from './NewPageForm'

/**
 * Adding a page to a site.
 *
 * An online store gets the starters — the about, contact and delivery pages
 * shoppers look for, already written. A landing site is one page by
 * definition, so instead of a form that would only fail it says so and offers
 * a new landing page for the new campaign.
 */
export default async function NewPagePage({
  params,
}: PageProps<'/stores/[storeId]/pages/new'>) {
  const { storeId } = await params
  const { organization } = await getActiveOrganization()

  let store
  try {
    store = await getStore(organization.id, storeId)
  } catch {
    notFound()
  }

  if (store.kind === 'LANDING') {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 py-12 text-center">
        <span className="bg-lime text-ink flex size-12 items-center justify-center rounded-xl">
          <PanelTop className="size-6" />
        </span>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          A landing page is one page
        </h1>
        <p className="text-muted-foreground">
          It is the page your ad sends people to, with its own offers and its
          own numbers. For another product or campaign, make another landing
          page — or an online store if you want many pages.
        </p>
        <Button render={<Link href="/stores/new" />} nativeButton={false}>
          Create a website
        </Button>
      </div>
    )
  }

  // The suggested page name is in the shop's language, like the page itself.
  const theme = await prisma.themeSettings.findUnique({
    where: { storeId: store.id },
    select: { language: true },
  })
  const language = siteLanguage(theme)

  return (
    <NewPageForm
      storeId={storeId}
      starters={PAGE_STARTERS.map(({ key, name, description, title }) => ({
        key,
        name,
        description,
        title: textIn(title, language),
      }))}
    />
  )
}
