# sitespec — designs from outside the builder

Every way a design reaches NCOM without a merchant dragging blocks goes through
this module:

| Where it comes from                          | Entry point                                    | Uses                                                                                         |
| -------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| The AI builder (Claude)                      | `server/ai/designer.ts`, `POST /api/ai/design` | `designGuide` as the cached system prompt, `readSiteDesign` / `readPageDesign` on the answer |
| "Use your own AI" (ChatGPT, Gemini, Claude…) | `stores/design-actions.ts`                     | `chatPrompt` to copy, the readers on the pasted answer                                       |
| AI code editors over MCP                     | `server/mcp/*`, `POST /api/mcp`                | `designGuide` (`get_design_guide`), the catalogue, the readers, `exportPage`                 |

## The format

A site (`ncom/site@1`) or a page (`ncom/page@1`): sections that name a block
(`type`), set some of its fields (`content`) and design it in three layers, all
optional:

- `style` — the section wrapper: background, spacing, fonts, a `customClassName`.
- `elements` — each thing the block draws, by the keys in its `elements`
  descriptors: per breakpoint, hover, transition and entrance animation. The
  same `ElementDesignMap` the builder's element panel writes.
- `extras` — headings, text, buttons, pictures, icons, dividers and spacers
  added to the block's slots, each with an optional `style` of its own.

Plus the site's `theme`, every Design-tab setting including `customCss`, which
a page answer may carry too. Together they reach everything a merchant can set
by hand. Anything left out keeps the block's default — in the site's language,
via each block's `translations`.

On a rewrite, `style` and `content` are the section's whole design (left out
means removed), while `elements` is laid over the section's own element by
element (null removes one) and `extras`, when sent, replaces the list — see
`restyleConfig` and `mergeElementConfig` in `style-keys.ts`.

## The files

- `format.ts` — the loose skeleton schemas and `classifyDesign` (site, page or a
  bare list of sections, told apart by shape).
- `catalog.ts` — every block described from its own zod schema, editor
  fields, element descriptors and slots; `catalogText` is the compact form
  that goes into prompts.
- `element-design.ts` — reads `elements` and `extras`: one property table,
  typed against `ElementStyle`, drives both the checks and the guide's
  property list. Takes CSS as models write it (`"font-size": "2rem"`,
  `"bold"`, shadow and gradient strings, `opacity: 0.5`) and repairs or drops
  each value on its own, with a note.
- `guide.ts` — the instructions, one text for all three readers.
- `parse.ts` — gets JSON out of a chat answer (fences, preamble, comments,
  trailing commas).
- `normalize.ts` — **repair, don't reject**: coerces near-misses, trims,
  falls back to defaults field by field, enforces page rules (one order form on a
  landing page, required blocks on product/category pages), and reports every
  change as a `DesignIssue`.
- `site.ts` — a whole-site design to a `SiteTemplate` that `createStore` builds
  from, filling a store's layout, product and category pages from the blank
  store when the design leaves them out.
- `read.ts` — the two entry points: `readSiteDesign`, `readPageDesign`.
- `export.ts` — a page out, in the same format, with section ids, element
  designs, extras and the theme, so "change this page" round-trips and the
  model sees everything it can change.
- `style-keys.ts` — the wrapper's style keys and how a rewrite combines with
  what a section has. Free of the font catalogue, for the browser.

New blocks need nothing here: registering a block in
`modules/sections/registry.ts` puts it in the catalogue, the prompts and the MCP
tools.
