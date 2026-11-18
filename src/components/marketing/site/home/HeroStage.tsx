'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import {
  ChartColumn,
  Check,
  ChevronDown,
  Ellipsis,
  House,
  Lock,
  MapPin,
  Package,
  PanelsTopLeft,
  Printer,
  ScanLine,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Tag,
  Truck,
  Users,
  X,
} from 'lucide-react'

/**
 * The hero's product scene, drawn as the real thing: a buyer orders from a
 * seller's Bangla landing page on a phone (opened from a Facebook ad, so in
 * Facebook's in-app browser), and the order lands in the NCOM dashboard —
 * the same menu, wording and order panel as the app. There the buyer's
 * delivery record is checked, the parcel is booked with Steadfast, and the
 * cash comes in. On a loop, one buyer after another.
 *
 * Product photos are Unsplash free-licence shots in public/marketing/showcase
 * (see PagesAndStores.tsx for the source IDs).
 *
 * Drawn at a fixed 1200×660 (620×760 on phones) and scaled to its column. It
 * only runs while on screen, follows the pointer a little for depth, and holds
 * still for anyone who prefers reduced motion.
 */

type PackKey = 'single' | 'family' | 'trio'

const PACKS: Record<
  PackKey,
  {
    en: string
    bn: string
    bnNote: string
    price: number
    photo: string
    tag?: string
  }
> = {
  single: {
    en: 'Single · 500 g',
    bn: '১ বোতল',
    bnNote: '৫০০ গ্রাম',
    price: 850,
    photo: '/marketing/showcase/honey-jar.jpg',
  },
  family: {
    en: 'Family pack · 2 × 500 g',
    bn: 'ফ্যামিলি প্যাক',
    bnNote: '২ বোতল · ১ কেজি',
    price: 1550,
    photo: '/marketing/showcase/honey-white.jpg',
    tag: 'জনপ্রিয়',
  },
  trio: {
    en: '3 bottles + dipper',
    bn: '৩ বোতল + ডিপার',
    bnNote: '১.৫ কেজি · কাঠের ডিপার ফ্রি',
    price: 2200,
    photo: '/marketing/showcase/honey-comb.jpg',
  },
}
const PACK_ORDER: PackKey[] = ['single', 'family', 'trio']

interface Buyer {
  name: string
  nameBn: string
  phone: string
  area: string
  areaBn: string
  pack: PackKey
  delivered: number
  refused: number
}

/** Who orders next, in turn, with their record across couriers. */
const BUYERS: Buyer[] = [
  {
    name: 'Rahima Akter',
    nameBn: 'রহিমা আক্তার',
    phone: '01712-345678',
    area: 'Mirpur 10, Dhaka',
    areaBn: 'বাসা ১২, রোড ৫, মিরপুর ১০',
    pack: 'family',
    delivered: 23,
    refused: 1,
  },
  {
    name: 'Tanvir Hasan',
    nameBn: 'তানভীর হাসান',
    phone: '01819-224466',
    area: 'Agrabad, Chattogram',
    areaBn: 'সিডিএ আবাসিক, আগ্রাবাদ',
    pack: 'single',
    delivered: 11,
    refused: 1,
  },
  {
    name: 'Nusrat Jahan',
    nameBn: 'নুসরাত জাহান',
    phone: '01555-781203',
    area: 'Zindabazar, Sylhet',
    areaBn: 'জিন্দাবাজার, সিলেট',
    pack: 'trio',
    delivered: 31,
    refused: 2,
  },
  {
    name: 'Arif Chowdhury',
    nameBn: 'আরিফ চৌধুরী',
    phone: '01911-603954',
    area: 'Uttara, Dhaka',
    areaBn: 'সেক্টর ৭, উত্তরা',
    pack: 'family',
    delivered: 8,
    refused: 0,
  },
  {
    name: 'Sharmin Sultana',
    nameBn: 'শারমিন সুলতানা',
    phone: '01633-918275',
    area: 'Shaheb Bazar, Rajshahi',
    areaBn: 'সাহেব বাজার, রাজশাহী',
    pack: 'single',
    delivered: 17,
    refused: 1,
  },
]

type Status = 'New' | 'Booked' | 'In transit' | 'Delivered' | 'Held'

interface Order {
  id: number
  name: string
  phone: string
  area: string
  pack: PackKey
  check: 'checking' | 'ok' | 'warn'
  delivered: number
  refused: number
  status: Status
  consignment?: string
}

const START: Order[] = [
  {
    id: 10482,
    name: 'Mahfuz Rahman',
    phone: '01715-660231',
    area: 'Dhanmondi, Dhaka',
    pack: 'single',
    check: 'ok',
    delivered: 14,
    refused: 0,
    status: 'In transit',
    consignment: 'SF-128472911',
  },
  {
    id: 10481,
    name: 'Farzana Islam',
    phone: '01822-417790',
    area: 'Khulna Sadar',
    pack: 'family',
    check: 'ok',
    delivered: 9,
    refused: 1,
    status: 'Delivered',
    consignment: 'SF-128472907',
  },
  {
    id: 10480,
    name: 'Sabbir Ahmed',
    phone: '01688-102938',
    area: 'Cumilla Sadar',
    pack: 'trio',
    check: 'warn',
    delivered: 2,
    refused: 5,
    status: 'Held',
  },
  {
    id: 10479,
    name: 'Jannatul Ferdous',
    phone: '01521-339874',
    area: 'Bashundhara, Dhaka',
    pack: 'single',
    check: 'ok',
    delivered: 26,
    refused: 1,
    status: 'Delivered',
    consignment: 'PT-DHK-55102',
  },
  {
    id: 10478,
    name: 'Mehedi Hasan',
    phone: '01913-770412',
    area: 'Boalia, Rajshahi',
    pack: 'family',
    check: 'ok',
    delivered: 5,
    refused: 0,
    status: 'Delivered',
    consignment: 'SF-128472893',
  },
]

type Phase =
  | 'idle'
  | 'scroll'
  | 'pick'
  | 'type'
  | 'press'
  | 'sent'
  | 'row'
  | 'checked'
  | 'booking'
  | 'booked'
  | 'delivered'

/** When each phase starts, in ms from the top of the loop. */
const TIMELINE: [Phase, number][] = [
  ['idle', 0],
  ['scroll', 700],
  ['pick', 1500],
  ['type', 1900],
  ['press', 3400],
  ['sent', 3700],
  ['row', 4600],
  ['checked', 6000],
  ['booking', 7100],
  ['booked', 7400],
  ['delivered', 9100],
]
const LOOP_MS = 11600

const taka = (n: number) => `৳${n.toLocaleString('en-IN')}`
const BN_DIGITS = '০১২৩৪৫৬৭৮৯'
const bn = (text: string | number) =>
  String(text).replace(/\d/g, (d) => BN_DIGITS[Number(d)]!)
const bnTaka = (n: number) => `৳${bn(n.toLocaleString('en-IN'))}`
const rate = (o: { delivered: number; refused: number }) =>
  Math.round((o.delivered / Math.max(1, o.delivered + o.refused)) * 100)
const masked = (phone: string) => `${phone.slice(0, 6)}•••${phone.slice(-3)}`

export function HeroStage() {
  const scalerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [turn, setTurn] = useState(0)
  const [rows, setRows] = useState<Order[]>(START)
  const [ordersToday, setOrdersToday] = useState(132)
  const [collected, setCollected] = useState(184350)
  const [bump, setBump] = useState<'orders' | 'collected' | null>(null)
  const [running, setRunning] = useState(false)

  const buyer = BUYERS[turn % BUYERS.length]!
  const nextId = 10483 + turn
  const pack = PACKS[buyer.pack]

  // Scale the stage to its column, and measure how far the landing page
  // scrolls to bring the order button into view.
  useEffect(() => {
    const scaler = scalerRef.current
    const stage = stageRef.current
    if (!scaler || !stage) return
    // Phones get their own composition (see site.css), at the same
    // breakpoint as the CSS that gives the box its height.
    const compactQuery = window.matchMedia('(max-width: 760px)')
    const fit = () => {
      const compact = compactQuery.matches
      stage.toggleAttribute('data-compact', compact)
      stage.style.setProperty(
        '--s',
        String(scaler.clientWidth / (compact ? 620 : 1200))
      )
      const view = viewRef.current
      const page = pageRef.current
      if (view && page) {
        stage.style.setProperty(
          '--hx-end',
          `${Math.max(0, page.scrollHeight - view.clientHeight)}px`
        )
      }
      setReady(true)
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(scaler)
    return () => observer.disconnect()
  }, [])

  // Run only while visible, and never for reduced motion — that visitor
  // sees the scene as a still picture.
  useEffect(() => {
    const scaler = scalerRef.current
    if (!scaler) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const observer = new IntersectionObserver(
      ([entry]) => setRunning(Boolean(entry?.isIntersecting)),
      { threshold: 0.15 }
    )
    observer.observe(scaler)
    return () => observer.disconnect()
  }, [])

  // The loop: one order, from the buyer's tap to the cash. Each step changes
  // the dashboard as it happens, from its timer.
  useEffect(() => {
    if (!running) return
    const id = 10483 + turn
    const who = BUYERS[turn % BUYERS.length]!
    const update = (change: (row: Order) => Order) =>
      setRows((current) =>
        current.map((row) => (row.id === id ? change(row) : row))
      )
    const steps: Partial<Record<Phase, () => void>> = {
      row: () => {
        setRows((current) =>
          [
            {
              id,
              name: who.name,
              phone: who.phone,
              area: who.area,
              pack: who.pack,
              delivered: who.delivered,
              refused: who.refused,
              check: 'checking' as const,
              status: 'New' as const,
            },
            ...current,
          ].slice(0, 6)
        )
        setOrdersToday((n) => n + 1)
        setBump('orders')
      },
      checked: () => update((row) => ({ ...row, check: 'ok' })),
      booked: () =>
        update((row) => ({
          ...row,
          status: 'Booked',
          consignment: `SF-${128472913 + turn}`,
        })),
      delivered: () => {
        update((row) => ({ ...row, status: 'Delivered' }))
        setCollected((n) => n + PACKS[who.pack].price)
        setBump('collected')
      },
    }
    const timers = TIMELINE.map(([next, at]) =>
      window.setTimeout(() => {
        setPhase(next)
        steps[next]?.()
      }, at)
    )
    timers.push(window.setTimeout(() => setBump(null), 4600 + 1400))
    timers.push(window.setTimeout(() => setBump(null), 9100 + 1400))
    timers.push(
      window.setTimeout(() => {
        setPhase('idle')
        setTurn((t) => t + 1)
      }, LOOP_MS)
    )
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [running, turn])

  // A little depth: the phone and the window drift with the pointer.
  useEffect(() => {
    const stage = stageRef.current
    if (
      !stage ||
      window.matchMedia('(pointer: coarse), (prefers-reduced-motion: reduce)')
        .matches
    )
      return
    let frame = 0
    const move = (event: PointerEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const box = stage.getBoundingClientRect()
        const x = ((event.clientX - box.left) / box.width) * 2 - 1
        const y = ((event.clientY - box.top) / box.height) * 2 - 1
        stage.style.setProperty('--mx', Math.max(-1, Math.min(1, x)).toFixed(3))
        stage.style.setProperty('--my', Math.max(-1, Math.min(1, y)).toFixed(3))
      })
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => {
      window.removeEventListener('pointermove', move)
      cancelAnimationFrame(frame)
    }
  }, [])

  const at = TIMELINE.findIndex(([name]) => name === phase)
  const after = (p: Phase) => at >= TIMELINE.findIndex(([name]) => name === p)
  const picked: PackKey = after('pick') ? buyer.pack : 'single'
  const selected = rows[0]!
  const isNew = selected.id === nextId
  const pendingOrders = 3 + (after('row') && !after('booked') ? 1 : 0)

  return (
    <div
      ref={scalerRef}
      className="hx-scaler"
      role="img"
      aria-label="NCOM in action: a buyer orders from a seller's Bangla landing page on a phone, and the order arrives in the NCOM dashboard, where the buyer's delivery record is checked, the parcel is booked with Steadfast, and the cash is collected."
    >
      <div
        ref={stageRef}
        className="hx-stage"
        data-ready={ready ? '' : undefined}
        aria-hidden="true"
      >
        <div className="hx-tilt">
          {/* The NCOM dashboard */}
          <div className="hx-layer hx-win">
            <div className="hx-bar">
              <div className="hx-dots">
                <i />
                <i />
                <i />
              </div>
              <div className="hx-url">
                <Lock size={10} strokeWidth={2.5} />
                ncom.bd/orders
              </div>
              <span style={{ width: 52 }} />
            </div>
            <div className="hx-body">
              <nav className="hx-side">
                <div className="hx-ws">
                  <span className="hx-ws-logo">ম</span>
                  <span className="hx-ws-name">
                    Madhuban Organics
                    <small>Business</small>
                  </span>
                  <ChevronDown size={14} />
                </div>
                <div className="hx-nav">
                  <House size={16} />
                  Home
                </div>
                <div className="hx-nav" data-on="">
                  <ShoppingBag size={16} />
                  Orders
                  <em>{pendingOrders}</em>
                </div>
                <div className="hx-nav">
                  <Package size={16} />
                  Products
                </div>
                <div className="hx-nav">
                  <Users size={16} />
                  Customers
                </div>
                <div className="hx-nav">
                  <Tag size={16} />
                  Discounts
                </div>
                <div className="hx-nav">
                  <PanelsTopLeft size={16} />
                  Websites
                </div>
                <div className="hx-nav">
                  <ChartColumn size={16} />
                  Analytics
                </div>
                <div className="hx-nav hx-nav-end">
                  <Settings size={16} />
                  Settings
                </div>
              </nav>

              <div className="hx-main">
                <div className="hx-head">
                  <div>
                    <h4>Orders</h4>
                    <p>
                      Every order from your pages, from the first check to the
                      customer’s door.
                    </p>
                  </div>
                  <div className="hx-actions">
                    <span className="hx-btn">
                      <ScanLine size={14} />
                      Scan parcels
                    </span>
                    <span className="hx-btn">
                      <Printer size={14} />
                      Print labels
                    </span>
                  </div>
                </div>

                <div className="hx-kpis">
                  <div className="hx-kpi">
                    <p>Orders today</p>
                    <strong data-bump={bump === 'orders' ? '' : undefined}>
                      {ordersToday}
                    </strong>
                  </div>
                  <div className="hx-kpi">
                    <p>Cash collected</p>
                    <strong data-bump={bump === 'collected' ? '' : undefined}>
                      {taka(collected)}
                    </strong>
                  </div>
                  <div className="hx-kpi">
                    <p>Delivery rate</p>
                    <strong>
                      94.2% <small>▲ 3.1</small>
                    </strong>
                  </div>
                  <div className="hx-kpi">
                    <p>Held for review</p>
                    <strong>2</strong>
                  </div>
                </div>

                <div className="hx-split">
                  {/* The order list */}
                  <div className="hx-list">
                    <div className="hx-list-head">
                      <span>
                        <b>{ordersToday}</b> orders today
                      </span>
                      <span className="hx-search">
                        <Search size={12} />
                        Name, phone or order
                      </span>
                    </div>
                    {rows.map((row) => (
                      <div
                        key={row.id}
                        className="hx-row"
                        data-status={row.status}
                        data-fresh={
                          row.id === nextId && after('row') ? '' : undefined
                        }
                        data-on={row.id === selected.id ? '' : undefined}
                      >
                        <span className="hx-thumb">
                          <Image
                            src={PACKS[row.pack].photo}
                            alt=""
                            width={68}
                            height={68}
                            sizes="34px"
                          />
                        </span>
                        <span className="hx-who">
                          <b>{row.name}</b>
                          <span>
                            #NC-{row.id} ·{' '}
                            {row.id === nextId
                              ? 'just now'
                              : `${(10483 + turn - row.id) * 7} min ago`}
                          </span>
                        </span>
                        <CheckChip check={row.check} />
                        <span className="hx-total">
                          <b>{taka(PACKS[row.pack].price)}</b>
                          <span>COD</span>
                        </span>
                        <StatusChip status={row.status} />
                      </div>
                    ))}
                  </div>

                  {/* The selected order */}
                  <div className="hx-panel" key={`panel-${selected.id}`}>
                    <div className="hx-p-head">
                      <span>
                        <b>#NC-{selected.id}</b>
                        <small>
                          Landing page · {isNew ? 'just now' : 'today'}
                        </small>
                      </span>
                      <StatusChip status={selected.status} />
                    </div>

                    <div className="hx-p-buyer">
                      <span className="hx-avatar">
                        {selected.name
                          .split(' ')
                          .map((part) => part[0])
                          .join('')}
                      </span>
                      <span>
                        <b>{selected.name}</b>
                        <small>{masked(selected.phone)}</small>
                      </span>
                    </div>
                    <p className="hx-p-addr">
                      <MapPin size={12} />
                      {selected.area}
                    </p>

                    <div className="hx-p-item">
                      <span className="hx-thumb hx-thumb-lg">
                        <Image
                          src={PACKS[selected.pack].photo}
                          alt=""
                          width={84}
                          height={84}
                          sizes="42px"
                        />
                      </span>
                      <span>
                        <b>Sundarbans Honey</b>
                        <small>{PACKS[selected.pack].en}</small>
                      </span>
                      <b>{taka(PACKS[selected.pack].price)}</b>
                    </div>

                    <div className="hx-p-check">
                      <div className="hx-p-label">
                        Delivery history
                        <CheckChip check={selected.check} />
                      </div>
                      {selected.check === 'checking' ? (
                        <div className="hx-p-loading">
                          <i />
                          <i />
                          <span>Looking up this number with couriers…</span>
                        </div>
                      ) : (
                        <>
                          <div
                            className="hx-p-bar"
                            data-tone={selected.check}
                            style={{
                              ['--rate' as string]: `${rate(selected)}%`,
                            }}
                          >
                            <i />
                          </div>
                          <dl className="hx-p-stats">
                            <div>
                              <dt>Delivery rate</dt>
                              <dd>{rate(selected)}%</dd>
                            </div>
                            <div>
                              <dt>Delivered</dt>
                              <dd>{selected.delivered}</dd>
                            </div>
                            <div>
                              <dt>Refused</dt>
                              <dd>{selected.refused}</dd>
                            </div>
                          </dl>
                        </>
                      )}
                    </div>

                    <div className="hx-p-courier">
                      {selected.status === 'New' ? (
                        <span
                          className="hx-book"
                          data-press={phase === 'booking' ? '' : undefined}
                          data-ready={selected.check === 'ok' ? '' : undefined}
                        >
                          <Truck size={15} />
                          Book with Steadfast
                        </span>
                      ) : selected.status === 'Held' ? (
                        <span className="hx-p-note" data-tone="warn">
                          Call the buyer before booking
                        </span>
                      ) : (
                        <span
                          className="hx-p-note"
                          data-tone={
                            selected.status === 'Delivered' ? 'done' : undefined
                          }
                        >
                          {selected.status === 'Delivered' ? (
                            <Check size={14} strokeWidth={3} />
                          ) : (
                            <Truck size={14} />
                          )}
                          <span>
                            <b>
                              {selected.status === 'Delivered'
                                ? `${taka(PACKS[selected.pack].price)} collected`
                                : selected.consignment?.startsWith('PT')
                                  ? 'Booked with Pathao'
                                  : 'Booked with Steadfast'}
                            </b>
                            <small>
                              {selected.consignment} · label printed
                            </small>
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* A toast, as the app shows one */}
            <div
              className="hx-toast"
              data-show={phase === 'delivered' ? '' : undefined}
            >
              <span className="hx-toast-icon">
                <Check size={14} strokeWidth={3} />
              </span>
              <span>
                <b>
                  #NC-{nextId} delivered · {taka(pack.price)} collected
                </b>
                <span>Steadfast will pay it out with the next settlement.</span>
              </span>
            </div>
          </div>

          {/* The seller's landing page, in Facebook's in-app browser */}
          <div className="hx-layer hx-phone">
            <div className="hx-screen">
              <div className="hx-status">
                <b>9:41</b>
                <span className="hx-island" />
                <span className="hx-sys">
                  <i className="hx-signal" />
                  <i className="hx-battery" />
                </span>
              </div>
              <div className="hx-browser">
                <X size={15} strokeWidth={2.4} />
                <span>
                  <b>Madhuban Organics</b>
                  <small>
                    <Lock size={8} strokeWidth={3} />
                    madhuban.ncom.bd
                  </small>
                </span>
                <Ellipsis size={16} />
              </div>

              <div className="hx-view" ref={viewRef}>
                <div
                  className="hx-page"
                  ref={pageRef}
                  lang="bn"
                  data-down={
                    after('scroll') && !after('booked') ? '' : undefined
                  }
                >
                  <div className="hx-strip">
                    ঢাকায় ডেলিভারি ফ্রি · ক্যাশ অন ডেলিভারি
                  </div>
                  <div className="hx-photo">
                    <Image
                      src="/marketing/showcase/honey-white.jpg"
                      alt=""
                      fill
                      sizes="250px"
                      priority
                    />
                    <em>১৯% ছাড়</em>
                    <span className="hx-pager">
                      <i data-on="" />
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>
                  <div className="hx-copy">
                    <small>মধুবন অর্গানিক্স · ল্যাব-টেস্টেড</small>
                    <h5>সুন্দরবনের কাঁচা মধু</h5>
                    <div className="hx-stars">
                      <span>★★★★★</span>
                      ৪.৯ · ৩১২ রিভিউ
                    </div>
                    <div className="hx-price">
                      <strong>৳৮৫০</strong>
                      <s>৳১,০৫০</s>
                    </div>
                  </div>

                  <p className="hx-label">প্যাকেজ বেছে নিন</p>
                  <div className="hx-packs">
                    {PACK_ORDER.map((key) => (
                      <div
                        key={key}
                        className="hx-pack"
                        data-on={picked === key ? '' : undefined}
                      >
                        <i />
                        <span>
                          {PACKS[key].bn}
                          {PACKS[key].tag && <em>{PACKS[key].tag}</em>}
                          <small>{bn(PACKS[key].bnNote)}</small>
                        </span>
                        <b>{bnTaka(PACKS[key].price)}</b>
                      </div>
                    ))}
                  </div>

                  <p className="hx-label">ডেলিভারির ঠিকানা</p>
                  <div
                    className="hx-form"
                    key={`form-${turn}`}
                    data-typed={after('type') ? '' : undefined}
                  >
                    <Field
                      label="আপনার নাম"
                      placeholder="পুরো নাম লিখুন"
                      value={buyer.nameBn}
                    />
                    <Field
                      label="মোবাইল নম্বর"
                      placeholder="০১XXXXXXXXX"
                      value={bn(buyer.phone)}
                    />
                    <Field
                      label="ঠিকানা"
                      placeholder="বাসা, রোড, এলাকা"
                      value={buyer.areaBn}
                    />
                  </div>

                  <div className="hx-sum">
                    <span>ডেলিভারি চার্জ</span>
                    <span>ফ্রি</span>
                  </div>
                  <div className="hx-sum hx-sum-total">
                    <span>মোট</span>
                    <b>{bnTaka(PACKS[picked].price)}</b>
                  </div>
                  <div
                    className="hx-order"
                    data-press={phase === 'press' ? '' : undefined}
                  >
                    অর্ডার কনফার্ম করুন
                  </div>
                  <p className="hx-cod">
                    <ShieldCheck size={11} />
                    পণ্য হাতে পেয়ে টাকা দিন · ২–৩ দিনে ডেলিভারি
                  </p>
                </div>
              </div>

              <div
                className="hx-sheet"
                data-open={after('sent') && !after('booked') ? '' : undefined}
              >
                <i>
                  <Check size={18} strokeWidth={3} />
                </i>
                <b>অর্ডার নেওয়া হয়েছে!</b>
                <span>
                  অর্ডার #NC-{bn(nextId)} · {bnTaka(pack.price)}
                  <br />
                  কনফার্ম করতে আমরা শিগগিরই কল করব
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  placeholder,
  value,
}: {
  label: string
  placeholder: string
  value: string
}) {
  return (
    <div className="hx-field">
      <small>{label}</small>
      <span className="hx-input">
        <span className="hx-ph">{placeholder}</span>
        <span className="hx-val">{value}</span>
      </span>
    </div>
  )
}

function CheckChip({ check }: { check: Order['check'] }) {
  if (check === 'checking')
    return (
      <span className="hx-chip" data-tone="neutral">
        <span className="hx-spin" />
        Checking
      </span>
    )
  if (check === 'ok')
    return (
      <span className="hx-chip" data-tone="ok">
        <ShieldCheck size={12} />
        Reliable
      </span>
    )
  return (
    <span className="hx-chip" data-tone="warn">
      Check first
    </span>
  )
}

function StatusChip({ status }: { status: Status }) {
  return (
    <span
      className="hx-chip hx-status-chip"
      data-tone={
        status === 'Delivered'
          ? 'lime'
          : status === 'Held'
            ? 'warn'
            : status === 'New'
              ? 'new'
              : 'neutral'
      }
    >
      {status}
    </span>
  )
}
