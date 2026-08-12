import { SCOPE, ratioCss } from './shared'

/**
 * Proof, comparison and attention sections.
 *
 * Reviews carry photo support because a screenshot of a customer's message is
 * the single most persuasive asset on a landing page in this market — more so
 * than a star rating, which anyone can type.
 */

export const REVIEWS_SOURCE = `<style>
${SCOPE} .rv{padding:clamp(26px,5vw,50px) 16px;background:var(--rv-bg,transparent)}
${SCOPE} .rv__head{text-align:center;max-width:640px;margin:0 auto 26px}
${SCOPE} .rv__head h2{font-size:clamp(20px,3.8vw,30px);font-weight:800;margin:0 0 6px}
${SCOPE} .rv__head p{margin:0;opacity:.72}
${SCOPE} .rv__list{max-width:1080px;margin:0 auto;display:grid;gap:var(--rv-gap,16px)}
${SCOPE} .rv--grid .rv__list{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
${SCOPE} .rv--two .rv__list{grid-template-columns:repeat(auto-fit,minmax(330px,1fr))}
${SCOPE} .rv--list .rv__list{grid-template-columns:1fr;max-width:680px}
${SCOPE} .rv--scroll .rv__list{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:8px}
${SCOPE} .rv--scroll .rv__item{flex:0 0 80%;scroll-snap-align:start}
@media(min-width:768px){${SCOPE} .rv--scroll .rv__item{flex:0 0 38%}}
${SCOPE} .rv--masonry .rv__list{grid-template-columns:repeat(auto-fit,minmax(250px,1fr))}
${SCOPE} .rv--masonry .rv__item:nth-child(even){margin-top:22px}

${SCOPE} .rv__item{padding:18px;border-radius:var(--rv-radius,16px);background:var(--rv-card,#fff);color:var(--rv-text,#0f172a)}
${SCOPE} .rv--bordered .rv__item{background:transparent;border:1px solid color-mix(in oklab,currentColor 16%,transparent)}
${SCOPE} .rv--shadow .rv__item{box-shadow:0 8px 26px -14px rgba(15,23,42,.45)}
${SCOPE} .rv--quote .rv__item{background:transparent;border-left:3px solid var(--rv-accent,#f59e0b);border-radius:0;padding-left:16px}
${SCOPE} .rv__stars{color:var(--rv-accent,#f59e0b);font-size:15px;letter-spacing:2px;margin:0 0 8px}
${SCOPE} .rv__body{font-size:15px;line-height:1.65;margin:0 0 12px}
${SCOPE} .rv__who{display:flex;align-items:center;gap:10px}
${SCOPE} .rv__avatar{width:36px;height:36px;border-radius:50%;object-fit:cover;background:color-mix(in oklab,currentColor 12%,transparent)}
${SCOPE} .rv__name{font-size:14px;font-weight:700;margin:0}
${SCOPE} .rv__meta{font-size:12px;opacity:.6;margin:0}
${SCOPE} .rv__shot{width:100%;border-radius:12px;margin:0 0 12px;display:block}
</style>

<div class="rv rv--{{ section.settings.layout }} rv--{{ section.settings.card_style }}" style="--rv-bg:{{ section.settings.background_color }};--rv-card:{{ section.settings.card_color }};--rv-text:{{ section.settings.text_color }};--rv-accent:{{ section.settings.accent_color }};--rv-radius:{{ section.settings.radius }}px;--rv-gap:{{ section.settings.gap }}px">
  {%- if section.settings.heading != blank or section.settings.subheading != blank -%}
  <div class="rv__head">
    {%- if section.settings.heading != blank -%}<h2>{{ section.settings.heading }}</h2>{%- endif -%}
    {%- if section.settings.subheading != blank -%}<p>{{ section.settings.subheading }}</p>{%- endif -%}
  </div>
  {%- endif -%}
  <div class="rv__list">
    {%- for block in section.blocks -%}
      <div class="rv__item" {{ block.shopify_attributes }}>
        {%- if section.settings.show_screenshot and block.settings.screenshot != blank -%}
          <img class="rv__shot" src="{{ block.settings.screenshot }}" alt="" loading="lazy">
        {%- endif -%}
        {%- if section.settings.show_stars -%}
          <p class="rv__stars">{% for i in (1..block.settings.rating) %}★{% endfor %}{% assign rest = 5 | minus: block.settings.rating %}{% for i in (1..rest) %}☆{% endfor %}</p>
        {%- endif -%}
        <p class="rv__body">{{ block.settings.body }}</p>
        <div class="rv__who">
          {%- if block.settings.avatar != blank -%}<img class="rv__avatar" src="{{ block.settings.avatar }}" alt="" loading="lazy">{%- endif -%}
          <div>
            <p class="rv__name">{{ block.settings.name }}</p>
            {%- if block.settings.meta != blank -%}<p class="rv__meta">{{ block.settings.meta }}</p>{%- endif -%}
          </div>
        </div>
      </div>
    {%- endfor -%}
  </div>
</div>

{% schema %}
{
  "name": "Customer reviews",
  "category": "Commerce",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "কাস্টমার রিভিউ" },
    { "type": "textarea", "id": "subheading", "label": "Subheading", "default": "আমাদের গ্রাহকরা যা বলছেন।" },
    { "type": "select", "id": "layout", "label": "Layout", "default": "grid",
      "options": [
        { "value": "grid", "label": "Grid — 3 across" },
        { "value": "two", "label": "Grid — 2 across" },
        { "value": "list", "label": "Single column" },
        { "value": "scroll", "label": "Swipeable row" },
        { "value": "masonry", "label": "Offset masonry" }
      ] },
    { "type": "select", "id": "card_style", "label": "Card design", "default": "shadow",
      "options": [
        { "value": "shadow", "label": "Soft shadow" },
        { "value": "bordered", "label": "Bordered" },
        { "value": "quote", "label": "Quote bar" },
        { "value": "flat", "label": "Flat fill" }
      ] },
    { "type": "checkbox", "id": "show_stars", "label": "Show star rating", "default": true },
    { "type": "checkbox", "id": "show_screenshot", "label": "Show review screenshots", "default": true },
    { "type": "color", "id": "background_color", "label": "Background", "default": "#f8fafc" },
    { "type": "color", "id": "card_color", "label": "Card background", "default": "#ffffff" },
    { "type": "color", "id": "text_color", "label": "Text colour", "default": "#0f172a" },
    { "type": "color", "id": "accent_color", "label": "Star / accent colour", "default": "#f59e0b" },
    { "type": "range", "id": "radius", "label": "Corner radius", "min": 0, "max": 30, "step": 2, "unit": "px", "default": 16 },
    { "type": "range", "id": "gap", "label": "Gap", "min": 6, "max": 36, "step": 2, "unit": "px", "default": 16 }
  ],
  "blocks": [
    { "type": "review", "name": "Review", "settings": [
      { "type": "textarea", "id": "body", "label": "Review", "default": "প্রোডাক্টের মান খুব ভালো। দ্রুত ডেলিভারি পেয়েছি।" },
      { "type": "text", "id": "name", "label": "Name", "default": "রহিম উদ্দিন" },
      { "type": "text", "id": "meta", "label": "Location / date", "default": "ঢাকা" },
      { "type": "range", "id": "rating", "label": "Stars", "min": 1, "max": 5, "step": 1, "default": 5 },
      { "type": "image_picker", "id": "avatar", "label": "Avatar", "default": "" },
      { "type": "image_picker", "id": "screenshot", "label": "Review screenshot", "default": "" }
    ] }
  ]
}
{% endschema %}`

export const COMPARISON_SOURCE = `<style>
${SCOPE} .cp{padding:clamp(26px,5vw,48px) 16px;background:var(--cp-bg,transparent)}
${SCOPE} .cp__head{text-align:center;max-width:620px;margin:0 auto 24px}
${SCOPE} .cp__head h2{font-size:clamp(20px,3.8vw,30px);font-weight:800;margin:0 0 6px}
${SCOPE} .cp__head p{margin:0;opacity:.72}
${SCOPE} .cp__table{max-width:760px;margin:0 auto;border-radius:16px;overflow:hidden;border:1px solid color-mix(in oklab,currentColor 15%,transparent)}
${SCOPE} .cp__row{display:grid;grid-template-columns:1.6fr 1fr 1fr;align-items:center}
${SCOPE} .cp__row+.cp__row{border-top:1px solid color-mix(in oklab,currentColor 12%,transparent)}
${SCOPE} .cp__cell{padding:13px 14px;font-size:14px}
${SCOPE} .cp__cell--mid{text-align:center;font-weight:800;background:color-mix(in oklab,var(--cp-accent,#16a34a) 10%,transparent);color:var(--cp-accent,#16a34a)}
${SCOPE} .cp__cell--other{text-align:center;opacity:.55}
${SCOPE} .cp__row--head .cp__cell{font-weight:800;font-size:14px;background:color-mix(in oklab,currentColor 5%,transparent)}
${SCOPE} .cp__row--head .cp__cell--mid{background:var(--cp-accent,#16a34a);color:#fff}
${SCOPE} .cp--striped .cp__row:nth-child(even){background:color-mix(in oklab,currentColor 3%,transparent)}
${SCOPE} .cp--plain .cp__table{border:none;border-radius:0}
${SCOPE} .cp--cards .cp__table{border:none}
${SCOPE} .cp--cards .cp__row{border:1px solid color-mix(in oklab,currentColor 14%,transparent);border-radius:12px;margin-bottom:8px}
@media(max-width:560px){${SCOPE} .cp__cell{padding:10px 8px;font-size:13px}}
</style>

<div class="cp cp--{{ section.settings.style }}" style="--cp-bg:{{ section.settings.background_color }};--cp-accent:{{ section.settings.accent_color }}">
  {%- if section.settings.heading != blank or section.settings.subheading != blank -%}
  <div class="cp__head">
    {%- if section.settings.heading != blank -%}<h2>{{ section.settings.heading }}</h2>{%- endif -%}
    {%- if section.settings.subheading != blank -%}<p>{{ section.settings.subheading }}</p>{%- endif -%}
  </div>
  {%- endif -%}
  <div class="cp__table">
    <div class="cp__row cp__row--head">
      <div class="cp__cell">{{ section.settings.feature_label }}</div>
      <div class="cp__cell cp__cell--mid">{{ section.settings.us_label }}</div>
      <div class="cp__cell cp__cell--other">{{ section.settings.them_label }}</div>
    </div>
    {%- for block in section.blocks -%}
      <div class="cp__row" {{ block.shopify_attributes }}>
        <div class="cp__cell">{{ block.settings.feature }}</div>
        <div class="cp__cell cp__cell--mid">{{ block.settings.us }}</div>
        <div class="cp__cell cp__cell--other">{{ block.settings.them }}</div>
      </div>
    {%- endfor -%}
  </div>
</div>

{% schema %}
{
  "name": "Comparison table",
  "category": "Commerce",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "কেন আমরা আলাদা?" },
    { "type": "textarea", "id": "subheading", "label": "Subheading", "default": "" },
    { "type": "text", "id": "feature_label", "label": "First column label", "default": "সুবিধা" },
    { "type": "text", "id": "us_label", "label": "Our column label", "default": "আমরা" },
    { "type": "text", "id": "them_label", "label": "Their column label", "default": "অন্যরা" },
    { "type": "select", "id": "style", "label": "Design", "default": "striped",
      "options": [
        { "value": "striped", "label": "Striped rows" },
        { "value": "plain", "label": "Plain" },
        { "value": "cards", "label": "Separated cards" }
      ] },
    { "type": "color", "id": "background_color", "label": "Background", "default": "#ffffff" },
    { "type": "color", "id": "accent_color", "label": "Accent colour", "default": "#16a34a" }
  ],
  "blocks": [
    { "type": "row", "name": "Row", "settings": [
      { "type": "text", "id": "feature", "label": "Feature", "default": "ক্যাশ অন ডেলিভারি" },
      { "type": "text", "id": "us", "label": "Us", "default": "✓" },
      { "type": "text", "id": "them", "label": "Them", "default": "✕" }
    ] }
  ]
}
{% endschema %}`

export const MARQUEE_SOURCE = `<style>
${SCOPE} .mq{overflow:hidden;background:var(--mq-bg,#16a34a);color:var(--mq-text,#fff);padding:var(--mq-pad,11px) 0;white-space:nowrap}
${SCOPE} .mq__track{display:inline-flex;gap:var(--mq-gap,40px);align-items:center;padding-left:var(--mq-gap,40px);animation:mq-scroll var(--mq-speed,22s) linear infinite;will-change:transform}
${SCOPE} .mq__item{font-size:var(--mq-size,15px);font-weight:700;letter-spacing:.01em}
${SCOPE} .mq--dashed .mq__item::after{content:"—";margin-left:var(--mq-gap,40px);opacity:.5}
${SCOPE} .mq--dot .mq__item::after{content:"•";margin-left:var(--mq-gap,40px);opacity:.6}
${SCOPE} .mq--outline{background:transparent;color:var(--mq-bg,#16a34a);border-top:1px solid currentColor;border-bottom:1px solid currentColor}
@keyframes mq-scroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@media(prefers-reduced-motion:reduce){${SCOPE} .mq__track{animation:none}}
</style>

<div class="mq mq--{{ section.settings.style }}" style="--mq-bg:{{ section.settings.background_color }};--mq-text:{{ section.settings.text_color }};--mq-speed:{{ section.settings.speed }}s;--mq-gap:{{ section.settings.gap }}px;--mq-size:{{ section.settings.font_size }}px;--mq-pad:{{ section.settings.padding }}px">
  <div class="mq__track">
    {%- comment -%} Rendered twice so the -50% keyframe loops seamlessly. {%- endcomment -%}
    {%- for pass in (1..2) -%}
      {%- for block in section.blocks -%}
        <span class="mq__item">{{ block.settings.text }}</span>
      {%- endfor -%}
    {%- endfor -%}
  </div>
</div>

{% schema %}
{
  "name": "Scrolling banner",
  "category": "Commerce",
  "settings": [
    { "type": "select", "id": "style", "label": "Separator", "default": "dot",
      "options": [
        { "value": "dot", "label": "Dot" },
        { "value": "dashed", "label": "Dash" },
        { "value": "plain", "label": "None" },
        { "value": "outline", "label": "Outlined, no fill" }
      ] },
    { "type": "color", "id": "background_color", "label": "Background", "default": "#16a34a" },
    { "type": "color", "id": "text_color", "label": "Text colour", "default": "#ffffff" },
    { "type": "range", "id": "speed", "label": "Seconds per loop", "min": 8, "max": 60, "step": 2, "unit": "s", "default": 22 },
    { "type": "range", "id": "gap", "label": "Gap", "min": 12, "max": 90, "step": 4, "unit": "px", "default": 40 },
    { "type": "range", "id": "font_size", "label": "Font size", "min": 11, "max": 28, "step": 1, "unit": "px", "default": 15 },
    { "type": "range", "id": "padding", "label": "Height", "min": 4, "max": 28, "step": 1, "unit": "px", "default": 11 }
  ],
  "blocks": [
    { "type": "message", "name": "Message", "settings": [
      { "type": "text", "id": "text", "label": "Text", "default": "🚚 সারা দেশে ক্যাশ অন ডেলিভারি" }
    ] }
  ]
}
{% endschema %}`

export const ANNOUNCEMENT_SOURCE = `<style>
${SCOPE} .an{padding:var(--an-pad,10px) 16px;background:var(--an-bg,#111827);color:var(--an-text,#fff);text-align:center;font-size:var(--an-size,14px);font-weight:600}
${SCOPE} .an a{color:inherit;text-decoration:underline;text-underline-offset:3px}
${SCOPE} .an--gradient{background:linear-gradient(90deg,var(--an-bg,#111827),var(--an-accent,#16a34a))}
${SCOPE} .an--bordered{background:transparent;color:var(--an-bg,#111827);border-top:2px solid currentColor;border-bottom:2px solid currentColor}
${SCOPE} .an--pill{background:transparent;padding:14px 16px}
${SCOPE} .an--pill .an__inner{display:inline-block;background:var(--an-bg,#111827);color:var(--an-text,#fff);padding:8px 20px;border-radius:999px}
</style>

<div class="an an--{{ section.settings.style }}" style="--an-bg:{{ section.settings.background_color }};--an-text:{{ section.settings.text_color }};--an-accent:{{ section.settings.accent_color }};--an-size:{{ section.settings.font_size }}px;--an-pad:{{ section.settings.padding }}px">
  <span class="an__inner">
    {%- if section.settings.link != blank -%}
      <a href="{{ section.settings.link }}">{{ section.settings.text }}</a>
    {%- else -%}
      {{ section.settings.text }}
    {%- endif -%}
  </span>
</div>

{% schema %}
{
  "name": "Announcement bar",
  "category": "Commerce",
  "settings": [
    { "type": "text", "id": "text", "label": "Message", "default": "🎉 ঈদ অফার — সব প্রোডাক্টে ৩০% ছাড়!" },
    { "type": "text", "id": "link", "label": "Link (optional)", "default": "" },
    { "type": "select", "id": "style", "label": "Design", "default": "solid",
      "options": [
        { "value": "solid", "label": "Solid" },
        { "value": "gradient", "label": "Gradient" },
        { "value": "bordered", "label": "Bordered" },
        { "value": "pill", "label": "Pill" }
      ] },
    { "type": "color", "id": "background_color", "label": "Background", "default": "#111827" },
    { "type": "color", "id": "text_color", "label": "Text colour", "default": "#ffffff" },
    { "type": "color", "id": "accent_color", "label": "Gradient end colour", "default": "#16a34a" },
    { "type": "range", "id": "font_size", "label": "Font size", "min": 11, "max": 22, "step": 1, "unit": "px", "default": 14 },
    { "type": "range", "id": "padding", "label": "Height", "min": 4, "max": 24, "step": 1, "unit": "px", "default": 10 }
  ]
}
{% endschema %}`

export const STICKY_BAR_SOURCE = `<style>
${SCOPE} .sb{position:fixed;left:0;right:0;bottom:0;z-index:60;background:var(--sb-bg,#0f172a);color:var(--sb-text,#fff);padding:10px 14px;box-shadow:0 -6px 24px -10px rgba(2,6,23,.6);transform:translateY(110%);transition:transform .26s ease}
${SCOPE} .sb.is-visible{transform:translateY(0)}
${SCOPE} .sb__inner{max-width:900px;margin:0 auto;display:flex;align-items:center;gap:12px}
${SCOPE} .sb__label{font-size:13px;opacity:.8;margin:0}
${SCOPE} .sb__price{font-size:18px;font-weight:800;margin:0;color:var(--sb-accent,#22c55e)}
${SCOPE} .sb__cta{margin-left:auto;background:var(--sb-accent,#22c55e);color:#062e17;font-weight:800;font-size:15px;padding:12px 22px;border-radius:10px;text-decoration:none;white-space:nowrap}
${SCOPE} .sb--light{background:#fff;color:#0f172a;border-top:1px solid #e2e8f0}
${SCOPE} .sb--accent{background:var(--sb-accent,#22c55e);color:#062e17}
${SCOPE} .sb--accent .sb__cta{background:#0f172a;color:#fff}
${SCOPE} .sb--accent .sb__price{color:inherit}
${SCOPE} .sb--full .sb__cta{margin:0;flex:1;text-align:center}
${SCOPE} .sb--full .sb__inner{flex-wrap:wrap}
@media(max-width:520px){
  ${SCOPE} .sb__label{display:none}
  ${SCOPE} .sb__cta{padding:12px 16px;font-size:14px}
}
</style>

{%- comment -%}
  The bar quotes the page's default offer, falling back to the newest product
  when the page has no offers yet.

  Quoting the offer rather than a bare product price is the whole point: the
  bar follows the buyer down a page whose headline is "2 pieces for 1800", and
  showing the single-unit price there contradicts everything above it.

  The product fallback is written this way because a variable assigned the
  value blank does NOT compare equal to blank in LiquidJS, so the obvious
  "initialise to blank, test for blank" shape silently never takes its
  fallback branch.
{%- endcomment -%}
{%- assign bar_price = 0 -%}
{%- assign bar_compare = 0 -%}
{%- assign bar_key = '' -%}
{%- if offer != blank -%}
  {%- assign bar_price = offer.price -%}
  {%- assign bar_compare = offer.compare_at_price -%}
  {%- assign bar_key = offer.key -%}
{%- else -%}
  {%- assign p = products | first -%}
  {%- if section.settings.product_handle != blank -%}
    {%- assign picked = all_products[section.settings.product_handle] -%}
    {%- if picked != blank -%}{%- assign p = picked -%}{%- endif -%}
  {%- endif -%}
  {%- if p != blank -%}{%- assign bar_price = p.price -%}{%- endif -%}
{%- endif -%}

<div class="sb sb--{{ section.settings.style }}" data-sticky-after="{{ section.settings.show_after }}" style="--sb-bg:{{ section.settings.background_color }};--sb-text:{{ section.settings.text_color }};--sb-accent:{{ section.settings.accent_color }}">
  <div class="sb__inner">
    <div>
      {%- if section.settings.label != blank -%}<p class="sb__label">{{ section.settings.label }}</p>{%- endif -%}
      {%- if section.settings.show_price and bar_price > 0 -%}
        <p class="sb__price">
          {{ bar_price | money }}
          {%- if bar_compare > bar_price -%}<s style="opacity:.5;font-size:14px;font-weight:500;margin-left:6px">{{ bar_compare | money }}</s>{%- endif -%}
        </p>
      {%- endif -%}
    </div>
    <a class="sb__cta" href="#order"{% if bar_key != blank %} data-offer-key="{{ bar_key }}"{% endif %}>{{ section.settings.button_label }}</a>
  </div>
</div>

{% schema %}
{
  "name": "Sticky order bar",
  "category": "Commerce",
  "settings": [
    { "type": "text", "id": "product_handle", "label": "Product handle (blank = newest)", "default": "" },
    { "type": "text", "id": "label", "label": "Small label", "default": "আজকের অফার মূল্য" },
    { "type": "text", "id": "button_label", "label": "Button label", "default": "অর্ডার করুন" },
    { "type": "checkbox", "id": "show_price", "label": "Show live price", "default": true },
    { "type": "range", "id": "show_after", "label": "Appear after scrolling", "min": 0, "max": 1600, "step": 50, "unit": "px", "default": 400 },
    { "type": "select", "id": "style", "label": "Design", "default": "dark",
      "options": [
        { "value": "dark", "label": "Dark" },
        { "value": "light", "label": "Light" },
        { "value": "accent", "label": "Accent" },
        { "value": "full", "label": "Full-width button" }
      ] },
    { "type": "color", "id": "background_color", "label": "Background", "default": "#0f172a" },
    { "type": "color", "id": "text_color", "label": "Text colour", "default": "#ffffff" },
    { "type": "color", "id": "accent_color", "label": "Accent colour", "default": "#22c55e" }
  ]
}
{% endschema %}`

export const GALLERY_STRIP_SOURCE = `<style>
${ratioCss(SCOPE)}
${SCOPE} .gs{padding:clamp(22px,4vw,44px) 16px;background:var(--gs-bg,transparent)}
${SCOPE} .gs__head{text-align:center;margin:0 0 20px}
${SCOPE} .gs__head h2{font-size:clamp(19px,3.4vw,28px);font-weight:800;margin:0}
${SCOPE} .gs__list{max-width:1100px;margin:0 auto;display:grid;gap:var(--gs-gap,10px)}
${SCOPE} .gs--grid-2 .gs__list{grid-template-columns:repeat(2,1fr)}
${SCOPE} .gs--grid-3 .gs__list{grid-template-columns:repeat(3,1fr)}
${SCOPE} .gs--grid-4 .gs__list{grid-template-columns:repeat(4,1fr)}
${SCOPE} .gs--scroll .gs__list{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:8px}
${SCOPE} .gs--scroll img{flex:0 0 68%;scroll-snap-align:start}
${SCOPE} .gs--mosaic .gs__list{grid-template-columns:repeat(4,1fr)}
${SCOPE} .gs--mosaic img:first-child{grid-column:span 2;grid-row:span 2}
${SCOPE} .gs img{width:100%;display:block;border-radius:var(--gs-radius,12px);object-fit:cover}
@media(max-width:640px){
  ${SCOPE} .gs--grid-3 .gs__list,${SCOPE} .gs--grid-4 .gs__list,${SCOPE} .gs--mosaic .gs__list{grid-template-columns:repeat(2,1fr)}
  ${SCOPE} .gs--mosaic img:first-child{grid-column:span 2;grid-row:auto}
}
</style>

<div class="gs gs--{{ section.settings.layout }}" style="--gs-bg:{{ section.settings.background_color }};--gs-gap:{{ section.settings.gap }}px;--gs-radius:{{ section.settings.radius }}px">
  {%- if section.settings.heading != blank -%}<div class="gs__head"><h2>{{ section.settings.heading }}</h2></div>{%- endif -%}
  <div class="gs__list">
    {%- if section.settings.source == "product" -%}
      {%- comment -%} See product-hero for why this is not written as "init to blank, test for blank". {%- endcomment -%}
      {%- assign p = products | first -%}
      {%- if section.settings.product_handle != blank -%}
        {%- assign picked = all_products[section.settings.product_handle] -%}
        {%- if picked != blank -%}{%- assign p = picked -%}{%- endif -%}
      {%- endif -%}
      {%- for image in p.images limit: section.settings.limit -%}
        <img class="ps-img ps-img--{{ section.settings.image_ratio }}" src="{{ image.src }}" alt="{{ image.alt | escape }}" loading="lazy">
      {%- endfor -%}
    {%- else -%}
      {%- for block in section.blocks -%}
        {%- if block.settings.image != blank -%}
          <img class="ps-img ps-img--{{ section.settings.image_ratio }}" src="{{ block.settings.image }}" alt="{{ block.settings.alt | escape }}" loading="lazy" {{ block.shopify_attributes }}>
        {%- endif -%}
      {%- endfor -%}
    {%- endif -%}
  </div>
</div>

{% schema %}
{
  "name": "Image gallery",
  "category": "Commerce",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "প্রোডাক্টের ছবি" },
    { "type": "select", "id": "source", "label": "Images from", "default": "custom",
      "options": [
        { "value": "custom", "label": "Uploaded below" },
        { "value": "product", "label": "A product's own images" }
      ] },
    { "type": "text", "id": "product_handle", "label": "Product handle (blank = newest)", "default": "" },
    { "type": "range", "id": "limit", "label": "Max images", "min": 1, "max": 12, "step": 1, "default": 6 },
    { "type": "select", "id": "layout", "label": "Layout", "default": "grid-3",
      "options": [
        { "value": "grid-2", "label": "Grid — 2 across" },
        { "value": "grid-3", "label": "Grid — 3 across" },
        { "value": "grid-4", "label": "Grid — 4 across" },
        { "value": "scroll", "label": "Swipeable row" },
        { "value": "mosaic", "label": "Mosaic — first image large" }
      ] },
    { "type": "select", "id": "image_ratio", "label": "Image shape", "default": "square",
      "options": [
        { "value": "square", "label": "Square" },
        { "value": "portrait", "label": "Portrait" },
        { "value": "landscape", "label": "Landscape" },
        { "value": "wide", "label": "Wide" },
        { "value": "auto", "label": "Original" }
      ] },
    { "type": "color", "id": "background_color", "label": "Background", "default": "#ffffff" },
    { "type": "range", "id": "gap", "label": "Gap", "min": 2, "max": 28, "step": 2, "unit": "px", "default": 10 },
    { "type": "range", "id": "radius", "label": "Corner radius", "min": 0, "max": 28, "step": 2, "unit": "px", "default": 12 }
  ],
  "blocks": [
    { "type": "image", "name": "Image", "settings": [
      { "type": "image_picker", "id": "image", "label": "Image", "default": "" },
      { "type": "text", "id": "alt", "label": "Alt text", "default": "" }
    ] }
  ]
}
{% endschema %}`
