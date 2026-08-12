import { SCOPE } from './shared'

/**
 * The sections a landing page uses to close the sale rather than describe the
 * product: urgency, reassurance, logistics and proof of process.
 *
 * Each carries several designs, because these blocks repeat across every page
 * on the platform and identical trust badges on ten stores make all ten look
 * like the same template.
 *
 * Countdown and sticky bar declare behaviour with data attributes rather than
 * inline scripts — see modules/sections/StorefrontEnhancements.
 */

export const COUNTDOWN_SOURCE = `<style>
${SCOPE} .cd{padding:clamp(18px,3vw,32px) 16px;background:var(--cd-bg,#111827);color:var(--cd-text,#fff);text-align:center}
${SCOPE} .cd__title{font-size:clamp(16px,2.6vw,22px);font-weight:800;margin:0 0 4px}
${SCOPE} .cd__sub{font-size:14px;opacity:.75;margin:0 0 16px}
${SCOPE} .cd__clock{display:inline-flex;gap:var(--cd-gap,10px);align-items:center;justify-content:center;flex-wrap:wrap}
${SCOPE} .cd__unit{display:flex;flex-direction:column;align-items:center;min-width:64px}
${SCOPE} .cd__num{font-size:clamp(22px,4vw,34px);font-weight:800;font-variant-numeric:tabular-nums;line-height:1}
${SCOPE} .cd__label{font-size:11px;opacity:.65;margin-top:5px;text-transform:uppercase;letter-spacing:.06em}

${SCOPE} .cd--boxes .cd__unit{background:var(--cd-box,rgba(255,255,255,.12));border-radius:12px;padding:12px 8px}
${SCOPE} .cd--outline .cd__unit{border:2px solid var(--cd-accent,#f59e0b);border-radius:12px;padding:12px 8px}
${SCOPE} .cd--solid .cd__unit{background:var(--cd-accent,#f59e0b);color:#fff;border-radius:12px;padding:12px 8px}
${SCOPE} .cd--plain .cd__unit{min-width:52px}
${SCOPE} .cd--plain .cd__sep{font-size:26px;font-weight:800;opacity:.4}
${SCOPE} .cd--bar{padding:10px 16px;display:flex;gap:14px;align-items:center;justify-content:center;flex-wrap:wrap}
${SCOPE} .cd--bar .cd__title{margin:0;font-size:15px}
${SCOPE} .cd--bar .cd__sub{display:none}
${SCOPE} .cd--bar .cd__unit{flex-direction:row;gap:4px;min-width:0}
${SCOPE} .cd--bar .cd__num{font-size:17px}
${SCOPE} .cd--bar .cd__label{margin:0;font-size:11px;opacity:.7}
</style>

<div class="cd cd--{{ section.settings.style }}" style="--cd-bg:{{ section.settings.background_color }};--cd-text:{{ section.settings.text_color }};--cd-accent:{{ section.settings.accent_color }};--cd-gap:{{ section.settings.gap }}px">
  {%- if section.settings.title != blank -%}<p class="cd__title">{{ section.settings.title }}</p>{%- endif -%}
  {%- if section.settings.subtitle != blank -%}<p class="cd__sub">{{ section.settings.subtitle }}</p>{%- endif -%}

  <div class="cd__clock"
    {% if section.settings.mode == "evergreen" %}data-countdown-hours="{{ section.settings.hours }}" data-countdown-id="{{ section.id }}"{% else %}data-countdown-to="{{ section.settings.end_at }}"{% endif %}
    data-countdown-expired="{{ section.settings.expired_text }}">
    {%- if section.settings.show_days -%}
    <span class="cd__unit"><span class="cd__num" data-countdown-unit="days">00</span><span class="cd__label">{{ section.settings.days_label }}</span></span>
    {%- if section.settings.style == "plain" -%}<span class="cd__sep">:</span>{%- endif -%}
    {%- endif -%}
    <span class="cd__unit"><span class="cd__num" data-countdown-unit="hours">00</span><span class="cd__label">{{ section.settings.hours_label }}</span></span>
    {%- if section.settings.style == "plain" -%}<span class="cd__sep">:</span>{%- endif -%}
    <span class="cd__unit"><span class="cd__num" data-countdown-unit="minutes">00</span><span class="cd__label">{{ section.settings.minutes_label }}</span></span>
    {%- if section.settings.style == "plain" -%}<span class="cd__sep">:</span>{%- endif -%}
    <span class="cd__unit"><span class="cd__num" data-countdown-unit="seconds">00</span><span class="cd__label">{{ section.settings.seconds_label }}</span></span>
  </div>
</div>

{% schema %}
{
  "name": "Countdown",
  "category": "Commerce",
  "settings": [
    { "type": "text", "id": "title", "label": "Title", "default": "অফার শেষ হতে বাকি" },
    { "type": "text", "id": "subtitle", "label": "Subtitle", "default": "সময় শেষ হওয়ার আগেই অর্ডার করুন" },
    { "type": "select", "id": "style", "label": "Design", "default": "boxes",
      "options": [
        { "value": "boxes", "label": "Filled boxes" },
        { "value": "outline", "label": "Outlined boxes" },
        { "value": "solid", "label": "Accent boxes" },
        { "value": "plain", "label": "Plain with separators" },
        { "value": "bar", "label": "Thin bar" }
      ] },
    { "type": "select", "id": "mode", "label": "Timer type", "default": "evergreen",
      "options": [
        { "value": "evergreen", "label": "Hours from each visitor's first visit" },
        { "value": "fixed", "label": "Fixed end date" }
      ] },
    { "type": "range", "id": "hours", "label": "Hours (evergreen)", "min": 1, "max": 72, "step": 1, "default": 24 },
    { "type": "text", "id": "end_at", "label": "End date (2026-12-31T23:59:59)", "default": "" },
    { "type": "text", "id": "expired_text", "label": "Text when finished", "default": "অফার শেষ" },
    { "type": "checkbox", "id": "show_days", "label": "Show days", "default": false },
    { "type": "text", "id": "days_label", "label": "Days label", "default": "দিন" },
    { "type": "text", "id": "hours_label", "label": "Hours label", "default": "ঘণ্টা" },
    { "type": "text", "id": "minutes_label", "label": "Minutes label", "default": "মিনিট" },
    { "type": "text", "id": "seconds_label", "label": "Seconds label", "default": "সেকেন্ড" },
    { "type": "color", "id": "background_color", "label": "Background", "default": "#111827" },
    { "type": "color", "id": "text_color", "label": "Text colour", "default": "#ffffff" },
    { "type": "color", "id": "accent_color", "label": "Accent colour", "default": "#f59e0b" },
    { "type": "range", "id": "gap", "label": "Gap", "min": 4, "max": 28, "step": 2, "unit": "px", "default": 10 }
  ]
}
{% endschema %}`

export const TRUST_BADGES_SOURCE = `<style>
${SCOPE} .tb{padding:clamp(20px,4vw,40px) 16px;background:var(--tb-bg,transparent)}
${SCOPE} .tb__head{text-align:center;margin:0 0 20px}
${SCOPE} .tb__head h2{font-size:clamp(19px,3.4vw,27px);font-weight:800;margin:0}
${SCOPE} .tb__list{max-width:1000px;margin:0 auto;display:grid;gap:var(--tb-gap,14px);grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}
${SCOPE} .tb__item{display:flex;gap:12px;align-items:center;padding:14px 16px;color:var(--tb-text,inherit)}
${SCOPE} .tb__icon{flex:none;width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;background:color-mix(in oklab,var(--tb-accent,#16a34a) 14%,transparent)}
${SCOPE} .tb__title{font-size:15px;font-weight:700;margin:0}
${SCOPE} .tb__desc{font-size:13px;opacity:.7;margin:2px 0 0}

${SCOPE} .tb--cards .tb__item{background:var(--tb-card,#fff);border:1px solid color-mix(in oklab,currentColor 12%,transparent);border-radius:14px;box-shadow:0 4px 14px -8px rgba(15,23,42,.25)}
${SCOPE} .tb--bordered .tb__item{border:1px solid color-mix(in oklab,currentColor 18%,transparent);border-radius:14px}
${SCOPE} .tb--stacked .tb__item{flex-direction:column;text-align:center;gap:8px}
${SCOPE} .tb--stacked .tb__icon{width:52px;height:52px;font-size:24px;border-radius:50%}
${SCOPE} .tb--strip{padding:14px 16px}
${SCOPE} .tb--strip .tb__list{grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}
${SCOPE} .tb--strip .tb__item{padding:8px;gap:8px}
${SCOPE} .tb--strip .tb__icon{width:30px;height:30px;font-size:15px;border-radius:8px}
${SCOPE} .tb--strip .tb__title{font-size:13px}
${SCOPE} .tb--strip .tb__desc{display:none}
${SCOPE} .tb--plain .tb__icon{background:transparent;font-size:26px}
</style>

<div class="tb tb--{{ section.settings.style }}" style="--tb-bg:{{ section.settings.background_color }};--tb-card:{{ section.settings.card_color }};--tb-accent:{{ section.settings.accent_color }};--tb-text:{{ section.settings.text_color }};--tb-gap:{{ section.settings.gap }}px">
  {%- if section.settings.heading != blank -%}<div class="tb__head"><h2>{{ section.settings.heading }}</h2></div>{%- endif -%}
  <div class="tb__list">
    {%- for block in section.blocks -%}
      <div class="tb__item" {{ block.shopify_attributes }}>
        <span class="tb__icon">{{ block.settings.icon }}</span>
        <div>
          <p class="tb__title">{{ block.settings.title }}</p>
          {%- if block.settings.description != blank -%}<p class="tb__desc">{{ block.settings.description }}</p>{%- endif -%}
        </div>
      </div>
    {%- endfor -%}
  </div>
</div>

{% schema %}
{
  "name": "Trust badges",
  "category": "Commerce",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "" },
    { "type": "select", "id": "style", "label": "Design", "default": "cards",
      "options": [
        { "value": "cards", "label": "Cards" },
        { "value": "bordered", "label": "Bordered" },
        { "value": "stacked", "label": "Icon above text" },
        { "value": "strip", "label": "Thin strip" },
        { "value": "plain", "label": "Plain" }
      ] },
    { "type": "color", "id": "background_color", "label": "Background", "default": "#ffffff" },
    { "type": "color", "id": "card_color", "label": "Card background", "default": "#ffffff" },
    { "type": "color", "id": "accent_color", "label": "Accent colour", "default": "#16a34a" },
    { "type": "color", "id": "text_color", "label": "Text colour", "default": "#0f172a" },
    { "type": "range", "id": "gap", "label": "Gap", "min": 4, "max": 32, "step": 2, "unit": "px", "default": 14 }
  ],
  "blocks": [
    { "type": "badge", "name": "Badge", "settings": [
      { "type": "text", "id": "icon", "label": "Icon (emoji)", "default": "🚚" },
      { "type": "text", "id": "title", "label": "Title", "default": "ফ্রি ডেলিভারি" },
      { "type": "text", "id": "description", "label": "Description", "default": "সারা দেশে" }
    ] }
  ]
}
{% endschema %}`

export const STEPS_SOURCE = `<style>
${SCOPE} .st{padding:clamp(26px,5vw,48px) 16px;background:var(--st-bg,transparent)}
${SCOPE} .st__head{text-align:center;max-width:620px;margin:0 auto 26px}
${SCOPE} .st__head h2{font-size:clamp(20px,3.8vw,30px);font-weight:800;margin:0 0 6px}
${SCOPE} .st__head p{margin:0;opacity:.72}
${SCOPE} .st__list{max-width:960px;margin:0 auto;display:grid;gap:var(--st-gap,18px);grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}
${SCOPE} .st__item{text-align:center;padding:18px}
${SCOPE} .st__num{width:46px;height:46px;margin:0 auto 12px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:19px;background:var(--st-accent,#16a34a);color:#fff}
${SCOPE} .st__title{font-size:16px;font-weight:700;margin:0 0 5px}
${SCOPE} .st__desc{font-size:14px;opacity:.72;margin:0}

${SCOPE} .st--cards .st__item{background:var(--st-card,#fff);border-radius:16px;box-shadow:0 6px 20px -10px rgba(15,23,42,.3)}
${SCOPE} .st--bordered .st__item{border:1px solid color-mix(in oklab,currentColor 16%,transparent);border-radius:16px}
${SCOPE} .st--line .st__list{position:relative}
${SCOPE} .st--line .st__item{position:relative}
${SCOPE} .st--line .st__item::after{content:"";position:absolute;top:41px;left:calc(50% + 34px);width:calc(100% - 68px);height:2px;background:color-mix(in oklab,var(--st-accent,#16a34a) 35%,transparent)}
${SCOPE} .st--line .st__item:last-child::after{display:none}
${SCOPE} .st--rows .st__list{grid-template-columns:1fr;gap:12px}
${SCOPE} .st--rows .st__item{display:flex;gap:14px;align-items:flex-start;text-align:left;padding:12px}
${SCOPE} .st--rows .st__num{margin:0;flex:none;width:38px;height:38px;font-size:16px}
${SCOPE} .st--outline .st__num{background:transparent;border:2px solid var(--st-accent,#16a34a);color:var(--st-accent,#16a34a)}
@media(max-width:820px){${SCOPE} .st--line .st__item::after{display:none}}
</style>

<div class="st st--{{ section.settings.style }}" style="--st-bg:{{ section.settings.background_color }};--st-card:{{ section.settings.card_color }};--st-accent:{{ section.settings.accent_color }};--st-gap:{{ section.settings.gap }}px">
  {%- if section.settings.heading != blank or section.settings.subheading != blank -%}
  <div class="st__head">
    {%- if section.settings.heading != blank -%}<h2>{{ section.settings.heading }}</h2>{%- endif -%}
    {%- if section.settings.subheading != blank -%}<p>{{ section.settings.subheading }}</p>{%- endif -%}
  </div>
  {%- endif -%}
  <div class="st__list">
    {%- for block in section.blocks -%}
      <div class="st__item" {{ block.shopify_attributes }}>
        <div class="st__num">{% if block.settings.icon != blank %}{{ block.settings.icon }}{% else %}{{ forloop.index }}{% endif %}</div>
        <div>
          <p class="st__title">{{ block.settings.title }}</p>
          {%- if block.settings.description != blank -%}<p class="st__desc">{{ block.settings.description }}</p>{%- endif -%}
        </div>
      </div>
    {%- endfor -%}
  </div>
</div>

{% schema %}
{
  "name": "How to order",
  "category": "Commerce",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "যেভাবে অর্ডার করবেন" },
    { "type": "textarea", "id": "subheading", "label": "Subheading", "default": "মাত্র তিনটি ধাপে অর্ডার সম্পন্ন করুন।" },
    { "type": "select", "id": "style", "label": "Design", "default": "cards",
      "options": [
        { "value": "cards", "label": "Cards" },
        { "value": "bordered", "label": "Bordered" },
        { "value": "line", "label": "Joined by a line" },
        { "value": "rows", "label": "Stacked rows" },
        { "value": "outline", "label": "Outlined numbers" }
      ] },
    { "type": "color", "id": "background_color", "label": "Background", "default": "#f8fafc" },
    { "type": "color", "id": "card_color", "label": "Card background", "default": "#ffffff" },
    { "type": "color", "id": "accent_color", "label": "Accent colour", "default": "#16a34a" },
    { "type": "range", "id": "gap", "label": "Gap", "min": 6, "max": 40, "step": 2, "unit": "px", "default": 18 }
  ],
  "blocks": [
    { "type": "step", "name": "Step", "settings": [
      { "type": "text", "id": "icon", "label": "Icon (blank = number)", "default": "" },
      { "type": "text", "id": "title", "label": "Title", "default": "ফর্ম পূরণ করুন" },
      { "type": "text", "id": "description", "label": "Description", "default": "নাম, মোবাইল ও ঠিকানা দিন।" }
    ] }
  ]
}
{% endschema %}`

export const GUARANTEE_SOURCE = `<style>
${SCOPE} .gt{padding:clamp(24px,4vw,44px) 16px;background:var(--gt-bg,transparent)}
${SCOPE} .gt__box{max-width:760px;margin:0 auto;display:flex;gap:18px;align-items:center;padding:22px;border-radius:var(--gt-radius,18px);color:var(--gt-text,inherit)}
${SCOPE} .gt__icon{flex:none;width:62px;height:62px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;background:color-mix(in oklab,var(--gt-accent,#16a34a) 16%,transparent)}
${SCOPE} .gt__title{font-size:clamp(17px,2.8vw,22px);font-weight:800;margin:0 0 5px}
${SCOPE} .gt__desc{font-size:15px;opacity:.78;margin:0;line-height:1.6}

${SCOPE} .gt--card .gt__box{background:var(--gt-card,#fff);box-shadow:0 10px 30px -14px rgba(15,23,42,.4)}
${SCOPE} .gt--outline .gt__box{border:2px dashed var(--gt-accent,#16a34a)}
${SCOPE} .gt--solid .gt__box{background:var(--gt-accent,#16a34a);color:#fff}
${SCOPE} .gt--solid .gt__icon{background:rgba(255,255,255,.2)}
${SCOPE} .gt--center .gt__box{flex-direction:column;text-align:center}
@media(max-width:560px){${SCOPE} .gt__box{flex-direction:column;text-align:center}}
</style>

<div class="gt gt--{{ section.settings.style }}" style="--gt-bg:{{ section.settings.background_color }};--gt-card:{{ section.settings.card_color }};--gt-accent:{{ section.settings.accent_color }};--gt-text:{{ section.settings.text_color }};--gt-radius:{{ section.settings.radius }}px">
  <div class="gt__box">
    <span class="gt__icon">{{ section.settings.icon }}</span>
    <div>
      <p class="gt__title">{{ section.settings.title }}</p>
      <p class="gt__desc">{{ section.settings.description }}</p>
    </div>
  </div>
</div>

{% schema %}
{
  "name": "Guarantee",
  "category": "Commerce",
  "settings": [
    { "type": "text", "id": "icon", "label": "Icon (emoji)", "default": "🛡️" },
    { "type": "text", "id": "title", "label": "Title", "default": "১০০% নিশ্চয়তা" },
    { "type": "textarea", "id": "description", "label": "Description", "default": "প্রোডাক্ট হাতে পেয়ে দেখে নিন। পছন্দ না হলে ফেরত দিন — কোনো প্রশ্ন ছাড়াই।" },
    { "type": "select", "id": "style", "label": "Design", "default": "card",
      "options": [
        { "value": "card", "label": "Card" },
        { "value": "outline", "label": "Dashed outline" },
        { "value": "solid", "label": "Solid accent" },
        { "value": "center", "label": "Centered" }
      ] },
    { "type": "color", "id": "background_color", "label": "Background", "default": "#ffffff" },
    { "type": "color", "id": "card_color", "label": "Card background", "default": "#f0fdf4" },
    { "type": "color", "id": "accent_color", "label": "Accent colour", "default": "#16a34a" },
    { "type": "color", "id": "text_color", "label": "Text colour", "default": "#0f172a" },
    { "type": "range", "id": "radius", "label": "Corner radius", "min": 0, "max": 34, "step": 2, "unit": "px", "default": 18 }
  ]
}
{% endschema %}`

export const DELIVERY_INFO_SOURCE = `<style>
${SCOPE} .di{padding:clamp(24px,4vw,44px) 16px;background:var(--di-bg,transparent)}
${SCOPE} .di__head{text-align:center;margin:0 0 20px}
${SCOPE} .di__head h2{font-size:clamp(19px,3.4vw,28px);font-weight:800;margin:0 0 6px}
${SCOPE} .di__head p{margin:0;opacity:.72}
${SCOPE} .di__wrap{max-width:640px;margin:0 auto}
${SCOPE} .di__row{display:flex;align-items:center;gap:12px;padding:14px 16px;color:var(--di-text,inherit)}
${SCOPE} .di__area{font-weight:700;font-size:15px}
${SCOPE} .di__time{font-size:13px;opacity:.66;margin-left:auto;text-align:right}
${SCOPE} .di__fee{font-weight:800;font-size:17px;color:var(--di-accent,#16a34a);min-width:76px;text-align:right}

${SCOPE} .di--table .di__wrap{border:1px solid color-mix(in oklab,currentColor 16%,transparent);border-radius:14px;overflow:hidden}
${SCOPE} .di--table .di__row+.di__row{border-top:1px solid color-mix(in oklab,currentColor 12%,transparent)}
${SCOPE} .di--table .di__row:nth-child(odd){background:color-mix(in oklab,currentColor 3%,transparent)}
${SCOPE} .di--cards .di__wrap{display:grid;gap:10px}
${SCOPE} .di--cards .di__row{background:var(--di-card,#fff);border-radius:14px;box-shadow:0 4px 16px -10px rgba(15,23,42,.35)}
${SCOPE} .di--plain .di__row+.di__row{border-top:1px dashed color-mix(in oklab,currentColor 20%,transparent)}
</style>

<div class="di di--{{ section.settings.style }}" style="--di-bg:{{ section.settings.background_color }};--di-card:{{ section.settings.card_color }};--di-accent:{{ section.settings.accent_color }};--di-text:{{ section.settings.text_color }}">
  {%- if section.settings.heading != blank or section.settings.subheading != blank -%}
  <div class="di__head">
    {%- if section.settings.heading != blank -%}<h2>{{ section.settings.heading }}</h2>{%- endif -%}
    {%- if section.settings.subheading != blank -%}<p>{{ section.settings.subheading }}</p>{%- endif -%}
  </div>
  {%- endif -%}
  {%- comment -%}
    The rates are the page's own delivery rates, not typed-in text.

    A merchant who changes their Dhaka charge should not have to remember that
    it is written down in two places; this table and the order form's zone
    picker read the same rows, so they cannot disagree about what delivery
    costs. Edit them under Offers -> Delivery.
  {%- endcomment -%}
  <div class="di__wrap">
    {%- for rate in shipping.rates -%}
      <div class="di__row">
        <span class="di__area">{{ rate.label }}</span>
        <span class="di__fee">{%- if rate.price > 0 -%}{{ rate.price | money }}{%- else -%}{{ section.settings.free_text }}{%- endif -%}</span>
      </div>
    {%- else -%}
      <div class="di__row"><span class="di__area">{{ section.settings.empty_text }}</span></div>
    {%- endfor -%}
    {%- if promotions.free_shipping.enabled and promotions.free_shipping.min_subtotal > 0 -%}
      <div class="di__row">
        <span class="di__area">{{ section.settings.free_shipping_label }}</span>
        <span class="di__fee">{{ promotions.free_shipping.min_subtotal | money }}+</span>
      </div>
    {%- endif -%}
  </div>
</div>

{% schema %}
{
  "name": "Delivery charges",
  "category": "Commerce",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "ডেলিভারি চার্জ" },
    { "type": "text", "id": "free_text", "label": "Free delivery text", "default": "ফ্রি" },
    { "type": "text", "id": "free_shipping_label", "label": "Free-delivery threshold label", "default": "ফ্রি ডেলিভারি" },
    { "type": "text", "id": "empty_text", "label": "Empty state text", "default": "Set delivery rates under Offers." },
    { "type": "textarea", "id": "subheading", "label": "Subheading", "default": "ক্যাশ অন ডেলিভারিতে সারা দেশে পৌঁছে দেওয়া হয়।" },
    { "type": "select", "id": "style", "label": "Design", "default": "table",
      "options": [
        { "value": "table", "label": "Table" },
        { "value": "cards", "label": "Cards" },
        { "value": "plain", "label": "Plain list" }
      ] },
    { "type": "color", "id": "background_color", "label": "Background", "default": "#ffffff" },
    { "type": "color", "id": "card_color", "label": "Card background", "default": "#ffffff" },
    { "type": "color", "id": "accent_color", "label": "Accent colour", "default": "#16a34a" },
    { "type": "color", "id": "text_color", "label": "Text colour", "default": "#0f172a" }
  ]
}
{% endschema %}`
