'use client'

import { useSyncExternalStore } from 'react'

/** Never fires: the value depends on where it is read, not on when. */
const subscribe = () => () => {}

/**
 * A timestamp read in the reader's timezone, not the server's.
 *
 * `toLocaleString()` called in a Server Component formats in whatever timezone
 * the container happens to run in — UTC on this deployment — so a merchant in
 * Dhaka read every timestamp six hours out. A timeline is exactly where that
 * matters: "the courier collected it at 3pm" is the fact being checked, and an
 * order history that disagrees with the merchant's own clock is worse than one
 * with no times on it, because it looks authoritative.
 *
 * The server renders the instant labelled UTC and the browser substitutes the
 * local reading. That split is what `useSyncExternalStore`'s server snapshot is
 * for: formatting on both sides would be a hydration mismatch by construction,
 * because the two are in different places, which is the whole point.
 */
export function LocalTime({
  at,
  className,
}: {
  /** ISO 8601 instant. */
  at: string
  className?: string
}) {
  const local = useSyncExternalStore(
    subscribe,
    () => new Date(at).toLocaleString(),
    () => null
  )

  return (
    <time dateTime={at} className={className}>
      {local ?? `${at.replace('T', ' ').slice(0, 16)} UTC`}
    </time>
  )
}
