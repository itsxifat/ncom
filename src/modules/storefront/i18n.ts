import type { PageTheme } from '@/modules/sections/types'
import {
  localizeDigits,
  siteLanguage,
  siteNumerals,
  type SiteLanguage,
  type SiteNumerals,
} from '@/modules/sections/language'
import { formatShelfPrice } from '@/modules/sections/storefront'
import type { OfferQuoteIssue } from '@/lib/offers/pricing'

/**
 * Every word NCOM itself puts on a storefront, in each of a site's languages.
 *
 * Not the merchant's words — a headline, a button a block lets them retype,
 * a product's name are whatever they wrote. These are the ones nobody types:
 * the cart drawer's "Subtotal", the checkout's field labels, "Sold out", the
 * errors a shopper meets when a code does not apply. A Bangla shop whose
 * checkout suddenly speaks English is the moment a first-time buyer decides it
 * is not a real shop, so every one of them exists in both.
 *
 * Each language is a function of the number formatter, so a sentence with a
 * count in it ("৩টি পণ্য") gets its digits the way the site writes them
 * without every caller having to remember. `StoreWords` is the English shape,
 * which makes a word missing from the Bangla dictionary a type error rather
 * than an English word on a Bangla page.
 *
 * The Bangla is written the way Bangladeshi shops actually say it — "কার্টে
 * যোগ করুন", "ক্যাশ অন ডেলিভারি", "স্টক নেই" — rather than translated word for
 * word, because a stilted translation reads as a scam just as surely as the
 * wrong language does.
 */

type Num = (value: number | string) => string

function english(num: Num) {
  const list = (values: number[]) =>
    values.length <= 1
      ? num(values[0] ?? '')
      : `${values.slice(0, -1).map(num).join(', ')} or ${num(values[values.length - 1]!)}`
  return {
    // ── Cart ─────────────────────────────────────────────────────────────
    yourCart: 'Your cart',
    cartWithCount: (count: number) =>
      count > 0 ? `Your cart (${num(count)})` : 'Your cart',
    closeCart: 'Close cart',
    loadingCart: 'Loading your cart…',
    cartEmpty: 'Your cart is empty',
    cartEmptyHint: 'Everything you add will wait for you here.',
    continueShopping: 'Continue shopping',
    startShopping: 'Start shopping',
    noLongerAvailable: 'No longer available',
    noLongerAvailableRemove: 'No longer available — remove it to check out',
    remove: 'Remove',
    discount: 'Discount',
    discountWithCode: (code: string) => `Discount (${code})`,
    subtotal: 'Subtotal',
    total: 'Total',
    deliveryAddedAtCheckout: 'Delivery is added at checkout.',
    checkout: 'Checkout',
    viewCart: 'View cart',
    each: (price: string) => `${price} each`,
    summary: 'Summary',
    discountCode: 'Discount code',
    apply: 'Apply',
    decreaseQuantity: 'Decrease quantity',
    increaseQuantity: 'Increase quantity',
    cartIcon: (count: number) =>
      `Cart, ${num(count)} item${count === 1 ? '' : 's'}`,

    // ── Checkout ─────────────────────────────────────────────────────────
    yourDetails: 'Your details',
    fullName: 'Full name',
    mobileNumber: 'Mobile number',
    mobileNumberHint: 'We’ll call to confirm your order.',
    emailOptional: 'Email (optional)',
    deliveryAddress: 'Delivery address',
    fullAddress: 'Full address',
    fullAddressHint: 'House, road, area',
    cityDistrict: 'City / district',
    cityPlaceholder: 'Dhaka',
    country: 'Country',
    noteForShop: 'Note for the shop (optional)',
    notePlaceholder: 'Landmark, best time to call…',
    delivery: 'Delivery',
    deliveryVia: (method: string) => `Delivery (${method})`,
    free: 'Free',
    // The names a new workspace's delivery rate and payment method are created
    // with — see `builtInName`.
    standardShipping: 'Standard shipping',
    cashOnDelivery: 'Cash on delivery',
    payment: 'Payment',
    noPaymentMethods:
      'This shop has not set up a way to pay yet. Please check back soon.',
    orderSummary: 'Order summary',
    tax: 'Tax',
    noDeliveryToCountry: 'This shop does not deliver to that country yet.',
    placingOrder: 'Placing your order…',
    placeOrder: 'Place order',
    placeOrderFor: (total: string) => `Place order · ${total}`,
    backToCart: '← Back to the cart',

    // ── Thank you ────────────────────────────────────────────────────────
    thankYouTitle: 'Thank you for your order',
    thankYou: (name: string | null) =>
      name ? `Thank you, ${name}!` : 'Thank you!',
    orderPlacedCall: (orderNumber: string, phone: string | null) =>
      `Your order ${orderNumber} is placed. We’ll call ${phone ?? 'you'} to confirm it before it ships.`,
    orderPlaced: 'Your order is placed. We’ll be in touch to confirm it.',
    quantityShort: (quantity: number) => `Qty ${num(quantity)}`,
    totalToPay: 'Total to pay',
    deliveringTo: (address: string) => `Delivering to ${address}`,

    // ── Account ──────────────────────────────────────────────────────────
    yourAccount: 'Your account',
    hello: (name: string) => `Hello, ${name}`,
    yourOrders: 'Your orders',
    noOrdersYet: 'You have not ordered anything yet.',
    itemCount: (count: number) => `${num(count)} item${count === 1 ? '' : 's'}`,
    track: 'Track',
    signIn: 'Sign in',
    signInSubtitle: 'See your orders and check out faster.',
    email: 'Email',
    password: 'Password',
    newHere: 'New here?',
    createAnAccount: 'Create an account',
    createYourAccount: 'Create your account',
    createAccountSubtitle: 'Keep track of your orders in one place.',
    mobileOptional: 'Mobile number (optional)',
    passwordHint: 'At least 8 characters.',
    createAccount: 'Create account',
    alreadyHaveAccount: 'Already have an account?',
    signOut: 'Sign out',
    orderStatus: {
      PENDING: 'Order placed',
      FRAUD_REVIEW: 'Order placed',
      PROCESSING: 'Being packed',
      DISPATCHED: 'Sent to courier',
      IN_TRANSIT: 'On the way',
      OUT_FOR_DELIVERY: 'Out for delivery',
      DELIVERED: 'Delivered',
      PARTIALLY_DELIVERED: 'Partly delivered',
      RETURNED: 'Returned',
      CANCELLED: 'Cancelled',
      FAILED: 'Delivery failed',
    } as Record<string, string>,

    // ── Products & listings ──────────────────────────────────────────────
    from: 'From',
    noPhoto: 'No photo',
    addToCart: 'Add to cart',
    chooseOptions: 'Choose options',
    soldOut: 'Sold out',
    sale: 'Sale',
    productsBackSoon: 'Products will be back in a moment.',
    ourProductsBackSoon: 'Our products will be back in a moment.',
    allProducts: 'All products',
    search: 'Search',
    searchResults: (query: string) => `Results for “${query}”`,
    searchProducts: 'Search products',
    closeSearch: 'Close search',
    seeAllProducts: 'See all products',
    narrowDown: 'Narrow down',
    pages: 'Pages',
    sortBy: 'Sort by',
    sort: {
      featured: 'Featured',
      newest: 'Newest',
      'price-asc': 'Price: low to high',
      'price-desc': 'Price: high to low',
      name: 'Name: A to Z',
    } as Record<string, string>,
    previousPhoto: 'Previous photo',
    nextPhoto: 'Next photo',
    photoNumber: (index: number) => `Photo ${num(index)}`,
    selectOption: (name: string) => `Choose ${name.toLowerCase()}`,
    chooseOptionsFirst: 'Choose your options first',
    quantity: 'Quantity',

    // ── Header, menu, sliders ────────────────────────────────────────────
    mainMenu: 'Main',
    menu: 'Menu',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    featured: 'Featured',
    previousSlide: 'Previous slide',
    nextSlide: 'Next slide',
    slideOf: (index: number, count: number) => `${num(index)} of ${num(count)}`,
    goToSlide: (index: number) => `Go to slide ${num(index)}`,
    copyright: (year: number, name: string) => `© ${num(year)} ${name}`,
    timeUnits: { days: 'Days', hours: 'Hours', mins: 'Mins', secs: 'Secs' },
    offerEnded: 'This offer has ended.',

    // ── Order form (landing pages) ───────────────────────────────────────
    couldNotPlaceOrder: 'Could not place the order.',
    couldNotReachStore: 'Could not reach the store. Please try again.',
    orderingUnavailable:
      'Ordering is unavailable for a moment. Please try again shortly.',
    offerSaving: 'Offer saving',
    freeDeliveryAmountMore: (amount: string) =>
      `Add ${amount} more for FREE delivery`,
    freeDeliveryItemsMore: (count: number) =>
      `Add ${num(count)} more item${count === 1 ? '' : 's'} for FREE delivery`,
    discountAmountMore: (amount: string, label: string) =>
      `Add ${amount} more — ${label}`,
    discountItemsMore: (count: number, label: string) =>
      `Add ${num(count)} more item${count === 1 ? '' : 's'} — ${label}`,
    placingYourOrder: 'Placing your order…',
    notInOffer: (title: string, price: string) =>
      `${title} is not part of this offer — it is sold at its regular price, ${price}.`,
    offerAppliesOnly: (included: string, excluded: string, many: boolean) =>
      `Offer applies to ${included} only. ${excluded} ${many ? 'are' : 'is'} sold at the regular price.`,
    sizesOutsideOffer:
      'These sizes are outside this offer — they are sold at their regular price.',
    outOfStock: 'Out of stock',
    selectAnOption: 'Select an option',
    crossedOutOfStock: 'Crossed-out options are out of stock.',
    pickOrMore: (min: number) =>
      `Pick ${num(min)} or more — price drops as you add`,
    pickAny: (range: string) => `Pick any ${range} — price drops as you add`,
    percentOff: (percent: number) => `${num(percent)}% off`,
    amountOff: (amount: string) => `${amount} off`,
    spendRule: (condition: string, reward: string) =>
      `Spend ${condition} — ${reward}`,
    itemsOrMore: (count: number) => `${num(count)}+ items`,
    amountOrMore: (amount: string) => `${amount}+`,
    pickWhatYouWant: 'Pick what you want',
    itemsRange: (range: string) => ` (${range} items)`,
    addToSeePrice: (min: number) => `Add ${num(min)} or more to see your price`,
    atRegularPrice: (count: number) => ` · ${num(count)} at the regular price`,
    addMore: (count: number) => ` — add ${num(count)} more`,
    fromLower: 'from',
    freeGift: (title: string) => `Free ${title}`,
    variantOutOfStock: (title: string) => `${title} — out of stock`,
    variantNotInOffer: (title: string) =>
      `${title} — not in this offer, regular price`,
    notInThisOffer: 'not in this offer',
    noOffer: 'no offer',
    piecesShort: (count: number) => `${num(count)} pcs`,
    includesOutsideOffer: (amount: string) =>
      `Includes ${amount} of sizes that are not in this offer, at their regular price.`,
    freeTag: 'FREE',
    maxSelected: (count: number) => `Maximum ${num(count)} items selected`,
    countInOffer: (count: number) => `${num(count)} in this offer`,
    countSelected: (count: number) => `${num(count)} selected`,
    quoteIssue: (issue: OfferQuoteIssue): string => {
      const items = (n: number) => `${num(n)} item${n === 1 ? '' : 's'}`
      switch (issue.code) {
        case 'item-sold-out':
          return `${issue.title} is out of stock.`
        case 'all-sold-out':
          return 'Everything in this offer is out of stock right now.'
        case 'choose-options':
          return 'Please choose an option for each item.'
        case 'choose-items':
          return 'Please choose at least one item.'
        case 'item-unavailable':
          return 'One of the chosen items is unavailable.'
        case 'too-few':
          return `Please choose at least ${items(issue.min)}${issue.scoped ? ' from this offer' : ''}.`
        case 'too-many':
          return `You can order up to ${items(issue.max)}${issue.scoped ? ' from this offer' : ''}.`
        case 'sets-only':
          return `This offer is sold in sets of ${list(issue.quantities)} — you have ${num(issue.have)}${issue.scoped ? ' in it' : ''}.`
        case 'no-price':
          return 'No price is set for that many items.'
      }
    },
    selectSizeFirst: 'Please select a size first',
    selectSize: 'Select a size',
    removeOne: 'Remove one',
    addOne: 'Add one',
    and: 'and',
    upTo: (max: number) => `up to ${num(max)}`,
    between: (min: number, max: number) => `${num(min)}–${num(max)}`,

    // ── Errors from the shop ─────────────────────────────────────────────
    errors: {
      noStore: 'This shop is not taking orders right now.',
      tooManyRequests: 'Too many requests — please slow down.',
      tooManyAttempts: 'Too many attempts — try again shortly.',
      tooManyAttemptsWait: 'Too many attempts — please wait a moment.',
      tooManyAttemptsLater: 'Too many attempts — try again later.',
      tooManyAttemptsMinutes: 'Too many attempts — try again in a few minutes.',
      invalid: 'Please check your details.',
      couldNotAdd: 'Could not add that to your cart',
      cartExpired: 'Your cart has expired.',
      cartExpiredAddAgain:
        'Your cart has expired. Please add your items again.',
      couldNotUpdate: 'Could not update your cart',
      addSomethingFirst: 'Add something to your cart first.',
      enterCode: 'Enter a code.',
      codeNotValid: 'That code is not valid',
      codeMinimumSpend: 'Your cart is below the minimum spend for this code.',
      codeMinimumItems: 'Add more items to your cart to use this code.',
      codeNoEligibleItems: 'This code does not apply to anything in your cart.',
      couldNotRemoveCode: 'Could not remove the code',
      enterName: 'Enter your name',
      enterPhone: 'Enter your phone number',
      phoneTooLong: 'That phone number is too long',
      phoneDigits: 'Enter a phone number with digits only',
      validEmail: 'Enter a valid email address',
      enterAddress: 'Enter your full address',
      enterCity: 'Enter your city or district',
      elevenDigitMobile: 'Enter an 11-digit mobile number, like 01712 345678.',
      choosePayment: 'Choose how you would like to pay.',
      couldNotPlace: 'We could not place your order. Please try again.',
      // The merchant's own order-form questions, named in their own words.
      answerQuestion: (question: string) => `Please answer “${question}”.`,
      chooseAnAnswer: (question: string) =>
        `Please choose one of the answers to “${question}”.`,
      accountsUnavailable: 'Accounts are not available on this shop.',
      checkDetails: 'Check your details',
      couldNotCreateAccount: 'Could not create your account',
      passwordLength: 'Use at least 8 characters',
      enterEmail: 'Enter your email address',
      enterPassword: 'Enter your password',
      wrongLogin: 'That email and password do not match an account here.',
    },
  }
}

export type StoreWords = ReturnType<typeof english>

function bangla(num: Num): StoreWords {
  const list = (values: number[]) =>
    values.length <= 1
      ? num(values[0] ?? '')
      : `${values.slice(0, -1).map(num).join(', ')} অথবা ${num(values[values.length - 1]!)}`
  return {
    // ── Cart ─────────────────────────────────────────────────────────────
    yourCart: 'আপনার কার্ট',
    cartWithCount: (count) =>
      count > 0 ? `আপনার কার্ট (${num(count)})` : 'আপনার কার্ট',
    closeCart: 'কার্ট বন্ধ করুন',
    loadingCart: 'কার্ট লোড হচ্ছে…',
    cartEmpty: 'আপনার কার্ট খালি',
    cartEmptyHint: 'যা যোগ করবেন, সব এখানে জমা থাকবে।',
    continueShopping: 'কেনাকাটা চালিয়ে যান',
    startShopping: 'কেনাকাটা শুরু করুন',
    noLongerAvailable: 'এটি আর পাওয়া যাচ্ছে না',
    noLongerAvailableRemove:
      'এটি আর পাওয়া যাচ্ছে না — অর্ডার করতে কার্ট থেকে সরিয়ে দিন',
    remove: 'সরিয়ে দিন',
    discount: 'ছাড়',
    discountWithCode: (code) => `ছাড় (${code})`,
    subtotal: 'সাবটোটাল',
    total: 'মোট',
    deliveryAddedAtCheckout: 'ডেলিভারি চার্জ চেকআউটে যোগ হবে।',
    checkout: 'চেকআউট',
    viewCart: 'কার্ট দেখুন',
    each: (price) => `প্রতিটি ${price}`,
    summary: 'হিসাব',
    discountCode: 'ডিসকাউন্ট কোড',
    apply: 'প্রয়োগ করুন',
    decreaseQuantity: 'পরিমাণ কমান',
    increaseQuantity: 'পরিমাণ বাড়ান',
    cartIcon: (count) => `কার্ট, ${num(count)}টি পণ্য`,

    // ── Checkout ─────────────────────────────────────────────────────────
    yourDetails: 'আপনার তথ্য',
    fullName: 'পুরো নাম',
    mobileNumber: 'মোবাইল নম্বর',
    mobileNumberHint: 'অর্ডার নিশ্চিত করতে আমরা আপনাকে কল করব।',
    emailOptional: 'ইমেইল (ঐচ্ছিক)',
    deliveryAddress: 'ডেলিভারির ঠিকানা',
    fullAddress: 'পুরো ঠিকানা',
    fullAddressHint: 'বাসা, রোড, এলাকা',
    cityDistrict: 'শহর / জেলা',
    cityPlaceholder: 'ঢাকা',
    country: 'দেশ',
    noteForShop: 'দোকানের জন্য নোট (ঐচ্ছিক)',
    notePlaceholder: 'কাছের পরিচিত জায়গা, কখন কল করলে সুবিধা…',
    delivery: 'ডেলিভারি',
    deliveryVia: (method) => `ডেলিভারি (${method})`,
    free: 'ফ্রি',
    standardShipping: 'স্ট্যান্ডার্ড ডেলিভারি',
    cashOnDelivery: 'ক্যাশ অন ডেলিভারি',
    payment: 'পেমেন্ট',
    noPaymentMethods:
      'এই দোকানে এখনো পেমেন্টের কোনো উপায় চালু করা হয়নি। একটু পরে আবার দেখুন।',
    orderSummary: 'অর্ডারের হিসাব',
    tax: 'ট্যাক্স',
    noDeliveryToCountry: 'এই দোকান এখনো ওই দেশে ডেলিভারি দেয় না।',
    placingOrder: 'অর্ডার করা হচ্ছে…',
    placeOrder: 'অর্ডার করুন',
    placeOrderFor: (total) => `অর্ডার করুন · ${total}`,
    backToCart: '← কার্টে ফিরে যান',

    // ── Thank you ────────────────────────────────────────────────────────
    thankYouTitle: 'অর্ডারের জন্য ধন্যবাদ',
    thankYou: (name) => (name ? `ধন্যবাদ, ${name}!` : 'ধন্যবাদ!'),
    orderPlacedCall: (orderNumber, phone) =>
      `আপনার অর্ডার ${orderNumber} সম্পন্ন হয়েছে। পাঠানোর আগে নিশ্চিত করতে আমরা ${phone ?? 'আপনাকে'} নম্বরে কল করব।`,
    orderPlaced:
      'আপনার অর্ডার সম্পন্ন হয়েছে। নিশ্চিত করতে আমরা শীঘ্রই যোগাযোগ করব।',
    quantityShort: (quantity) => `পরিমাণ ${num(quantity)}`,
    totalToPay: 'মোট পরিশোধ করতে হবে',
    deliveringTo: (address) => `ডেলিভারি যাবে: ${address}`,

    // ── Account ──────────────────────────────────────────────────────────
    yourAccount: 'আমার অ্যাকাউন্ট',
    hello: (name) => `হ্যালো, ${name}`,
    yourOrders: 'আমার অর্ডারসমূহ',
    noOrdersYet: 'আপনি এখনো কোনো অর্ডার করেননি।',
    itemCount: (count) => `${num(count)}টি পণ্য`,
    track: 'ট্র্যাক করুন',
    signIn: 'সাইন ইন',
    signInSubtitle: 'অর্ডার দেখুন, আরও দ্রুত চেকআউট করুন।',
    email: 'ইমেইল',
    password: 'পাসওয়ার্ড',
    newHere: 'নতুন?',
    createAnAccount: 'অ্যাকাউন্ট খুলুন',
    createYourAccount: 'আপনার অ্যাকাউন্ট খুলুন',
    createAccountSubtitle: 'আপনার সব অর্ডারের খোঁজ এক জায়গায়।',
    mobileOptional: 'মোবাইল নম্বর (ঐচ্ছিক)',
    passwordHint: 'কমপক্ষে ৮টি অক্ষর।',
    createAccount: 'অ্যাকাউন্ট খুলুন',
    alreadyHaveAccount: 'আগেই অ্যাকাউন্ট আছে?',
    signOut: 'সাইন আউট',
    orderStatus: {
      PENDING: 'অর্ডার নেওয়া হয়েছে',
      FRAUD_REVIEW: 'অর্ডার নেওয়া হয়েছে',
      PROCESSING: 'প্যাক করা হচ্ছে',
      DISPATCHED: 'কুরিয়ারে দেওয়া হয়েছে',
      IN_TRANSIT: 'পথে আছে',
      OUT_FOR_DELIVERY: 'ডেলিভারির জন্য বের হয়েছে',
      DELIVERED: 'ডেলিভারি হয়েছে',
      PARTIALLY_DELIVERED: 'আংশিক ডেলিভারি হয়েছে',
      RETURNED: 'ফেরত এসেছে',
      CANCELLED: 'বাতিল হয়েছে',
      FAILED: 'ডেলিভারি হয়নি',
    },

    // ── Products & listings ──────────────────────────────────────────────
    from: 'শুরু',
    noPhoto: 'ছবি নেই',
    addToCart: 'কার্টে যোগ করুন',
    chooseOptions: 'অপশন বেছে নিন',
    soldOut: 'স্টক নেই',
    sale: 'অফার',
    productsBackSoon: 'পণ্যগুলো একটু পরেই ফিরে আসবে।',
    ourProductsBackSoon: 'আমাদের পণ্যগুলো একটু পরেই ফিরে আসবে।',
    allProducts: 'সব পণ্য',
    search: 'খুঁজুন',
    searchResults: (query) => `“${query}” খোঁজার ফলাফল`,
    searchProducts: 'পণ্য খুঁজুন',
    closeSearch: 'খোঁজা বন্ধ করুন',
    seeAllProducts: 'সব পণ্য দেখুন',
    narrowDown: 'আরও বাছাই করুন',
    pages: 'পাতা',
    sortBy: 'সাজান',
    sort: {
      featured: 'বাছাই করা',
      newest: 'নতুন আগে',
      'price-asc': 'দাম: কম থেকে বেশি',
      'price-desc': 'দাম: বেশি থেকে কম',
      name: 'নাম অনুযায়ী (A–Z)',
    },
    previousPhoto: 'আগের ছবি',
    nextPhoto: 'পরের ছবি',
    photoNumber: (index) => `ছবি ${num(index)}`,
    selectOption: (name) => `${name} বেছে নিন`,
    chooseOptionsFirst: 'আগে আপনার পছন্দ বেছে নিন',
    quantity: 'পরিমাণ',

    // ── Header, menu, sliders ────────────────────────────────────────────
    mainMenu: 'মূল মেনু',
    menu: 'মেনু',
    openMenu: 'মেনু খুলুন',
    closeMenu: 'মেনু বন্ধ করুন',
    featured: 'বিশেষ',
    previousSlide: 'আগের স্লাইড',
    nextSlide: 'পরের স্লাইড',
    slideOf: (index, count) => `${num(count)}টির মধ্যে ${num(index)}`,
    goToSlide: (index) => `${num(index)} নম্বর স্লাইডে যান`,
    copyright: (year, name) => `© ${num(year)} ${name}`,
    timeUnits: { days: 'দিন', hours: 'ঘণ্টা', mins: 'মিনিট', secs: 'সেকেন্ড' },
    offerEnded: 'অফারটি শেষ হয়ে গেছে।',

    // ── Order form (landing pages) ───────────────────────────────────────
    couldNotPlaceOrder: 'অর্ডারটি করা যায়নি।',
    couldNotReachStore: 'দোকানের সাথে যোগাযোগ করা যাচ্ছে না। আবার চেষ্টা করুন।',
    orderingUnavailable:
      'এই মুহূর্তে অর্ডার নেওয়া যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।',
    offerSaving: 'অফারে সাশ্রয়',
    freeDeliveryAmountMore: (amount) =>
      `আর ${amount} এর কেনাকাটায় ডেলিভারি ফ্রি`,
    freeDeliveryItemsMore: (count) =>
      `আর ${num(count)}টি পণ্য যোগ করলেই ডেলিভারি ফ্রি`,
    discountAmountMore: (amount, label) =>
      `আর ${amount} এর কেনাকাটায় — ${label}`,
    discountItemsMore: (count, label) =>
      `আর ${num(count)}টি পণ্য যোগ করুন — ${label}`,
    placingYourOrder: 'অর্ডার করা হচ্ছে…',
    notInOffer: (title, price) =>
      `${title} এই অফারের অংশ নয় — এটি নিয়মিত দামে বিক্রি হয়, ${price}।`,
    offerAppliesOnly: (included, excluded) =>
      `অফারটি শুধু ${included} এর জন্য। ${excluded} নিয়মিত দামে বিক্রি হয়।`,
    sizesOutsideOffer: 'এই সাইজগুলো অফারের বাইরে — নিয়মিত দামে বিক্রি হয়।',
    outOfStock: 'স্টক নেই',
    selectAnOption: 'একটি বেছে নিন',
    crossedOutOfStock: 'কাটা চিহ্ন দেওয়া অপশনগুলোর স্টক নেই।',
    pickOrMore: (min) =>
      `${num(min)}টি বা তার বেশি বেছে নিন — যত বেশি, তত কম দাম`,
    pickAny: (range) => `যেকোনো ${range}টি বেছে নিন — যত বেশি, তত কম দাম`,
    percentOff: (percent) => `${num(percent)}% ছাড়`,
    amountOff: (amount) => `${amount} ছাড়`,
    spendRule: (condition, reward) => `${condition} কিনলে ${reward}`,
    itemsOrMore: (count) => `${num(count)}টি বা বেশি পণ্য`,
    amountOrMore: (amount) => `${amount} বা বেশি`,
    pickWhatYouWant: 'আপনার পছন্দ বেছে নিন',
    itemsRange: (range) => ` (${range}টি)`,
    addToSeePrice: (min) => `দাম দেখতে ${num(min)}টি বা তার বেশি যোগ করুন`,
    atRegularPrice: (count) => ` · ${num(count)}টি নিয়মিত দামে`,
    addMore: (count) => ` — আর ${num(count)}টি যোগ করুন`,
    fromLower: 'শুরু',
    freeGift: (title) => `${title} ফ্রি`,
    variantOutOfStock: (title) => `${title} — স্টক নেই`,
    variantNotInOffer: (title) => `${title} — অফারের বাইরে, নিয়মিত দাম`,
    notInThisOffer: 'অফারের বাইরে',
    noOffer: 'অফার নেই',
    piecesShort: (count) => `${num(count)}টি`,
    includesOutsideOffer: (amount) =>
      `এর মধ্যে ${amount} মূল্যের সাইজ এই অফারের বাইরে — সেগুলো নিয়মিত দামে।`,
    freeTag: 'ফ্রি',
    maxSelected: (count) => `সর্বোচ্চ ${num(count)}টি বেছে নেওয়া হয়েছে`,
    countInOffer: (count) => `অফারে ${num(count)}টি`,
    countSelected: (count) => `${num(count)}টি বেছে নেওয়া হয়েছে`,
    quoteIssue: (issue) => {
      switch (issue.code) {
        case 'item-sold-out':
          return `${issue.title} এর স্টক শেষ।`
        case 'all-sold-out':
          return 'এই অফারের সব পণ্যের স্টক এখন শেষ।'
        case 'choose-options':
          return 'প্রতিটি পণ্যের জন্য একটি অপশন বেছে নিন।'
        case 'choose-items':
          return 'অন্তত একটি পণ্য বেছে নিন।'
        case 'item-unavailable':
          return 'বেছে নেওয়া একটি পণ্য এখন পাওয়া যাচ্ছে না।'
        case 'too-few':
          return `${issue.scoped ? 'এই অফার থেকে ' : ''}অন্তত ${num(issue.min)}টি পণ্য বেছে নিন।`
        case 'too-many':
          return `${issue.scoped ? 'এই অফার থেকে ' : ''}সর্বোচ্চ ${num(issue.max)}টি পণ্য অর্ডার করা যাবে।`
        case 'sets-only':
          return `এই অফারটি ${list(issue.quantities)}টির সেটে বিক্রি হয় — ${issue.scoped ? 'অফারে ' : ''}আপনি নিয়েছেন ${num(issue.have)}টি।`
        case 'no-price':
          return 'এতগুলো পণ্যের জন্য কোনো দাম ঠিক করা নেই।'
      }
    },
    selectSizeFirst: 'আগে একটি সাইজ বেছে নিন',
    selectSize: 'সাইজ বেছে নিন',
    removeOne: 'একটি কমান',
    addOne: 'একটি বাড়ান',
    and: 'ও',
    upTo: (max) => `সর্বোচ্চ ${num(max)}`,
    between: (min, max) => `${num(min)}–${num(max)}`,

    // ── Errors from the shop ─────────────────────────────────────────────
    errors: {
      noStore: 'এই দোকান এখন অর্ডার নিচ্ছে না।',
      tooManyRequests: 'অনেকবার চেষ্টা হয়েছে — একটু ধীরে করুন।',
      tooManyAttempts: 'অনেকবার চেষ্টা হয়েছে — একটু পরে আবার চেষ্টা করুন।',
      tooManyAttemptsWait: 'অনেকবার চেষ্টা হয়েছে — একটু অপেক্ষা করুন।',
      tooManyAttemptsLater: 'অনেকবার চেষ্টা হয়েছে — পরে আবার চেষ্টা করুন।',
      tooManyAttemptsMinutes:
        'অনেকবার চেষ্টা হয়েছে — কয়েক মিনিট পরে আবার চেষ্টা করুন।',
      invalid: 'আপনার তথ্যগুলো আরেকবার দেখে নিন।',
      couldNotAdd: 'কার্টে যোগ করা যায়নি',
      cartExpired: 'আপনার কার্টের মেয়াদ শেষ হয়ে গেছে।',
      cartExpiredAddAgain:
        'আপনার কার্টের মেয়াদ শেষ হয়ে গেছে। পণ্যগুলো আবার যোগ করুন।',
      couldNotUpdate: 'কার্ট আপডেট করা যায়নি',
      addSomethingFirst: 'আগে কার্টে কিছু যোগ করুন।',
      enterCode: 'একটি কোড লিখুন।',
      codeNotValid: 'কোডটি সঠিক নয়',
      codeMinimumSpend:
        'এই কোড ব্যবহার করতে কার্টে সর্বনিম্ন কেনাকাটার পরিমাণ পূরণ হয়নি।',
      codeMinimumItems: 'এই কোড ব্যবহার করতে কার্টে আরও পণ্য যোগ করুন।',
      codeNoEligibleItems: 'আপনার কার্টের কোনো পণ্যে এই কোডটি প্রযোজ্য নয়।',
      couldNotRemoveCode: 'কোডটি সরানো যায়নি',
      enterName: 'আপনার নাম লিখুন',
      enterPhone: 'আপনার ফোন নম্বর লিখুন',
      phoneTooLong: 'ফোন নম্বরটি অনেক বড়',
      phoneDigits: 'ফোন নম্বরে শুধু সংখ্যা লিখুন',
      validEmail: 'সঠিক ইমেইল ঠিকানা লিখুন',
      enterAddress: 'আপনার পুরো ঠিকানা লিখুন',
      enterCity: 'আপনার শহর বা জেলা লিখুন',
      elevenDigitMobile: '১১ সংখ্যার মোবাইল নম্বর লিখুন, যেমন 01712 345678।',
      choosePayment: 'কীভাবে পেমেন্ট করবেন বেছে নিন।',
      couldNotPlace: 'অর্ডারটি করা যায়নি। আবার চেষ্টা করুন।',
      answerQuestion: (question) => `“${question}” প্রশ্নের উত্তর দিন।`,
      chooseAnAnswer: (question) =>
        `“${question}” প্রশ্নের জন্য দেওয়া অপশনগুলো থেকে একটি বেছে নিন।`,
      accountsUnavailable: 'এই দোকানে অ্যাকাউন্ট খোলার সুবিধা নেই।',
      checkDetails: 'আপনার তথ্যগুলো দেখে নিন',
      couldNotCreateAccount: 'অ্যাকাউন্ট খোলা যায়নি',
      passwordLength: 'কমপক্ষে ৮টি অক্ষর দিন',
      enterEmail: 'আপনার ইমেইল ঠিকানা লিখুন',
      enterPassword: 'আপনার পাসওয়ার্ড লিখুন',
      wrongLogin: 'এই ইমেইল ও পাসওয়ার্ডে কোনো অ্যাকাউন্ট পাওয়া যায়নি।',
    },
  }
}

const DICTIONARIES: Record<SiteLanguage, (num: Num) => StoreWords> = {
  en: english,
  bn: bangla,
}

/** Everything a storefront component needs to speak the site's language. */
export interface StoreText {
  language: SiteLanguage
  numerals: SiteNumerals
  words: StoreWords
  /** A shelf price (`৳1,250`) with the site's digits. */
  price: (cents: number, currencyCode: string) => string
  /** Any number, or a string holding digits, with the site's digits. */
  number: (value: number | string) => string
}

const cache = new Map<string, StoreText>()

export function makeStoreText(
  language: SiteLanguage,
  numerals: SiteNumerals
): StoreText {
  const key = `${language}:${numerals}`
  const cached = cache.get(key)
  if (cached) return cached

  const number: Num = (value) => localizeDigits(String(value), numerals)
  const text: StoreText = {
    language,
    numerals,
    words: DICTIONARIES[language](number),
    price: (cents, currencyCode) =>
      localizeDigits(formatShelfPrice(cents, currencyCode), numerals),
    number,
  }
  cache.set(key, text)
  return text
}

/** The storefront's words for a theme — for server components and actions. */
export function storeText(
  theme: Pick<PageTheme, 'language' | 'numerals'> | null | undefined
): StoreText {
  return makeStoreText(siteLanguage(theme), siteNumerals(theme))
}

/** English with Latin digits, for anywhere no theme is in reach. */
export const DEFAULT_STORE_TEXT = makeStoreText('en', 'latin')

/**
 * Why a code earns nothing yet, in the shop's words.
 *
 * Pricing reports the reason as a code — `MINIMUM_SUBTOTAL_NOT_MET` — which is
 * what the cart carries; this is the only place it becomes a sentence, so a
 * shopper is never shown the code itself. A reason this does not know yet
 * reads as "not valid" rather than leaking whatever pricing called it.
 */
export function discountRejectionText(
  words: StoreWords,
  reason: string | null | undefined
): string | null {
  if (!reason) return null
  switch (reason) {
    case 'MINIMUM_SUBTOTAL_NOT_MET':
      return words.errors.codeMinimumSpend
    case 'MINIMUM_QUANTITY_NOT_MET':
      return words.errors.codeMinimumItems
    case 'NO_ELIGIBLE_ITEMS':
      return words.errors.codeNoEligibleItems
    default:
      return words.errors.codeNotValid
  }
}

/**
 * The names NCOM gives a new workspace's delivery rate and payment method
 * (`provisionCommerce` in storeService), and the word each is in the shop's
 * dictionary. Keep in step with that seed.
 */
const BUILT_IN_NAMES = new Map<string, (words: StoreWords) => string>([
  ['Standard shipping', (words) => words.standardShipping],
  ['Cash on delivery', (words) => words.cashOnDelivery],
])

/**
 * A delivery rate's or payment method's name as the checkout shows it.
 *
 * The defaults are created once per workspace, in English, and every store in
 * it shares them — so a Bangla shop beside an English one cannot simply be
 * seeded in Bangla. Instead a name that is still exactly the one NCOM wrote is
 * shown in the shop's own language; one the merchant has typed themselves is
 * theirs, and shown as written.
 */
export function builtInName(name: string, words: StoreWords): string {
  return BUILT_IN_NAMES.get(name)?.(words) ?? name
}
