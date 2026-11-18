'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import {
  Check,
  Copy,
  Printer,
  ShieldCheck,
  Truck,
  TriangleAlert,
} from 'lucide-react'

/**
 * The four steps after an order, as tabs: pick one, or let them advance on
 * their own while the section is on screen (paused under the pointer, and
 * never for reduced motion). Each step shows the real thing, drawn on a fixed
 * 640×480 canvas scaled to its box, so nothing on the page moves when the
 * step changes. The wording is the app's own — fraud-badges.tsx,
 * courier-automation-form.tsx, the 4×6 sticker in app/print/orders and the
 * buyer's page in app/track.
 */

const STEPS = [
  {
    title: 'Checked before it ships',
    text: 'NCOM looks up the buyer’s number on your courier accounts and checks it against your rules. Orders that fail wait for you.',
    alt: 'A buyer’s delivery record: 96% delivered, 23 parcels delivered, 1 refused, no fraud reports. It passes the seller’s rules and goes to Steadfast; another order with a 29% rate waits for review.',
  },
  {
    title: 'Booked and labelled',
    text: 'Book Steadfast or Pathao from the order on your own account, or send orders that pass automatically. Print 4×6 stickers in one go.',
    alt: 'The order is booked with Steadfast and its 4×6 sticker prints: cash on delivery ৳1,550, the buyer’s name, phone and address, the items and a barcode.',
  },
  {
    title: 'Tracked by the buyer',
    text: 'Each parcel gets its own tracking page with the courier’s updates and the cash to keep ready. Copy the link into WhatsApp.',
    alt: 'The buyer’s tracking page on a phone: out for delivery, the tracking code, “please have ৳1,550 ready for the rider”, and the courier’s updates.',
  },
  {
    title: 'Delivered and counted',
    text: 'Statuses arrive from the courier on their own. When the parcel is delivered, the cash counts in your sales.',
    alt: 'The order’s courier updates arrive one by one until it is delivered, and ৳1,550 is added to the cash collected this month.',
  },
]

const STEP_MS = 6500

export function OrderFlowSteps({ barcode }: { barcode: string | null }) {
  const [active, setActive] = useState(0)
  const [running, setRunning] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  // Scale the 640×480 canvas to the box it sits in.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const fit = () =>
      stage.style.setProperty('--s', String(stage.clientWidth / 640))
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  // Advance only while the section is on screen.
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const observer = new IntersectionObserver(
      ([entry]) => setRunning(Boolean(entry?.isIntersecting)),
      { threshold: 0.35 }
    )
    observer.observe(body)
    return () => observer.disconnect()
  }, [])

  const next = () => setActive((step) => (step + 1) % STEPS.length)

  return (
    <div
      ref={bodyRef}
      className="of-body"
      data-run={running ? '' : undefined}
      style={{ ['--of-step' as string]: `${STEP_MS}ms` }}
    >
      <div className="of-steps" role="tablist" aria-label="After the order">
        {STEPS.map((step, index) => (
          <button
            key={step.title}
            type="button"
            role="tab"
            id={`of-tab-${index}`}
            aria-selected={index === active}
            aria-controls="of-stage"
            className="of-step"
            data-on={index === active ? '' : undefined}
            onClick={() => setActive(index)}
          >
            <span className="of-num">{String(index + 1).padStart(2, '0')}</span>
            <span className="of-txt">
              <b>{step.title}</b>
              <span>{step.text}</span>
            </span>
            <span className="of-bar" aria-hidden="true">
              {index === active && (
                <i key={`bar-${active}`} onAnimationEnd={next} />
              )}
            </span>
          </button>
        ))}
      </div>

      <div
        ref={stageRef}
        id="of-stage"
        className="of-stage"
        role="tabpanel"
        aria-labelledby={`of-tab-${active}`}
      >
        <p className="of-sr">{STEPS[active]!.alt}</p>
        <div className="of-canvas" aria-hidden="true">
          <Panel on={active === 0}>
            <CheckScene />
          </Panel>
          <Panel on={active === 1}>
            <LabelScene barcode={barcode} />
          </Panel>
          <Panel on={active === 2}>
            <TrackScene />
          </Panel>
          <Panel on={active === 3}>
            <DeliveredScene />
          </Panel>
        </div>
      </div>
    </div>
  )
}

function Panel({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <div className="of-panel" data-on={on ? '' : undefined}>
      {children}
    </div>
  )
}

/* 01 — the delivery-record check */
function CheckScene() {
  return (
    <>
      <div className="of-card of-check">
        <div className="of-card-head">
          <span>Fraud screening</span>
          <span className="of-chip" data-tone="ok">
            <ShieldCheck size={12} />
            Reliable
          </span>
        </div>
        <div className="of-buyer">
          <span className="of-avatar">RA</span>
          <span>
            <b>Rahima Akter</b>
            <small>01712-345678 · #NC-10483 · ৳1,550</small>
          </span>
        </div>
        <dl className="of-stats">
          <div>
            <dt>Delivery rate</dt>
            <dd>96%</dd>
          </div>
          <div>
            <dt>Delivered</dt>
            <dd>23</dd>
          </div>
          <div>
            <dt>Refused</dt>
            <dd>1</dd>
          </div>
          <div>
            <dt>Fraud reports</dt>
            <dd>0</dd>
          </div>
        </dl>
        <div className="of-meter">
          <i />
        </div>
        <p className="of-label">Your rules</p>
        <ul className="of-rules">
          <li>
            <Tick />
            Minimum delivery rate <em>70%</em>
          </li>
          <li>
            <Tick />
            Fraud reports allowed <em>0</em>
          </li>
          <li>
            <Tick />
            Always review orders above <em>৳5,000</em>
          </li>
        </ul>
        <p className="of-result">
          <Check size={14} strokeWidth={3} />
          Passed — sent to Steadfast
        </p>
      </div>
      <div className="of-card of-held">
        <span className="of-held-icon">
          <TriangleAlert size={16} />
        </span>
        <span>
          <b>#NC-10480 · Sabbir Ahmed</b>
          <small>29% delivered · 5 refused</small>
        </span>
        <span className="of-chip" data-tone="warn">
          Check first
        </span>
      </div>
    </>
  )
}

function Tick() {
  return (
    <span className="of-tick">
      <Check size={11} strokeWidth={3.2} />
    </span>
  )
}

/* 02 — booked, and the 4×6 sticker printing */
function LabelScene({ barcode }: { barcode: string | null }) {
  return (
    <>
      <div className="of-card of-book">
        <p className="of-label">Courier</p>
        <div className="of-radio" data-on="">
          <i />
          <span>
            <b>Steadfast</b>
            <small>Your account</small>
          </span>
        </div>
        <div className="of-radio">
          <i />
          <span>
            <b>Pathao</b>
            <small>Your account</small>
          </span>
        </div>
        <div className="of-swap of-book-btn">
          <span className="of-swap-a">
            <Truck size={15} />
            Book with Steadfast
          </span>
          <span className="of-swap-b">
            <Check size={15} strokeWidth={3} />
            Booked · 128472913
          </span>
        </div>
        <div className="of-switch-row">
          <span>Send passing orders automatically</span>
          <span className="of-switch" />
        </div>
        <div className="of-print">
          <Printer size={15} />
          Print labels · 24 orders
        </div>
      </div>

      <div className="of-printer" />
      <div className="of-paper">
        <div className="of-sticker">
          <div className="of-st-head">
            <span>
              <b>Madhuban Organics</b>
              <small>NC-10483 · 17/11/2026</small>
            </span>
            <span className="of-st-cod">
              <small>Cash on delivery</small>
              <b>৳1,550</b>
            </span>
          </div>
          <div className="of-st-body">
            <small>Deliver to</small>
            <b className="of-st-name">Rahima Akter</b>
            <b className="of-st-phone">01712-345678</b>
            <span>House 12, Road 5, Mirpur 10</span>
            <span>Dhaka 1216</span>
            <p>
              2 items: 2× Sundarbans Raw Honey (500 g)
              <br />
              Steadfast consignment 128472913
            </p>
          </div>
          <div className="of-st-code">
            {barcode ? (
              <span dangerouslySetInnerHTML={{ __html: barcode }} />
            ) : (
              <b>NC-10483</b>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

/* 03 — the buyer's tracking page, and the link the seller sends */
function TrackScene() {
  return (
    <>
      <div className="of-card of-link">
        <p className="of-label">Customer tracking link</p>
        <div className="of-link-row">
          <code>ncom.bd/track/k7x2p9</code>
          <span className="of-swap of-copy">
            <span className="of-swap-a">
              <Copy size={13} />
              Copy
            </span>
            <span className="of-swap-b">
              <Check size={13} strokeWidth={3} />
              Copied
            </span>
          </span>
        </div>
        <p className="of-note">
          Paste it into WhatsApp. Buyers who left an email get it by email too.
          The page never shows their address.
        </p>
      </div>

      <div className="of-phone">
        <div className="of-screen">
          <div className="of-status">
            <b>10:14</b>
            <span className="of-island" />
            <span className="of-sys" />
          </div>
          <div className="of-url">ncom.bd/track/k7x2p9</div>
          <div className="of-track">
            <small>Madhuban Organics</small>
            <h5>Order NC-10483</h5>
            <small>Placed 17/11/2026</small>
            <div className="of-track-card">
              <div className="of-track-status">
                <Truck size={16} />
                <span>
                  <b>Out for delivery</b>
                  <small>The rider will call before coming.</small>
                </span>
              </div>
              <p>
                Tracking code <code>128472913</code> ·{' '}
                <u>View on the courier’s site</u>
              </p>
              <p className="of-due">
                Please have <b>৳1,550</b> ready for the rider.
              </p>
            </div>
            <h6>Progress</h6>
            <ol className="of-events">
              <li data-new="">
                <b>Out for delivery</b>
                <small>Today, 10:12 am</small>
              </li>
              <li>
                <b>In transit — Dhaka hub</b>
                <small>Yesterday, 9:40 pm</small>
              </li>
              <li>
                <b>Received by courier</b>
                <small>Yesterday, 6:05 pm</small>
              </li>
              <li>
                <b>Accepted by courier</b>
                <small>Yesterday, 2:10 pm</small>
              </li>
            </ol>
            <h6>In this parcel</h6>
            <div className="of-item">
              <Image
                src="/marketing/showcase/honey-white.jpg"
                alt=""
                width={64}
                height={64}
                sizes="32px"
              />
              <span>Sundarbans Raw Honey</span>
              <small>×2</small>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

/* 04 — the courier's statuses arrive, and the cash is counted */
const EVENTS = [
  ['Accepted by courier', 'Nov 17, 2:10 pm'],
  ['Received by courier', 'Nov 17, 6:05 pm'],
  ['In transit', 'Nov 17, 9:40 pm'],
  ['Out for delivery', 'Nov 18, 10:12 am'],
  ['Delivered', 'Nov 18, 1:24 pm'],
] as const

function DeliveredScene() {
  return (
    <>
      <div className="of-card of-order">
        <div className="of-card-head">
          <span className="of-order-id">
            <Image
              src="/marketing/showcase/honey-white.jpg"
              alt=""
              width={72}
              height={72}
              sizes="36px"
            />
            <span>
              <b>#NC-10483</b>
              <small>Rahima Akter · Mirpur 10, Dhaka</small>
            </span>
          </span>
          <span className="of-swap of-status-chip">
            <span className="of-swap-a of-chip" data-tone="neutral">
              Out for delivery
            </span>
            <span className="of-swap-b of-chip" data-tone="lime">
              Delivered
            </span>
          </span>
        </div>
        <p className="of-label">Steadfast · 128472913</p>
        <ol className="of-timeline">
          {EVENTS.map(([label, when]) => (
            <li key={label}>
              <i />
              <b>{label}</b>
              <small>{when}</small>
            </li>
          ))}
        </ol>
        <p className="of-note">Updates arrive from the courier on their own.</p>
      </div>
      <div className="of-card of-cash">
        <p className="of-label">Cash collected · November</p>
        <span className="of-swap of-cash-sum">
          <b className="of-swap-a">৳1,94,650</b>
          <b className="of-swap-b">৳1,96,200</b>
        </span>
        <span className="of-plus">+ ৳1,550 · #NC-10483</span>
      </div>
    </>
  )
}
