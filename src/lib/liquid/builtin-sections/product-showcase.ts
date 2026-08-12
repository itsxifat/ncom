import { SCOPE, gridCss, ratioCss } from './shared'

/**
 * Product showcase — the section most landing pages are built around.
 *
 * Shows real products from the store's catalogue. The point of this section is
 * choice: sixteen card designs, seven layouts, five image ratios and per-field
 * visibility toggles, so two stores using the same section do not look like
 * each other. A merchant who wants a dense four-up grid of bordered cards and
 * one who wants a single full-bleed overlay card both get what they want
 * without touching code.
 *
 * Card styles are expressed as CSS modifier classes on one shared markup
 * structure, with three exceptions that genuinely need different markup —
 * overlay (text sits on the image), split (image beside text) and polaroid
 * (caption outside the frame). Doing the other thirteen in CSS keeps the Liquid
 * readable; doing those three in CSS would mean absolutely-positioning content
 * that should just be in a different order.
 */

const CARD_STYLES = [
  'minimal',
  'bordered',
  'shadow',
  'elevated',
  'outlined',
  'sharp',
  'rounded',
  'soft',
  'glass',
  'dark',
  'gradient',
  'overlay',
  'split',
  'compact',
  'polaroid',
  'ribbon',
] as const

function cardCss(scope: string): string {
  return `
${scope} .ps-card{position:relative;display:block;color:inherit;text-decoration:none;overflow:hidden;border-radius:var(--ps-radius,14px);background:var(--ps-card-bg,transparent);color:var(--ps-card-text,inherit);transition:transform .18s ease,box-shadow .18s ease}
${scope} .ps-card:hover{transform:translateY(-2px)}
${scope} .ps-body{padding:14px}
${scope} .ps-title{font-size:15px;font-weight:700;margin:0 0 4px;line-height:1.35}
${scope} .ps-vendor{font-size:12px;opacity:.6;margin:0 0 4px;text-transform:uppercase;letter-spacing:.04em}
${scope} .ps-price{margin:6px 0 0;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
${scope} .ps-price__now{font-size:18px;font-weight:800;color:var(--ps-accent,#16a34a)}
${scope} .ps-price__was{font-size:14px;opacity:.5}
${scope} .ps-price__off{font-size:12px;font-weight:700;background:var(--ps-accent,#16a34a);color:#fff;padding:2px 8px;border-radius:999px}
${scope} .ps-btn{display:block;text-align:center;margin:12px 0 0;background:var(--ps-accent,#16a34a);color:#fff;font-weight:700;font-size:14px;padding:11px 14px;border-radius:calc(var(--ps-radius,14px) - 4px);text-decoration:none}
${scope} .ps-badge{position:absolute;top:10px;left:10px;z-index:2;background:#dc2626;color:#fff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px}
${scope} .ps-sold{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.55);color:#fff;font-weight:800;z-index:3}

/* ── The sixteen card designs ─────────────────────────────────────── */
${scope} .ps-card--minimal{background:transparent}
${scope} .ps-card--minimal .ps-body{padding:12px 2px}

${scope} .ps-card--bordered{border:1px solid color-mix(in oklab,currentColor 16%,transparent)}

${scope} .ps-card--shadow{box-shadow:0 1px 3px rgba(15,23,42,.09),0 6px 16px -6px rgba(15,23,42,.12)}
${scope} .ps-card--shadow:hover{box-shadow:0 2px 6px rgba(15,23,42,.12),0 14px 28px -10px rgba(15,23,42,.2)}

${scope} .ps-card--elevated{box-shadow:0 10px 30px -8px rgba(15,23,42,.28);background:var(--ps-card-bg,#fff)}
${scope} .ps-card--elevated:hover{transform:translateY(-5px)}

${scope} .ps-card--outlined{border:2px solid var(--ps-accent,#16a34a)}

${scope} .ps-card--sharp{border-radius:0;border:1px solid color-mix(in oklab,currentColor 18%,transparent)}
${scope} .ps-card--sharp .ps-btn{border-radius:0}

${scope} .ps-card--rounded{border-radius:26px;border:1px solid color-mix(in oklab,currentColor 12%,transparent)}
${scope} .ps-card--rounded .ps-btn{border-radius:999px}

${scope} .ps-card--soft{background:color-mix(in oklab,currentColor 5%,transparent);border-radius:20px}

${scope} .ps-card--glass{background:rgba(255,255,255,.14);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.3)}

${scope} .ps-card--dark{background:#0f172a;color:#e2e8f0}
${scope} .ps-card--dark .ps-price__was{color:#94a3b8}

${scope} .ps-card--gradient{background:linear-gradient(160deg,var(--ps-accent,#16a34a),color-mix(in oklab,var(--ps-accent,#16a34a) 45%,#0f172a));color:#fff}
${scope} .ps-card--gradient .ps-price__now{color:#fff}
${scope} .ps-card--gradient .ps-btn{background:#fff;color:var(--ps-accent,#16a34a)}

${scope} .ps-card--overlay{color:#fff}
${scope} .ps-card--overlay .ps-overlay{position:absolute;inset:auto 0 0 0;padding:16px;background:linear-gradient(to top,rgba(2,6,23,.88),rgba(2,6,23,0))}
${scope} .ps-card--overlay .ps-price__now{color:#fff}
${scope} .ps-card--overlay .ps-title{font-size:17px}

${scope} .ps-card--split{display:flex;align-items:stretch;border:1px solid color-mix(in oklab,currentColor 14%,transparent)}
${scope} .ps-card--split .ps-media{flex:0 0 40%}
${scope} .ps-card--split .ps-img{height:100%;aspect-ratio:auto;min-height:140px}
${scope} .ps-card--split .ps-body{flex:1;display:flex;flex-direction:column;justify-content:center}

${scope} .ps-card--compact .ps-body{padding:9px 10px}
${scope} .ps-card--compact .ps-title{font-size:13px}
${scope} .ps-card--compact .ps-price__now{font-size:15px}
${scope} .ps-card--compact .ps-btn{padding:8px 10px;font-size:13px}

${scope} .ps-card--polaroid{background:#fff;color:#0f172a;padding:10px 10px 0;box-shadow:0 6px 20px -8px rgba(15,23,42,.35);border-radius:4px}
${scope} .ps-card--polaroid .ps-body{padding:12px 2px 16px;text-align:center}

${scope} .ps-card--ribbon{border:1px solid color-mix(in oklab,currentColor 14%,transparent)}
${scope} .ps-card--ribbon .ps-badge{top:14px;left:-6px;border-radius:0 4px 4px 0;box-shadow:0 2px 6px rgba(15,23,42,.3)}

${scope} .ps-list .ps-card{display:flex;align-items:stretch}
${scope} .ps-list .ps-media{flex:0 0 34%;max-width:180px}
${scope} .ps-list .ps-img{height:100%;aspect-ratio:auto;min-height:120px}
${scope} .ps-list .ps-body{flex:1;display:flex;flex-direction:column;justify-content:center}
`
}

export const PRODUCT_SHOWCASE_SOURCE = `<style>
${gridCss(SCOPE)}
${ratioCss(SCOPE)}
${cardCss(SCOPE)}
</style>

{%- assign style = section.settings.card_style -%}
{%- assign ratio = section.settings.image_ratio -%}
{%- assign use_handles = false -%}
{%- if section.settings.source == "specific" and section.settings.handles != blank -%}
  {%- assign use_handles = true -%}
  {%- assign wanted = section.settings.handles | replace: " ", "" | prepend: "," | append: "," -%}
{%- endif -%}

{%- case section.settings.layout -%}
  {%- when "list" -%}{%- assign wrap_class = "ps-grid ps-grid--1 ps-list" -%}
  {%- when "single" -%}{%- assign wrap_class = "ps-grid ps-grid--1" -%}
  {%- when "scroll" -%}{%- assign wrap_class = "ps-scroll" -%}
  {%- when "grid-2" -%}{%- assign wrap_class = "ps-grid ps-grid--2" -%}
  {%- when "grid-4" -%}{%- assign wrap_class = "ps-grid ps-grid--4" -%}
  {%- when "grid-5" -%}{%- assign wrap_class = "ps-grid ps-grid--5" -%}
  {%- else -%}{%- assign wrap_class = "ps-grid ps-grid--3" -%}
{%- endcase -%}

<div class="ps" style="--ps-gap:{{ section.settings.gap }}px;--ps-radius:{{ section.settings.radius }}px;--ps-accent:{{ section.settings.accent_color }};--ps-card-bg:{{ section.settings.card_background }};--ps-card-text:{{ section.settings.card_text_color }};--ps-heading:{{ section.settings.heading_color }};text-align:{{ section.settings.text_align }}">

  {%- if section.settings.heading != blank or section.settings.subheading != blank -%}
  <div class="ps-head">
    {%- if section.settings.heading != blank -%}<h2>{{ section.settings.heading }}</h2>{%- endif -%}
    {%- if section.settings.subheading != blank -%}<p>{{ section.settings.subheading }}</p>{%- endif -%}
  </div>
  {%- endif -%}

  {%- assign shown = 0 -%}
  <div class="{{ wrap_class }}">
  {%- for card_product in products -%}
    {%- if use_handles -%}
      {%- assign key = card_product.handle | prepend: "," | append: "," -%}
      {%- unless wanted contains key -%}{%- continue -%}{%- endunless -%}
    {%- endif -%}
    {%- if shown >= section.settings.limit -%}{%- break -%}{%- endif -%}
    {%- assign shown = shown | plus: 1 -%}

    {%- if section.settings.button_target == "product" -%}
      {%- assign card_href = card_product.url -%}
    {%- else -%}
      {%- assign card_href = "#order" -%}
    {%- endif -%}

    {%- comment -%} Three markup shapes; every other design is a CSS modifier. {%- endcomment -%}
    {%- if style == "overlay" -%}
      <a class="ps-card ps-card--overlay" href="{{ card_href }}">
        {%- if section.settings.show_badge and section.settings.badge_text != blank -%}<span class="ps-badge">{{ section.settings.badge_text }}</span>{%- endif -%}
        {%- if card_product.featured_image -%}<img class="ps-img ps-img--{{ ratio }}" src="{{ card_product.featured_image.src }}" alt="{{ card_product.title | escape }}" loading="lazy">{%- endif -%}
        {%- unless card_product.available -%}<span class="ps-sold">{{ section.settings.sold_out_text }}</span>{%- endunless -%}
        <div class="ps-overlay">
          {%- if section.settings.show_title -%}<p class="ps-title">{{ card_product.title }}</p>{%- endif -%}
          {%- if section.settings.show_price -%}<p class="ps-price"><span class="ps-price__now">{{ card_product.price | money }}</span>{%- if section.settings.show_compare_price and card_product.compare_at_price > card_product.price -%}<s class="ps-price__was">{{ card_product.compare_at_price | money }}</s>{%- endif -%}</p>{%- endif -%}
        </div>
      </a>

    {%- elsif style == "split" -%}
      <a class="ps-card ps-card--split" href="{{ card_href }}">
        {%- if section.settings.show_badge and section.settings.badge_text != blank -%}<span class="ps-badge">{{ section.settings.badge_text }}</span>{%- endif -%}
        {%- if section.settings.show_image and card_product.featured_image -%}
          <div class="ps-media"><img class="ps-img" src="{{ card_product.featured_image.src }}" alt="{{ card_product.title | escape }}" loading="lazy"></div>
        {%- endif -%}
        <div class="ps-body">
          {%- if section.settings.show_vendor and card_product.vendor != blank -%}<p class="ps-vendor">{{ card_product.vendor }}</p>{%- endif -%}
          {%- if section.settings.show_title -%}<p class="ps-title">{{ card_product.title }}</p>{%- endif -%}
          {%- if section.settings.show_price -%}<p class="ps-price"><span class="ps-price__now">{{ card_product.price | money }}</span>{%- if section.settings.show_compare_price and card_product.compare_at_price > card_product.price -%}<s class="ps-price__was">{{ card_product.compare_at_price | money }}</s>{%- endif -%}</p>{%- endif -%}
          {%- if section.settings.show_button -%}<span class="ps-btn">{{ section.settings.button_label }}</span>{%- endif -%}
        </div>
      </a>

    {%- else -%}
      <a class="ps-card ps-card--{{ style }}" href="{{ card_href }}">
        {%- if section.settings.show_badge and section.settings.badge_text != blank -%}<span class="ps-badge">{{ section.settings.badge_text }}</span>{%- endif -%}
        {%- if section.settings.show_image and card_product.featured_image -%}
          <div class="ps-media" style="position:relative">
            <img class="ps-img ps-img--{{ ratio }}" src="{{ card_product.featured_image.src }}" alt="{{ card_product.title | escape }}" loading="lazy">
            {%- unless card_product.available -%}<span class="ps-sold">{{ section.settings.sold_out_text }}</span>{%- endunless -%}
          </div>
        {%- endif -%}
        <div class="ps-body">
          {%- if section.settings.show_vendor and card_product.vendor != blank -%}<p class="ps-vendor">{{ card_product.vendor }}</p>{%- endif -%}
          {%- if section.settings.show_title -%}<p class="ps-title">{{ card_product.title }}</p>{%- endif -%}
          {%- if section.settings.show_price -%}
            <p class="ps-price">
              <span class="ps-price__now">{{ card_product.price | money }}</span>
              {%- if section.settings.show_compare_price and card_product.compare_at_price > card_product.price -%}
                <s class="ps-price__was">{{ card_product.compare_at_price | money }}</s>
                {%- if section.settings.show_saving -%}
                  {%- assign saved = card_product.compare_at_price | minus: card_product.price -%}
                  <span class="ps-price__off">-{{ saved | money }}</span>
                {%- endif -%}
              {%- endif -%}
            </p>
          {%- endif -%}
          {%- if section.settings.show_button -%}<span class="ps-btn">{{ section.settings.button_label }}</span>{%- endif -%}
        </div>
      </a>
    {%- endif -%}
  {%- endfor -%}
  </div>

  {%- if shown == 0 -%}
    <div class="ps-empty">{{ section.settings.empty_text }}</div>
  {%- endif -%}
</div>

{% schema %}
{
  "name": "Product showcase",
  "category": "Commerce",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "আমাদের প্রোডাক্ট" },
    { "type": "text", "id": "subheading", "label": "Subheading", "default": "" },
    { "type": "select", "id": "source", "label": "Which products", "default": "all",
      "options": [
        { "value": "all", "label": "All products" },
        { "value": "specific", "label": "Specific handles" }
      ] },
    { "type": "text", "id": "handles", "label": "Product handles (comma separated)", "default": "" },
    { "type": "range", "id": "limit", "label": "How many", "min": 1, "max": 24, "step": 1, "default": 6 },
    { "type": "select", "id": "layout", "label": "Layout", "default": "grid-3",
      "options": [
        { "value": "grid-2", "label": "Grid — 2 across" },
        { "value": "grid-3", "label": "Grid — 3 across" },
        { "value": "grid-4", "label": "Grid — 4 across" },
        { "value": "grid-5", "label": "Grid — 5 across" },
        { "value": "list", "label": "List — image beside text" },
        { "value": "single", "label": "Single column" },
        { "value": "scroll", "label": "Swipeable row" }
      ] },
    { "type": "select", "id": "card_style", "label": "Card design", "default": "shadow",
      "options": [
        { "value": "minimal", "label": "Minimal — no frame" },
        { "value": "bordered", "label": "Bordered" },
        { "value": "shadow", "label": "Soft shadow" },
        { "value": "elevated", "label": "Elevated" },
        { "value": "outlined", "label": "Accent outline" },
        { "value": "sharp", "label": "Sharp corners" },
        { "value": "rounded", "label": "Extra rounded" },
        { "value": "soft", "label": "Soft tint" },
        { "value": "glass", "label": "Glass" },
        { "value": "dark", "label": "Dark card" },
        { "value": "gradient", "label": "Gradient" },
        { "value": "overlay", "label": "Text over image" },
        { "value": "split", "label": "Split — image beside text" },
        { "value": "compact", "label": "Compact" },
        { "value": "polaroid", "label": "Polaroid frame" },
        { "value": "ribbon", "label": "Corner ribbon" }
      ] },
    { "type": "select", "id": "image_ratio", "label": "Image shape", "default": "square",
      "options": [
        { "value": "square", "label": "Square" },
        { "value": "portrait", "label": "Portrait" },
        { "value": "landscape", "label": "Landscape" },
        { "value": "wide", "label": "Wide" },
        { "value": "auto", "label": "Original" }
      ] },
    { "type": "select", "id": "text_align", "label": "Text alignment", "default": "left",
      "options": [
        { "value": "left", "label": "Left" },
        { "value": "center", "label": "Center" },
        { "value": "right", "label": "Right" }
      ] },
    { "type": "checkbox", "id": "show_image", "label": "Show image", "default": true },
    { "type": "checkbox", "id": "show_title", "label": "Show title", "default": true },
    { "type": "checkbox", "id": "show_vendor", "label": "Show brand", "default": false },
    { "type": "checkbox", "id": "show_price", "label": "Show price", "default": true },
    { "type": "checkbox", "id": "show_compare_price", "label": "Show old price", "default": true },
    { "type": "checkbox", "id": "show_saving", "label": "Show amount saved", "default": true },
    { "type": "checkbox", "id": "show_button", "label": "Show button", "default": true },
    { "type": "checkbox", "id": "show_badge", "label": "Show badge", "default": false },
    { "type": "text", "id": "badge_text", "label": "Badge text", "default": "নতুন" },
    { "type": "text", "id": "button_label", "label": "Button label", "default": "অর্ডার করুন" },
    { "type": "select", "id": "button_target", "label": "Button goes to", "default": "order",
      "options": [
        { "value": "order", "label": "The order form on this page" },
        { "value": "product", "label": "The product page" }
      ] },
    { "type": "text", "id": "sold_out_text", "label": "Sold out label", "default": "স্টক শেষ" },
    { "type": "text", "id": "empty_text", "label": "Empty state text", "default": "কোনো প্রোডাক্ট পাওয়া যায়নি।" },
    { "type": "color", "id": "accent_color", "label": "Accent colour", "default": "#16a34a" },
    { "type": "color", "id": "card_background", "label": "Card background", "default": "#ffffff" },
    { "type": "color", "id": "card_text_color", "label": "Card text colour", "default": "#0f172a" },
    { "type": "color", "id": "heading_color", "label": "Heading colour", "default": "#0f172a" },
    { "type": "range", "id": "radius", "label": "Corner radius", "min": 0, "max": 32, "step": 2, "unit": "px", "default": 14 },
    { "type": "range", "id": "gap", "label": "Gap between cards", "min": 4, "max": 40, "step": 2, "unit": "px", "default": 16 }
  ]
}
{% endschema %}`

export const PRODUCT_SHOWCASE_CARD_STYLES = CARD_STYLES
