# Blocks

A block is a React component plus a `SectionDefinition` describing it. The
definition is the only thing the editor sees: the palette, the Content tab, the
element tree, the canvas overlay and the published stylesheet are five views of
one object. Nothing about a block is discovered by looking at its JSX.

That is why the rule below exists, and why `pnpm check:elements` enforces it.

## The rule

**Every visible thing a block draws is an `<El>` with a literal `part`, and every
`part` has a descriptor in `elements`.**

A merchant edits by pointing at the page. Anything without a `part` is invisible
to that: it cannot be selected, cannot be restyled, cannot be typed into, and —
worst of all — gives no sign that it is missing. The merchant clicks it, the
nearest wrapper gets selected instead, and they conclude the editor is broken.

Concretely, when you add or change a block:

1. **Wrap what you draw.** `<El as="p" part="cardText">` renders the `<p>` itself
   — `El` becomes the tag, it does not wrap one — so converting existing markup
   is adding an attribute, not adding a div. Containers count: a row a merchant
   might want to give a background to is a thing they will try to click.

2. **Repeat with an index.** A list draws the same `part` per item with
   `index={i}`. Styling `card` styles all of them; `card#2` styles the third.
   That is one mechanism at two specificities, not two features.

3. **Declare every key in `elements`.** Give it a `label` a merchant would use
   for it ("Package card", not "offerCard") and a `kind`, which decides which
   controls the panel offers — a headline has no `object-fit` and a spacer has
   no line height.

4. **Point text at its content with `contentField`.** This is what makes a
   double-click on the canvas edit the right words. It is a path, so a repeated
   element says where _its_ words live:

   ```ts
   { key: 'title',     label: 'Heading',    kind: 'heading', contentField: 'title' }
   { key: 'cardTitle', label: 'Card title', kind: 'heading', repeated: true,
     contentField: 'items[].title' }
   ```

   `[]` is filled in with the instance index. A repeated element **must** use
   one: without it, typing into the third card would write over the field the
   other two are drawn from.

   Text that is derived rather than stored — a total, an order number, a
   paragraph split out of a longer body — has no path and takes no
   `contentField`. It stays styleable and is not editable in place, which is the
   honest answer.

5. **Put the words in `content`, not in the JSX.** A hard-coded English string
   is a string the merchant cannot translate, and in a block that takes orders a
   field label they cannot change costs them sales. Every user-visible sentence
   is a schema field with the current wording as its `.default(…)`, so pages
   written before the field existed read exactly as they did.

6. **Offer a slot.** `<Extras config={config} slot="content" />` inside the main
   container is what lets a merchant add a second button or a badge to a block
   whose author never thought of one. Declare the slots in `slots`.

## What the check catches

```
pnpm check:elements
```

- a `part` the markup draws with no descriptor behind it;
- a descriptor nothing draws;
- a key declared twice;
- a `contentField` naming a field `editorFields` does not have, descending into
  something that is not an array, or repeated without a `[]`;
- a `part` that is not a literal, which nothing static can resolve.

It reads the source with the TypeScript parser rather than rendering, because a
block pulls in `next/font`, which only works inside a Next build. Keep `part`
values literal and it sees everything.

## Styling, and why none of it is in the block

A block's own classes are a _starting look_. Everything a merchant changes lands
in one stylesheet built by `elementStyle.ts` and matched on `data-el`, which is
why an element's appearance has exactly one place it is ever explained.

Two consequences worth remembering while writing a block:

- **Never paint with an inline `style` what a merchant might want to change.** An
  inline declaration outranks every selector, so an inline background makes that
  element's own colour control do nothing. Use a class.
- **Unset means inherit.** No control writes a default. A property nobody set
  produces no declaration at all, so the block's classes and the page theme keep
  painting it — which is what makes the whole design layer safe to ship onto
  pages that already exist.

## Online store blocks

A site is a landing page or an online store (`SiteKind`), and a store page has
a role (`PageRole`): a standard page, the shared layout, the product page
design or the catalogue design. Four optional fields on a definition say where a
block belongs; the block library, the canvas's "+" menus and the layers list
all read them through `blockFitsPage` and `modules/builder/rules.ts`.

- **`sites`** — which kinds of site offer it. The order form is landing-only;
  the product blocks are store-only.
- **`pageRoles`** — which pages it can be added to. Unset means every page a
  visitor sees, never the layout.
- **`placement`** — for layout blocks only: drawn above every page (`top`, the
  header and announcement bar) or below it (`bottom`, the footer).
- **`requiredOn`** — the page cannot do without it (product details on the
  product page, the product list on the catalogue page). It can be moved and
  restyled, never removed.

A block that shows products declares **`productQuery(content)`** instead of
fetching. The page — the live site on the server, the builder canvas through a
server action — runs every block's query once and hands the answers over as
`storefront.sectionProducts[sectionId]`. Blocks render synchronously in both
places, so this is the only way a grid gets its products.

Product cards are drawn by `modules/storefront/ProductCard.tsx` for every block
that shows them. Its parts (`card`, `cardImage`, `cardBadge`, `cardTitle`,
`cardPrice`, `cardButton`) are declared in each such block's own `elements`;
`pnpm check:elements` follows imports from `@/modules/storefront/` so the
declarations and the shared markup are checked together.

## Bangla and English

A site speaks to its shoppers in English or Bangla (`theme.language`, see
`language.ts`), and writes its numbers as `1,250` or `১,২৫০`
(`theme.numerals`). Two things follow from it:

- **Words a block lets the merchant type** start in the site's language. Give
  the definition a `translations: { bn: { … } }` with the Bangla for every
  default that is words — only words, never a layout or a number. The builder
  adds blocks through `localizedDefaults(definition, language)`, and templates
  and starters go through `materializeSection(section, language)`.
- **Words nobody types** — "Sold out", the cart's "Subtotal", a countdown's
  unit labels — come from the storefront dictionary in
  `modules/storefront/i18n.ts`: `storeText(theme)` in a server component,
  `useStoreText()` in a client one. Prices and counts go through its `price()`
  and `number()` so the site's digits follow. A string added to a block that a
  shopper reads and the merchant cannot change belongs there, in both languages.

Letter-spacing breaks Bangla shaping, so `globals.css` switches the blocks'
`tracking-*` classes off on a Bangla site; a spacing the merchant sets in the
element panel still applies.

## Custom code

`customcode` draws a merchant's own HTML and CSS — a section a designer built,
or one an AI wrote from the prompt NCOM hands merchants. It is the one block
whose insides are not React, so two rules hold it in:

- **Sanitised on every render** by `customcode/sanitize.ts`: an allow-list
  tokeniser like the rich-text one, wider (layout, images, tables, inline SVG,
  `<video>`), with no scripts, `on*` handlers, forms, `javascript:` URLs or
  framing beyond YouTube, Vimeo, Google Maps and Facebook embeds, which get a
  forced sandbox. The CSS is sanitised too (`@import`, `expression()`,
  non-HTTPS `url()`s dropped) and has every `<` escaped, so nothing in it can
  close its `<style>`. `<style>` blocks inside pasted HTML move into the CSS;
  `html`/`body`/`:root` selectors become `:host`.
- **Drawn in a shadow root** by `customcode/CustomCodeFrame.tsx`, so its CSS
  touches only itself. Server renders emit a declarative shadow root (works
  with JavaScript off); browser renders — the builder canvas — attach one.
  Inherited values cross the boundary, so a design follows the theme with
  `var(--page-primary)`, `var(--page-text)`, `var(--page-background)` and
  `var(--page-font-heading)`. Tailwind classes do nothing in there: pasted
  code needs real CSS.

`#section` links inside the code jump to sections of the page; the builder
selects the whole block on click and never reaches inside it.
