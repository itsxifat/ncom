/**
 * Shared Liquid fragments for the built-in commerce sections.
 *
 * These sections are Liquid rather than React for one reason: only Liquid
 * sections receive the store's catalogue. The publish pipeline and the builder
 * preview both put `products` and `all_products` in the render scope (see
 * storefrontService.buildCatalogScope), so a Liquid section can show real
 * titles, real prices and real stock. A React section renders from saved
 * content alone and would be showing placeholder text forever.
 *
 * They are seeded as global ComponentDefinitions with `renderMode: LIQUID`, so
 * every store gets them in the palette and their `{% schema %}` blocks compile
 * into Inspector controls automatically — the same path a merchant's own pasted
 * Liquid takes.
 */

/**
 * CSS scoped to one section instance.
 *
 * Every rule must be prefixed, because a landing page routinely stacks three
 * showcases with different settings and an unscoped `.card { }` would repaint
 * all of them from whichever rendered last.
 */
export const SCOPE = '[data-section-id="{{ section.id }}"]'

/** Resolves the product list from the section's source settings. */
export const PRODUCT_SOURCE = `
{%- assign picked = "" -%}
{%- if section.settings.source == "handles" and section.settings.handles != blank -%}
  {%- assign wanted = section.settings.handles | split: "," -%}
  {%- assign picked = "" -%}
{%- endif -%}
`

/**
 * The base layout CSS every product-bearing section uses.
 *
 * Grid columns collapse to one on narrow screens unconditionally: this
 * platform's buyers are overwhelmingly on phones, so a four-column grid that
 * stays four columns is not a design choice, it is a broken page.
 */
export function gridCss(scope: string): string {
  return `
${scope} .ps-grid{display:grid;gap:var(--ps-gap,16px)}
${scope} .ps-grid--1{grid-template-columns:1fr}
${scope} .ps-grid--2{grid-template-columns:repeat(2,1fr)}
${scope} .ps-grid--3{grid-template-columns:repeat(3,1fr)}
${scope} .ps-grid--4{grid-template-columns:repeat(4,1fr)}
${scope} .ps-grid--5{grid-template-columns:repeat(5,1fr)}
${scope} .ps-scroll{display:flex;gap:var(--ps-gap,16px);overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:8px}
${scope} .ps-scroll > *{flex:0 0 78%;scroll-snap-align:start}
@media(min-width:640px){${scope} .ps-scroll > *{flex:0 0 42%}}
@media(min-width:1024px){${scope} .ps-scroll > *{flex:0 0 28%}}
@media(max-width:900px){
  ${scope} .ps-grid--4,${scope} .ps-grid--5{grid-template-columns:repeat(2,1fr)}
  ${scope} .ps-grid--3{grid-template-columns:repeat(2,1fr)}
}
@media(max-width:560px){
  ${scope} .ps-grid--2,${scope} .ps-grid--3,${scope} .ps-grid--4,${scope} .ps-grid--5{grid-template-columns:1fr}
}
${scope} .ps-head{text-align:center;margin:0 0 22px}
${scope} .ps-head h2{font-size:clamp(20px,4vw,30px);font-weight:800;margin:0 0 6px;color:var(--ps-heading,inherit)}
${scope} .ps-head p{margin:0;opacity:.72;font-size:15px}
${scope} .ps-empty{text-align:center;opacity:.6;padding:28px;border:1px dashed currentColor;border-radius:12px}
`
}

/** Image aspect-ratio classes, shared by every card style. */
export function ratioCss(scope: string): string {
  return `
${scope} .ps-img{width:100%;display:block;object-fit:cover;background:#f1f5f9}
${scope} .ps-img--square{aspect-ratio:1/1}
${scope} .ps-img--portrait{aspect-ratio:3/4}
${scope} .ps-img--landscape{aspect-ratio:4/3}
${scope} .ps-img--wide{aspect-ratio:16/9}
${scope} .ps-img--auto{aspect-ratio:auto}
`
}

/**
 * Money with the store's own formatting.
 *
 * Kept as a fragment rather than repeated inline so a change to how strike-
 * through pricing reads happens in one place across every section.
 */
export const PRICE_BLOCK = `
{%- if section.settings.show_price -%}
  <p class="ps-price">
    <span class="ps-price__now">{{ card_product.price | money }}</span>
    {%- if section.settings.show_compare_price and card_product.compare_at_price > card_product.price -%}
      <s class="ps-price__was">{{ card_product.compare_at_price | money }}</s>
      {%- if section.settings.show_saving -%}
        {%- assign saved = card_product.compare_at_price | minus: card_product.price -%}
        <span class="ps-price__off">{{ saved | money }} সাশ্রয়</span>
      {%- endif -%}
    {%- endif -%}
  </p>
{%- endif -%}
`
