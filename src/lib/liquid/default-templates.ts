import type { StorefrontTemplateType } from '@/generated/prisma/enums'

/**
 * Starter Liquid for each storefront route.
 *
 * These are created as *drafts* when a store is enabled, never as published
 * templates — the built-in React fallbacks serve the storefront until a
 * merchant deliberately publishes theme code. That ordering matters: a store
 * should never be rendering Liquid it did not ask for, and a merchant opening
 * the code editor should find working, readable code to modify rather than an
 * empty file.
 *
 * They double as the reference for the object model. Anything used here is
 * part of the documented contract in lib/liquid/drops.ts.
 */
export const DEFAULT_STOREFRONT_TEMPLATES: Partial<
  Record<StorefrontTemplateType, string>
> = {
  PRODUCT: `<div class="product">
  <div class="product__media">
    {% if product.featured_image %}
      <img src="{{ product.featured_image.src }}" alt="{{ product.featured_image.alt | escape }}" width="800">
    {% endif %}
  </div>

  <div class="product__info">
    {% if product.vendor %}<p class="product__vendor">{{ product.vendor }}</p>{% endif %}
    <h1>{{ product.title }}</h1>

    {% assign variant = product.selected_or_first_available_variant %}
    <p class="product__price">
      {{ variant.price | money }}
      {% if variant.compare_at_price > variant.price %}
        <s>{{ variant.compare_at_price | money }}</s>
      {% endif %}
    </p>

    {% if variant.available %}
      <form method="post" action="/cart/add">
        <input type="hidden" name="variantId" value="{{ variant.id }}">
        <input type="number" name="quantity" value="1" min="1">
        <button type="submit">Add to cart</button>
      </form>
    {% else %}
      <p class="product__sold-out">Sold out</p>
    {% endif %}

    <div class="product__description">{{ product.description }}</div>
  </div>
</div>
`,

  COLLECTION: `<div class="collection">
  <h1>{{ collection.title }}</h1>
  {% if collection.description %}<p>{{ collection.description }}</p>{% endif %}

  <div class="collection__grid">
    {% for product in collection.products %}
      <a class="card" href="{{ product.url }}">
        {% if product.featured_image %}
          <img src="{{ product.featured_image.src }}" alt="{{ product.title | escape }}" width="400">
        {% endif %}
        <h3>{{ product.title }}</h3>
        <p>
          {% if product.price_varies %}
            From {{ product.price_min | money }}
          {% else %}
            {{ product.price | money }}
          {% endif %}
        </p>
        {% unless product.available %}<span class="card__sold-out">Sold out</span>{% endunless %}
      </a>
    {% else %}
      <p>No products in this collection yet.</p>
    {% endfor %}
  </div>
</div>
`,

  CART: `<div class="cart">
  <h1>Your cart</h1>

  {% if cart.empty %}
    <p>Your cart is empty.</p>
    <a href="/">Continue shopping</a>
  {% else %}
    <ul class="cart__items">
      {% for item in cart.items %}
        <li class="cart__item">
          {% if item.image %}
            <img src="{{ item.image.src }}" alt="{{ item.product_title | escape }}" width="120">
          {% endif %}
          <div>
            <a href="{{ item.url }}">{{ item.title }}</a>
            <p>{{ item.price | money }} x {{ item.quantity }}</p>
          </div>
          <div class="cart__item-total">{{ item.final_line_price | money }}</div>
        </li>
      {% endfor %}
    </ul>

    <dl class="cart__totals">
      <dt>Subtotal</dt><dd>{{ cart.original_total_price | money }}</dd>
      {% if cart.total_discount > 0 %}
        <dt>Discount</dt><dd>-{{ cart.total_discount | money }}</dd>
      {% endif %}
      <dt>Total</dt><dd>{{ cart.total_price | money }}</dd>
    </dl>

    <a class="cart__checkout" href="/checkout">Checkout</a>
  {% endif %}
</div>
`,

  NOT_FOUND: `<div class="not-found">
  <h1>Page not found</h1>
  <p>The page you were looking for doesn't exist.</p>
  <a href="/">Back to {{ shop.name }}</a>
</div>
`,
}

/**
 * A starter custom section, shown when a merchant creates their first Liquid
 * section. It exercises settings, blocks and a preset, so the generated
 * Inspector form is immediately non-trivial and the {% schema %} contract is
 * visible by example.
 */
export const STARTER_SECTION_SOURCE = `<section class="feature-grid" style="background: {{ section.settings.background }}">
  <div class="feature-grid__inner">
    <h2>{{ section.settings.heading }}</h2>

    <div class="feature-grid__items" style="gap: {{ section.settings.gap }}px">
      {% for block in section.blocks %}
        <div class="feature-grid__item" {{ block.shopify_attributes }}>
          <h3>{{ block.settings.title }}</h3>
          <p>{{ block.settings.body }}</p>
        </div>
      {% endfor %}
    </div>
  </div>
</section>

{% schema %}
{
  "name": "Feature grid",
  "category": "Content",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "Why choose us" },
    { "type": "color", "id": "background", "label": "Background", "default": "#ffffff" },
    { "type": "range", "id": "gap", "label": "Gap", "min": 0, "max": 64, "step": 4, "default": 24 }
  ],
  "blocks": [
    {
      "type": "feature",
      "name": "Feature",
      "settings": [
        { "type": "text", "id": "title", "label": "Title" },
        { "type": "textarea", "id": "body", "label": "Body" }
      ]
    }
  ],
  "presets": [
    {
      "name": "Feature grid",
      "settings": { "heading": "Why choose us" },
      "blocks": [
        { "type": "feature", "title": "Fast delivery", "body": "Ships within 24 hours." },
        { "type": "feature", "title": "Easy returns", "body": "30-day return policy." }
      ]
    }
  ]
}
{% endschema %}
`
