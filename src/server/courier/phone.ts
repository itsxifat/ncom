/**
 * Bangladeshi mobile number normalisation.
 *
 * Every courier in this integration keys on a phone number, and customers type
 * theirs six different ways: `01712345678`, `+8801712345678`, `8801712345678`,
 * `017-1234-5678`, `+88 01712 345678`. Left alone, one customer becomes several
 * rows in the fraud cache, each with a partial history, and a repeat offender
 * screens clean simply by writing their number differently at checkout.
 *
 * The canonical form is the local one — eleven digits beginning `01` — because
 * that is what both Steadfast and Pathao accept in their `recipient_phone`
 * fields and what their lookup endpoints expect.
 */

/** Eleven digits starting `01`, which is every mobile operator in Bangladesh. */
const LOCAL_PATTERN = /^01[3-9]\d{8}$/

/**
 * Reduces a typed number to `01XXXXXXXXX`, or null if it cannot be one.
 *
 * Returning null rather than a best guess is deliberate: a number this cannot
 * parse is a number the courier will reject too, and inventing a plausible one
 * would send a parcel to a stranger.
 */
export function normalizeBdPhone(
  raw: string | null | undefined
): string | null {
  if (!raw) return null

  // Strip everything a human might use as punctuation, including the leading
  // plus, so only the digits are left to reason about.
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null

  // 8801712345678 -> 01712345678. Country code with the trunk zero already
  // dropped, which is how E.164 writes it.
  if (digits.length === 13 && digits.startsWith('880')) {
    const local = `0${digits.slice(3)}`
    return LOCAL_PATTERN.test(local) ? local : null
  }

  // 88001712345678 — country code with the trunk zero kept. Wrong per E.164 but
  // common in pasted spreadsheets.
  if (digits.length === 14 && digits.startsWith('8800')) {
    const local = digits.slice(3)
    return LOCAL_PATTERN.test(local) ? local : null
  }

  // 1712345678 — the trunk zero dropped, as a phone keypad would show it.
  if (digits.length === 10 && digits.startsWith('1')) {
    const local = `0${digits}`
    return LOCAL_PATTERN.test(local) ? local : null
  }

  if (digits.length === 11) {
    return LOCAL_PATTERN.test(digits) ? digits : null
  }

  return null
}

/**
 * Normalises, or throws with a message a merchant can act on.
 *
 * Used at the courier boundary, where sending an unusable number produces an
 * opaque provider-side validation error hours later instead of a clear one now.
 */
export function requireBdPhone(raw: string | null | undefined): string {
  const phone = normalizeBdPhone(raw)
  if (!phone) {
    throw new Error(
      `"${raw ?? ''}" is not a valid Bangladeshi mobile number — couriers need 11 digits starting 01`
    )
  }
  return phone
}

/** `01712345678` -> `017****5678`, for logs and support screens. */
export function maskPhone(phone: string): string {
  if (phone.length < 7) return '•'.repeat(phone.length)
  return `${phone.slice(0, 3)}${'•'.repeat(phone.length - 7)}${phone.slice(-4)}`
}
