import Link from 'next/link'
import { Package, Plus } from 'lucide-react'
import { getActiveOrganization } from '@/server/services/organizationService'
import { listOffers } from '@/server/services/offerAdminService'
import { checkOfferHealth } from '@/server/services/offerService'
import { getOrganizationSettings } from '@/server/services/organizationSettingsService'
import { prisma } from '@/server/db/client'
import { formatMoney } from '@/lib/money'
import { EmptyState } from '@/components/app/empty-state'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ListPanel,
  ListPanelHeader,
  ListRow,
  ListRowActions,
  ListRowText,
} from '@/components/app/list-panel'

/**
 * Every offer the workspace runs, most specific scope first.
 *
 * One list rather than one per page: a merchant asking "what am I selling right
 * now" is asking about the business, and an answer that can only be reached one
 * campaign page at a time is not an answer. Scope is a badge on the row, so
 * "this bundle runs everywhere" is legible at a glance.
 */
export default async function OffersPage() {
  const { organization } = await getActiveOrganization()

  const [offers, settings, stores] = await Promise.all([
    listOffers(organization.id),
    getOrganizationSettings(organization.id),
    prisma.store.findMany({
      where: { organizationId: organization.id },
      select: {
        id: true,
        name: true,
        pages: { select: { id: true, title: true } },
      },
    }),
  ])

  // Asked of the storefront's own resolver, so this list cannot claim an offer
  // is fine while pages quietly drop it.
  const health = await checkOfferHealth(offers.map((offer) => offer.id))

  const currency = settings?.currencyCode ?? 'USD'
  const now = new Date()

  const storeNames = new Map(stores.map((store) => [store.id, store.name]))
  const pageTitles = new Map(
    stores.flatMap((store) => store.pages.map((page) => [page.id, page.title]))
  )

  if (offers.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="No offers yet"
        description="An offer is what a landing page's order form sells — one product, a bundle at your own price, or a mix-and-match ladder. Without one, a page has nothing to take an order for."
        action={
          <Button
            render={<Link href="/discounts/offers/new" />}
            nativeButton={false}
          >
            <Plus />
            New offer
          </Button>
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Button
          render={<Link href="/discounts/offers/new" />}
          nativeButton={false}
        >
          <Plus />
          New offer
        </Button>
      </div>

      <ListPanel>
        <ListPanelHeader>
          <p className="text-muted-foreground text-sm">
            {offers.length} {offers.length === 1 ? 'offer' : 'offers'}
          </p>
        </ListPanelHeader>

        {offers.map((offer) => {
          const where =
            offer.scope === 'ORGANIZATION'
              ? 'Every store'
              : offer.scope === 'STORE'
                ? (storeNames.get(offer.storeId ?? '') ?? 'A store')
                : (pageTitles.get(offer.pageId ?? '') ?? 'A page')

          const kind =
            offer.kind === 'FIXED'
              ? `Fixed set · ${offer.items.length} product${offer.items.length === 1 ? '' : 's'}`
              : offer.kind === 'COLLECTION'
                ? `Mix & match · ${offer.tiers.length} rung${offer.tiers.length === 1 ? '' : 's'}`
                : `À la carte · ${offer.items.length} in pool`

          const price =
            offer.pricingMode === 'FIXED'
              ? formatMoney(offer.priceCents, currency)
              : offer.pricingMode === 'PERCENT'
                ? `${offer.discountBps / 100}% off`
                : offer.pricingMode === 'AMOUNT'
                  ? `${formatMoney(offer.priceCents, currency)} off`
                  : null

          // "Live" is not just the flag — a scheduled or finished offer is
          // switched on and sells nothing, and showing it as live is how a
          // merchant ends up debugging a bundle that "does not appear".
          const scheduled = offer.startsAt !== null && offer.startsAt > now
          const finished = offer.endsAt !== null && offer.endsAt <= now
          const live = offer.isActive && !scheduled && !finished

          // The same trap one step further in: an offer can pass every date and
          // flag check and still be dropped by the page. Only worth saying
          // while it is otherwise live — nobody needs to be told a paused offer
          // is not showing. `soldOut` is the softer case: the offer is up, but
          // some of it cannot be bought, which is a restocking job.
          const state = live ? health.get(offer.id) : undefined
          const blocked = state?.hidden ?? undefined
          const soldOut = state?.soldOut ?? []

          const rules = offer.variantRules.length
          const narrowed = offer.items.filter(
            (item) => item.variantIds.length > 0
          ).length

          return (
            <ListRow key={offer.id}>
              <ListRowText
                title={
                  <Link
                    href={`/discounts/offers/${offer.id}`}
                    className="hover:underline"
                  >
                    {offer.label}
                  </Link>
                }
                meta={
                  <>
                    {where} · {kind}
                    {price && <> · {price}</>}
                    {rules > 0 && (
                      <>
                        {' '}
                        · {rules} size rule{rules === 1 ? '' : 's'}
                      </>
                    )}
                    {narrowed > 0 && <> · {narrowed} narrowed to sizes</>}
                    {offer.giftVariantId && <> · free gift</>}
                    {blocked && (
                      <span className="text-destructive block">
                        Buyers cannot see this offer because {blocked}.
                      </span>
                    )}
                    {soldOut.length > 0 && (
                      <span className="block text-amber-600 dark:text-amber-500">
                        On the page, but out of stock:{' '}
                        {soldOut.map((title) => `"${title}"`).join(', ')}.
                        Buyers can see {soldOut.length === 1 ? 'it' : 'them'}{' '}
                        but cannot order {soldOut.length === 1 ? 'it' : 'them'}.
                      </span>
                    )}
                  </>
                }
                badges={
                  <>
                    <Badge
                      variant={
                        blocked
                          ? 'destructive'
                          : live
                            ? 'lime'
                            : finished
                              ? 'outline'
                              : 'secondary'
                      }
                    >
                      {finished
                        ? 'Finished'
                        : scheduled
                          ? 'Scheduled'
                          : blocked
                            ? 'Not showing'
                            : offer.isActive
                              ? 'Live'
                              : 'Paused'}
                    </Badge>
                    {soldOut.length > 0 && !blocked && (
                      <Badge variant="outline">Out of stock</Badge>
                    )}
                    {offer.isDefault && (
                      <Badge variant="outline">Preselected</Badge>
                    )}
                  </>
                }
              />
              <ListRowActions>
                <span className="text-muted-foreground text-sm">
                  {offer.scope === 'ORGANIZATION'
                    ? 'Workspace'
                    : offer.scope === 'STORE'
                      ? 'Store'
                      : 'Page'}
                </span>
              </ListRowActions>
            </ListRow>
          )
        })}
      </ListPanel>
    </div>
  )
}
