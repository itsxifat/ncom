import type { SiteTemplate } from './types'
import { L } from './localize'

/**
 * The landing page templates.
 *
 * A landing page sells one thing, or a small set, to someone who arrived from
 * an ad and will decide in the next minute. Every template here is that page
 * in a different voice — a calm product page, a flash sale against the clock,
 * a beauty brand's story, a gadget launch — and every one ends where a landing
 * page has to: the order form, with cash on delivery.
 *
 * The words are written as real copy rather than lorem ipsum, so a merchant
 * sees the shape of a page that sells and only has to swap in their product.
 */

const classic: SiteTemplate = {
  key: 'landing-classic',
  kind: 'LANDING',
  name: 'Classic',
  description: 'A calm, trustworthy page: product, proof, then the order form.',
  bestFor: 'Any single product',
  theme: {
    primaryColor: '#e8590c',
    secondaryColor: '#2f9e44',
    backgroundColor: '#ffffff',
    textColor: '#1c1c1c',
    headingFont: 'Poppins',
    // Google Sans even in English: its Latin and Bangla letters were drawn
    // together, so a Bangla product name or review in an English page's text
    // matches the words around it. A Bangla face here (it used to be Hind
    // Siliguri) would draw that Bangla itself and skip the Google Sans default.
    bodyFont: 'Google Sans',
    bangla: { headingFont: 'Google Sans', bodyFont: 'Google Sans' },
    borderRadius: 'lg',
    headingWeight: '700',
  },
  pages: [
    {
      title: L('Home', 'হোম'),
      slug: 'home',
      isHome: true,
      sections: [
        {
          type: 'hero',
          content: {
            eyebrow: L('Limited stock', 'স্টক সীমিত'),
            title: L(
              'Premium cotton panjabi, made to last',
              'প্রিমিয়াম কটন পাঞ্জাবি, টেকে বহুদিন'
            ),
            subtitle: L(
              'Soft, breathable fabric with fine embroidery — perfect for Eid and every occasion.',
              'নরম, আরামদায়ক কাপড়ে সূক্ষ্ম এমব্রয়ডারি — ঈদ আর যেকোনো উৎসবের জন্য একদম মানানসই।'
            ),
            ctaText: L(
              'Order now — cash on delivery',
              'এখনই অর্ডার করুন — ক্যাশ অন ডেলিভারি'
            ),
            height: 'medium',
          },
          config: { backgroundVariant: 'muted' },
        },
        {
          type: 'trust',
          content: {
            items: [
              { text: L('Cash on delivery', 'ক্যাশ অন ডেলিভারি') },
              { text: L('Delivery in 2–3 days', '২–৩ দিনে ডেলিভারি') },
              { text: L('Easy exchange', 'সহজ এক্সচেঞ্জ') },
            ],
          },
        },
        {
          type: 'features',
          content: {
            title: L('Why you’ll love it', 'কেন আপনার ভালো লাগবে'),
            items: [
              {
                title: L('100% cotton', '১০০% কটন'),
                text: L(
                  'Breathable and soft, comfortable all day long.',
                  'নরম ও আরামদায়ক, সারাদিন পরে থাকলেও অস্বস্তি নেই।'
                ),
              },
              {
                title: L('Hand-finished embroidery', 'হাতে করা এমব্রয়ডারি'),
                text: L(
                  'Detail you can feel, stitch by stitch.',
                  'প্রতিটি সেলাইয়ে যত্নের ছোঁয়া।'
                ),
              },
              {
                title: L('True to size', 'সঠিক মাপ'),
                text: L(
                  'Not sure? We exchange it within 7 days.',
                  'মাপ নিয়ে চিন্তা? ৭ দিনের মধ্যে এক্সচেঞ্জ করে নিন।'
                ),
              },
            ],
          },
        },
        {
          type: 'testimonials',
          content: {
            title: L('What customers say', 'ক্রেতারা যা বলছেন'),
            items: [
              {
                name: 'Arif R.',
                text: L(
                  'The fabric quality is excellent. Got so many compliments!',
                  'কাপড়ের মান অসাধারণ। সবাই খুব প্রশংসা করেছে!'
                ),
                rating: '5',
                image: '',
              },
              {
                name: 'Sabbir K.',
                text: L(
                  'Delivered in two days, exactly like the pictures.',
                  'দুই দিনেই হাতে পেয়েছি, একদম ছবির মতো।'
                ),
                rating: '5',
                image: '',
              },
            ],
          },
        },
        { type: 'orderform' },
        {
          type: 'faq',
          content: {
            items: [
              {
                q: L('How do I pay?', 'কীভাবে পেমেন্ট করব?'),
                a: L(
                  'Pay in cash when the parcel arrives. No advance needed.',
                  'পার্সেল হাতে পেয়ে টাকা দিন। কোনো অগ্রিম লাগবে না।'
                ),
              },
              {
                q: L(
                  'How long does delivery take?',
                  'ডেলিভারি পেতে কত দিন লাগে?'
                ),
                a: L(
                  'Inside Dhaka 1–2 days, outside Dhaka 2–4 days.',
                  'ঢাকার ভেতরে ১–২ দিন, ঢাকার বাইরে ২–৪ দিন।'
                ),
              },
              {
                q: L('Can I exchange the size?', 'মাপ বদলানো যাবে কি?'),
                a: L(
                  'Yes, within 7 days of delivery.',
                  'হ্যাঁ, ডেলিভারির ৭ দিনের মধ্যে।'
                ),
              },
            ],
          },
        },
      ],
    },
  ],
}

const flash: SiteTemplate = {
  key: 'landing-flash',
  kind: 'LANDING',
  name: 'Flash sale',
  description: 'A countdown at the top and urgency all the way down.',
  bestFor: 'Offers, combos, limited drops',
  theme: {
    primaryColor: '#e03131',
    secondaryColor: '#f08c00',
    backgroundColor: '#fff8f1',
    textColor: '#2b1a12',
    headingFont: 'Montserrat',
    // Google Sans for the same reason as Classic's, and so the Design panel's
    // "Bold" pairing (Montserrat over Google Sans) shows as this page's fonts.
    bodyFont: 'Google Sans',
    bangla: { headingFont: 'Google Sans', bodyFont: 'Google Sans' },
    borderRadius: 'md',
    headingWeight: '800',
  },
  pages: [
    {
      title: L('Home', 'হোম'),
      slug: 'home',
      isHome: true,
      sections: [
        {
          type: 'countdown',
          content: {
            title: L('Offer ends in', 'অফার শেষ হতে বাকি'),
            subtitle: L(
              'After the timer, the price goes back to normal.',
              'সময় শেষ হলেই দাম আবার আগের মতো হয়ে যাবে।'
            ),
            mode: 'evergreen',
            durationMinutes: 30,
            style: 'boxes',
            urgentAtMinutes: 5,
            ctaText: L('Grab the offer', 'অফারটি নিন'),
          },
        },
        {
          type: 'hero',
          content: {
            eyebrow: L('Today only', 'শুধু আজকের জন্য'),
            title: L('Buy 2, get 1 free', '২টি কিনলে ১টি ফ্রি'),
            subtitle: L(
              'Our best-selling combo at the lowest price of the year.',
              'আমাদের সবচেয়ে জনপ্রিয় কম্বো, বছরের সবচেয়ে কম দামে।'
            ),
            ctaText: L('Order before it ends', 'শেষ হওয়ার আগেই অর্ডার করুন'),
            height: 'small',
          },
        },
        {
          type: 'features',
          content: {
            title: L('What you get', 'আপনি যা পাচ্ছেন'),
            layout: 'list',
            items: [
              {
                title: L('3 pieces for the price of 2', '২টির দামে ৩টি'),
                text: L(
                  'Mix and match any colours.',
                  'পছন্দমতো যেকোনো রং মিলিয়ে নিন।'
                ),
              },
              {
                title: L('Free delivery', 'ফ্রি ডেলিভারি'),
                text: L(
                  'On this offer, anywhere in Bangladesh.',
                  'এই অফারে, বাংলাদেশের যেকোনো জায়গায়।'
                ),
              },
              {
                title: L('Cash on delivery', 'ক্যাশ অন ডেলিভারি'),
                text: L(
                  'Check it first, then pay.',
                  'আগে দেখে নিন, তারপর টাকা দিন।'
                ),
              },
            ],
          },
        },
        {
          type: 'orderform',
          content: { title: L('Claim your offer now', 'এখনই অফারটি নিন') },
        },
        {
          type: 'faq',
          content: {
            items: [
              {
                q: L(
                  'Is the offer really free delivery?',
                  'এই অফারে কি সত্যিই ডেলিভারি ফ্রি?'
                ),
                a: L(
                  'Yes — no delivery charge on this offer.',
                  'হ্যাঁ — এই অফারে কোনো ডেলিভারি চার্জ নেই।'
                ),
              },
              {
                q: L('When will I get it?', 'কবে হাতে পাব?'),
                a: L(
                  'Within 2–4 days after we call to confirm.',
                  'আমরা কল করে কনফার্ম করার পর ২–৪ দিনের মধ্যে।'
                ),
              },
            ],
          },
        },
      ],
    },
  ],
}

const glow: SiteTemplate = {
  key: 'landing-glow',
  kind: 'LANDING',
  name: 'Glow',
  description: 'Soft colours and serif headlines for beauty and wellness.',
  bestFor: 'Skincare, cosmetics, wellness',
  theme: {
    primaryColor: '#c2577a',
    secondaryColor: '#e9b8a8',
    backgroundColor: '#fdf6f4',
    textColor: '#3b2a2a',
    headingFont: 'Playfair Display',
    bodyFont: 'DM Sans',
    bangla: { headingFont: 'Noto Serif Bengali', bodyFont: 'Google Sans' },
    borderRadius: 'full',
    headingWeight: '600',
  },
  pages: [
    {
      title: L('Home', 'হোম'),
      slug: 'home',
      isHome: true,
      sections: [
        {
          type: 'hero',
          content: {
            eyebrow: L(
              'Dermatologist tested',
              'চর্মরোগ বিশেষজ্ঞ দ্বারা পরীক্ষিত'
            ),
            title: L('Glowing skin in 14 days', '১৪ দিনে উজ্জ্বল ত্বক'),
            subtitle: L(
              'A gentle vitamin C serum for brighter, even-toned skin — suitable for every skin type.',
              'উজ্জ্বল ও সমান রঙের ত্বকের জন্য কোমল ভিটামিন সি সিরাম — সব ধরনের ত্বকে মানানসই।'
            ),
            ctaText: L('Get yours today', 'আজই আপনারটি নিন'),
            height: 'large',
          },
        },
        {
          type: 'richtext',
          content: {
            title: L(
              'Made with ingredients you can pronounce',
              'চেনা ও নিরাপদ উপাদানে তৈরি'
            ),
            body: L(
              'Vitamin C, hyaluronic acid and aloe vera — nothing harsh, nothing hidden. Just a few drops every morning for skin that looks rested and bright.',
              'ভিটামিন সি, হায়ালুরোনিক অ্যাসিড আর অ্যালোভেরা — কোনো কড়া রাসায়নিক নেই, কিছু লুকানো নেই। প্রতিদিন সকালে কয়েক ফোঁটাই যথেষ্ট সতেজ, উজ্জ্বল ত্বকের জন্য।'
            ),
            align: 'center',
          },
        },
        {
          type: 'features',
          content: {
            title: L('Why it works', 'কেন কাজ করে'),
            items: [
              {
                title: L('Brightens', 'উজ্জ্বল করে'),
                text: L(
                  'Fades dark spots and dullness.',
                  'কালো দাগ আর মলিনতা কমায়।'
                ),
              },
              {
                title: L('Hydrates', 'আর্দ্রতা ধরে রাখে'),
                text: L(
                  'Locks in moisture all day.',
                  'সারাদিন ত্বক রাখে কোমল ও আর্দ্র।'
                ),
              },
              {
                title: L('Gentle', 'কোমল'),
                text: L(
                  'No alcohol, no parabens, no fragrance.',
                  'অ্যালকোহল, প্যারাবেন বা সুগন্ধি নেই।'
                ),
              },
            ],
          },
        },
        {
          type: 'testimonials',
          content: {
            title: L('Real results', 'সত্যিকারের ফলাফল'),
            items: [
              {
                name: 'Farzana M.',
                text: L(
                  'My skin has never looked this bright. I am on my second bottle!',
                  'আমার ত্বক আগে কখনো এত উজ্জ্বল দেখায়নি। এখন দ্বিতীয় বোতল ব্যবহার করছি!'
                ),
                rating: '5',
                image: '',
              },
              {
                name: 'Lamia S.',
                text: L(
                  'Gentle on my sensitive skin and smells lovely.',
                  'আমার সংবেদনশীল ত্বকেও কোনো সমস্যা হয়নি, ঘ্রাণটাও চমৎকার।'
                ),
                rating: '5',
                image: '',
              },
            ],
          },
        },
        {
          type: 'orderform',
          content: { title: L('Order your serum', 'আপনার সিরাম অর্ডার করুন') },
        },
        {
          type: 'faq',
          content: {
            items: [
              {
                q: L(
                  'Is it safe for sensitive skin?',
                  'সংবেদনশীল ত্বকের জন্য কি নিরাপদ?'
                ),
                a: L(
                  'Yes. It is dermatologist tested and fragrance-free.',
                  'হ্যাঁ। এটি চর্মরোগ বিশেষজ্ঞ দ্বারা পরীক্ষিত এবং সুগন্ধিমুক্ত।'
                ),
              },
              {
                q: L('How long does one bottle last?', 'এক বোতল কত দিন চলে?'),
                a: L(
                  'About 6–8 weeks of daily use.',
                  'প্রতিদিন ব্যবহারে প্রায় ৬–৮ সপ্তাহ।'
                ),
              },
            ],
          },
        },
      ],
    },
  ],
}

const launch: SiteTemplate = {
  key: 'landing-launch',
  kind: 'LANDING',
  name: 'Launch',
  description:
    'Dark and dramatic, for a product people should be excited about.',
  bestFor: 'Gadgets, new products, pre-orders',
  theme: {
    primaryColor: '#7c5cff',
    secondaryColor: '#22d3ee',
    backgroundColor: '#0b0d12',
    textColor: '#eef1f6',
    headingFont: 'Space Grotesk',
    bodyFont: 'Inter',
    bangla: { headingFont: 'Google Sans', bodyFont: 'Google Sans' },
    borderRadius: 'lg',
    headingWeight: '700',
  },
  pages: [
    {
      title: L('Home', 'হোম'),
      slug: 'home',
      isHome: true,
      sections: [
        {
          type: 'hero',
          content: {
            eyebrow: L('New launch', 'নতুন এসেছে'),
            title: L(
              'Noise cancelling earbuds, 40-hour battery',
              'নয়েজ ক্যান্সেলিং ইয়ারবাড, ৪০ ঘণ্টা ব্যাটারি'
            ),
            subtitle: L(
              'Crystal-clear sound, all-day comfort and a case that fits in any pocket.',
              'ঝকঝকে পরিষ্কার সাউন্ড, সারাদিনের আরাম আর পকেটে ধরে এমন কেস।'
            ),
            ctaText: L('Pre-order now', 'এখনই প্রি-অর্ডার করুন'),
            height: 'large',
          },
        },
        {
          type: 'features',
          content: {
            title: L('Built for every day', 'প্রতিদিনের সঙ্গী'),
            items: [
              {
                title: L(
                  'Active noise cancelling',
                  'অ্যাক্টিভ নয়েজ ক্যান্সেলিং'
                ),
                text: L(
                  'Shut out traffic, office chatter and the bus.',
                  'রাস্তার জ্যাম, অফিসের কোলাহল আর বাসের শব্দ — সব বন্ধ।'
                ),
              },
              {
                title: L('40 hours of battery', '৪০ ঘণ্টা ব্যাটারি'),
                text: L(
                  'A full week of listening on one charge.',
                  'এক চার্জে পুরো সপ্তাহ গান শুনুন।'
                ),
              },
              {
                title: L('Water resistant', 'পানি প্রতিরোধী'),
                text: L(
                  'Rain, sweat and gym-proof.',
                  'বৃষ্টি, ঘাম আর জিম — কিছুতেই সমস্যা নেই।'
                ),
              },
            ],
          },
        },
        {
          type: 'countdown',
          content: {
            title: L('Launch price ends in', 'লঞ্চ অফার শেষ হতে বাকি'),
            mode: 'evergreen',
            durationMinutes: 120,
            style: 'pill',
          },
        },
        {
          type: 'orderform',
          content: {
            title: L(
              'Reserve yours at the launch price',
              'লঞ্চ দামে আপনারটি বুক করুন'
            ),
          },
        },
        {
          type: 'faq',
          content: {
            items: [
              {
                q: L('Is there a warranty?', 'ওয়ারেন্টি আছে কি?'),
                a: L(
                  'Yes, 6 months of official warranty.',
                  'হ্যাঁ, ৬ মাসের অফিসিয়াল ওয়ারেন্টি।'
                ),
              },
              {
                q: L(
                  'Do they work with iPhone and Android?',
                  'আইফোন আর অ্যান্ড্রয়েড দুটোতেই চলবে?'
                ),
                a: L(
                  'Yes, with any phone that has Bluetooth.',
                  'হ্যাঁ, ব্লুটুথ আছে এমন যেকোনো ফোনে।'
                ),
              },
            ],
          },
        },
      ],
    },
  ],
}

export const LANDING_TEMPLATES: SiteTemplate[] = [classic, flash, glow, launch]
