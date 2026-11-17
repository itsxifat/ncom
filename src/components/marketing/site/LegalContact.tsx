import Link from 'next/link'
import {
  displayPhone,
  whatsappLink,
  type SiteContact,
} from '@/server/services/siteContactService'

/** "Email … or WhatsApp …" — the ways to reach us that an admin has set. */
export function LegalContact({ contact }: { contact: SiteContact }) {
  const whatsapp = whatsappLink(contact.whatsapp)
  const ways: React.ReactNode[] = []
  if (contact.supportEmail) {
    ways.push(
      <a key="e" href={`mailto:${contact.supportEmail}`}>
        {contact.supportEmail}
      </a>
    )
  }
  if (whatsapp) {
    ways.push(
      <a key="w" href={whatsapp}>
        WhatsApp {displayPhone(contact.whatsapp)}
      </a>
    )
  }
  if (ways.length === 0) {
    return <Link href="/contact">our contact page</Link>
  }
  return (
    <>
      {ways.map((way, index) => (
        <span key={index}>
          {index > 0 && ' or '}
          {way}
        </span>
      ))}
    </>
  )
}
