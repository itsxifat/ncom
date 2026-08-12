import { z } from 'zod'
import type { SectionDefinition, SectionRendererProps } from '../registry'
import { SectionContainer, SectionWrapper } from '../primitives'

/**
 * Paste-your-own-markup section.
 *
 * This is the escape hatch for "the builder doesn't have the block I want".
 * It accepts HTML and Liquid together with scoped CSS, and renders them where
 * the section sits on the page — so custom code is a *thing on the page*
 * rather than a global script bolted onto the document head.
 *
 * How the two halves render:
 *
 *   - `html` may contain Liquid. It is compiled on the server (at publish time
 *     for the live store, and by a server action for the builder preview) and
 *     arrives here as a finished string on `section.html`. That is why this
 *     renderer emits `content.html` only as a fallback: if the compiled output
 *     is present, PageRenderer has already used it and never calls this.
 *
 *   - `css` is scoped to this section instance by prefixing every rule with
 *     the section's own id. Without that, one section's `h2 { color: red }`
 *     would repaint every heading on the page, which is the single most common
 *     way custom CSS in a page builder goes wrong.
 *
 * The markup is not sanitized. This is the merchant's own storefront and
 * emitting arbitrary HTML is the entire point of the feature; the isolation
 * that makes it safe is at the origin level (tenant sites on their own
 * registrable domain, builder preview inside a sandboxed iframe), not by
 * stripping tags here.
 */
export const customCodeContentSchema = z.object({
  html: z.string().max(100_000).default(''),
  css: z.string().max(50_000).default(''),
  /**
   * When on, `css` is left untouched instead of being scoped to this section.
   * Needed for things a scoped rule cannot express — @keyframes, @font-face,
   * or deliberately styling the whole page from one block.
   */
  globalCss: z.boolean().default(false),
})

export type CustomCodeContent = z.infer<typeof customCodeContentSchema>

export const customCodeDefaultContent: CustomCodeContent = {
  html: `<div class="my-block">
  <h2>Custom block</h2>
  <p>Write any HTML here. Liquid works too — try {{ shop.name }}.</p>
</div>`,
  css: `.my-block { padding: 2rem; text-align: center; }
.my-block h2 { font-size: 2rem; margin-bottom: .5rem; }`,
  globalCss: false,
}

/**
 * At-rules whose contents are NOT selectors and must be passed through
 * untouched. `@keyframes` uses `from`/`to`/percentages as block labels, and
 * prefixing those silently breaks the animation.
 *
 * Everything else that starts with `@` (@media, @supports, @container, @layer)
 * contains ordinary style rules, so selectors inside it still get scoped —
 * that is what stops a `@media` block restyling the whole page.
 */
const OPAQUE_AT_RULES =
  /^@(keyframes|-webkit-keyframes|font-face|counter-style|property|page|viewport)\b/i

/**
 * Prefixes every selector in a stylesheet with a scope, so a section's CSS
 * cannot restyle the rest of the page.
 *
 * Written as a brace-depth walk rather than a regex because CSS nests: a regex
 * that prefixes "whatever precedes a {" either misses selectors inside
 * `@media` (letting them leak out) or prefixes the `from`/`to` labels inside
 * `@keyframes` (breaking the animation). Both of those were real bugs in the
 * regex version this replaces.
 *
 * Handling, by construct:
 *   - plain rules            → selector list is prefixed
 *   - comma-separated lists  → each selector prefixed individually
 *   - @media / @supports     → at-rule kept, selectors inside it prefixed
 *   - @keyframes / @font-face→ whole block passed through untouched
 *   - @import / @charset     → passed through untouched
 *
 * This is a scoping tool, not a sanitiser: the merchant's CSS is their own and
 * may say anything it likes *within their section*.
 */
export function scopeCss(css: string, scope: string): string {
  if (!css.trim()) return ''
  if (!scope) return css

  /**
   * What the block we are currently inside contains:
   *   'group'  — an at-rule like @media: its contents are more style rules,
   *              so selectors inside it still need scoping
   *   'rule'   — a style rule: its contents are declarations, passed through
   *   'opaque' — @keyframes/@font-face: everything inside is passed through
   *
   * The stack is what the previous regex version lacked, and why @media
   * selectors escaped scoping while @keyframes labels got mangled.
   */
  type Block = 'group' | 'rule' | 'opaque'
  const stack: Block[] = []

  let out = ''
  let buffer = ''

  const top = () => stack[stack.length - 1]
  /** Selectors are only expected at the root or directly inside an at-group. */
  const expectingSelector = () => stack.length === 0 || top() === 'group'

  for (const char of css) {
    if (char === '{') {
      if (!expectingSelector()) {
        out += char
        stack.push(top() === 'opaque' ? 'opaque' : 'rule')
        continue
      }

      const prelude = buffer.trim()
      buffer = ''

      if (prelude.startsWith('@')) {
        out += `${prelude} {`
        stack.push(OPAQUE_AT_RULES.test(prelude) ? 'opaque' : 'group')
      } else if (prelude) {
        out += `${scopeSelectorList(prelude, scope)} {`
        stack.push('rule')
      } else {
        out += '{'
        stack.push('rule')
      }
      continue
    }

    if (char === '}') {
      out += buffer + '}'
      buffer = ''
      stack.pop()
      continue
    }

    if (expectingSelector()) {
      buffer += char
    } else {
      out += char
    }
  }

  // Anything trailing at the root (a bare @import, say) is emitted as-is.
  return out + buffer
}

/** Prefixes each selector in a comma-separated list independently. */
function scopeSelectorList(selectors: string, scope: string): string {
  return selectors
    .split(',')
    .map((selector) => selector.trim())
    .filter(Boolean)
    .map((selector) => `${scope} ${selector}`)
    .join(', ')
}

function CustomCodeRenderer({
  content,
  config,
  sectionId,
}: SectionRendererProps<CustomCodeContent> & { sectionId?: string }) {
  const scope = sectionId ? `[data-section-id="${sectionId}"]` : ''
  const css = content.globalCss ? content.css : scopeCss(content.css, scope)

  return (
    <SectionWrapper config={config}>
      {css && <style>{css}</style>}
      <SectionContainer config={config}>
        {/* Reached only when the HTML was not compiled server-side — i.e. the
            merchant used plain HTML with no Liquid in it. */}
        <div dangerouslySetInnerHTML={{ __html: content.html }} />
      </SectionContainer>
    </SectionWrapper>
  )
}

export const customCodeSection: SectionDefinition<CustomCodeContent> = {
  key: 'custom-code',
  name: 'Custom code',
  category: 'Advanced',
  schema: customCodeContentSchema,
  defaultContent: customCodeDefaultContent,
  editorFields: [
    { type: 'textarea', name: 'html', label: 'HTML / Liquid' },
    { type: 'textarea', name: 'css', label: 'CSS' },
    { type: 'boolean', name: 'globalCss', label: 'Apply CSS to whole page' },
  ],
  Renderer: CustomCodeRenderer,
}
