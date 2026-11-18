import Image from 'next/image'
import { Check, ShieldCheck, Truck } from 'lucide-react'

/**
 * The panel beside the sign-in and sign-up forms: what NCOM does, shown as
 * the four things a seller actually sees happen to one order — it comes in,
 * the buyer is checked, the parcel is booked, the cash arrives — arriving on
 * a loop like notifications. Always on ink, in both themes. Pure CSS
 * (auth.css), so it costs the form nothing.
 */

const FEED = [
  {
    icon: 'photo',
    title: 'New order #NC-10484',
    text: 'Family pack · ৳1,550 · Dhanmondi',
  },
  {
    icon: 'shield',
    title: 'Reliable buyer',
    text: '96% delivered · 23 parcels · Rahima A.',
  },
  {
    icon: 'truck',
    title: 'Booked with Steadfast',
    text: 'Consignment 128472913 · sticker printed',
  },
  {
    icon: 'cash',
    title: '৳1,550 collected',
    text: '#NC-10484 delivered to Dhanmondi',
  },
] as const

export function AuthShowcase({ facts }: { facts: string[] }) {
  return (
    <aside aria-label="What NCOM does" className="au-panel">
      <div className="au-panel-in">
        <p className="au-eyebrow">
          <i aria-hidden="true" />
          For Facebook sellers in Bangladesh
        </p>

        <div>
          <h2 className="au-title">
            Make a landing page or an online store{' '}
            <span className="text-[#d8f84e]">in minutes.</span>
          </h2>
          <p className="au-sub">
            Take cash-on-delivery orders in Bangla or English, stop fake orders
            before they ship, and book Steadfast or Pathao straight from the
            order.
          </p>
        </div>

        <div className="au-feed" aria-hidden="true">
          {FEED.map((item, index) => (
            <div
              key={item.title}
              className="au-note"
              style={{ ['--i' as string]: index }}
            >
              <span className="au-note-icon" data-kind={item.icon}>
                {item.icon === 'photo' ? (
                  <Image
                    src="/marketing/showcase/honey-white.jpg"
                    alt=""
                    width={80}
                    height={80}
                    sizes="40px"
                  />
                ) : item.icon === 'shield' ? (
                  <ShieldCheck className="size-[18px]" />
                ) : item.icon === 'truck' ? (
                  <Truck className="size-[18px]" />
                ) : (
                  <Check className="size-[18px]" strokeWidth={3} />
                )}
              </span>
              <span className="au-note-text">
                <b>{item.title}</b>
                <span>{item.text}</span>
              </span>
            </div>
          ))}
        </div>

        <ul className="au-facts">
          {facts.map((fact) => (
            <li key={fact}>
              <Check className="size-4" strokeWidth={3} aria-hidden="true" />
              {fact}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}
