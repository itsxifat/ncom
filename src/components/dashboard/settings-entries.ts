import {
  Activity,
  Banknote,
  BookOpen,
  Bot,
  Code,
  CreditCard,
  KeyRound,
  MapPin,
  Package,
  Percent,
  Plug,
  Send,
  Store,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react'

export interface SettingsEntry {
  href: string
  title: string
  /** What it is for, in the words of someone who has not opened it yet. */
  description: string
  icon: LucideIcon
  /** Other words people search for it by — "bKash", "Steadfast", "pixel". */
  keywords: string[]
}

export interface SettingsGroup {
  title: string
  entries: SettingsEntry[]
}

/**
 * Everything a workspace sets up once, in one list.
 *
 * Shared by the Settings page and the search menu so the two can never
 * disagree about what a setting is called or where it lives. Titles are what
 * the setting *does* for a merchant rather than what the platform calls it:
 * "Your website's products" rather than "Product source", "Delivery charges"
 * rather than "Shipping zones". A few entries keep URLs from before they were
 * settings (/organization, /billing, /tracking) — links into them still work.
 *
 * Grouped by the job, and ordered roughly in the order a new merchant needs
 * them: who you are, how you get paid, how parcels leave, what you connect.
 * The developer group is last on purpose — most merchants never open it.
 */
export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    title: 'Your business',
    entries: [
      {
        href: '/settings/business',
        title: 'Business & currency',
        description:
          'Your business name and contact details, the currency you sell in, and how orders are numbered',
        icon: Store,
        keywords: ['currency', 'taka', 'bdt', 'phone', 'email', 'order number'],
      },
      {
        href: '/organization',
        title: 'Team',
        description: 'Invite people to pack orders, ship parcels or edit pages',
        icon: Users,
        keywords: ['workspace', 'members', 'invite', 'staff'],
      },
      {
        href: '/billing',
        title: 'Plan & billing',
        description: 'Your NCOM plan, what it includes and your invoices',
        icon: CreditCard,
        keywords: ['subscription', 'upgrade', 'invoice', 'plan'],
      },
    ],
  },
  {
    title: 'Getting paid',
    entries: [
      {
        href: '/settings/payments',
        title: 'How customers pay',
        description: 'Cash on delivery, bKash, card or bank transfer',
        icon: Banknote,
        keywords: ['payments', 'bkash', 'cod', 'cash', 'stripe', 'card'],
      },
      {
        href: '/settings/taxes',
        title: 'VAT & taxes',
        description: 'Add tax to your prices, only if you need to',
        icon: Percent,
        keywords: ['tax', 'vat'],
      },
    ],
  },
  {
    title: 'Delivery',
    entries: [
      {
        href: '/settings/courier',
        title: 'Courier & fraud check',
        description:
          'Send parcels with Steadfast or Pathao, and check risky customers before they ship',
        icon: Truck,
        keywords: ['steadfast', 'pathao', 'fraud', 'courier', 'dispatch'],
      },
      {
        href: '/settings/shipping',
        title: 'Delivery charges',
        description:
          'What customers pay for delivery, inside and outside Dhaka',
        icon: Package,
        keywords: ['shipping', 'delivery', 'rates', 'zones', 'dhaka'],
      },
      {
        href: '/settings/locations',
        title: 'Stock locations',
        description: 'Where your stock is kept',
        icon: MapPin,
        keywords: ['locations', 'warehouse', 'address'],
      },
    ],
  },
  {
    title: 'Connections',
    entries: [
      {
        href: '/settings/product-source',
        title: "Your website's products",
        description:
          'Sell what you already list on your own website, with live prices and stock',
        icon: Plug,
        keywords: ['product source', 'woocommerce', 'connector', 'catalogue'],
      },
      {
        href: '/settings/order-destination',
        title: 'Where orders go',
        description:
          'Handle orders here, or pass them straight to your website',
        icon: Send,
        keywords: ['order handling', 'forward', 'handoff'],
      },
      {
        href: '/settings/ai-editors',
        title: 'AI code editors',
        description:
          'Let Cursor, Claude Code, VS Code or Windsurf build your websites here',
        icon: Bot,
        keywords: [
          'mcp',
          'ai',
          'cursor',
          'claude',
          'copilot',
          'windsurf',
          'editor',
        ],
      },
      {
        href: '/tracking',
        title: 'Facebook & Google ad tracking',
        description:
          'Count every sale your ads bring in, even when shoppers block trackers',
        icon: Activity,
        keywords: ['pixel', 'meta', 'facebook', 'google', 'ga4', 'tracking'],
      },
    ],
  },
  {
    title: 'For developers',
    entries: [
      {
        href: '/settings/api-keys',
        title: 'API keys',
        description: 'Let another app read and update your store',
        icon: KeyRound,
        keywords: ['api', 'token', 'key'],
      },
      {
        href: '/settings/webhooks',
        title: 'Webhooks',
        description: 'Tell another system when an order or product changes',
        icon: Code,
        keywords: ['webhook', 'events'],
      },
      {
        href: '/docs',
        title: 'Developer docs',
        description: 'The product source contract and the REST API',
        icon: BookOpen,
        keywords: ['documentation', 'api', 'reference'],
      },
    ],
  },
]
