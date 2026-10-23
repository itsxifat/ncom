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
import { LoginForm } from '@/modules/storefront/AccountForms'
import { safeNextPath } from '@/modules/storefront/safe-next'

export async function generateMetadata({
  params,
}: PageProps<'/sites/[subdomain]/account/login'>): Promise<Metadata> {
  const { subdomain } = await params
  return storeScreenMetadata(
    subdomain,
    ['account', 'login'],
    (words) => words.signIn
  )
}

/** A shopper signing in to this store. */
export default async function LoginPage({
  params,
  searchParams,
}: PageProps<'/sites/[subdomain]/account/login'>) {
  const [{ subdomain }, query] = await Promise.all([params, searchParams])
  const store = await storeForRoute(subdomain)
  if (!store) return renderSitePage(subdomain, ['account', 'login'])

  // Cleaned once, here, so the redirect, the hidden field and the link to the
  // register page only ever carry a path on this store.
  const next = safeNextPath(stringParam(query.next))
  if (await requestCustomer(store.organizationId)) redirect(next)

  const { layout, storefront, theme } = await storeChrome(store)
  return (
    <StoreDocument
      theme={theme}
      storeId={store.id}
      storefront={storefront}
      top={layout.top}
      bottom={layout.bottom}
    >
      <LoginForm
        next={next}
        registerHref={`/account/register?${new URLSearchParams({ next })}`}
      />
    </StoreDocument>
  )
}
