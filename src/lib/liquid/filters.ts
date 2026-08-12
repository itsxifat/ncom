import type { Liquid } from 'liquidjs'
import type { FilterImpl } from 'liquidjs/dist/template/filter-impl-options'
import {
  currencyExponent,
  formatMoney,
  formatMoneyAmount,
  minorUnitsPerMajor,
} from '@/lib/money'
import { slugify } from '@/lib/slug'

/**
 * Shopify-compatible filters layered on top of LiquidJS's standard set.
 *
 * The filter set is deliberately fixed and audited rather than extensible by
 * tenants: filters are the one place where a template gets to call host
 * JavaScript, so every function here is part of the sandbox boundary. None of
 * them may touch the filesystem, the network, the database, or `process`.
 *
 * Naming follows Shopify exactly where a filter with that name exists there,
 * because the whole point of choosing Liquid was that templates and developer
 * knowledge port over. A filter that behaves *almost* like Shopify's is worse
 * than one that is missing outright — a missing filter fails loudly, a subtly
 * different one produces wrong prices in production.
 */

/**
 * Money filters take the amount in minor units, matching how prices are stored
 * and how Shopify's own `money` filter behaves (`{{ 1999 | money }}` is
 * "$19.99"). Currency comes from the `shop` drop in scope rather than a filter
 * argument, so a template can never format one store's price in another's
 * currency.
 */
function currencyFromContext(impl: FilterImpl): string {
  const code = impl.context.getSync(['shop', 'currency'])
  return typeof code === 'string' && code.length === 3 ? code : 'USD'
}

function localeFromContext(impl: FilterImpl): string {
  const locale = impl.context.getSync(['shop', 'locale'])
  return typeof locale === 'string' && locale.length > 0 ? locale : 'en-US'
}

/** Coerces a Liquid value to minor units, tolerating strings from `assign`. */
function toCents(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? Math.round(n) : 0
}

export function registerCommerceFilters(engine: Liquid): void {
  // ── Money ──────────────────────────────────────────────────────────────

  engine.registerFilter('money', function (this: FilterImpl, value: unknown) {
    return formatMoney(
      toCents(value),
      currencyFromContext(this),
      localeFromContext(this)
    )
  })

  engine.registerFilter(
    'money_with_currency',
    function (this: FilterImpl, value: unknown) {
      const currency = currencyFromContext(this)
      return `${formatMoney(toCents(value), currency, localeFromContext(this))} ${currency}`
    }
  )

  engine.registerFilter(
    'money_without_currency',
    function (this: FilterImpl, value: unknown) {
      return formatMoneyAmount(
        toCents(value),
        currencyFromContext(this),
        localeFromContext(this)
      )
    }
  )

  engine.registerFilter(
    'money_without_trailing_zeros',
    function (this: FilterImpl, value: unknown) {
      const currency = currencyFromContext(this)
      const cents = toCents(value)
      const isWhole = cents % minorUnitsPerMajor(currency) === 0
      if (!isWhole) {
        return formatMoney(cents, currency, localeFromContext(this))
      }
      return new Intl.NumberFormat(localeFromContext(this), {
        style: 'currency',
        currency: currency.toUpperCase(),
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(cents / minorUnitsPerMajor(currency))
    }
  )

  // ── Text ───────────────────────────────────────────────────────────────

  engine.registerFilter('handleize', (value: unknown) =>
    slugify(String(value ?? ''))
  )
  // Shopify exposes the same function under both names.
  engine.registerFilter('handle', (value: unknown) =>
    slugify(String(value ?? ''))
  )

  engine.registerFilter(
    'pluralize',
    (value: unknown, singular: unknown, plural: unknown) =>
      toCents(value) === 1 ? String(singular ?? '') : String(plural ?? '')
  )

  // ── URLs & media ───────────────────────────────────────────────────────

  /**
   * Returns the asset URL unchanged.
   *
   * Shopify's `image_url` appends resize parameters, but EnCDN delivery URLs
   * are signed (see server/storage/encdn.ts) and appending query parameters
   * invalidates the signature, which would break every image on the page
   * rather than merely skipping the resize. Until EnCDN exposes signed
   * transform URLs this is a passthrough, and templates should rely on CSS for
   * sizing. The filter still exists so ported themes parse and render.
   */
  engine.registerFilter('image_url', (value: unknown) => String(value ?? ''))
  engine.registerFilter('img_url', (value: unknown) => String(value ?? ''))

  engine.registerFilter(
    'link_to',
    (label: unknown, url: unknown, title: unknown) => {
      // Platform-generated markup wrapping tenant values: these must be
      // escaped here, since the engine does not auto-escape output.
      const href = escapeHtmlAttribute(String(url ?? ''))
      const text = escapeHtml(String(label ?? ''))
      const titleAttr = title
        ? ` title="${escapeHtmlAttribute(String(title))}"`
        : ''
      return `<a href="${href}"${titleAttr}>${text}</a>`
    }
  )

  // ── Units ──────────────────────────────────────────────────────────────

  engine.registerFilter(
    'weight_with_unit',
    function (this: FilterImpl, grams: unknown, unit: unknown) {
      const g = toCents(grams)
      const target = typeof unit === 'string' ? unit.toLowerCase() : 'g'
      switch (target) {
        case 'kg':
          return `${(g / 1000).toFixed(2)} kg`
        case 'oz':
          return `${(g / 28.349523125).toFixed(2)} oz`
        case 'lb':
          return `${(g / 453.59237).toFixed(2)} lb`
        default:
          return `${g} g`
      }
    }
  )

  // ── Formatting helpers ─────────────────────────────────────────────────

  engine.registerFilter('format_address', (address: unknown) => {
    if (!address || typeof address !== 'object') return ''
    const a = address as Record<string, unknown>
    const lines = [
      [a.firstName, a.lastName].filter(Boolean).join(' '),
      a.company,
      a.address1,
      a.address2,
      [a.city, a.provinceCode, a.postalCode].filter(Boolean).join(' '),
      a.countryCode,
    ]
    return lines
      .filter((line) => typeof line === 'string' && line.trim().length > 0)
      .map((line) => escapeHtml(String(line)))
      .join('<br>')
  })

  engine.registerFilter('percent', (bps: unknown) => `${toCents(bps) / 100}%`)

  /** Exposed so themes can round prices without float drift. */
  engine.registerFilter(
    'cents_to_amount',
    function (this: FilterImpl, value: unknown) {
      const currency = currencyFromContext(this)
      return toCents(value) / minorUnitsPerMajor(currency)
    }
  )

  engine.registerFilter('currency_exponent', function (this: FilterImpl) {
    return currencyExponent(currencyFromContext(this))
  })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeHtmlAttribute(value: string): string {
  // Also neutralises `javascript:` and `data:` hrefs, which escaping alone
  // would leave intact.
  const escaped = escapeHtml(value)
  return /^\s*(javascript|data|vbscript):/i.test(value) ? '#' : escaped
}
