import type { SiteTemplate, TemplateSection } from './types'
import {
  aboutPage,
  catalogPage,
  contactPage,
  deliveryPage,
  layoutPage,
  productPage,
} from './store-pages'
import { L, type Localized } from './localize'

/**
 * The online store templates.
 *
 * Four looks for the four kinds of shop that make up most of this market —
 * an everyday general store, a fashion boutique, a grocer, a gadget shop. Each
 * is a complete store: header and footer, a home page laid out for that kind
 * of shop, a product page and a catalogue page shaped for its photos, and the
 * about, contact and delivery pages shoppers look for before they trust a new
 * shop with an order.
 *
 * None of them needs a single photo to look finished. Banners fall back to
 * the theme's colours and products come from the merchant's catalogue, so a
 * store made from a template reads as designed the moment it exists, and gets
 * better as the merchant adds their own pictures.
 */

function footer(
  about: string | Localized,
  extra: Record<string, unknown> = {}
): TemplateSection {
  return {
    type: 'footer',
    content: {
      about,
      columns: [
        {
          title: L('Shop', 'শপ'),
          links: [
            { label: L('All products', 'সব পণ্য'), href: '/products' },
            { label: L('Search', 'খুঁজুন'), href: '/search' },
            { label: L('My account', 'আমার অ্যাকাউন্ট'), href: '/account' },
          ],
        },
        {
          title: L('Help', 'সাহায্য'),
          links: [
            {
              label: L('Delivery & returns', 'ডেলিভারি ও রিটার্ন'),
              href: '/delivery',
            },
            { label: L('Contact us', 'যোগাযোগ করুন'), href: '/contact' },
            { label: L('About us', 'আমাদের সম্পর্কে'), href: '/about' },
          ],
        },
      ],
      phone: '01XXX-XXXXXX',
      email: 'hello@yourstore.com',
      ...extra,
    },
  }
}

const essentials: SiteTemplate = {
  key: 'store-essentials',
  kind: 'STORE',
  name: 'Essentials',
  description: 'Clean and bright, with room for every kind of product.',
  bestFor: 'General stores, lifestyle, gifts',
  theme: {
    primaryColor: '#111111',
    secondaryColor: '#f59f00',
    backgroundColor: '#ffffff',
    textColor: '#1b1b1f',
    headingFont: 'Plus Jakarta Sans',
    bodyFont: 'Inter',
    bangla: { headingFont: 'Google Sans', bodyFont: 'Google Sans' },
    borderRadius: 'md',
    headingWeight: '700',
  },
  pages: [
    layoutPage([
      {
        type: 'announcement',
        content: {
          messages: [
            {
              text: L(
                'Cash on delivery all over Bangladesh',
                'সারা বাংলাদেশে ক্যাশ অন ডেলিভারি'
              ),
              href: '',
            },
            {
              text: L(
                'Easy exchange within 7 days',
                '৭ দিনের মধ্যে সহজ এক্সচেঞ্জ'
              ),
              href: '/delivery',
            },
          ],
          rotateSeconds: 5,
        },
      },
      {
        type: 'header',
        content: {
          menu: [
            { label: L('Home', 'হোম'), href: '/' },
            { label: L('Shop', 'শপ'), href: '/products' },
            { label: L('About', 'আমাদের কথা'), href: '/about' },
            { label: L('Contact', 'যোগাযোগ'), href: '/contact' },
          ],
        },
      },
      footer(
        L(
          'Everyday things, chosen with care and delivered to your door.',
          'যত্ন করে বাছাই করা প্রতিদিনের পণ্য, পৌঁছে যায় আপনার দরজায়।'
        )
      ),
    ]),
    {
      title: L('Home', 'হোম'),
      slug: 'home',
      isHome: true,
      sections: [
        {
          type: 'slider',
          content: {
            slides: [
              {
                image: '',
                mobileImage: '',
                eyebrow: L('New in', 'নতুন এসেছে'),
                title: L(
                  'Everything you need, all in one place',
                  'আপনার যা দরকার, সব এক জায়গায়'
                ),
                subtitle: L(
                  'Hand-picked everyday favourites, delivered across the country.',
                  'বাছাই করা প্রতিদিনের প্রিয় পণ্য, পৌঁছে যায় সারা দেশে।'
                ),
                buttonText: L('Shop now', 'এখনই কিনুন'),
                buttonHref: '/products',
                align: 'left',
              },
              {
                image: '',
                mobileImage: '',
                eyebrow: L('This week only', 'শুধু এই সপ্তাহে'),
                title: L(
                  'Up to 30% off best sellers',
                  'জনপ্রিয় পণ্যে ৩০% পর্যন্ত ছাড়'
                ),
                subtitle: L(
                  'Pay when it arrives — cash on delivery everywhere.',
                  'পণ্য হাতে পেয়ে টাকা দিন — সব জায়গায় ক্যাশ অন ডেলিভারি।'
                ),
                buttonText: L('See the offers', 'অফারগুলো দেখুন'),
                buttonHref: '/products',
                align: 'left',
              },
            ],
            height: 'large',
          },
        },
        {
          type: 'categories',
          content: {
            title: L('Shop by category', 'ক্যাটাগরি অনুযায়ী কিনুন'),
            style: 'circles',
            columns: '5',
          },
        },
        {
          type: 'products',
          content: {
            title: L('New arrivals', 'নতুন এসেছে'),
            source: 'newest',
            limit: 8,
          },
        },
        { type: 'promos' },
        {
          type: 'products',
          content: {
            title: L('Best sellers', 'সবচেয়ে বেশি বিক্রি'),
            subtitle: L(
              'The things our customers come back for.',
              'যে পণ্যগুলোর জন্য ক্রেতারা বারবার ফিরে আসেন।'
            ),
            source: 'newest',
            limit: 10,
            layout: 'carousel',
          },
        },
        {
          type: 'testimonials',
          content: {
            title: L('Loved by our customers', 'ক্রেতাদের ভালোবাসা'),
            items: [
              {
                name: 'Nusrat J.',
                text: L(
                  'Delivered in two days and packed so carefully. Will order again!',
                  'দুই দিনেই পেয়েছি, প্যাকিংও খুব যত্নের। আবার অর্ডার করব!'
                ),
                rating: '5',
                image: '',
              },
              {
                name: 'Rafiq H.',
                text: L(
                  'Exactly like the photos. Cash on delivery made it easy.',
                  'একদম ছবির মতো। ক্যাশ অন ডেলিভারি থাকায় খুব সহজ হয়েছে।'
                ),
                rating: '5',
                image: '',
              },
              {
                name: 'Tania A.',
                text: L(
                  'They called to confirm my size before sending. Great service.',
                  'পাঠানোর আগে কল করে মাপ নিশ্চিত করেছে। দারুণ সার্ভিস।'
                ),
                rating: '5',
                image: '',
              },
            ],
          },
        },
        {
          type: 'trust',
          content: {
            items: [
              { text: L('Cash on delivery', 'ক্যাশ অন ডেলিভারি') },
              {
                text: L(
                  'Delivery across Bangladesh',
                  'সারা বাংলাদেশে ডেলিভারি'
                ),
              },
              { text: L('7-day exchange', '৭ দিনে এক্সচেঞ্জ') },
              { text: L('Genuine products', 'শতভাগ আসল পণ্য') },
            ],
          },
        },
      ],
    },
    productPage({}),
    catalogPage({}),
    aboutPage({
      title: L('Our story', 'আমাদের গল্প'),
      body: L(
        'We started with a simple idea: good everyday products, honest prices, and delivery you can count on. Every item in our shop is one we would use ourselves.',
        'আমরা শুরু করেছিলাম একটি সহজ ভাবনা থেকে: ভালো মানের প্রতিদিনের পণ্য, ন্যায্য দাম আর ভরসার ডেলিভারি। আমাদের দোকানের প্রতিটি পণ্যই এমন, যা আমরা নিজেরাও ব্যবহার করি।'
      ),
    }),
    contactPage(),
    deliveryPage(),
  ],
}

const boutique: SiteTemplate = {
  key: 'store-boutique',
  kind: 'STORE',
  name: 'Boutique',
  description: 'Elegant serif type, warm neutrals and tall photos.',
  bestFor: 'Clothing, jewellery, handmade',
  theme: {
    primaryColor: '#2b2118',
    secondaryColor: '#b08d57',
    backgroundColor: '#faf7f2',
    textColor: '#2b2118',
    headingFont: 'Cormorant Garamond',
    bodyFont: 'Manrope',
    bangla: { headingFont: 'Noto Serif Bengali', bodyFont: 'Google Sans' },
    borderRadius: 'none',
    headingWeight: '600',
  },
  pages: [
    layoutPage([
      {
        type: 'announcement',
        content: {
          messages: [
            {
              text: L('Handmade in small batches', 'অল্প অল্প করে হাতে তৈরি'),
              href: '/about',
            },
            {
              text: L(
                'Exchange any size within 7 days',
                '৭ দিনের মধ্যে যেকোনো মাপ বদলে নিন'
              ),
              href: '/delivery',
            },
          ],
          rotateSeconds: 6,
        },
      },
      {
        type: 'header',
        content: {
          layout: 'center',
          menu: [
            { label: L('New in', 'নতুন এসেছে'), href: '/products' },
            { label: L('Our story', 'আমাদের গল্প'), href: '/about' },
          ],
          showCategories: true,
        },
      },
      footer(
        L(
          'Considered clothing, made in small batches by people who care about every stitch.',
          'যত্ন নিয়ে অল্প অল্প করে তৈরি পোশাক, প্রতিটি সেলাইয়ে মমতার ছোঁয়া।'
        )
      ),
    ]),
    {
      title: L('Home', 'হোম'),
      slug: 'home',
      isHome: true,
      sections: [
        {
          type: 'slider',
          content: {
            slides: [
              {
                image: '',
                mobileImage: '',
                eyebrow: L('The new collection', 'নতুন কালেকশন'),
                title: L(
                  'Quiet luxury, for every day',
                  'প্রতিদিনের জন্য স্নিগ্ধ আভিজাত্য'
                ),
                subtitle: L(
                  'Soft fabrics, timeless cuts, made to be worn for years.',
                  'নরম কাপড়, চিরন্তন কাটিং — বছরের পর বছর পরার জন্য তৈরি।'
                ),
                buttonText: L('Discover the collection', 'কালেকশনটি দেখুন'),
                buttonHref: '/products',
                align: 'center',
              },
            ],
            height: 'full',
            overlay: 20,
          },
        },
        {
          type: 'categories',
          content: {
            title: L('Shop the collection', 'কালেকশন থেকে কিনুন'),
            style: 'tiles',
            columns: '3',
            limit: 6,
          },
        },
        {
          type: 'products',
          content: {
            title: L('The edit', 'বাছাই করা কালেকশন'),
            source: 'newest',
            limit: 8,
            columns: '4',
            imageRatio: 'portrait',
            showButton: false,
          },
        },
        {
          type: 'richtext',
          content: {
            title: L('Made slowly, worn often', 'ধীরে তৈরি, বারবার পরা'),
            body: L(
              'Each piece is cut and finished by hand in our workshop. We make less, so we can make it better — and so what you buy from us stays in your wardrobe for years, not weeks.',
              'প্রতিটি পোশাক আমাদের ওয়ার্কশপে হাতে কাটা ও সেলাই করা। আমরা কম বানাই, যাতে আরও ভালো বানাতে পারি — আর আমাদের কাছ থেকে কেনা পোশাক যেন আপনার আলমারিতে থাকে বছরের পর বছর, শুধু কয়েক সপ্তাহ নয়।'
            ),
            align: 'center',
          },
          config: {
            paddingTop: 5,
            paddingBottom: 5,
            backgroundVariant: 'muted',
          },
        },
        {
          type: 'promos',
          content: {
            tiles: [
              {
                image: '',
                eyebrow: L('Women', 'মেয়েদের'),
                title: L('Everyday elegance', 'প্রতিদিনের স্নিগ্ধতা'),
                buttonText: L('Shop women', 'মেয়েদের কালেকশন'),
                href: '/products',
                tone: 'light',
              },
              {
                image: '',
                eyebrow: L('Men', 'ছেলেদের'),
                title: L('Tailored essentials', 'মাপমতো প্রয়োজনীয় পোশাক'),
                buttonText: L('Shop men', 'ছেলেদের কালেকশন'),
                href: '/products',
                tone: 'light',
              },
            ],
            height: 'large',
          },
        },
        {
          type: 'products',
          content: {
            title: L('Just in', 'এইমাত্র এসেছে'),
            source: 'newest',
            limit: 10,
            layout: 'carousel',
            imageRatio: 'portrait',
            showButton: false,
          },
        },
      ],
    },
    productPage({
      imageRatio: 'portrait',
      gallery: 'stack',
      highlights: [
        L(
          'Free exchange of size within 7 days',
          '৭ দিনের মধ্যে ফ্রি সাইজ এক্সচেঞ্জ'
        ),
        L(
          'Cash on delivery across Bangladesh',
          'সারা বাংলাদেশে ক্যাশ অন ডেলিভারি'
        ),
        L('Handmade in our own workshop', 'আমাদের নিজস্ব ওয়ার্কশপে হাতে তৈরি'),
      ],
    }),
    catalogPage({ imageRatio: 'portrait', columns: '3' }),
    aboutPage({
      title: L('Made by hand, made to last', 'হাতে তৈরি, টেকে বহুদিন'),
      body: L(
        'Our workshop began with three tailors and one sewing machine. Today we still make every piece the same way — slowly, carefully, and in fabrics we would wear ourselves.',
        'তিনজন দর্জি আর একটি সেলাই মেশিন দিয়ে আমাদের ওয়ার্কশপের যাত্রা শুরু। আজও আমরা প্রতিটি পোশাক একইভাবে বানাই — ধীরে, যত্ন নিয়ে, এমন কাপড়ে যা আমরা নিজেরাও পরি।'
      ),
    }),
    contactPage(),
    deliveryPage(),
  ],
}

const fresh: SiteTemplate = {
  key: 'store-fresh',
  kind: 'STORE',
  name: 'Fresh',
  description:
    'Friendly and green, built for big catalogues and quick repeat orders.',
  bestFor: 'Groceries, food, organic, pharmacy',
  theme: {
    primaryColor: '#2f7d32',
    secondaryColor: '#f5b301',
    backgroundColor: '#ffffff',
    textColor: '#1f2a1f',
    headingFont: 'Poppins',
    bodyFont: 'Nunito',
    bangla: { headingFont: 'Google Sans', bodyFont: 'Google Sans' },
    borderRadius: 'lg',
    headingWeight: '600',
  },
  pages: [
    layoutPage([
      {
        type: 'announcement',
        content: {
          messages: [
            {
              text: L(
                'Order before 2pm for same-day delivery in Dhaka',
                'দুপুর ২টার আগে অর্ডার করলে ঢাকায় একই দিনে ডেলিভারি'
              ),
              href: '',
            },
          ],
          rotateSeconds: 0,
        },
      },
      {
        type: 'header',
        content: {
          menu: [
            { label: L('Home', 'হোম'), href: '/' },
            { label: L('All products', 'সব পণ্য'), href: '/products' },
          ],
          showCategories: true,
          searchPlaceholder: L(
            'Search for rice, oil, fruit…',
            'চাল, তেল, ফল খুঁজুন…'
          ),
        },
      },
      footer(
        L(
          'Fresh groceries and daily essentials, delivered to your door the same day.',
          'তাজা বাজার আর নিত্যপ্রয়োজনীয় পণ্য, একই দিনে আপনার দরজায়।'
        )
      ),
    ]),
    {
      title: L('Home', 'হোম'),
      slug: 'home',
      isHome: true,
      sections: [
        {
          type: 'slider',
          content: {
            slides: [
              {
                image: '',
                mobileImage: '',
                eyebrow: L('Farm to door', 'খামার থেকে আপনার দরজায়'),
                title: L(
                  'Fresh groceries, delivered today',
                  'তাজা বাজার, আজই ডেলিভারি'
                ),
                subtitle: L(
                  'Vegetables, fruit and daily essentials at fair prices.',
                  'শাকসবজি, ফলমূল আর নিত্যপ্রয়োজনীয় পণ্য ন্যায্য দামে।'
                ),
                buttonText: L('Start shopping', 'কেনাকাটা শুরু করুন'),
                buttonHref: '/products',
                align: 'left',
              },
              {
                image: '',
                mobileImage: '',
                eyebrow: L('Weekly saver', 'সাপ্তাহিক সাশ্রয়'),
                title: L(
                  'Save on your monthly bazar',
                  'মাসের বাজারে সাশ্রয় করুন'
                ),
                subtitle: L(
                  'Big packs, small prices — cash on delivery.',
                  'বড় প্যাক, কম দাম — ক্যাশ অন ডেলিভারি।'
                ),
                buttonText: L('See the deals', 'অফারগুলো দেখুন'),
                buttonHref: '/products',
                align: 'left',
              },
            ],
            height: 'medium',
          },
        },
        {
          type: 'categories',
          content: {
            title: L('Shop by aisle', 'ধরন অনুযায়ী কিনুন'),
            style: 'cards',
            columns: '6',
            limit: 12,
          },
        },
        {
          type: 'products',
          content: {
            title: L('Fresh this week', 'এই সপ্তাহের তাজা পণ্য'),
            source: 'newest',
            limit: 10,
            columns: '5',
            imageRatio: 'square',
          },
        },
        {
          type: 'promos',
          content: {
            tiles: [
              {
                image: '',
                eyebrow: L('Fruits', 'ফলমূল'),
                title: L('Sweet & seasonal', 'মিষ্টি ও মৌসুমি'),
                buttonText: L('Shop fruit', 'ফল কিনুন'),
                href: '/products',
                tone: 'light',
              },
              {
                image: '',
                eyebrow: L('Vegetables', 'শাকসবজি'),
                title: L('Picked this morning', 'আজ সকালেই তোলা'),
                buttonText: L('Shop veg', 'সবজি কিনুন'),
                href: '/products',
                tone: 'light',
              },
              {
                image: '',
                eyebrow: L('Pantry', 'মুদি পণ্য'),
                title: L('Stock up & save', 'একসাথে কিনুন, সাশ্রয় করুন'),
                buttonText: L('Shop pantry', 'মুদি পণ্য কিনুন'),
                href: '/products',
                tone: 'dark',
              },
            ],
            height: 'small',
          },
        },
        {
          type: 'products',
          content: {
            title: L('Daily essentials', 'নিত্যপ্রয়োজনীয় পণ্য'),
            source: 'newest',
            limit: 10,
            layout: 'carousel',
            columns: '5',
            imageRatio: 'square',
          },
        },
        {
          type: 'features',
          content: {
            title: L(
              'Why families order from us',
              'পরিবারগুলো কেন আমাদের থেকে অর্ডার করে'
            ),
            layout: 'grid',
            items: [
              {
                title: L('Same-day delivery', 'একই দিনে ডেলিভারি'),
                text: L(
                  'Order by 2pm and get it today in Dhaka.',
                  'দুপুর ২টার মধ্যে অর্ডার করুন, ঢাকায় আজই পেয়ে যান।'
                ),
              },
              {
                title: L('Always fresh', 'সবসময় তাজা'),
                text: L(
                  'Fruit and vegetables bought fresh every morning.',
                  'ফল আর সবজি প্রতিদিন সকালে তাজা কেনা হয়।'
                ),
              },
              {
                title: L('Pay on delivery', 'ডেলিভারিতে পেমেন্ট'),
                text: L(
                  'Check your bag, then pay — no advance needed.',
                  'ব্যাগ দেখে নিন, তারপর টাকা দিন — কোনো অগ্রিম লাগবে না।'
                ),
              },
            ],
          },
        },
      ],
    },
    productPage({
      imageRatio: 'square',
      highlights: [
        L('Same-day delivery inside Dhaka', 'ঢাকার ভেতরে একই দিনে ডেলিভারি'),
        L('Pay in cash when it arrives', 'হাতে পেয়ে নগদ টাকা দিন'),
        L(
          'Not fresh? We replace it, no questions',
          'তাজা না হলে কোনো প্রশ্ন ছাড়াই বদলে দেব'
        ),
      ],
    }),
    catalogPage({ imageRatio: 'square', columns: '5' }),
    aboutPage({
      title: L('Fresh food, fair prices', 'তাজা খাবার, ন্যায্য দাম'),
      body: L(
        'We buy directly from farmers and trusted suppliers every morning, so what reaches your kitchen is fresher — and costs less — than the bazar.',
        'আমরা প্রতিদিন সকালে সরাসরি কৃষক আর বিশ্বস্ত সরবরাহকারীদের কাছ থেকে কিনি, তাই আপনার রান্নাঘরে যা পৌঁছায় তা বাজারের চেয়ে বেশি তাজা — আর দামেও কম।'
      ),
    }),
    contactPage(),
    deliveryPage(),
  ],
}

const volt: SiteTemplate = {
  key: 'store-volt',
  kind: 'STORE',
  name: 'Volt',
  description: 'Dark, bold and techy, with a flash-sale timer up front.',
  bestFor: 'Gadgets, electronics, accessories',
  theme: {
    primaryColor: '#4f8cff',
    secondaryColor: '#22d3a6',
    backgroundColor: '#0d1015',
    textColor: '#e8ebf1',
    headingFont: 'Space Grotesk',
    bodyFont: 'Inter',
    bangla: { headingFont: 'Google Sans', bodyFont: 'Google Sans' },
    borderRadius: 'md',
    headingWeight: '700',
  },
  pages: [
    layoutPage([
      {
        type: 'announcement',
        content: {
          messages: [
            {
              text: L(
                'Official warranty on every gadget',
                'প্রতিটি গ্যাজেটে অফিসিয়াল ওয়ারেন্টি'
              ),
              href: '',
            },
            {
              text: L(
                '7-day replacement guarantee',
                '৭ দিনের রিপ্লেসমেন্ট গ্যারান্টি'
              ),
              href: '/delivery',
            },
          ],
          rotateSeconds: 5,
        },
      },
      {
        type: 'header',
        content: {
          menu: [
            { label: L('Home', 'হোম'), href: '/' },
            { label: L('All gadgets', 'সব গ্যাজেট'), href: '/products' },
            { label: L('Support', 'সাপোর্ট'), href: '/contact' },
          ],
          showCategories: true,
          searchPlaceholder: L(
            'Search phones, earbuds, watches…',
            'ফোন, ইয়ারবাড, ঘড়ি খুঁজুন…'
          ),
        },
      },
      footer(
        L(
          'Genuine gadgets with official warranty, delivered fast across Bangladesh.',
          'অফিসিয়াল ওয়ারেন্টিসহ আসল গ্যাজেট, দ্রুত ডেলিভারি সারা বাংলাদেশে।'
        )
      ),
    ]),
    {
      title: L('Home', 'হোম'),
      slug: 'home',
      isHome: true,
      sections: [
        {
          type: 'slider',
          content: {
            slides: [
              {
                image: '',
                mobileImage: '',
                eyebrow: L('Just launched', 'সদ্য লঞ্চ হয়েছে'),
                title: L(
                  'The latest tech, at the best price',
                  'সর্বশেষ প্রযুক্তি, সেরা দামে'
                ),
                subtitle: L(
                  '100% genuine, with official warranty and cash on delivery.',
                  '১০০% আসল, অফিসিয়াল ওয়ারেন্টি আর ক্যাশ অন ডেলিভারিসহ।'
                ),
                buttonText: L('Shop gadgets', 'গ্যাজেট কিনুন'),
                buttonHref: '/products',
                align: 'left',
              },
              {
                image: '',
                mobileImage: '',
                eyebrow: L('Mega deals', 'মেগা অফার'),
                title: L('Earbuds from ৳990', 'ইয়ারবাড মাত্র ৳৯৯০ থেকে'),
                subtitle: L(
                  'Limited stock — grab yours before it is gone.',
                  'স্টক সীমিত — শেষ হওয়ার আগেই নিয়ে নিন।'
                ),
                buttonText: L('See the deals', 'অফারগুলো দেখুন'),
                buttonHref: '/products',
                align: 'left',
              },
            ],
            height: 'large',
            overlay: 40,
          },
        },
        {
          type: 'countdown',
          content: {
            title: L('Flash sale ends in', 'ফ্ল্যাশ সেল শেষ হতে বাকি'),
            subtitle: L(
              'Prices go back up when the timer hits zero.',
              'সময় শেষ হলেই দাম আবার বেড়ে যাবে।'
            ),
            mode: 'evergreen',
            durationMinutes: 480,
            style: 'boxes',
            size: 'medium',
          },
        },
        {
          type: 'products',
          content: {
            title: L('Flash deals', 'ফ্ল্যাশ অফার'),
            source: 'newest',
            limit: 8,
            columns: '4',
            imageRatio: 'square',
          },
        },
        {
          type: 'categories',
          content: {
            title: L('Browse by category', 'ক্যাটাগরি অনুযায়ী দেখুন'),
            style: 'circles',
            columns: '6',
          },
        },
        {
          type: 'promos',
          content: {
            tiles: [
              {
                image: '',
                eyebrow: L('Audio', 'অডিও'),
                title: L('Sound that moves you', 'মন ছুঁয়ে যাওয়া সাউন্ড'),
                buttonText: L('Shop audio', 'অডিও কিনুন'),
                href: '/products',
                tone: 'light',
              },
              {
                image: '',
                eyebrow: L('Wearables', 'স্মার্ট ঘড়ি ও ব্যান্ড'),
                title: L(
                  'Smart on your wrist',
                  'আপনার কব্জিতে স্মার্ট প্রযুক্তি'
                ),
                buttonText: L('Shop watches', 'ঘড়ি কিনুন'),
                href: '/products',
                tone: 'light',
              },
            ],
          },
        },
        {
          type: 'products',
          content: {
            title: L('Trending now', 'এখন জনপ্রিয়'),
            source: 'newest',
            limit: 10,
            layout: 'carousel',
            imageRatio: 'square',
          },
        },
        {
          type: 'trust',
          content: {
            items: [
              { text: L('Official warranty', 'অফিসিয়াল ওয়ারেন্টি') },
              { text: L('100% genuine', '১০০% আসল') },
              { text: L('7-day replacement', '৭ দিনে রিপ্লেসমেন্ট') },
              { text: L('Cash on delivery', 'ক্যাশ অন ডেলিভারি') },
            ],
          },
        },
      ],
    },
    productPage({
      imageRatio: 'square',
      gallery: 'side',
      highlights: [
        L('Official warranty included', 'অফিসিয়াল ওয়ারেন্টিসহ'),
        L(
          '7-day replacement if anything is wrong',
          'কোনো সমস্যা হলে ৭ দিনে রিপ্লেসমেন্ট'
        ),
        L(
          'Cash on delivery across Bangladesh',
          'সারা বাংলাদেশে ক্যাশ অন ডেলিভারি'
        ),
      ],
    }),
    catalogPage({ imageRatio: 'square', columns: '4' }),
    aboutPage({
      title: L('Genuine gadgets, honest prices', 'আসল গ্যাজেট, সৎ দাম'),
      body: L(
        'We only sell original products from authorised importers, with the official warranty — so the gadget you unbox is the real thing, backed by people you can call.',
        'আমরা শুধু অনুমোদিত আমদানিকারকদের আসল পণ্য বিক্রি করি, অফিসিয়াল ওয়ারেন্টিসহ — তাই আপনি যে গ্যাজেটটি খুলবেন তা একদম আসল, আর পাশে আছি আমরা, যাদের যেকোনো সময় কল করতে পারবেন।'
      ),
    }),
    contactPage(),
    deliveryPage(),
  ],
}

export const STORE_TEMPLATES: SiteTemplate[] = [
  essentials,
  boutique,
  fresh,
  volt,
]
