'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Plug, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { HOOK_REFERENCE } from '../sections/customcode/hooks'
import { makeStoreText, storeText } from '../storefront/i18n'
import { useBuilderStore } from './store'
import { useBuilderSite } from './SiteContext'
import { useProductCatalog } from './ProductCatalogContext'
import { pageOffersForCodeAction, type CodeHookCommerce } from './code-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormSelect } from '@/components/ui/form-select'
import { cn } from '@/lib/utils'

/**
 * "Connect to your shop", under a custom-code block's HTML.
 *
 * The hooks (see `customcode/hooks.ts`) are what keep a free-form design
 * part of the shop — a live price, an order button that picks the offer —
 * but an attribute nobody knows about does nothing for anyone. So this lists
 * them with this page's own offers, or the store's own products, already
 * filled in and today's figures as their fallback words: copy one, paste it
 * into the design, and it works. For a merchant whose AI writes their HTML,
 * the last button copies the same knowledge as instructions to paste into
 * that AI with their next request.
 */
export function CustomCodeConnect() {
  const site = useBuilderSite()
  const theme = useBuilderStore((s) => s.theme)
  const text = useMemo(() => storeText(theme), [theme])
  if (!site) return null

  return (
    <details className="bg-muted/40 group rounded-xl border" open>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-semibold select-none">
        <Plug className="size-4" />
        Connect to your shop
        <span className="text-muted-foreground ml-auto text-xs font-normal group-open:hidden">
          Show
        </span>
      </summary>
      <div className="flex flex-col gap-3 border-t px-3 pt-3 pb-3">
        <p className="text-muted-foreground text-xs leading-relaxed">
          Your design can show live prices and sell, with no code that runs. Add
          these to elements in its HTML — NCOM fills in today’s figures and
          makes the buttons work, and keeps them right when prices change.
        </p>
        {site.kind === 'LANDING' ? (
          <LandingSnippets
            storeId={site.storeId}
            pageId={site.pageId}
            language={text.language}
            numerals={text.numerals}
          />
        ) : (
          <StoreSnippets language={text.language} numerals={text.numerals} />
        )}
      </div>
    </details>
  )
}

interface Snippet {
  label: string
  code: string
}

function LandingSnippets({
  storeId,
  pageId,
  language,
  numerals,
}: {
  storeId: string
  pageId: string
  language: 'en' | 'bn'
  numerals: 'latin' | 'bangla'
}) {
  const [commerce, setCommerce] = useState<CodeHookCommerce | null>(null)
  const [failed, setFailed] = useState(false)
  const [chosen, setChosen] = useState<string>('')

  useEffect(() => {
    let live = true
    pageOffersForCodeAction(storeId, pageId)
      .then((result) => {
        if (!live) return
        setCommerce(result)
        if (!result) setFailed(true)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [storeId, pageId])

  if (failed) {
    return (
      <p className="text-muted-foreground text-xs">
        Could not load this page’s offers. Reopen the block to try again.
      </p>
    )
  }
  if (!commerce) {
    return <p className="text-muted-foreground text-xs">Loading your offers…</p>
  }

  const text = makeStoreText(language, numerals)
  const price = (cents: number) => text.price(cents, commerce.currencyCode)
  const offer =
    commerce.offers.find((candidate) => candidate.key === chosen) ??
    commerce.offers.find((candidate) => candidate.isDefault) ??
    commerce.offers[0]
  const bn = language === 'bn'

  const snippets: Snippet[] = []
  if (offer) {
    const key = escapeAttribute(offer.key)
    const saving = offer.compareAtCents - offer.priceCents
    snippets.push(
      {
        label: 'Order button — picks this offer',
        code: `<a href="#order" data-ncom-order="${key}">${bn ? 'এখনই অর্ডার করুন' : 'Order now'}</a>`,
      },
      {
        label: 'Price',
        code: `<span data-ncom-price="${key}">${escapeText(price(offer.priceCents))}</span>`,
      },
      {
        label: 'Price before the discount (hidden when there is none)',
        code: `<s data-ncom-regular-price="${key}">${escapeText(price(Math.max(offer.compareAtCents, offer.priceCents)))}</s>`,
      },
      {
        label: 'How much it saves (hidden when nothing)',
        code: `<span data-ncom-saving="${key}">${escapeText(price(Math.max(saving, 0)))}</span>`,
      },
      {
        label: 'Offer name',
        code: `<span data-ncom-name="${key}">${escapeText(offer.label)}</span>`,
      }
    )
  }
  const cheapest = commerce.deliveryAreas[0]
  if (cheapest) {
    snippets.push({
      label: 'Delivery charge (the cheapest area)',
      code: `<span data-ncom-delivery>${escapeText(cheapest.priceCents === 0 ? text.words.free : price(cheapest.priceCents))}</span>`,
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {commerce.offers.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-2 text-xs">
          This page has no offers yet. Add one under{' '}
          <strong>Delivery &amp; offers</strong>, and its order button and price
          snippets appear here. A plain link to{' '}
          <code className="font-mono">#order</code> already scrolls to the order
          form.
        </p>
      ) : commerce.offers.length > 1 ? (
        <label className="flex flex-col gap-1 text-xs font-medium">
          Offer
          <FormSelect
            size="sm"
            value={offer?.key}
            onChange={(event) => setChosen(event.target.value)}
            aria-label="Which offer the snippets are for"
          >
            {commerce.offers.map((candidate) => (
              <option key={candidate.key} value={candidate.key}>
                {`${candidate.label} · ${price(candidate.priceCents)}`}
              </option>
            ))}
          </FormSelect>
        </label>
      ) : null}
      <SnippetList snippets={snippets} />
      <AiInstructions
        kind="LANDING"
        names={commerce.offers.map(
          (candidate) =>
            `"${candidate.key}" — ${candidate.label} (${price(candidate.priceCents)})`
        )}
      />
    </div>
  )
}

function StoreSnippets({
  language,
  numerals,
}: {
  language: 'en' | 'bn'
  numerals: 'latin' | 'bangla'
}) {
  const catalog = useProductCatalog()
  const [query, setQuery] = useState('')
  const [chosenId, setChosenId] = useState<string | null>(null)
  const visible = catalog.products.filter(
    (product) => product.status === 'ACTIVE'
  )
  const matches = query.trim()
    ? visible
        .filter((product) =>
          `${product.title} ${product.handle}`
            .toLowerCase()
            .includes(query.trim().toLowerCase())
        )
        .slice(0, 6)
    : visible.slice(0, 6)
  const product =
    visible.find((candidate) => candidate.id === chosenId) ?? matches[0]

  if (visible.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-2 text-xs">
        Add products to your shop and their add-to-cart and price snippets
        appear here.
      </p>
    )
  }

  const text = makeStoreText(language, numerals)
  const bn = language === 'bn'
  const snippets: Snippet[] = []
  if (product) {
    const ref = escapeAttribute(product.handle)
    const price = escapeText(
      text.price(product.minPriceCents, catalog.currencyCode)
    )
    snippets.push(
      {
        label: 'Add to cart button',
        code: `<button data-ncom-add-to-cart="${ref}">${bn ? 'কার্টে যোগ করুন' : 'Add to cart'}</button>`,
      },
      {
        label: 'Buy now — straight to checkout',
        code: `<button data-ncom-buy-now="${ref}">${bn ? 'এখনই কিনুন' : 'Buy now'}</button>`,
      },
      {
        label: 'Price',
        code: `<span data-ncom-price="${ref}">${price}</span>`,
      },
      {
        label: 'Price before the discount (hidden when there is none)',
        code: `<s data-ncom-regular-price="${ref}">${price}</s>`,
      },
      {
        label: 'Product name',
        code: `<span data-ncom-name="${ref}">${escapeText(product.title)}</span>`,
      },
      {
        label: 'Product photo',
        code: `<img data-ncom-image="${ref}" alt="${escapeAttribute(product.title)}">`,
      },
      {
        label: 'Shown only when sold out',
        code: `<span data-ncom-sold-out="${ref}">${bn ? 'স্টক শেষ' : 'Sold out'}</span>`,
      },
      {
        label: 'A link to its page',
        code: `<a href="/products/${encodeURIComponent(product.handle)}">${escapeText(product.title)}</a>`,
      }
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a product"
          aria-label="Find a product for the snippets"
          className="h-8 text-sm"
        />
        <div className="flex flex-wrap gap-1">
          {matches.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => setChosenId(candidate.id)}
              className={cn(
                'max-w-full truncate rounded-full border px-2 py-0.5 text-xs transition',
                candidate.id === product?.id
                  ? 'bg-foreground text-background border-foreground'
                  : 'hover:bg-muted'
              )}
            >
              {candidate.title}
            </button>
          ))}
        </div>
      </div>
      <SnippetList snippets={snippets} />
      <AiInstructions
        kind="STORE"
        names={visible
          .slice(0, 30)
          .map((candidate) => `"${candidate.handle}" — ${candidate.title}`)}
      />
    </div>
  )
}

function SnippetList({ snippets }: { snippets: Snippet[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {snippets.map((snippet) => (
        <li key={snippet.label} className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-xs font-medium">
              {snippet.label}
            </span>
            <CopyButton value={snippet.code} />
          </div>
          <code className="bg-background block overflow-x-auto rounded-md border px-2 py-1.5 font-mono text-[11px] leading-snug whitespace-pre">
            {snippet.code}
          </code>
        </li>
      ))}
    </ul>
  )
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      title="Copy"
      aria-label="Copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          toast.error('Could not copy. Select the code and copy it instead.')
        }
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </Button>
  )
}

/**
 * The hooks as instructions for the merchant's own AI, with this site's
 * offers or products named — to paste in with a request like "add a second
 * order button under the photos".
 */
function AiInstructions({
  kind,
  names,
}: {
  kind: 'LANDING' | 'STORE'
  names: string[]
}) {
  const instructions = [
    'This HTML is one section of my shop’s page on NCOM. Change only what I ask, keep my class names and styles, and keep every data-ncom-* attribute exactly as it is.',
    'NCOM removes JavaScript, forms and click handlers. To connect the design to my shop, put these attributes on ordinary elements instead — NCOM fills in live figures and handles the clicks:',
    ...HOOK_REFERENCE.flatMap((hook) => {
      const does = kind === 'LANDING' ? hook.landing : hook.store
      return does ? [`- ${hook.attribute}: ${does}`] : []
    }),
    kind === 'LANDING'
      ? 'Name an offer by its key. Leave the value empty for the page’s main offer. A plain link to "#order" also scrolls to the order form.'
      : 'Name a product by its handle. Links to "/products/<handle>" open its page.',
    'Write the current figure inside each element as a fallback, e.g. <span data-ncom-price="…">৳990</span>.',
    ...(names.length
      ? [
          kind === 'LANDING' ? 'My offers:' : 'My products:',
          ...names.map((name) => `- ${name}`),
        ]
      : []),
    'Reply with the full updated HTML and CSS.',
  ].join('\n')

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="self-start"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(instructions)
          toast.success('Copied instructions for your AI', {
            description:
              'Paste them into ChatGPT, Claude or Gemini with this design and what you want changed.',
          })
        } catch {
          toast.error('Could not copy the instructions.')
        }
      }}
    >
      <Sparkles />
      Copy instructions for your AI
    </Button>
  )
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
