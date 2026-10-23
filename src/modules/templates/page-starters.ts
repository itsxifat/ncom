import type { TemplateSection } from './types'
import { aboutPage, contactPage, deliveryPage } from './store-pages'
import { L, type Localized } from './localize'

/**
 * What a new page on an online store can start as.
 *
 * The pages shoppers look for before they trust a shop, already written, so a
 * merchant adding "About us" changes the names and the story rather than
 * facing an empty page and a block library.
 */
export interface PageStarter {
  key: string
  name: string
  description: string
  /** The page's name, in both of a site's languages. */
  title: string | Localized
  slug: string
  sections: TemplateSection[]
}

export const PAGE_STARTERS: PageStarter[] = [
  {
    key: 'blank',
    name: 'Blank page',
    description: 'A heading and some text to start from.',
    title: L('New page', 'নতুন পাতা'),
    slug: 'new-page',
    sections: [
      {
        type: 'richtext',
        content: {
          title: L('New page', 'নতুন পাতা'),
          body: L(
            'Write something here, or add blocks from the panel on the left.',
            'এখানে কিছু লিখুন, অথবা বাঁ দিকের প্যানেল থেকে ব্লক যোগ করুন।'
          ),
          align: 'center',
        },
        config: { paddingTop: 5, paddingBottom: 5 },
      },
    ],
  },
  {
    key: 'about',
    name: 'About us',
    description: 'Your story and what you promise customers.',
    title: L('About us', 'আমাদের সম্পর্কে'),
    slug: 'about',
    sections: aboutPage({
      title: L('Our story', 'আমাদের গল্প'),
      body: L(
        'Tell customers who you are, why you started and what makes your products worth buying.',
        'ক্রেতাদের জানান আপনি কে, কেন শুরু করেছেন আর আপনার পণ্য কেন কেনার মতো।'
      ),
    }).sections,
  },
  {
    key: 'contact',
    name: 'Contact',
    description: 'How to reach you: phone, email, social.',
    title: L('Contact', 'যোগাযোগ'),
    slug: 'contact',
    sections: contactPage().sections,
  },
  {
    key: 'delivery',
    name: 'Delivery & returns',
    description: 'Delivery times, charges and exchanges.',
    title: L('Delivery & returns', 'ডেলিভারি ও রিটার্ন'),
    slug: 'delivery',
    sections: deliveryPage().sections,
  },
  {
    key: 'offer',
    name: 'Offer page',
    description: 'A banner, a timer and the products on offer.',
    title: L('Special offer', 'বিশেষ অফার'),
    slug: 'offer',
    sections: [
      {
        type: 'slider',
        content: {
          slides: [
            {
              image: '',
              mobileImage: '',
              eyebrow: L('Limited time', 'সীমিত সময়'),
              title: L(
                'Our biggest sale of the season',
                'এই সিজনের সবচেয়ে বড় সেল'
              ),
              subtitle: L(
                'Up to 40% off while stock lasts.',
                'স্টক থাকা পর্যন্ত ৪০% পর্যন্ত ছাড়।'
              ),
              buttonText: L('Shop the sale', 'সেল থেকে কিনুন'),
              buttonHref: '/products',
              align: 'center',
            },
          ],
          height: 'medium',
        },
      },
      {
        type: 'countdown',
        content: {
          title: L('Sale ends in', 'সেল শেষ হতে বাকি'),
          mode: 'evergreen',
          durationMinutes: 1440,
        },
      },
      {
        type: 'products',
        content: { title: L('On sale now', 'এখন সেলে আছে'), limit: 12 },
      },
    ],
  },
]

export function getPageStarter(key: string | null | undefined): PageStarter {
  return (
    PAGE_STARTERS.find((starter) => starter.key === key) ?? PAGE_STARTERS[0]!
  )
}
