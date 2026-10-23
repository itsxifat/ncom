import type { StoreText } from './i18n'

/**
 * The order a shopper just placed, remembered on their own device.
 *
 * The thank-you page reads it to show the order back to them. A cookie rather
 * than an id in the address, so the confirmation — which shows their address
 * and phone number — cannot be opened by anyone the link is pasted to.
 */
export const LAST_ORDER_COOKIE = 'ncom_last_order'

/** The country a shop delivers in, read from the currency it sells in. */
export function defaultCountryFor(currencyCode: string): string {
  const byCurrency: Record<string, string> = {
    BDT: 'BD',
    INR: 'IN',
    PKR: 'PK',
    AED: 'AE',
    USD: 'US',
    GBP: 'GB',
    EUR: 'DE',
    AUD: 'AU',
    CAD: 'CA',
    SGD: 'SG',
    MYR: 'MY',
    JPY: 'JP',
  }
  return byCurrency[currencyCode.toUpperCase()] ?? 'BD'
}

/**
 * An order form's validation message in the shop's language — the store
 * checkout's and a landing page's order form alike, since both ask for the
 * same name, phone and address. English keeps the schema's own wording; other
 * languages are matched by field.
 */
export function checkoutIssueMessage(
  issue: { message: string; path: PropertyKey[]; code: string },
  text: StoreText
): string {
  if (text.language === 'en') return issue.message
  const errors = text.words.errors
  switch (issue.path[0]) {
    case 'name':
      return errors.enterName
    case 'phone':
      return issue.code === 'too_small'
        ? errors.enterPhone
        : issue.code === 'too_big'
          ? errors.phoneTooLong
          : errors.phoneDigits
    case 'email':
      return errors.validEmail
    case 'address':
      return errors.enterAddress
    case 'city':
      return errors.enterCity
    default:
      return errors.invalid
  }
}

/** Countries a store outside Bangladesh can deliver to from its checkout. */
export const CHECKOUT_COUNTRIES = [
  { code: 'BD', name: 'Bangladesh' },
  { code: 'IN', name: 'India' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'SG', name: 'Singapore' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'JP', name: 'Japan' },
]
