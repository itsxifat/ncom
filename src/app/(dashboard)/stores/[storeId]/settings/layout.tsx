/**
 * Store settings has a single page, so there are no tabs here.
 *
 * Shipping, taxes, payments and locations are workspace settings — one set
 * shared by every store — and live under /settings/*, reachable from the
 * sidebar's Setup group. They were previously linked from here as
 * `/stores/[storeId]/settings/shipping` and friends, which are routes that
 * have never existed.
 */
export default function StoreSettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="flex flex-col gap-8">{children}</div>
}
