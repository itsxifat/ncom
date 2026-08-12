import Link from 'next/link'
import { formatMoney } from '@/lib/money'
import type { CartDrop, CollectionDrop, ProductDrop } from '@/lib/liquid/drops'
import { AddToCartForm } from './add-to-cart-form'

/**
 * Built-in storefront templates.
 *
 * A store gets a working product, collection and cart page from the moment its
 * first product is created, without anyone writing Liquid. These render only
 * when the merchant has not published a StorefrontTemplate of their own — the
 * Liquid template always wins.
 *
 * They are styled with the same `--page-*` custom properties the builder's
 * sections use (see modules/sections/theme.tsx), so the default storefront
 * picks up the store's theme rather than looking like a different site.
 */

function Container({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[var(--page-container-width,72rem)] px-6 py-12">
      {children}
    </div>
  )
}

export function DefaultProductTemplate({
  product,
  subdomain,
  currencyCode,
}: {
  product: ProductDrop
  subdomain: string
  currencyCode: string
}) {
  const price = (cents: number) => formatMoney(cents, currencyCode)
  const selected = product.selected_or_first_available_variant

  return (
    <Container>
      <div className="grid gap-12 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          {product.featured_image ? (
            // Storefront images come from arbitrary tenant uploads on the CDN,
            // so they are not a build-time next/image optimization target.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.featured_image.src}
              alt={product.featured_image.alt ?? product.title}
              className="w-full rounded-[var(--page-radius)] object-cover"
            />
          ) : (
            <div className="aspect-square w-full rounded-[var(--page-radius)] bg-black/5" />
          )}

          {product.images.length > 1 && (
            <div className="grid grid-cols-4 gap-3">
              {product.images.slice(1, 5).map((image) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={image.id}
                  src={image.src}
                  alt={image.alt ?? ''}
                  className="aspect-square w-full rounded-[var(--page-radius)] object-cover"
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <div>
            {product.vendor && (
              <p className="text-sm tracking-wide uppercase opacity-60">
                {product.vendor}
              </p>
            )}
            <h1
              className="mt-2 text-4xl leading-tight"
              style={{ fontFamily: 'var(--page-font-heading)' }}
            >
              {product.title}
            </h1>
          </div>

          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-medium">
              {price(selected?.price ?? product.price)}
            </span>
            {selected?.compare_at_price != null &&
              selected.compare_at_price > selected.price && (
                <span className="text-lg line-through opacity-50">
                  {price(selected.compare_at_price)}
                </span>
              )}
          </div>

          <AddToCartForm
            subdomain={subdomain}
            formatPrice={price}
            variants={product.variants.map((variant) => ({
              id: variant.id,
              title: variant.title,
              priceCents: variant.price,
              available: variant.available,
            }))}
          />

          {product.description && (
            <div
              className="prose max-w-none opacity-90"
              // Product descriptions are merchant-authored rich text. This is
              // the merchant's own storefront and formatted descriptions are
              // the expected behaviour; isolation is at the origin level, not
              // by stripping their markup.
              dangerouslySetInnerHTML={{ __html: product.description }}
            />
          )}
        </div>
      </div>
    </Container>
  )
}

export function DefaultCollectionTemplate({
  collection,
  currencyCode,
}: {
  collection: CollectionDrop
  currencyCode: string
}) {
  return (
    <Container>
      <header className="mb-10">
        <h1
          className="text-4xl leading-tight"
          style={{ fontFamily: 'var(--page-font-heading)' }}
        >
          {collection.title}
        </h1>
        {collection.description && (
          <p className="mt-3 max-w-2xl opacity-75">{collection.description}</p>
        )}
      </header>

      {collection.products.length === 0 ? (
        <p className="opacity-60">No products in this collection yet.</p>
      ) : (
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {collection.products.map((product) => (
            <Link
              key={product.id}
              href={product.url}
              className="group flex flex-col gap-3"
            >
              {product.featured_image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.featured_image.src}
                  alt={product.featured_image.alt ?? product.title}
                  className="aspect-square w-full rounded-[var(--page-radius)] object-cover"
                />
              ) : (
                <div className="aspect-square w-full rounded-[var(--page-radius)] bg-black/5" />
              )}
              <div>
                <p className="font-medium group-hover:underline">
                  {product.title}
                </p>
                <p className="opacity-70">
                  {product.price_varies ? 'From ' : ''}
                  {formatMoney(product.price_min, currencyCode)}
                </p>
                {!product.available && (
                  <p className="text-sm opacity-50">Sold out</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </Container>
  )
}

export function DefaultCartTemplate({
  cart,
  currencyCode,
  checkoutHref = '/checkout',
}: {
  cart: CartDrop
  currencyCode: string
  checkoutHref?: string
}) {
  const price = (cents: number) => formatMoney(cents, currencyCode)

  return (
    <Container>
      <h1
        className="mb-8 text-4xl"
        style={{ fontFamily: 'var(--page-font-heading)' }}
      >
        Your cart
      </h1>

      {cart.empty ? (
        <p className="opacity-70">Your cart is empty.</p>
      ) : (
        <div className="grid gap-12 lg:grid-cols-[1fr_20rem]">
          <ul className="flex flex-col divide-y">
            {cart.items.map((item) => (
              <li key={item.id} className="flex gap-4 py-5">
                {item.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.image.src}
                    alt={item.image.alt ?? ''}
                    className="size-20 rounded-[var(--page-radius)] object-cover"
                  />
                ) : (
                  <div className="size-20 rounded-[var(--page-radius)] bg-black/5" />
                )}
                <div className="flex flex-1 justify-between gap-4">
                  <div>
                    <Link
                      href={item.url}
                      className="font-medium hover:underline"
                    >
                      {item.title}
                    </Link>
                    <p className="text-sm opacity-70">Qty {item.quantity}</p>
                  </div>
                  <p className="font-medium">{price(item.final_line_price)}</p>
                </div>
              </li>
            ))}
          </ul>

          <aside className="flex h-fit flex-col gap-3 rounded-[var(--page-radius)] border p-6">
            <Row label="Subtotal" value={price(cart.original_total_price)} />
            {cart.total_discount > 0 && (
              <Row label="Discount" value={`−${price(cart.total_discount)}`} />
            )}
            <div className="mt-2 border-t pt-3">
              <Row label="Total" value={price(cart.total_price)} strong />
            </div>
            <p className="text-xs opacity-60">
              Shipping and taxes are calculated at checkout.
            </p>
            <Link
              href={checkoutHref}
              className="mt-2 rounded-[var(--page-radius)] px-6 py-3 text-center font-medium"
              style={{
                backgroundColor: 'var(--page-primary)',
                color: 'var(--page-background)',
              }}
            >
              Checkout
            </Link>
          </aside>
        </div>
      )}
    </Container>
  )
}

function Row({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="flex justify-between">
      <span className={strong ? 'font-medium' : 'opacity-70'}>{label}</span>
      <span className={strong ? 'font-medium' : ''}>{value}</span>
    </div>
  )
}
