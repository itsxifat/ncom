import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requestCustomer } from '@/server/storefront/request'
import {
  renderSitePage,
  storeChrome,
  storeForRoute,
  stringParam,
  storeScreenMetadata,
} from '@/server/storefront/site-page'
import { StoreDocument } from '@/server/storefront/store-page'
import { RegisterForm } from '@/modules/storefront/AccountForms'
import { safeNextPath } from '@/modules/storefront/safe-next'

export async function generateMetadata({
  params,
}: PageProps<'/sites/[subdomain]/account/register'>): Promise<Metadata> {
  const { subdomain } = await params
  return storeScreenMetadata(
    subdomain,
    ['account', 'register'],
    (words) => words.createAnAccount
  )
}

/** A shopper creating an account at this store. */
export default async function RegisterPage({
  params,
  searchParams,
}: PageProps<'/sites/[subdomain]/account/register'>) {
  const [{ subdomain }, query] = await Promise.all([params, searchParams])
  const store = await storeForRoute(subdomain)
  if (!store) return renderSitePage(subdomain, ['account', 'register'])

  // Cleaned here so the hidden field and the sign-in link only ever carry a
  // path on this store.
  const next = safeNextPath(stringParam(query.next))
  if (await requestCustomer(store.organizationId)) redirect('/account')

  const { layout, storefront, theme } = await storeChrome(store)
  return (
    <StoreDocument
      theme={theme}
      storeId={store.id}
      storefront={storefront}
      top={layout.top}
      bottom={layout.bottom}
    >
      <RegisterForm
        next={next}
        loginHref={`/account/login?${new URLSearchParams({ next })}`}
      />
    </StoreDocument>
  )
}
