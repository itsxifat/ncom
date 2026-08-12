import { Liquid } from 'liquidjs'
import { registerCommerceFilters } from './filters'

/**
 * Sandboxed Liquid engine for tenant-authored templates.
 *
 * Everything rendered through here is untrusted input written by a customer
 * of the platform, running on our servers. The threat model is not "a user
 * might XSS their own storefront" — that is their site and injecting HTML is
 * the entire point of the feature. The threats that matter are:
 *
 *   1. Reading data belonging to another tenant.
 *   2. Reading anything off the filesystem or the network.
 *   3. Escaping into host JavaScript (prototype access, constructor walking).
 *   4. Denial of service — infinite loops, exponential string growth, OOM.
 *
 * The configuration below closes each of those, and the comments say which.
 * Do not relax any of these options without working through what it opens up.
 *
 * Note on escaping: Liquid does NOT auto-escape, and we deliberately keep it
 * that way for Shopify compatibility. That means any value placed into a drop
 * must be safe to emit raw, and any platform-owned string interpolated into a
 * template must be escaped by whoever puts it there.
 */

/** Hard ceiling on a single template's source length (characters). */
const PARSE_LIMIT = 500_000

/**
 * Wall-clock budget for one render, in ms. LiquidJS checks this between node
 * renders, so it does interrupt `{% for %}` loops — it is the real protection
 * against a runaway template, not a courtesy timeout. A blocking construct
 * inside a single filter call would not be caught, which is why the filter set
 * is fixed and audited rather than user-extensible.
 */
const RENDER_LIMIT_MS = 2_000

/** Cap on objects allocated during a render, to stop `| times` / concat bombs. */
const MEMORY_LIMIT = 10_000_000

/** Cap on total tag/output nodes rendered, to stop deeply recursive includes. */
const TEMPLATE_LIMIT = 50_000

export interface LiquidEngineOptions {
  /**
   * Snippets available to `{% render 'name' %}`, as name -> source. This is
   * passed as LiquidJS's in-memory `templates` map, which bypasses the
   * filesystem entirely for partial lookup — there is no `fs` for a template
   * to reach through. Callers must scope this to a single store; that
   * scoping is what enforces tenant isolation for partials.
   */
  snippets?: Record<string, string>
  /**
   * Editor mode. Turns on strict variable/filter checking so the code editor
   * can report "undefined variable `prodct`" instead of silently rendering an
   * empty string. Never enable for public rendering: a typo would take the
   * storefront down instead of degrading.
   */
  strict?: boolean
}

export function createLiquidEngine(options: LiquidEngineOptions = {}): Liquid {
  const engine = new Liquid({
    // Partial lookup comes from this map only. With `templates` set, LiquidJS
    // bypasses fs/root/partials/layouts, so `{% render %}` cannot reach disk.
    templates: options.snippets ?? {},

    // Blocks prototype-chain access on scope objects, so a template cannot
    // walk `constructor.constructor` to reach the Function constructor and
    // execute host JavaScript. This is the single most important option here.
    ownPropertyOnly: true,

    // Shopify semantics: only nil and false are falsy — empty string and 0 are
    // truthy. jsTruthy would silently change the meaning of every `{% if %}`
    // in a template ported from Shopify.
    jsTruthy: false,

    // Undefined variables render empty and unknown filters pass through,
    // matching Shopify, unless we're linting in the editor.
    strictVariables: options.strict ?? false,
    strictFilters: options.strict ?? false,
    lenientIf: true,

    // Templates are compiled at publish time and cached as HTML, so per-parse
    // caching buys little and would hold tenant sources in memory.
    cache: false,

    // No auto-escape: see the note in the file header.
    outputEscape: undefined,

    // DoS ceilings.
    parseLimit: PARSE_LIMIT,
    renderLimit: RENDER_LIMIT_MS,
    memoryLimit: MEMORY_LIMIT,

    trimTagRight: false,
    trimTagLeft: false,
  })

  registerCommerceFilters(engine)

  return engine
}

export interface LiquidRenderResult {
  html: string
  /**
   * Populated instead of throwing when a template fails. Rendering a broken
   * section must not take down the whole page: the caller substitutes a
   * placeholder for that one section and renders the rest.
   */
  error: LiquidRenderError | null
}

export interface LiquidRenderError {
  message: string
  line?: number
  snippet?: string
}

/**
 * Renders a template to HTML, converting any failure into a result rather than
 * an exception.
 */
export async function renderLiquid(
  source: string,
  scope: Record<string, unknown>,
  options: LiquidEngineOptions = {}
): Promise<LiquidRenderResult> {
  const engine = createLiquidEngine(options)

  try {
    const html = await engine.parseAndRender(source, scope, {
      templateLimit: TEMPLATE_LIMIT,
      renderLimit: RENDER_LIMIT_MS,
      memoryLimit: MEMORY_LIMIT,
      ownPropertyOnly: true,
    })
    return { html, error: null }
  } catch (cause) {
    return { html: '', error: toRenderError(cause) }
  }
}

/**
 * Parses without rendering, to surface syntax errors in the code editor before
 * anything is saved or published.
 */
export async function validateLiquid(
  source: string,
  options: LiquidEngineOptions = {}
): Promise<LiquidRenderError | null> {
  const engine = createLiquidEngine(options)
  try {
    engine.parse(source)
    return null
  } catch (cause) {
    return toRenderError(cause)
  }
}

/**
 * LiquidJS errors carry `line` and a rendered `context` excerpt, but only as
 * loose properties on the Error — narrow them defensively rather than casting,
 * since a non-Liquid error (an exploded drop getter, say) can land here too.
 */
function toRenderError(cause: unknown): LiquidRenderError {
  if (cause instanceof Error) {
    const withPosition = cause as Error & { line?: number; context?: string }
    return {
      message: cause.message,
      line:
        typeof withPosition.line === 'number' ? withPosition.line : undefined,
      snippet:
        typeof withPosition.context === 'string'
          ? withPosition.context
          : undefined,
    }
  }
  return { message: String(cause) }
}
