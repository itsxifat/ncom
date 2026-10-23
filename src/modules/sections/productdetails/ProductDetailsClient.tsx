'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { El, Extras } from '../elements'
import {
  savingPercent,
  storePaths,
  type StoreProductDetail,
  type StoreVariant,
} from '../storefront'
import type { SectionConfig } from '../types'
import { cn } from '@/lib/utils'
import { useCart, QuantityStepper } from '@/modules/storefront/CartProvider'
import { useStoreText } from '@/modules/storefront/StoreTextProvider'
import { FormSelect } from '@/components/ui/form-select'
import type { ProductDetailsContent } from './index'

const RATIO = { portrait: 'aspect-[4/5]', square: 'aspect-square' } as const

/**
 * The interactive half of the product page.
 *
 * Choosing works the way shoppers expect from every shop they already use: one
 * row of buttons per option, a value that cannot be bought in the current
 * combination crossed through rather than hidden (hiding "XL" because it is out
 * in black would make a shopper think the shirt does not come in XL at all),
 * and the photo following the colour.
 */
export function ProductDetailsClient({
  product,
  content,
  config,
  currencyCode,
  linkBase,
  editing,
}: {
  product: StoreProductDetail
  content: ProductDetailsContent
  config?: SectionConfig
  currencyCode: string
  linkBase: string
  editing?: boolean
}) {
  const cart = useCart()
  const text = useStoreText()
  const paths = storePaths(linkBase)

  // Start on the first variant that can be bought — opening a product page on
  // a sold-out size makes the whole product look sold out.
  const initial =
    product.variants.find((variant) => variant.available) ?? product.variants[0]
  const [selected, setSelected] = useState<string[]>(
    () => initial?.options ?? []
  )
  const [quantity, setQuantity] = useState(1)
  const [imageIndex, setImageIndex] = useState(0)
  const [pending, setPending] = useState<'add' | 'buy' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const variant: StoreVariant | undefined = useMemo(
    () =>
      product.variants.find((candidate) =>
        candidate.options.every((value, index) => value === selected[index])
      ) ?? (product.options.length === 0 ? product.variants[0] : undefined),
    [product, selected]
  )

  const images =
    product.images.length > 0
      ? product.images
      : product.imageUrl
        ? [{ url: product.imageUrl, alt: product.title }]
        : []

  function choose(optionIndex: number, value: string) {
    const next = [...selected]
    next[optionIndex] = value
    // A combination that does not exist (Black / XL when black stops at L)
    // moves the other options to the nearest one that does, instead of
    // leaving the shopper on a choice with no price.
    const exact = product.variants.find((candidate) =>
      candidate.options.every((v, i) => v === next[i])
    )
    const fallback =
      exact ??
      product.variants.find(
        (candidate) =>
          candidate.options[optionIndex] === value && candidate.available
      ) ??
      product.variants.find(
        (candidate) => candidate.options[optionIndex] === value
      )
    const resolved = fallback?.options ?? next
    setSelected(resolved)
    setError(null)

    const match = product.variants.find((candidate) =>
      candidate.options.every((v, i) => v === resolved[i])
    )
    if (match?.imageUrl) {
      const at = images.findIndex((image) => image.url === match.imageUrl)
      if (at >= 0) setImageIndex(at)
    }
  }

  /** Whether a value can be bought alongside what else is chosen. */
  function valueAvailable(optionIndex: number, value: string): boolean {
    return product.variants.some(
      (candidate) =>
        candidate.available &&
        candidate.options[optionIndex] === value &&
        candidate.options.every(
          (v, i) => i === optionIndex || v === selected[i]
        )
    )
  }

  const price = variant?.priceCents ?? product.priceCents
  const compareAt =
    variant?.compareAtPriceCents ??
    (variant ? null : product.compareAtPriceCents)
  const saving = savingPercent(price, compareAt)
  const soldOut = variant ? !variant.available : !product.available

  async function buy(mode: 'add' | 'buy') {
    if (!variant || soldOut || !cart) return
    setPending(mode)
    setError(null)
    const ok = await cart.add({
      variantId: variant.id,
      productId: product.id,
      quantity,
    })
    if (!ok) {
      setPending(null)
      return
    }
    if (mode === 'buy') {
      cart.closeCart()
      window.location.href = paths.checkout
      return
    }
    setPending(null)
  }

  const stockMessage = soldOut
    ? content.soldOutText
    : variant?.stockLeft
      ? content.lowStockText.replace('{count}', text.number(variant.stockLeft))
      : content.inStockText

  const mainImage = images[Math.min(imageIndex, images.length - 1)]
  const showBar = content.stickyMobileBar && !soldOut && !editing

  // The phone buy bar is fixed over the bottom of the screen, so at the very
  // end of the page it would sit on top of the footer's last lines. Making
  // room for it on the body keeps everything under it reachable.
  useEffect(() => {
    if (!showBar) return
    document.body.classList.add('sf-has-buy-bar')
    return () => document.body.classList.remove('sf-has-buy-bar')
  }, [showBar])

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-14">
      {/* Photos */}
      <El
        as="div"
        part="gallery"
        className={cn(
          'flex min-w-0 gap-3',
          content.gallery === 'side' ? 'flex-row-reverse' : 'flex-col'
        )}
      >
        {content.gallery === 'stack' ? (
          <div className="flex flex-col gap-3">
            {images.map((image, index) =>
              index === 0 ? (
                <El
                  key={image.url}
                  as="img"
                  part="mainImage"
                  src={image.url}
                  alt={image.alt ?? product.title}
                  className={cn(
                    'w-full rounded-[min(var(--page-radius),1rem)] object-cover',
                    RATIO[content.imageRatio]
                  )}
                />
              ) : (
                <El
                  key={image.url}
                  as="img"
                  part="thumbnail"
                  index={index - 1}
                  src={image.url}
                  alt={image.alt ?? ''}
                  loading="lazy"
                  className={cn(
                    'w-full rounded-[min(var(--page-radius),1rem)] object-cover',
                    RATIO[content.imageRatio]
                  )}
                />
              )
            )}
          </div>
        ) : (
          <>
            <div
              className={cn(
                'group/main relative min-w-0 flex-1 overflow-hidden rounded-[min(var(--page-radius),1rem)] bg-[color-mix(in_oklab,var(--page-text)_5%,var(--page-background))]',
                RATIO[content.imageRatio]
              )}
            >
              {mainImage ? (
                <El
                  as="img"
                  part="mainImage"
                  src={mainImage.url}
                  alt={mainImage.alt ?? product.title}
                  className="absolute inset-0 size-full object-cover"
                />
              ) : (
                <El
                  as="div"
                  part="mainImage"
                  className="absolute inset-0 flex items-center justify-center text-sm opacity-40"
                >
                  {text.words.noPhoto}
                </El>
              )}
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label={text.words.previousPhoto}
                    onClick={() =>
                      setImageIndex(
                        (current) =>
                          (current - 1 + images.length) % images.length
                      )
                    }
                    className="absolute top-1/2 left-3 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-neutral-900 shadow transition sm:opacity-0 sm:group-hover/main:opacity-100"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    aria-label={text.words.nextPhoto}
                    onClick={() =>
                      setImageIndex((current) => (current + 1) % images.length)
                    }
                    className="absolute top-1/2 right-3 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-neutral-900 shadow transition sm:opacity-0 sm:group-hover/main:opacity-100"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                </>
              )}
            </div>
            {images.length > 1 && (
              <div
                className={cn(
                  'flex gap-2.5',
                  content.gallery === 'side'
                    ? 'w-16 shrink-0 flex-col sm:w-20'
                    : 'overflow-x-auto pb-1'
                )}
              >
                {images.map((image, index) => (
                  <button
                    key={image.url}
                    type="button"
                    aria-label={text.words.photoNumber(index + 1)}
                    aria-current={index === imageIndex}
                    onClick={() => setImageIndex(index)}
                    className={cn(
                      'relative shrink-0 overflow-hidden rounded-[min(var(--page-radius),0.6rem)] border-2 transition',
                      content.gallery === 'side' ? 'w-full' : 'w-16 sm:w-20',
                      RATIO[content.imageRatio],
                      index === imageIndex
                        ? 'border-[var(--page-text)]'
                        : 'border-transparent opacity-70 hover:opacity-100'
                    )}
                  >
                    <El
                      as="img"
                      part="thumbnail"
                      index={index}
                      src={image.url}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 size-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </El>

      {/* Info */}
      <El
        as="div"
        part="info"
        className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-24 lg:self-start"
      >
        <div className="flex flex-col gap-2">
          {content.showVendor && product.vendor && (
            <El
              as="p"
              part="vendor"
              className="text-xs font-semibold tracking-[0.14em] uppercase opacity-60"
            >
              {product.vendor}
            </El>
          )}
          <El
            as="h1"
            part="title"
            className="[font-family:var(--page-font-heading)] text-2xl leading-tight [font-weight:var(--page-heading-weight)] tracking-tight sm:text-[2rem]"
          >
            {product.title}
          </El>
          <div className="flex flex-wrap items-center gap-3">
            <El
              as="p"
              part="price"
              className="flex items-baseline gap-2.5 text-xl font-semibold"
            >
              <span
                className={saving ? 'text-[var(--page-primary)]' : undefined}
              >
                {text.price(price, currencyCode)}
              </span>
              {saving && compareAt && (
                <s className="text-base font-normal opacity-50">
                  {text.price(compareAt, currencyCode)}
                </s>
              )}
            </El>
            {saving && (
              <El
                as="span"
                part="saving"
                className="rounded-full bg-[var(--page-primary)] px-2.5 py-1 text-xs font-bold text-[var(--page-on-primary)]"
              >
                −{text.number(saving)}%
              </El>
            )}
          </div>
        </div>

        {product.options.map((option, optionIndex) => (
          <div key={option.name} className="flex flex-col gap-2.5">
            <El
              as="p"
              part="optionLabel"
              index={optionIndex}
              className="text-sm font-medium"
            >
              {option.name}:{' '}
              <span className="font-normal opacity-70">
                {selected[optionIndex]}
              </span>
            </El>
            {content.optionStyle === 'dropdown' ? (
              <FormSelect
                tone="page"
                value={selected[optionIndex] ?? ''}
                onChange={(event) => choose(optionIndex, event.target.value)}
              >
                {option.values.map((value) => (
                  <option key={value} value={value}>
                    {value}
                    {valueAvailable(optionIndex, value)
                      ? ''
                      : ` — ${text.words.soldOut}`}
                  </option>
                ))}
              </FormSelect>
            ) : (
              <div className="flex flex-wrap gap-2">
                {option.values.map((value, valueIndex) => {
                  const active = selected[optionIndex] === value
                  const available = valueAvailable(optionIndex, value)
                  return (
                    <El
                      key={value}
                      as="button"
                      part="optionValue"
                      index={optionIndex * 100 + valueIndex}
                      type="button"
                      aria-pressed={active}
                      onClick={() => choose(optionIndex, value)}
                      className={cn(
                        'relative min-h-11 min-w-12 rounded-[min(var(--page-radius),0.75rem)] border px-4 text-sm font-medium transition',
                        active
                          ? 'border-[var(--page-text)] bg-[var(--page-text)] text-[var(--page-background)]'
                          : 'border-[color-mix(in_oklab,var(--page-text)_20%,transparent)] hover:border-[var(--page-text)]',
                        !available && 'line-through opacity-45'
                      )}
                    >
                      {value}
                    </El>
                  )
                })}
              </div>
            )}
          </div>
        ))}

        {content.showStock && (
          <El
            as="p"
            part="stock"
            className={cn(
              'flex items-center gap-2 text-sm font-medium',
              soldOut
                ? 'text-red-600'
                : variant?.stockLeft
                  ? 'text-amber-600'
                  : 'text-emerald-700'
            )}
          >
            <span
              className={cn(
                'size-2 rounded-full',
                soldOut
                  ? 'bg-red-500'
                  : variant?.stockLeft
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
              )}
            />
            {stockMessage}
          </El>
        )}

        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            {content.showQuantity && !soldOut && (
              <QuantityStepper
                value={quantity}
                onChange={setQuantity}
                max={variant?.stockLeft ?? 99}
                size="lg"
              />
            )}
            <El
              as="button"
              part="addButton"
              type="button"
              disabled={soldOut || pending !== null}
              onClick={() => buy('add')}
              className={cn(
                'inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[min(var(--page-radius),1.25rem)] px-6 text-[15px] font-semibold transition disabled:cursor-not-allowed',
                content.showBuyNow
                  ? 'border-2 border-[var(--page-text)] text-[var(--page-text)] hover:bg-[var(--page-text)] hover:text-[var(--page-background)]'
                  : 'bg-[var(--page-primary)] text-[var(--page-on-primary)] hover:opacity-90',
                soldOut && 'opacity-50'
              )}
            >
              {pending === 'add' ? (
                <Loader2 className="size-5 animate-spin" />
              ) : soldOut ? (
                content.soldOutText
              ) : (
                content.addToCartText
              )}
            </El>
          </div>
          {content.showBuyNow && !soldOut && (
            <El
              as="button"
              part="buyButton"
              type="button"
              disabled={pending !== null}
              onClick={() => buy('buy')}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[min(var(--page-radius),1.25rem)] bg-[var(--page-primary)] px-6 text-[15px] font-semibold text-[var(--page-on-primary)] transition hover:opacity-90"
            >
              {pending === 'buy' ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                content.buyNowText
              )}
            </El>
          )}
          {(error || cart?.error) && (
            <p role="alert" className="text-sm font-medium text-red-600">
              {error ?? cart?.error}
            </p>
          )}
        </div>

        {content.highlights.some((item) => item.text.trim()) && (
          <El
            as="ul"
            part="highlights"
            className="flex flex-col gap-2.5 rounded-[min(var(--page-radius),1rem)] bg-[color-mix(in_oklab,var(--page-text)_4%,var(--page-background))] p-4"
          >
            {content.highlights.map((item, index) =>
              item.text.trim() ? (
                <El
                  key={index}
                  as="li"
                  part="highlight"
                  index={index}
                  className="flex items-start gap-2.5 text-sm"
                >
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-[var(--page-primary)]"
                    strokeWidth={2.5}
                  />
                  <span>{item.text}</span>
                </El>
              ) : null
            )}
          </El>
        )}

        {content.showDescription && product.descriptionHtml && (
          <div className="flex flex-col gap-3 border-t border-[color-mix(in_oklab,var(--page-text)_10%,transparent)] pt-5">
            {content.descriptionTitle && (
              <El
                as="h2"
                part="descriptionTitle"
                className="text-base font-semibold"
              >
                {content.descriptionTitle}
              </El>
            )}
            <El
              as="div"
              part="description"
              className="max-w-none text-[15px] leading-relaxed opacity-85 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_p+p]:mt-3 [&_ul]:mt-2 [&_ul]:list-disc"
              dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
            />
          </div>
        )}

        <Extras config={config} slot="content" />
      </El>

      {showBar && (
        <El
          as="div"
          part="stickyBar"
          className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-[color-mix(in_oklab,var(--page-text)_10%,transparent)] bg-[var(--page-background)] px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] lg:hidden"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs opacity-70">{product.title}</p>
            <p className="text-base font-semibold">
              {text.price(price, currencyCode)}
            </p>
          </div>
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => buy(content.showBuyNow ? 'buy' : 'add')}
            className="inline-flex min-h-11 items-center justify-center rounded-[min(var(--page-radius),1.25rem)] bg-[var(--page-primary)] px-6 text-sm font-semibold text-[var(--page-on-primary)]"
          >
            {content.showBuyNow ? content.buyNowText : content.addToCartText}
          </button>
        </El>
      )}
    </div>
  )
}
