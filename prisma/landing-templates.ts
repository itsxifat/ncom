/**
 * The template catalogue.
 *
 * Ten landing pages built around how this platform's merchants actually sell:
 * one product with a cash-on-delivery form on the same page, or a small bundle
 * of three to five. Every one of them showcases products, and every one of them
 * takes an order without the buyer leaving the page — that combination is the
 * product, so a template that does only one half is not worth shipping.
 *
 * They are deliberately different from each other rather than one layout in ten
 * colourways. Each varies on at least three axes — section order, card design,
 * image shape, density, palette and typography — because a merchant picking
 * from a gallery is choosing a *look*, and ten pages that differ only in hue
 * read as one template with a colour setting.
 *
 * Content is Bengali by default. These are starting points for a market where
 * the buyer does not read English, and shipping English placeholder copy would
 * mean every merchant's first task is translating the whole page.
 */

export interface TemplateSectionSeed {
  /** ComponentDefinition key. */
  key: string
  /** Overrides merged over the section's own defaults. */
  content?: Record<string, unknown>
}

export interface LandingTemplateSeed {
  slug: string
  name: string
  description: string
  categorySlug: string
  theme: Record<string, unknown>
  sections: TemplateSectionSeed[]
}

/** Shorthand for a repeatable block list. */
const blocks = (...items: Array<Record<string, unknown>>) =>
  items.map((settings, index) => ({
    type: 'block',
    id: String(index),
    ...settings,
  }))

export const LANDING_TEMPLATES: LandingTemplateSeed[] = [
  // ─────────────────────────────────────────────────────────────────────
  {
    slug: 'direct-cod',
    name: 'সরাসরি অর্ডার — Direct COD',
    description:
      'The classic one-product cash-on-delivery page: hero, proof, three-step explainer, order form. The safest default for a first store.',
    categorySlug: 'single-product',
    theme: {
      primaryColor: '#16a34a',
      secondaryColor: '#0f172a',
      backgroundColor: '#ffffff',
      textColor: '#0f172a',
      headingFont: 'Hind Siliguri',
      bodyFont: 'Hind Siliguri',
      buttonStyle: 'SOLID',
      borderRadius: 'md',
      spacingScale: 'comfortable',
      containerWidth: '1140px',
    },
    sections: [
      {
        key: 'announcement',
        content: {
          text: '🚚 সারা দেশে ক্যাশ অন ডেলিভারি — ডেলিভারি চার্জ মাত্র ৬০৳',
          background_color: '#16a34a',
        },
      },
      {
        key: 'product-hero',
        content: {
          layout: 'split',
          accent_color: '#16a34a',
          background_color: '#f0fdf4',
          badge_text: 'সীমিত সময়ের অফার',
        },
      },
      {
        key: 'trust-badges',
        content: {
          style: 'strip',
          accent_color: '#16a34a',
          background_color: '#ffffff',
          blocks: blocks(
            {
              icon: '🚚',
              title: 'ফ্রি ডেলিভারি',
              description: '১৫০০৳ এর উপরে',
            },
            {
              icon: '💵',
              title: 'ক্যাশ অন ডেলিভারি',
              description: 'হাতে পেয়ে টাকা দিন',
            },
            {
              icon: '🔄',
              title: '৭ দিনে রিটার্ন',
              description: 'শর্ত প্রযোজ্য',
            },
            { icon: '✅', title: '১০০% অরিজিনাল', description: 'গ্যারান্টিসহ' }
          ),
        },
      },
      {
        key: 'order-steps',
        content: {
          style: 'line',
          accent_color: '#16a34a',
          blocks: blocks(
            {
              title: 'ফর্ম পূরণ করুন',
              description: 'নাম, মোবাইল ও ঠিকানা দিন।',
            },
            {
              title: 'কনফার্ম করুন',
              description: 'আমাদের প্রতিনিধি কল করে নিশ্চিত করবেন।',
            },
            {
              title: 'হাতে পেয়ে টাকা দিন',
              description: 'ডেলিভারির সময় পেমেন্ট করুন।',
            }
          ),
        },
      },
      { key: 'order-form', content: { buttonColor: '#16a34a' } },
      {
        key: 'reviews',
        content: {
          layout: 'grid',
          card_style: 'shadow',
          accent_color: '#f59e0b',
          blocks: blocks(
            {
              body: 'প্রোডাক্টের মান খুব ভালো। দ্রুত ডেলিভারি পেয়েছি।',
              name: 'রহিম উদ্দিন',
              meta: 'ঢাকা',
              rating: 5,
            },
            {
              body: 'দাম অনুযায়ী চমৎকার। আবার অর্ডার করব।',
              name: 'সাবিনা আক্তার',
              meta: 'চট্টগ্রাম',
              rating: 5,
            },
            {
              body: 'ক্যাশ অন ডেলিভারি হওয়ায় নিশ্চিন্তে নিলাম।',
              name: 'জাহিদ হাসান',
              meta: 'সিলেট',
              rating: 4,
            }
          ),
        },
      },
      { key: 'guarantee', content: { style: 'card', accent_color: '#16a34a' } },
      { key: 'footer' },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  {
    slug: 'flash-sale',
    name: 'ফ্ল্যাশ সেল — Flash Sale',
    description:
      'Urgency-first: a live countdown above the fold, a full-bleed product image, tiered bundles and a sticky order bar that follows the buyer down the page.',
    categorySlug: 'single-product',
    theme: {
      primaryColor: '#dc2626',
      secondaryColor: '#facc15',
      backgroundColor: '#0b0b0f',
      textColor: '#f8fafc',
      headingFont: 'Hind Siliguri',
      bodyFont: 'Hind Siliguri',
      buttonStyle: 'SOLID',
      borderRadius: 'sm',
      spacingScale: 'compact',
      containerWidth: '1100px',
    },
    sections: [
      {
        key: 'countdown',
        content: {
          style: 'solid',
          mode: 'evergreen',
          hours: 12,
          background_color: '#000000',
          accent_color: '#dc2626',
          title: '⚡ ফ্ল্যাশ সেল শেষ হতে বাকি',
        },
      },
      {
        key: 'product-hero',
        content: {
          layout: 'overlay',
          accent_color: '#dc2626',
          badge_text: '🔥 আজকের ডিল',
          title_color: '#ffffff',
          background_color: '#0b0b0f',
          button_radius: 4,
        },
      },
      {
        key: 'marquee',
        content: {
          style: 'dot',
          background_color: '#dc2626',
          speed: 16,
          blocks: blocks(
            { text: '🔥 স্টক সীমিত' },
            { text: '⚡ আজই অর্ডার করুন' },
            { text: '🚚 ফ্রি ডেলিভারি' },
            { text: '💵 ক্যাশ অন ডেলিভারি' }
          ),
        },
      },
      {
        key: 'bundle-offer',
        content: {
          style: 'tiers',
          accent_color: '#dc2626',
          background_color: '#111117',
          card_color: '#1c1c24',
          card_text_color: '#f8fafc',
          heading_color: '#ffffff',
        },
      },
      { key: 'order-form', content: { buttonColor: '#dc2626' } },
      {
        key: 'reviews',
        content: {
          layout: 'scroll',
          card_style: 'bordered',
          background_color: '#0b0b0f',
          card_color: '#16161d',
          text_color: '#e2e8f0',
          blocks: blocks(
            {
              body: 'অবিশ্বাস্য দাম! সাথে সাথে অর্ডার করেছি।',
              name: 'তানভীর',
              meta: 'ঢাকা',
              rating: 5,
            },
            {
              body: 'কম্বো প্যাক নিয়ে অনেক সাশ্রয় হয়েছে।',
              name: 'নুসরাত',
              meta: 'খুলনা',
              rating: 5,
            }
          ),
        },
      },
      {
        key: 'sticky-order-bar',
        content: { style: 'accent', accent_color: '#dc2626', show_after: 350 },
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  {
    slug: 'combo-pack',
    name: 'কম্বো প্যাক — Combo Pack',
    description:
      'Built for selling three to five items together. Gradient product cards, a package picker and a delivery-charge table.',
    categorySlug: 'general',
    theme: {
      primaryColor: '#7c3aed',
      secondaryColor: '#f472b6',
      backgroundColor: '#faf5ff',
      textColor: '#1e1b4b',
      headingFont: 'Hind Siliguri',
      bodyFont: 'Hind Siliguri',
      buttonStyle: 'SOLID',
      borderRadius: 'lg',
      spacingScale: 'comfortable',
      containerWidth: '1180px',
    },
    sections: [
      {
        key: 'announcement',
        content: {
          text: '🎁 কম্বো অফার — যত বেশি নিবেন তত বেশি ছাড়',
          style: 'gradient',
          background_color: '#7c3aed',
          accent_color: '#f472b6',
        },
      },
      {
        key: 'product-showcase',
        content: {
          layout: 'grid-2',
          card_style: 'gradient',
          image_ratio: 'square',
          accent_color: '#7c3aed',
          heading: 'কম্বোতে যা যা পাচ্ছেন',
          limit: 4,
          show_saving: true,
          button_label: 'অর্ডার করুন',
        },
      },
      {
        key: 'bundle-offer',
        content: {
          style: 'cards',
          accent_color: '#7c3aed',
          background_color: '#ffffff',
        },
      },
      {
        key: 'delivery-info',
        content: {
          style: 'cards',
          accent_color: '#7c3aed',
          background_color: '#faf5ff',
        },
      },
      { key: 'order-form', content: { buttonColor: '#7c3aed' } },
      {
        key: 'guarantee',
        content: { style: 'solid', accent_color: '#7c3aed' },
      },
      { key: 'footer' },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  {
    slug: 'beauty-glow',
    name: 'বিউটি ও কসমেটিকস — Glow',
    description:
      'Soft and photographic for skincare and cosmetics: polaroid product cards, a mosaic gallery and review screenshots.',
    categorySlug: 'beauty',
    theme: {
      primaryColor: '#db2777',
      secondaryColor: '#fbcfe8',
      backgroundColor: '#fff1f7',
      textColor: '#500724',
      headingFont: 'Fraunces',
      bodyFont: 'Hind Siliguri',
      buttonStyle: 'SOLID',
      borderRadius: 'full',
      spacingScale: 'spacious',
      containerWidth: '1080px',
    },
    sections: [
      {
        key: 'product-hero',
        content: {
          layout: 'split-reverse',
          accent_color: '#db2777',
          background_color: '#fff1f7',
          title_color: '#500724',
          badge_text: '✨ নতুন কালেকশন',
          image_radius: 32,
          button_radius: 40,
        },
      },
      {
        key: 'gallery-strip',
        content: {
          layout: 'mosaic',
          image_ratio: 'square',
          heading: 'রেজাল্ট দেখুন',
          background_color: '#ffffff',
          radius: 18,
        },
      },
      {
        key: 'product-showcase',
        content: {
          layout: 'grid-3',
          card_style: 'polaroid',
          image_ratio: 'portrait',
          accent_color: '#db2777',
          heading: 'আমাদের প্রোডাক্ট',
          text_align: 'center',
          show_saving: false,
          limit: 6,
        },
      },
      {
        key: 'reviews',
        content: {
          layout: 'masonry',
          card_style: 'shadow',
          accent_color: '#db2777',
          background_color: '#fff1f7',
          radius: 22,
          blocks: blocks(
            {
              body: 'এক সপ্তাহেই ত্বকে পরিবর্তন বুঝতে পারছি।',
              name: 'তাসনিম',
              meta: 'ঢাকা',
              rating: 5,
            },
            {
              body: 'গন্ধ খুব সুন্দর, স্কিনে জ্বালা করেনি।',
              name: 'ফারিয়া',
              meta: 'রাজশাহী',
              rating: 5,
            },
            {
              body: 'অরিজিনাল প্রোডাক্ট পেয়েছি, ধন্যবাদ।',
              name: 'মিম',
              meta: 'বরিশাল',
              rating: 4,
            }
          ),
        },
      },
      { key: 'order-form', content: { buttonColor: '#db2777' } },
      {
        key: 'trust-badges',
        content: {
          style: 'stacked',
          accent_color: '#db2777',
          background_color: '#ffffff',
          blocks: blocks(
            { icon: '🌿', title: 'কেমিক্যাল মুক্ত', description: '' },
            { icon: '🧪', title: 'ডার্মাটোলজিস্ট টেস্টেড', description: '' },
            { icon: '🐰', title: 'ক্রুয়েলটি ফ্রি', description: '' }
          ),
        },
      },
      { key: 'footer' },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  {
    slug: 'gadget-dark',
    name: 'গ্যাজেট — Dark Tech',
    description:
      'A dark, technical page for electronics: glass product cards, a spec comparison table and a wide hero image.',
    categorySlug: 'electronics',
    theme: {
      primaryColor: '#3b82f6',
      secondaryColor: '#22d3ee',
      backgroundColor: '#0b1120',
      textColor: '#e2e8f0',
      headingFont: 'Inter',
      bodyFont: 'Inter',
      buttonStyle: 'SOLID',
      borderRadius: 'md',
      spacingScale: 'comfortable',
      containerWidth: '1240px',
    },
    sections: [
      {
        key: 'marquee',
        content: {
          style: 'plain',
          background_color: '#1e293b',
          text_color: '#93c5fd',
          speed: 28,
          blocks: blocks(
            { text: '⚡ অফিসিয়াল ওয়ারেন্টি' },
            { text: '🚚 ফ্রি শিপিং' },
            { text: '🔒 ১০০% অরিজিনাল' }
          ),
        },
      },
      {
        key: 'product-hero',
        content: {
          layout: 'wide',
          accent_color: '#3b82f6',
          background_color: '#0b1120',
          title_color: '#f8fafc',
          badge_text: 'NEW',
          image_ratio: 'wide',
        },
      },
      {
        key: 'product-showcase',
        content: {
          layout: 'grid-4',
          card_style: 'glass',
          image_ratio: 'square',
          accent_color: '#22d3ee',
          card_text_color: '#e2e8f0',
          heading_color: '#f8fafc',
          heading: 'আরও গ্যাজেট',
          limit: 8,
          gap: 14,
        },
      },
      {
        key: 'comparison',
        content: {
          style: 'striped',
          accent_color: '#3b82f6',
          background_color: '#0b1120',
          blocks: blocks(
            { feature: 'অফিসিয়াল ওয়ারেন্টি', us: '✓ ১ বছর', them: '✕' },
            { feature: 'ক্যাশ অন ডেলিভারি', us: '✓', them: '✕' },
            { feature: 'ডেলিভারি সময়', us: '২৪-৪৮ ঘণ্টা', them: '৫-৭ দিন' },
            { feature: 'রিটার্ন পলিসি', us: '৭ দিন', them: 'নেই' }
          ),
        },
      },
      { key: 'order-form', content: { buttonColor: '#3b82f6' } },
      {
        key: 'sticky-order-bar',
        content: { style: 'dark', accent_color: '#3b82f6' },
      },
      { key: 'footer' },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  {
    slug: 'fashion-lookbook',
    name: 'ফ্যাশন লুকবুক — Lookbook',
    description:
      'Image-led for clothing: tall portrait cards with the text over the photo, a swipeable lookbook and a minimal order form.',
    categorySlug: 'fashion',
    theme: {
      primaryColor: '#0f172a',
      secondaryColor: '#a16207',
      backgroundColor: '#faf9f7',
      textColor: '#1c1917',
      headingFont: 'Fraunces',
      bodyFont: 'Inter',
      buttonStyle: 'OUTLINE',
      borderRadius: 'none',
      spacingScale: 'spacious',
      containerWidth: '1280px',
    },
    sections: [
      {
        key: 'announcement',
        content: {
          text: 'নতুন কালেকশন — সীমিত স্টক',
          style: 'bordered',
          background_color: '#1c1917',
        },
      },
      {
        key: 'product-showcase',
        content: {
          layout: 'grid-3',
          card_style: 'overlay',
          image_ratio: 'portrait',
          heading: 'লুকবুক',
          accent_color: '#a16207',
          radius: 0,
          gap: 8,
          show_button: false,
          button_target: 'product',
          limit: 6,
        },
      },
      {
        key: 'gallery-strip',
        content: {
          layout: 'scroll',
          image_ratio: 'portrait',
          heading: 'স্টাইল গাইড',
          background_color: '#ffffff',
          radius: 0,
        },
      },
      {
        key: 'product-hero',
        content: {
          layout: 'centered',
          accent_color: '#0f172a',
          background_color: '#faf9f7',
          badge_text: '',
          image_radius: 0,
          button_radius: 0,
        },
      },
      { key: 'order-form', content: { buttonColor: '#0f172a' } },
      {
        key: 'reviews',
        content: {
          layout: 'two',
          card_style: 'quote',
          accent_color: '#a16207',
          background_color: '#ffffff',
          radius: 0,
          blocks: blocks(
            {
              body: 'কাপড়ের মান দারুণ, ফিটিংও পারফেক্ট।',
              name: 'সাদিয়া',
              meta: 'ঢাকা',
              rating: 5,
            },
            {
              body: 'ছবির সাথে হুবহু মিল আছে।',
              name: 'রাফি',
              meta: 'কুমিল্লা',
              rating: 5,
            }
          ),
        },
      },
      { key: 'footer' },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  {
    slug: 'food-fresh',
    name: 'খাবার ও গ্রোসারি — Fresh',
    description:
      'Warm and appetite-led for food: a list layout that puts price beside the photo, prominent delivery areas and a fast order form.',
    categorySlug: 'food',
    theme: {
      primaryColor: '#ea580c',
      secondaryColor: '#65a30d',
      backgroundColor: '#fffbeb',
      textColor: '#431407',
      headingFont: 'Hind Siliguri',
      bodyFont: 'Hind Siliguri',
      buttonStyle: 'SOLID',
      borderRadius: 'lg',
      spacingScale: 'comfortable',
      containerWidth: '1080px',
    },
    sections: [
      {
        key: 'announcement',
        content: {
          text: '🍲 আজ অর্ডার করলে আজই ডেলিভারি (ঢাকায়)',
          background_color: '#ea580c',
        },
      },
      {
        key: 'product-showcase',
        content: {
          layout: 'list',
          card_style: 'bordered',
          image_ratio: 'square',
          heading: 'আজকের মেনু',
          accent_color: '#ea580c',
          limit: 8,
          show_saving: false,
          button_label: 'অর্ডার',
        },
      },
      {
        key: 'trust-badges',
        content: {
          style: 'cards',
          accent_color: '#65a30d',
          background_color: '#fffbeb',
          blocks: blocks(
            { icon: '🌾', title: '১০০% ফ্রেশ', description: 'প্রতিদিন তৈরি' },
            { icon: '❄️', title: 'কোল্ড চেইন', description: 'নিরাপদ ডেলিভারি' },
            { icon: '🕒', title: 'সময়মতো', description: 'ঢাকায় সেইম-ডে' }
          ),
        },
      },
      {
        key: 'delivery-info',
        content: {
          style: 'table',
          accent_color: '#ea580c',
          background_color: '#ffffff',
        },
      },
      {
        key: 'order-form',
        content: {
          buttonColor: '#ea580c',
          showNote: true,
          noteLabel: 'বিশেষ নির্দেশনা',
        },
      },
      { key: 'footer' },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  {
    slug: 'minimal-one',
    name: 'মিনিমাল — One Page',
    description:
      'Everything stripped back: no badges, no banners, one product, one price, one form. For merchants whose product photography does the selling.',
    categorySlug: 'single-product',
    theme: {
      primaryColor: '#111827',
      secondaryColor: '#6b7280',
      backgroundColor: '#ffffff',
      textColor: '#111827',
      headingFont: 'Inter',
      bodyFont: 'Inter',
      buttonStyle: 'SOLID',
      borderRadius: 'sm',
      spacingScale: 'spacious',
      containerWidth: '900px',
    },
    sections: [
      {
        key: 'product-hero',
        content: {
          layout: 'stacked',
          accent_color: '#111827',
          background_color: '#ffffff',
          badge_text: '',
          note: '',
          point_3: '',
          point_4: '',
          image_radius: 6,
          button_radius: 6,
        },
      },
      {
        key: 'product-showcase',
        content: {
          layout: 'grid-2',
          card_style: 'minimal',
          image_ratio: 'square',
          heading: '',
          accent_color: '#111827',
          show_saving: false,
          show_button: false,
          limit: 2,
          gap: 28,
        },
      },
      {
        key: 'order-form',
        content: {
          buttonColor: '#111827',
          heading: 'অর্ডার করুন',
          subheading: '',
        },
      },
      { key: 'footer' },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  {
    slug: 'home-living',
    name: 'হোম ও লিভিং — Living',
    description:
      'Earthy and roomy for furniture and homeware: split cards with the image beside the copy, and reviews in an offset masonry.',
    categorySlug: 'home',
    theme: {
      primaryColor: '#78350f',
      secondaryColor: '#0f766e',
      backgroundColor: '#fdf8f3',
      textColor: '#292524',
      headingFont: 'Fraunces',
      bodyFont: 'Inter',
      buttonStyle: 'SOLID',
      borderRadius: 'lg',
      spacingScale: 'spacious',
      containerWidth: '1160px',
    },
    sections: [
      {
        key: 'product-hero',
        content: {
          layout: 'split',
          accent_color: '#78350f',
          background_color: '#fdf8f3',
          title_color: '#292524',
          badge_text: 'হ্যান্ডক্রাফটেড',
          image_ratio: 'landscape',
          image_radius: 24,
        },
      },
      {
        key: 'product-showcase',
        content: {
          layout: 'grid-2',
          card_style: 'split',
          image_ratio: 'landscape',
          heading: 'কালেকশন',
          accent_color: '#78350f',
          limit: 4,
          gap: 20,
        },
      },
      {
        key: 'order-steps',
        content: {
          style: 'rows',
          accent_color: '#0f766e',
          background_color: '#ffffff',
          heading: 'অর্ডার প্রক্রিয়া',
          blocks: blocks(
            { icon: '📝', title: 'অর্ডার দিন', description: 'ফর্ম পূরণ করুন।' },
            {
              icon: '📞',
              title: 'কনফার্মেশন',
              description: 'আমরা কল করে নিশ্চিত করব।',
            },
            {
              icon: '🚛',
              title: 'ডেলিভারি',
              description: 'ঘরে পৌঁছে দেওয়া হবে।',
            }
          ),
        },
      },
      {
        key: 'reviews',
        content: {
          layout: 'masonry',
          card_style: 'bordered',
          accent_color: '#78350f',
          background_color: '#fdf8f3',
          blocks: blocks(
            {
              body: 'কাঠের ফিনিশিং অসাধারণ।',
              name: 'ইমরান',
              meta: 'ঢাকা',
              rating: 5,
            },
            {
              body: 'ঘরের সাথে দারুণ মানিয়েছে।',
              name: 'নাদিয়া',
              meta: 'চট্টগ্রাম',
              rating: 5,
            },
            {
              body: 'ডেলিভারি টিম খুব যত্নশীল ছিল।',
              name: 'শাকিল',
              meta: 'রংপুর',
              rating: 5,
            }
          ),
        },
      },
      { key: 'order-form', content: { buttonColor: '#78350f' } },
      {
        key: 'guarantee',
        content: {
          style: 'outline',
          accent_color: '#0f766e',
          title: '২ বছরের ওয়ারেন্টি',
          icon: '🪵',
        },
      },
      { key: 'footer' },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  {
    slug: 'multi-product',
    name: 'মাল্টি প্রোডাক্ট — Store Front',
    description:
      'For a store selling many items on one page: a dense four-across catalogue, a swipeable best-seller row and an order form at the end.',
    categorySlug: 'general',
    theme: {
      primaryColor: '#0e7490',
      secondaryColor: '#f59e0b',
      backgroundColor: '#f8fafc',
      textColor: '#0f172a',
      headingFont: 'Inter',
      bodyFont: 'Hind Siliguri',
      buttonStyle: 'SOLID',
      borderRadius: 'md',
      spacingScale: 'compact',
      containerWidth: '1320px',
    },
    sections: [
      {
        key: 'announcement',
        content: {
          text: '🛍️ সব প্রোডাক্টে ক্যাশ অন ডেলিভারি',
          style: 'pill',
          background_color: '#0e7490',
        },
      },
      {
        key: 'product-showcase',
        content: {
          layout: 'scroll',
          card_style: 'elevated',
          image_ratio: 'square',
          heading: '🔥 বেস্ট সেলার',
          subheading: 'সবচেয়ে বেশি বিক্রি হওয়া প্রোডাক্ট',
          accent_color: '#0e7490',
          limit: 8,
          show_badge: true,
          badge_text: 'হট',
        },
      },
      {
        key: 'product-showcase',
        content: {
          layout: 'grid-4',
          card_style: 'compact',
          image_ratio: 'square',
          heading: 'সব প্রোডাক্ট',
          accent_color: '#0e7490',
          limit: 16,
          gap: 12,
          button_target: 'product',
        },
      },
      {
        key: 'marquee',
        content: {
          style: 'dashed',
          background_color: '#f59e0b',
          text_color: '#431407',
          speed: 20,
          blocks: blocks(
            { text: 'নতুন প্রোডাক্ট প্রতি সপ্তাহে' },
            { text: 'সারা দেশে ডেলিভারি' }
          ),
        },
      },
      {
        key: 'delivery-info',
        content: {
          style: 'plain',
          accent_color: '#0e7490',
          background_color: '#ffffff',
        },
      },
      { key: 'order-form', content: { buttonColor: '#0e7490' } },
      { key: 'footer' },
    ],
  },
]
