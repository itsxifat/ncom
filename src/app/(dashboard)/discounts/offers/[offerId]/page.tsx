import { notFound } from 'next/navigation'
import { getActiveOrganization } from '@/server/services/organizationService'
import { getOffer } from '@/server/services/offerAdminService'
import { PageHeader } from '@/components/app/page-header'
import { OfferForm } from '@/components/store/offer-form'
import { centsToMajorString, bpsToPercent } from '@/lib/money'
import { loadOfferContext, toLocalInput } from '../offer-data'
import { OfferDangerZone } from './danger-zone'

/** Blank rather than "0", so an unset field reads as unset in the input. */
function percent(bps: number): string {
  return bps > 0 ? String(bpsToPercent(bps)) : ''
}

function money(cents: number, currencyCode: string): string {
  return cents > 0 ? centsToMajorString(cents, currencyCode) : ''
}

export default async function EditOfferPage({
  params,
}: PageProps<'/discounts/offers/[offerId]'>) {
  const { offerId } = await params
  const { organization } = await getActiveOrganization()

  const [offer, context] = await Promise.all([
    getOffer(organization.id, offerId),
    loadOfferContext(organization.id),
  ])
  if (!offer) notFound()

  const { currencyCode, products, stores } = context

  return (
    <>
      <PageHeader
        backHref="/discounts/offers"
        backLabel="Offers"
        title={offer.label}
        description={`Key ${offer.key} — what orders record this offer as.`}
      />

      <OfferForm
        currencyCode={currencyCode}
        products={products}
        stores={stores}
        initial={{
          id: offer.id,
          label: offer.label,
          description: offer.description ?? '',
          badge: offer.badge ?? '',
          scope: offer.scope,
          storeId: offer.storeId ?? '',
          pageId: offer.pageId ?? '',
          kind: offer.kind,
          pricingMode: offer.pricingMode,
          price: money(offer.priceCents, currencyCode),
          discountPercent: percent(offer.discountBps),
          compareAt: money(offer.compareAtCents, currencyCode),
          minQuantity: offer.minQuantity ? String(offer.minQuantity) : '',
          maxQuantity: offer.maxQuantity ? String(offer.maxQuantity) : '',
          tierMode: offer.tierMode,
          tiers: offer.tiers.map((tier) => ({
            quantity: String(tier.quantity),
            reward: tier.reward,
            price: money(tier.priceCents, currencyCode),
            discountPercent: percent(tier.discountBps),
          })),
          items: offer.items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            variantIds: item.variantIds,
            quantity: item.quantity,
          })),
          variantRules: offer.variantRules.map((rule) => ({
            variantId: rule.variantId,
            excluded: rule.excluded,
            pricingMode: rule.pricingMode,
            price: money(rule.priceCents, currencyCode),
            discountPercent: percent(rule.discountBps),
          })),
          giftVariantId: offer.giftVariantId ?? '',
          giftQuantity: String(offer.giftQuantity || 1),
          startsAt: toLocalInput(offer.startsAt),
          endsAt: toLocalInput(offer.endsAt),
          isDefault: offer.isDefault,
          isActive: offer.isActive,
        }}
      />

      <OfferDangerZone offerId={offer.id} label={offer.label} />
    </>
  )
}
