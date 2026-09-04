/**
 * What can go wrong between here and a merchant's own website.
 *
 * Every catalogue read now leaves this building, so failure is an ordinary
 * runtime state rather than a bug: the merchant's server can be down, slow,
 * misconfigured, or answering with something that is not their catalogue at
 * all. Each of those needs a different sentence in front of a different
 * audience — the shopper gets "we cannot load this right now", the merchant
 * gets the reason and the fix — so they are separate classes rather than one
 * Error with a string in it.
 *
 * `merchantMessage` is deliberately not the shopper-facing text. Storefront
 * surfaces render their own copy; these strings are for the dashboard, the
 * connection health panel and the logs.
 */

export type CatalogFailure =
  | 'not_configured'
  | 'unreachable'
  | 'timeout'
  | 'unauthorized'
  | 'contract'
  | 'upstream_error'
  | 'unsupported'

export class CatalogError extends Error {
  /**
   * A brand, checked by `isCatalogError` instead of `instanceof`.
   *
   * `instanceof` compares constructors, and a constructor is only ever equal to
   * itself *within one loaded copy of this module*. Next bundles the same
   * source into more than one graph — the RSC build, the node build, a route
   * handler — and a module loaded twice produces two `CatalogError` classes
   * that are structurally identical and mutually unrecognisable. The failure
   * that causes is silent and specific: a checkout that meant to show "products
   * are unavailable for a moment" shows the raw upstream message instead,
   * because the guard in front of that branch quietly said no.
   *
   * A field on the instance survives every copy of the class.
   */
  readonly isCatalogError = true as const

  readonly failure: CatalogFailure
  readonly merchantMessage: string
  readonly status: number | null

  constructor(
    failure: CatalogFailure,
    merchantMessage: string,
    options: { status?: number | null; cause?: unknown } = {}
  ) {
    super(merchantMessage, { cause: options.cause })
    this.name = 'CatalogError'
    this.failure = failure
    this.merchantMessage = merchantMessage
    this.status = options.status ?? null
  }
}

/** No connection saved yet — the store has never been pointed at a website. */
export class CatalogNotConfiguredError extends CatalogError {
  constructor() {
    super(
      'not_configured',
      'This workspace is not connected to a product source yet. Add one under Settings → Product source.'
    )
    this.name = 'CatalogNotConfiguredError'
  }
}

/** The connector answered, but not with something this contract understands. */
export class CatalogContractError extends CatalogError {
  constructor(detail: string, options: { status?: number | null } = {}) {
    super('contract', detail, options)
    this.name = 'CatalogContractError'
  }
}

/**
 * The connector does not implement an endpoint we asked for.
 *
 * Separate from a hard failure because most of these are survivable: a site
 * that cannot reserve stock can still sell, it just cannot hold anything back.
 * Callers decide whether the missing capability is fatal for what they are
 * doing.
 */
export class CatalogUnsupportedError extends CatalogError {
  readonly capability: string

  constructor(capability: string) {
    super(
      'unsupported',
      `The connected website does not implement "${capability}".`
    )
    this.name = 'CatalogUnsupportedError'
    this.capability = capability
  }
}

export function isCatalogError(error: unknown): error is CatalogError {
  if (error instanceof CatalogError) return true

  // See the note on the brand above: the same class from a second copy of this
  // module is not `instanceof` this one, and is still a catalogue error.
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { isCatalogError?: unknown }).isCatalogError === true
  )
}

/**
 * One sentence a shopper may read.
 *
 * Never leaks the merchant's hostname, the status code or the endpoint — a
 * storefront visitor is not owed the plumbing, and the plumbing is exactly what
 * an attacker probing a connector would like to see.
 */
export function shopperMessage(error: unknown): string {
  if (isCatalogError(error) && error.failure === 'unsupported') {
    return 'This item cannot be ordered right now.'
  }
  return 'Products are unavailable for a moment. Please try again shortly.'
}
