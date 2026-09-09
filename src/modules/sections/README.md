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
