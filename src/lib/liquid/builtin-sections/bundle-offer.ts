import { SCOPE } from './shared'

/**
 * Bundle / package offer.
 *
 * The second dominant selling shape in this market: the same product offered
 * as 1 piece, a 2-piece combo and a 3-piece family pack, with the saving spelled
 * out so the middle option looks obvious. Packages are `{% schema %}` blocks,
 * which compile into a repeatable list in the Inspector — a merchant adds or
 * removes tiers without touching the layout.
 *
 * Each package can be marked "most popular", which is the whole mechanic: the
 * highlighted tier is the one the page is steering toward, and every style
 * below renders that emphasis differently rather than just adding a label.
 */
export const BUNDLE_OFFER_SOURCE = `<style>
${SCOPE} .bo{padding:clamp(28px,5vw,52px) 16px;background:var(--bo-bg,transparent)}
${SCOPE} .bo__head{text-align:center;max-width:640px;margin:0 auto 26px}
${SCOPE} .bo__head h2{font-size:clamp(21px,4vw,32px);font-weight:800;margin:0 0 8px;color:var(--bo-heading,inherit)}
${SCOPE} .bo__head p{margin:0;opacity:.72}
${SCOPE} .bo__list{max-width:1000px;margin:0 auto;display:grid;gap:16px}
${SCOPE} .bo--cards .bo__list{grid-template-columns:repeat(auto-fit,minmax(230px,1fr));align-items:stretch}
${SCOPE} .bo--tiers .bo__list{grid-template-columns:repeat(auto-fit,minmax(230px,1fr));align-items:end}
${SCOPE} .bo--rows .bo__list,${SCOPE} .bo--table .bo__list{grid-template-columns:1fr;gap:10px}
${SCOPE} .bo--compact .bo__list{grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}

${SCOPE} .bo__item{position:relative;background:var(--bo-card,#fff);color:var(--bo-card-text,#0f172a);border:1px solid color-mix(in oklab,currentColor 14%,transparent);border-radius:var(--bo-radius,16px);padding:22px 18px;text-align:center;display:flex;flex-direction:column;gap:6px;text-decoration:none}
${SCOPE} .bo__item--best{border:2px solid var(--bo-accent,#16a34a);box-shadow:0 14px 34px -14px var(--bo-accent,#16a34a)}
${SCOPE} .bo--tiers .bo__item--best{transform:scale(1.05);z-index:2}
${SCOPE} .bo__flag{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:var(--bo-accent,#16a34a);color:#fff;font-size:11px;font-weight:800;padding:4px 14px;border-radius:999px;white-space:nowrap}
${SCOPE} .bo__name{font-size:16px;font-weight:800;margin:0}
${SCOPE} .bo__desc{font-size:13px;opacity:.7;margin:0}
${SCOPE} .bo__price{font-size:clamp(22px,3.5vw,30px);font-weight:800;color:var(--bo-accent,#16a34a);margin:6px 0 0}
${SCOPE} .bo__was{font-size:14px;opacity:.5;text-decoration:line-through;margin:0}
${SCOPE} .bo__save{display:inline-block;background:color-mix(in oklab,var(--bo-accent,#16a34a) 14%,transparent);color:var(--bo-accent,#16a34a);font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px;margin:6px auto 0}
${SCOPE} .bo__btn{display:block;margin:14px 0 0;background:var(--bo-accent,#16a34a);color:#fff;font-weight:700;padding:11px 16px;border-radius:calc(var(--bo-radius,16px) - 6px);text-decoration:none;font-size:14px}
${SCOPE} .bo__item--best .bo__btn{box-shadow:0 6px 18px -6px var(--bo-accent,#16a34a)}

/* Rows: a horizontal strip, easier to scan on a phone than three tall cards. */
${SCOPE} .bo--rows .bo__item,${SCOPE} .bo--table .bo__item{flex-direction:row;align-items:center;text-align:left;gap:14px;padding:14px 16px}
${SCOPE} .bo--rows .bo__flag,${SCOPE} .bo--table .bo__flag{position:static;transform:none;margin-left:auto}
${SCOPE} .bo--rows .bo__price,${SCOPE} .bo--table .bo__price{margin:0 0 0 auto;font-size:20px}
${SCOPE} .bo--rows .bo__btn,${SCOPE} .bo--table .bo__btn{margin:0;flex:none;padding:10px 18px}
${SCOPE} .bo--table .bo__item{border-radius:0;border-bottom:none}
${SCOPE} .bo--table .bo__item:first-child{border-radius:var(--bo-radius,16px) var(--bo-radius,16px) 0 0}
${SCOPE} .bo--table .bo__item:last-child{border-radius:0 0 var(--bo-radius,16px) var(--bo-radius,16px);border-bottom:1px solid color-mix(in oklab,currentColor 14%,transparent)}

${SCOPE} .bo--compact .bo__item{padding:14px 10px;gap:3px}
${SCOPE} .bo--compact .bo__price{font-size:19px}
${SCOPE} .bo--compact .bo__btn{padding:9px 10px;font-size:13px}
@media(max-width:620px){
  ${SCOPE} .bo--rows .bo__item,${SCOPE} .bo--table .bo__item{flex-wrap:wrap}
  ${SCOPE} .bo--rows .bo__price,${SCOPE} .bo--table .bo__price{margin-left:0}
  ${SCOPE} .bo--tiers .bo__item--best{transform:none}
}
</style>

<div class="bo bo--{{ section.settings.style }}" style="--bo-accent:{{ section.settings.accent_color }};--bo-bg:{{ section.settings.background_color }};--bo-card:{{ section.settings.card_color }};--bo-card-text:{{ section.settings.card_text_color }};--bo-heading:{{ section.settings.heading_color }};--bo-radius:{{ section.settings.radius }}px">
  {%- if section.settings.heading != blank or section.settings.subheading != blank -%}
  <div class="bo__head">
    {%- if section.settings.heading != blank -%}<h2>{{ section.settings.heading }}</h2>{%- endif -%}
    {%- if section.settings.subheading != blank -%}<p>{{ section.settings.subheading }}</p>{%- endif -%}
  </div>
  {%- endif -%}

  {%- comment -%}
    The packages are the page's offers, not hand-typed text.

    This section used to carry its own list of blocks with a price the
    merchant wrote themselves, which meant the card could advertise one number
    while the order form charged another. Reading offers makes that
    impossible: the price here and the price taken are the same row of the same
    table. Editing happens in the Offers tab.

    data-offer-key is what makes a card clickable rather than decorative —
    StorefrontEnhancements picks it up, scrolls to the form and preselects this
    exact offer.
  {%- endcomment -%}
  <div class="bo__list">
    {%- for offer in offers -%}
      <a class="bo__item{% if offer.badge != blank %} bo__item--best{% endif %}"
         href="#order" data-offer-key="{{ offer.key }}">
        {%- if offer.badge != blank -%}<span class="bo__flag">{{ offer.badge }}</span>{%- endif -%}
        <p class="bo__name">{{ offer.label }}</p>
        {%- if offer.description != blank -%}<p class="bo__desc">{{ offer.description }}</p>{%- endif -%}
        <p class="bo__price">{{ offer.price | money }}</p>
        {%- if offer.savings > 0 -%}
          <p class="bo__was">{{ offer.compare_at_price | money }}</p>
          <span class="bo__save">{{ offer.savings | money }} {{ section.settings.saving_suffix }}</span>
        {%- endif -%}
        {%- if section.settings.show_button -%}<span class="bo__btn">{{ section.settings.button_label }}</span>{%- endif -%}
      </a>
    {%- else -%}
      <p style="text-align:center;opacity:.6">{{ section.settings.empty_text }}</p>
    {%- endfor -%}
  </div>
</div>

{% schema %}
{
  "name": "Bundle offer",
  "category": "Commerce",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "\u0995\u09cb\u09a8 \u09aa\u09cd\u09af\u09be\u0995\u09c7\u099c\u099f\u09bf \u09a8\u09bf\u09ac\u09c7\u09a8?" },
    { "type": "textarea", "id": "subheading", "label": "Subheading", "default": "\u09af\u09a4 \u09ac\u09c7\u09b6\u09bf \u09a8\u09bf\u09ac\u09c7\u09a8 \u09a4\u09a4 \u09ac\u09c7\u09b6\u09bf \u09b8\u09be\u09b6\u09cd\u09b0\u09af\u09bc\u0964" },
    { "type": "select", "id": "style", "label": "Design", "default": "cards",
      "options": [
        { "value": "cards", "label": "Equal cards" },
        { "value": "tiers", "label": "Tiers \u2014 popular one raised" },
        { "value": "rows", "label": "Horizontal rows" },
        { "value": "table", "label": "Joined table" },
        { "value": "compact", "label": "Compact chips" }
      ] },
    { "type": "checkbox", "id": "show_button", "label": "Show button on each package", "default": true },
    { "type": "text", "id": "button_label", "label": "Button label", "default": "\u0985\u09b0\u09cd\u09a1\u09be\u09b0 \u0995\u09b0\u09c1\u09a8" },
    { "type": "text", "id": "saving_suffix", "label": "Saving suffix", "default": "\u09b8\u09be\u09b6\u09cd\u09b0\u09af\u09bc" },
    { "type": "text", "id": "empty_text", "label": "Empty state text", "default": "Add an offer in the Offers tab." },
    { "type": "color", "id": "accent_color", "label": "Accent colour", "default": "#16a34a" },
    { "type": "color", "id": "background_color", "label": "Section background", "default": "#f8fafc" },
    { "type": "color", "id": "card_color", "label": "Card background", "default": "#ffffff" },
    { "type": "color", "id": "card_text_color", "label": "Card text colour", "default": "#0f172a" },
    { "type": "color", "id": "heading_color", "label": "Heading colour", "default": "#0f172a" },
    { "type": "range", "id": "radius", "label": "Corner radius", "min": 0, "max": 34, "step": 2, "unit": "px", "default": 16 }
  ]
}
{% endschema %}`
