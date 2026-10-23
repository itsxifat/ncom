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
(`type`), set some of its fields (`content`) and optionally its section design
(`style`). Anything left out keeps the block's default — in the site's language,
via each block's `translations`.

## The files

- `format.ts` — the loose skeleton schemas and `classifyDesign` (site, page or a
  bare list of sections, told apart by shape).
- `catalog.ts` — every block described from its own zod schema and editor
  fields; `catalogText` is the compact form that goes into prompts.
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
- `export.ts` — a page out, in the same format, with section ids, so "change
  this page" round-trips and keeps per-element styling.

New blocks need nothing here: registering a block in
`modules/sections/registry.ts` puts it in the catalogue, the prompts and the MCP
tools.
