import type { TemplatePage, TemplateSection } from './types'
import { L, type Localized } from './localize'

/**
 * Pages every online store template shares, varied only where a template has
 * something different to say.
 *
 * A store's product page and catalogue page are designs, not content — what
 * changes between a fashion shop and a grocer is mostly the photo shape and
 * the words, which is what the options here are for. The about, contact and
 * delivery pages are the ones every shop in this market is asked for, written
 * so a merchant only has to change the names and numbers.
 */

export function productPage(options: {
  imageRatio?: 'portrait' | 'square'
  gallery?: 'below' | 'side' | 'stack'
  highlights?: (string | Localized)[]
  extra?: TemplateSection[]
}): TemplatePage {
  return {
    title: 'Product page',
    slug: '_product',
    role: 'PRODUCT',
    sections: [
      {
        type: 'productdetails',
        content: {
          imageRatio: options.imageRatio ?? 'portrait',
          gallery: options.gallery ?? 'below',
          ...(options.highlights
            ? { highlights: options.highlights.map((text) => ({ text })) }
            : {}),
        },
      },
      ...(options.extra ?? []),
      {
        type: 'relatedproducts',
        content: { imageRatio: options.imageRatio ?? 'portrait' },
      },
    ],
  }
}

export function catalogPage(options: {
  imageRatio?: 'portrait' | 'square' | 'landscape'
  columns?: '3' | '4' | '5'
}): TemplatePage {
  return {
    title: 'Category page',
    slug: '_catalog',
    role: 'CATALOG',
    sections: [
      {
        type: 'productlisting',
        content: {
          imageRatio: options.imageRatio ?? 'portrait',
          columns: options.columns ?? '4',
        },
      },
    ],
  }
}

export function layoutPage(sections: TemplateSection[]): TemplatePage {
  return { title: 'Header & footer', slug: '_layout', role: 'LAYOUT', sections }
}

export function aboutPage(story: {
  title: string | Localized
  body: string | Localized
}): TemplatePage {
  return {
    title: L('About us', 'আমাদের সম্পর্কে'),
    slug: 'about',
    sections: [
      {
        type: 'richtext',
        content: { title: story.title, body: story.body, align: 'center' },
        config: { paddingTop: 5, paddingBottom: 2 },
      },
      {
        type: 'features',
        content: {
          title: L('What we promise', 'আমাদের প্রতিশ্রুতি'),
          layout: 'grid',
          items: [
            {
              title: L('Checked before it ships', 'পাঠানোর আগে যাচাই করা'),
              text: L(
                'Every order is inspected and packed by hand.',
                'প্রতিটি অর্ডার হাতে যাচাই করে প্যাক করা হয়।'
              ),
            },
            {
              title: L('Pay when it arrives', 'হাতে পেয়ে টাকা দিন'),
              text: L(
                'Cash on delivery, anywhere in the country.',
                'দেশের যেকোনো জায়গায় ক্যাশ অন ডেলিভারি।'
              ),
            },
            {
              title: L('Easy exchange', 'সহজ এক্সচেঞ্জ'),
              text: L(
                'Wrong size? Exchange it within 7 days.',
                'মাপ মেলেনি? ৭ দিনের মধ্যে বদলে নিন।'
              ),
            },
          ],
        },
      },
    ],
  }
}

export function contactPage(): TemplatePage {
  return {
    title: L('Contact', 'যোগাযোগ'),
    slug: 'contact',
    sections: [
      {
        type: 'richtext',
        content: {
          title: L('We’re here to help', 'আমরা আছি আপনার পাশে'),
          body: L(
            'Questions about an order, a size or a delivery? Call or message us — we reply within a few hours, every day from 10am to 8pm.<br><br><b>Phone:</b> 01XXX-XXXXXX<br><b>Email:</b> hello@yourstore.com<br><b>Facebook:</b> facebook.com/yourstore',
            'অর্ডার, মাপ বা ডেলিভারি নিয়ে কোনো প্রশ্ন? কল বা মেসেজ করুন — প্রতিদিন সকাল ১০টা থেকে রাত ৮টা পর্যন্ত কয়েক ঘণ্টার মধ্যেই উত্তর দিই।<br><br><b>ফোন:</b> 01XXX-XXXXXX<br><b>ইমেইল:</b> hello@yourstore.com<br><b>ফেসবুক:</b> facebook.com/yourstore'
          ),
          align: 'center',
        },
        config: { paddingTop: 5, paddingBottom: 5 },
      },
    ],
  }
}

export function deliveryPage(): TemplatePage {
  return {
    title: L('Delivery & returns', 'ডেলিভারি ও রিটার্ন'),
    slug: 'delivery',
    sections: [
      {
        type: 'faq',
        content: {
          title: L('Delivery & returns', 'ডেলিভারি ও রিটার্ন'),
          items: [
            {
              q: L(
                'How long does delivery take?',
                'ডেলিভারি পেতে কত দিন লাগে?'
              ),
              a: L(
                'Inside Dhaka 1–2 days, outside Dhaka 2–5 days after we confirm your order.',
                'অর্ডার কনফার্ম হওয়ার পর ঢাকার ভেতরে ১–২ দিন, ঢাকার বাইরে ২–৫ দিন।'
              ),
            },
            {
              q: L('How much is delivery?', 'ডেলিভারি চার্জ কত?'),
              a: L(
                'Delivery charges are shown at checkout before you place your order.',
                'অর্ডার করার আগেই চেকআউটে ডেলিভারি চার্জ দেখতে পাবেন।'
              ),
            },
            {
              q: L(
                'Can I pay when the parcel arrives?',
                'পার্সেল হাতে পেয়ে কি টাকা দেওয়া যাবে?'
              ),
              a: L(
                'Yes. Cash on delivery is available everywhere we deliver.',
                'হ্যাঁ। আমরা যেখানে ডেলিভারি দিই, সব জায়গায় ক্যাশ অন ডেলিভারি আছে।'
              ),
            },
            {
              q: L(
                'What if something is wrong with my order?',
                'অর্ডারে কোনো সমস্যা হলে কী করব?'
              ),
              a: L(
                'Tell us within 7 days and we will exchange it or refund you.',
                '৭ দিনের মধ্যে জানান, আমরা বদলে দেব অথবা টাকা ফেরত দেব।'
              ),
            },
          ],
        },
        config: { paddingTop: 3, paddingBottom: 3 },
      },
    ],
  }
}
