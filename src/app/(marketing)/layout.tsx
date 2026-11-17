import { SiteHeaderBar } from '@/components/marketing/site/SiteHeaderBar'
import { SiteFooter } from '@/components/marketing/site/SiteFooter'
import { getSiteContact } from '@/server/services/siteContactService'
import '@/components/marketing/site/site.css'

/**
 * The public site — home, pricing, contact and the legal pages — in the
 * homepage design: dark ink and lime, the design's header and footer.
 */
export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const contact = await getSiteContact()
  return (
    <div className="ncom-site">
      <SiteHeaderBar />
      <main>{children}</main>
      <SiteFooter contact={contact} />
    </div>
  )
}
