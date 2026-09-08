import { z } from 'zod'

/**
 * What a block declares about the individual things it draws.
 *
 * The style engine in `elementStyle.ts` can paint any element that carries a
 * `data-el` attribute, but the *editor* cannot offer what it cannot name. This
 * is that list: one descriptor per styleable thing in a block, which becomes
 * the element tree in the inspector, the labels on the canvas overlay, and the
 * set of controls each element is offered.
 *
 * It is declared by hand next to the block's `editorFields` for the same reason
 * those are: deriving it from the JSX would mean parsing the component, and the
 * two would drift the moment anyone refactored the markup.
 */

/**
 * What kind of thing an element is, which decides which controls make sense
 * for it. Offering `object-fit` on a headline or `line-height` on a spacer is
 * how a design panel turns into a wall of irrelevant inputs.
 */
export type ElementKind =
  | 'text'
  | 'heading'
  | 'button'
  | 'image'
  | 'icon'
  | 'container'
  | 'divider'
  | 'spacer'
  | 'embed'

export interface ElementDescriptor {
  /** Addresses this element in `config.elements`, and in the DOM as `data-el`. */
  key: string
  label: string
  kind: ElementKind
  /**
   * True when the block draws one of these per item in a list, so the editor
   * can offer "all of them" as well as one instance. Styling all of them is
   * nearly always what a merchant means — a grid where card three has its own
   * padding is a mistake, not a design.
   */
  repeated?: boolean
  /**
   * Which content field carries this element's words, when it has any. Lets the
   * canvas send a double-click straight into the right rich-text editor rather
   * than making the merchant find the field in the panel.
   */
  contentField?: string
  /** Extras dropped into this element land inside it. */
  slot?: boolean
}

// ── Merchant-added elements ───────────────────────────────────────────

/**
 * The elements a merchant can add to a block that its author did not put there.
 *
 * A short list on purpose. These are the pieces that turn a fixed block into a
 * composable one — a second button, a badge, a bit of breathing room — not a
 * general-purpose widget library. Anything that needs data behind it (a price,
 * a countdown, a form) is a block, because it needs a schema and a renderer,
 * not a style.
 */
export const EXTRA_ELEMENT_TYPES = [
  'heading',
  'text',
  'button',
  'image',
  'icon',
  'divider',
  'spacer',
] as const

export type ExtraElementType = (typeof EXTRA_ELEMENT_TYPES)[number]

export const extraElementSchema = z.object({
  id: z.string().max(64),
  type: z.enum(EXTRA_ELEMENT_TYPES),
  /** The slot in the block this sits in. Blocks declare their own. */
  slot: z.string().max(80).default('content'),
  /** Rich text, for the types that carry words. */
  html: z.string().max(5000).default(''),
  /** Where a button goes. Defaults to the order form, the point of the page. */
  href: z.string().max(500).default('#order'),
  src: z.string().max(1000).default(''),
  alt: z.string().max(300).default(''),
  icon: z.string().max(60).default('star'),
})

export type ExtraElement = z.infer<typeof extraElementSchema>

/** The `data-el` key an extra is addressed by. */
export function extraKey(id: string): string {
  return `x:${id}`
}

/** A descriptor for an extra, so it appears in the tree like anything else. */
export function extraDescriptor(extra: ExtraElement): ElementDescriptor {
  const kind: ElementKind =
    extra.type === 'text'
      ? 'text'
      : extra.type === 'heading'
        ? 'heading'
        : extra.type === 'button'
          ? 'button'
          : extra.type === 'image'
            ? 'image'
            : extra.type === 'icon'
              ? 'icon'
              : extra.type === 'divider'
                ? 'divider'
                : 'spacer'

  return {
    key: extraKey(extra.id),
    label: EXTRA_LABELS[extra.type],
    kind,
    contentField:
      extra.type === 'text' ||
      extra.type === 'heading' ||
      extra.type === 'button'
        ? 'html'
        : undefined,
  }
}

const EXTRA_LABELS: Record<ExtraElementType, string> = {
  heading: 'Heading',
  text: 'Text',
  button: 'Button',
  image: 'Image',
  icon: 'Icon',
  divider: 'Divider',
  spacer: 'Spacer',
}

/** What a freshly added element starts as. */
export function newExtraElement(
  type: ExtraElementType,
  id: string,
  slot = 'content'
): ExtraElement {
  return extraElementSchema.parse({
    id,
    type,
    slot,
    html:
      type === 'heading'
        ? 'New heading'
        : type === 'text'
          ? 'Say something here.'
          : type === 'button'
            ? 'Order now'
            : '',
  })
}

/**
 * The icons an `icon` element may name.
 *
 * A closed set because every one of these is a component that has to be in the
 * bundle. An open name would either mean shipping the whole of lucide to every
 * storefront or rendering nothing for names outside whatever was bundled — a
 * blank space the merchant cannot debug.
 */
export const ICON_NAMES = [
  'star',
  'heart',
  'check',
  'check-circle',
  'shield',
  'shield-check',
  'truck',
  'package',
  'gift',
  'tag',
  'percent',
  'clock',
  'zap',
  'flame',
  'award',
  'thumbs-up',
  'phone',
  'mail',
  'map-pin',
  'credit-card',
  'lock',
  'refresh-cw',
  'sparkles',
  'trending-up',
  'users',
  'message-circle',
  'arrow-right',
  'chevron-right',
  'info',
  'alert-circle',
] as const

export type IconName = (typeof ICON_NAMES)[number]
