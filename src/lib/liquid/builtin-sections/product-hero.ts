import { SCOPE, ratioCss } from './shared'

/**
 * Single-product hero — the top of a one-product landing page.
 *
 * The dominant shape of selling in this market: one product, one price, one
 * call to action, and the buyer should be able to order without scrolling
 * twice. Pulls its price and image from the real product rather than from
 * typed-in copy, so a price change in the admin updates the page on the next
 * publish instead of silently going stale.
 *
 * Six layouts because the same content reads very differently depending on
 * whether the image leads, follows, or sits behind the text — and on a phone
 * every one of them stacks, which is the only version most buyers will see.
 */
export const PRODUCT_HERO_SOURCE = `<style>
${ratioCss(SCOPE)}
${SCOPE} .ph{--ph-pad:clamp(24px,5vw,56px);padding:var(--ph-pad) 16px}
${SCOPE} .ph__inner{max-width:1100px;margin:0 auto;display:grid;gap:clamp(20px,4vw,44px);align-items:center}
${SCOPE} .ph--split .ph__inner{grid-template-columns:1fr 1fr}
${SCOPE} .ph--split-reverse .ph__inner{grid-template-columns:1fr 1fr}
${SCOPE} .ph--split-reverse .ph__media{order:2}
${SCOPE} .ph--centered .ph__inner{grid-template-columns:1fr;text-align:center;justify-items:center}
${SCOPE} .ph--stacked .ph__inner{grid-template-columns:1fr;max-width:620px;text-align:center;justify-items:center}
${SCOPE} .ph--wide .ph__inner{grid-template-columns:1.25fr 1fr}
${SCOPE} .ph--overlay{position:relative;min-height:78vh;display:flex;align-items:flex-end}
${SCOPE} .ph--overlay .ph__media{position:absolute;inset:0}
${SCOPE} .ph--overlay .ph__media img{width:100%;height:100%;object-fit:cover}
${SCOPE} .ph--overlay .ph__inner{position:relative;grid-template-columns:1fr;color:#fff}
${SCOPE} .ph--overlay::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(2,6,23,.9),rgba(2,6,23,.15))}
${SCOPE} .ph--overlay .ph__body{position:relative;z-index:2}
@media(max-width:820px){
  ${SCOPE} .ph--split .ph__inner,${SCOPE} .ph--split-reverse .ph__inner,${SCOPE} .ph--wide .ph__inner{grid-template-columns:1fr;text-align:center;justify-items:center}
  ${SCOPE} .ph--split-reverse .ph__media{order:0}
}
${SCOPE} .ph__media img{width:100%;border-radius:var(--ph-radius,18px);display:block}
${SCOPE} .ph__badge{display:inline-block;background:var(--ph-badge-bg,#dc2626);color:var(--ph-badge-text,#fff);font-size:13px;font-weight:700;padding:6px 14px;border-radius:999px;margin-bottom:14px}
${SCOPE} .ph__title{font-size:clamp(26px,5vw,42px);line-height:1.18;font-weight:800;margin:0 0 12px;color:var(--ph-title,inherit)}
${SCOPE} .ph__sub{font-size:clamp(15px,2.2vw,18px);opacity:.78;margin:0 0 18px;max-width:52ch}
${SCOPE} .ph__price{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:0 0 6px}
${SCOPE} .ph--centered .ph__price,${SCOPE} .ph--stacked .ph__price{justify-content:center}
${SCOPE} .ph__now{font-size:clamp(26px,4vw,36px);font-weight:800;color:var(--ph-accent,#16a34a)}
${SCOPE} .ph__was{font-size:18px;opacity:.5;text-decoration:line-through}
${SCOPE} .ph__off{background:var(--ph-accent,#16a34a);color:#fff;font-size:13px;font-weight:700;padding:3px 10px;border-radius:999px}
${SCOPE} .ph__stock{font-size:14px;margin:0 0 16px;font-weight:600}
${SCOPE} .ph__stock--in{color:var(--ph-accent,#16a34a)}
${SCOPE} .ph__stock--out{color:#dc2626}
${SCOPE} .ph__cta{display:inline-block;background:var(--ph-accent,#16a34a);color:#fff;font-size:clamp(16px,2.4vw,19px);font-weight:800;padding:15px 40px;border-radius:var(--ph-btn-radius,12px);text-decoration:none;box-shadow:0 8px 22px -8px var(--ph-accent,#16a34a)}
${SCOPE} .ph__note{font-size:13px;opacity:.62;margin:12px 0 0}
${SCOPE} .ph__points{list-style:none;padding:0;margin:16px 0 0;display:grid;gap:8px;text-align:left;max-width:44ch}
${SCOPE} .ph--centered .ph__points,${SCOPE} .ph--stacked .ph__points{margin-inline:auto}
${SCOPE} .ph__points li{display:flex;gap:9px;align-items:flex-start;font-size:15px}
${SCOPE} .ph__points li::before{content:"✓";flex:none;width:20px;height:20px;border-radius:50%;background:var(--ph-accent,#16a34a);color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center;margin-top:2px}
</style>

{%- comment -%}
  Resolve the product: newest by default, overridden by an explicit handle.
  Written this way because a variable assigned the value blank does NOT compare
  equal to blank in LiquidJS, so the obvious "initialise to blank, test for
  blank" shape silently never takes its fallback branch.
{%- endcomment -%}
{%- assign p = products | first -%}
{%- if section.settings.product_handle != blank -%}
  {%- assign picked = all_products[section.settings.product_handle] -%}
  {%- if picked != blank -%}{%- assign p = picked -%}{%- endif -%}
{%- endif -%}

<div class="ph ph--{{ section.settings.layout }}" style="--ph-accent:{{ section.settings.accent_color }};--ph-title:{{ section.settings.title_color }};--ph-radius:{{ section.settings.image_radius }}px;--ph-btn-radius:{{ section.settings.button_radius }}px;--ph-badge-bg:{{ section.settings.badge_background }};--ph-badge-text:{{ section.settings.badge_text_color }};background:{{ section.settings.background_color }}">
  <div class="ph__inner">
    {%- if section.settings.show_image -%}
    <div class="ph__media">
      {%- if section.settings.image_override != blank -%}
        <img src="{{ section.settings.image_override }}" alt="{{ section.settings.title_override | escape }}">
      {%- elsif p.featured_image -%}
        <img class="ps-img ps-img--{{ section.settings.image_ratio }}" src="{{ p.featured_image.src }}" alt="{{ p.title | escape }}">
      {%- endif -%}
    </div>
    {%- endif -%}

    <div class="ph__body">
      {%- if section.settings.badge_text != blank -%}<span class="ph__badge">{{ section.settings.badge_text }}</span>{%- endif -%}

      <h1 class="ph__title">
        {%- if section.settings.title_override != blank -%}{{ section.settings.title_override }}{%- else -%}{{ p.title }}{%- endif -%}
      </h1>

      {%- if section.settings.subheading != blank -%}<p class="ph__sub">{{ section.settings.subheading }}</p>{%- endif -%}

      {%- if section.settings.show_price and p != blank -%}
      <div class="ph__price">
        <span class="ph__now">{{ p.price | money }}</span>
        {%- if p.compare_at_price > p.price -%}
          <s class="ph__was">{{ p.compare_at_price | money }}</s>
          {%- assign saved = p.compare_at_price | minus: p.price -%}
          <span class="ph__off">{{ saved | money }} ছাড়</span>
        {%- endif -%}
      </div>
      {%- endif -%}

      {%- if section.settings.show_stock and p != blank -%}
        {%- if p.available -%}
          <p class="ph__stock ph__stock--in">{{ section.settings.in_stock_text }}</p>
        {%- else -%}
          <p class="ph__stock ph__stock--out">{{ section.settings.out_of_stock_text }}</p>
        {%- endif -%}
      {%- endif -%}

      {%- if section.settings.point_1 != blank or section.settings.point_2 != blank or section.settings.point_3 != blank or section.settings.point_4 != blank -%}
      <ul class="ph__points">
        {%- if section.settings.point_1 != blank -%}<li>{{ section.settings.point_1 }}</li>{%- endif -%}
        {%- if section.settings.point_2 != blank -%}<li>{{ section.settings.point_2 }}</li>{%- endif -%}
        {%- if section.settings.point_3 != blank -%}<li>{{ section.settings.point_3 }}</li>{%- endif -%}
        {%- if section.settings.point_4 != blank -%}<li>{{ section.settings.point_4 }}</li>{%- endif -%}
      </ul>
      {%- endif -%}

      {%- if section.settings.button_label != blank -%}
        <p style="margin:20px 0 0"><a class="ph__cta" href="{{ section.settings.button_link }}">{{ section.settings.button_label }}</a></p>
      {%- endif -%}
      {%- if section.settings.note != blank -%}<p class="ph__note">{{ section.settings.note }}</p>{%- endif -%}
    </div>
  </div>
</div>

{% schema %}
{
  "name": "Product hero",
  "category": "Commerce",
  "settings": [
    { "type": "text", "id": "product_handle", "label": "Product handle (blank = newest)", "default": "" },
    { "type": "select", "id": "layout", "label": "Layout", "default": "split",
      "options": [
        { "value": "split", "label": "Image left, text right" },
        { "value": "split-reverse", "label": "Text left, image right" },
        { "value": "centered", "label": "Centered" },
        { "value": "stacked", "label": "Narrow stacked" },
        { "value": "wide", "label": "Wide image" },
        { "value": "overlay", "label": "Full-bleed image with text over it" }
      ] },
    { "type": "text", "id": "badge_text", "label": "Badge", "default": "সীমিত সময়ের অফার" },
    { "type": "text", "id": "title_override", "label": "Headline (blank = product title)", "default": "" },
    { "type": "textarea", "id": "subheading", "label": "Subheading", "default": "প্রোডাক্টের মূল সুবিধা এক লাইনে লিখুন।" },
    { "type": "text", "id": "point_1", "label": "Selling point 1", "default": "১০০% অরিজিনাল প্রোডাক্ট" },
    { "type": "text", "id": "point_2", "label": "Selling point 2", "default": "সারা দেশে ক্যাশ অন ডেলিভারি" },
    { "type": "text", "id": "point_3", "label": "Selling point 3", "default": "২৪-৭২ ঘণ্টায় ডেলিভারি" },
    { "type": "text", "id": "point_4", "label": "Selling point 4", "default": "" },
    { "type": "text", "id": "button_label", "label": "Button label", "default": "এখনই অর্ডার করুন" },
    { "type": "text", "id": "button_link", "label": "Button link", "default": "#order" },
    { "type": "text", "id": "note", "label": "Small note under button", "default": "প্রোডাক্ট হাতে পেয়ে টাকা পরিশোধ করুন" },
    { "type": "checkbox", "id": "show_image", "label": "Show image", "default": true },
    { "type": "checkbox", "id": "show_price", "label": "Show price", "default": true },
    { "type": "checkbox", "id": "show_stock", "label": "Show stock status", "default": true },
    { "type": "text", "id": "in_stock_text", "label": "In stock text", "default": "স্টকে আছে" },
    { "type": "text", "id": "out_of_stock_text", "label": "Out of stock text", "default": "স্টক শেষ" },
    { "type": "image_picker", "id": "image_override", "label": "Image override", "default": "" },
    { "type": "select", "id": "image_ratio", "label": "Image shape", "default": "square",
      "options": [
        { "value": "square", "label": "Square" },
        { "value": "portrait", "label": "Portrait" },
        { "value": "landscape", "label": "Landscape" },
        { "value": "wide", "label": "Wide" },
        { "value": "auto", "label": "Original" }
      ] },
    { "type": "color", "id": "accent_color", "label": "Accent colour", "default": "#16a34a" },
    { "type": "color", "id": "background_color", "label": "Background", "default": "#fff7ed" },
    { "type": "color", "id": "title_color", "label": "Headline colour", "default": "#111827" },
    { "type": "color", "id": "badge_background", "label": "Badge background", "default": "#dc2626" },
    { "type": "color", "id": "badge_text_color", "label": "Badge text", "default": "#ffffff" },
    { "type": "range", "id": "image_radius", "label": "Image corner radius", "min": 0, "max": 40, "step": 2, "unit": "px", "default": 18 },
    { "type": "range", "id": "button_radius", "label": "Button corner radius", "min": 0, "max": 40, "step": 2, "unit": "px", "default": 12 }
  ]
}
{% endschema %}`
