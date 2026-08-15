import { createHash } from 'node:crypto'

/**
 * Normalisation and hashing for the customer details sent to Meta.
 *
 * Meta matches a server-side conversion to a person by comparing SHA-256
 * hashes of details it already holds. That makes normalisation the entire game:
 * the hash of `01712345678` and the hash of `+8801712345678` have nothing in
 * common, so a phone number written the way a Bangladeshi buyer writes it will
 * match nobody unless it is put into the exact form Meta hashes on its side.
 * A mis-normalised field is not a partial match, it is a miss — which shows up
 * as a low "event match quality" score and ads optimised against a fraction of
 * the conversions that actually happened.
 *
 * Hashing happens here rather than at the edge of the API call so that nothing
 * downstream ever holds a plaintext buyer detail bound for a third party: the
 * queue payload, the retry sweep and the delivery log all only ever see digests.
 * A leaked TrackingDelivery row is not a leaked customer list.
 *
 * Reference: Meta's Conversions API customer information parameters. The rules
 * are theirs; the comments explain why each one bites.
 */

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/** Hashes a value that is already normalised, or drops it if it is empty. */
function hashed(value: string | null): string | null {
  return value ? sha256(value) : null
}

/**
 * Calling codes for the markets this platform serves.
 *
 * Deliberately a short list rather than a dependency: every entry here is a
 * country a merchant on this platform actually ships to, and an unknown country
 * falls through to "assume the number is already international", which is the
 * correct reading of a number typed with its own country code.
 */
const CALLING_CODES: Record<string, string> = {
  BD: '880',
  IN: '91',
  PK: '92',
  LK: '94',
  NP: '977',
  MY: '60',
  SG: '65',
  AE: '971',
  SA: '966',
  GB: '44',
  US: '1',
  CA: '1',
  AU: '61',
}

/**
 * Puts a phone number into the digits-only international form Meta hashes.
 *
 * The three shapes a buyer in this market types — `01712345678`,
 * `8801712345678` and `+880 1712-345678` — must all come out as
 * `8801712345678`. The leading-zero rule is what does most of the work: a
 * national trunk prefix is not part of the international number, and leaving it
 * in produces `88001712345678`, which matches nothing.
 */
export function normalizePhone(
  phone: string,
  countryCode: string | null
): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 6) return null

  const callingCode = countryCode
    ? CALLING_CODES[countryCode.toUpperCase()]
    : undefined
  if (!callingCode) return digits

  // Already international.
  if (digits.startsWith(callingCode)) return digits

  const national = digits.replace(/^0+/, '')
  return `${callingCode}${national}`
}

/** Lowercased and trimmed; Meta hashes nothing else about an address. */
export function normalizeEmail(email: string): string | null {
  const value = email.trim().toLowerCase()
  return value.includes('@') ? value : null
}

/**
 * Names, cities and similar free text: lowercase, and strip everything that is
 * not a letter or a digit.
 *
 * Whitespace and punctuation are removed rather than collapsed, because
 * `Cox's Bazar`, `coxs bazar` and `Cox’s  Bazar` are one city and must produce
 * one hash.
 *
 * Combining marks (`\p{M}`) are kept alongside letters and digits, and that is
 * not a detail: in Bengali the vowel signs of ঢাকা are marks rather than
 * letters, so a rule that keeps only `\p{L}` reduces the city to ঢক — a
 * different string, a different hash, and a customer who matches nobody. The
 * same applies to every Indic and Arabic script this platform's merchants sell
 * in.
 */
export function normalizeText(value: string): string | null {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]/gu, '')
  return normalized || null
}

/** Two-letter ISO country, lowercased. */
export function normalizeCountry(countryCode: string): string | null {
  const value = countryCode.trim().toLowerCase()
  return /^[a-z]{2}$/.test(value) ? value : null
}

/**
 * The buyer details a conversion can carry, before hashing.
 *
 * Every field is optional because a cash-on-delivery order genuinely may not
 * have one — most are placed without an email address at all. What survives is
 * still worth sending: a phone number and a name from a real order out-match a
 * browser-only event on their own.
 */
export interface CustomerDetails {
  email?: string | null
  phone?: string | null
  firstName?: string | null
  lastName?: string | null
  city?: string | null
  countryCode?: string | null
  /** A stable, non-reversible id for this visitor. Hashed like the rest. */
  externalId?: string | null
}

/**
 * Meta's `user_data` matching keys, hashed and stripped of empty entries.
 *
 * The short key names (`em`, `ph`, `fn`) are Meta's own wire format, not an
 * abbreviation chosen here.
 */
export interface HashedCustomerData {
  em?: string[]
  ph?: string[]
  fn?: string[]
  ln?: string[]
  ct?: string[]
  country?: string[]
  external_id?: string[]
}

export function hashCustomerDetails(
  details: CustomerDetails
): HashedCustomerData {
  const country = details.countryCode ?? null

  const entries: [keyof HashedCustomerData, string | null][] = [
    ['em', hashed(details.email ? normalizeEmail(details.email) : null)],
    [
      'ph',
      hashed(details.phone ? normalizePhone(details.phone, country) : null),
    ],
    ['fn', hashed(details.firstName ? normalizeText(details.firstName) : null)],
    ['ln', hashed(details.lastName ? normalizeText(details.lastName) : null)],
    ['ct', hashed(details.city ? normalizeText(details.city) : null)],
    ['country', hashed(country ? normalizeCountry(country) : null)],
    // Already opaque, but Meta expects every matching key hashed and rejects
    // the event outright if one arrives in the clear.
    ['external_id', hashed(details.externalId ?? null)],
  ]

  const userData: HashedCustomerData = {}
  for (const [key, digest] of entries) {
    if (digest) userData[key] = [digest]
  }
  return userData
}

/**
 * Splits a single full-name field into the two Meta wants.
 *
 * The order form asks for one name, as forms in this market do. Everything
 * before the last space is the first name — wrong for some naming conventions,
 * but the alternative is sending no name at all, and Meta matches each part
 * independently so a wrong split still contributes the part it got right.
 */
export function splitName(fullName: string): {
  firstName: string | null
  lastName: string | null
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: null, lastName: null }
  if (parts.length === 1) return { firstName: parts[0]!, lastName: null }

  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1]!,
  }
}
