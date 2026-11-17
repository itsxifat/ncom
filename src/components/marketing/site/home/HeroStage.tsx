'use client'

import { useEffect, useRef, useState } from 'react'
import {
  BarChart3,
  Check,
  Home,
  LayoutTemplate,
  Package,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Truck,
  Users,
} from 'lucide-react'

/**
 * The hero's product scene: a seller's landing page on a phone takes an order,
 * the order lands in the NCOM dashboard, the buyer's delivery record is
 * checked, the parcel is booked with Steadfast, and the cash is collected —
 * on a loop, with the counters moving as it goes.
 *
 * Drawn at a fixed 1200×660 and scaled to its column, so it reads the same at
 * any width. It only runs while on screen, follows the pointer a little for
 * depth, and holds still for anyone who prefers reduced motion.
 */

interface Order {
  id: number
  name: string
  area: string
  item: string
  total: number
  check: 'checking' | 'ok' | 'warn'
  courier: string
  status: 'New' | 'Booked' | 'In transit' | 'Delivered' | 'Held'
}

/** Who orders next, in turn. Totals are the Madhuban price list. */
const BUYERS = [
  {
    name: 'Rahima Akter',
    area: 'Mirpur 10, Dhaka',
    item: 'Family pack · 2 × 500 g',
    total: 1550,
  },
  {
    name: 'Tanvir Hasan',
    area: 'Agrabad, Chattogram',
    item: 'Single · 500 g',
    total: 850,
  },
  {
    name: 'Nusrat Jahan',
    area: 'Zindabazar, Sylhet',
    item: '3 bottles + dipper',
    total: 2200,
  },
  {
    name: 'Arif Chowdhury',
    area: 'Uttara, Dhaka',
    item: 'Family pack · 2 × 500 g',
    total: 1550,
  },
  {
    name: 'Sharmin Sultana',
    area: 'Shaheb Bazar, Rajshahi',
    item: 'Single · 500 g',
    total: 850,
  },
]

const START: Order[] = [
  {
    id: 10482,
    name: 'Mahfuz Rahman',
    area: 'Dhanmondi, Dhaka',
    item: 'Single · 500 g',
    total: 850,
    check: 'ok',
    courier: 'Pathao',
    status: 'In transit',
  },
  {
    id: 10481,
    name: 'Farzana Islam',
    area: 'Khulna Sadar',
    item: 'Family pack · 2 × 500 g',
    total: 1550,
    check: 'ok',
    courier: 'Steadfast',
    status: 'Delivered',
  },
  {
    id: 10480,
    name: 'Sabbir Ahmed',
    area: 'Cumilla Sadar',
    item: '3 bottles + dipper',
    total: 2200,
    check: 'warn',
    courier: '—',
    status: 'Held',
  },
  {
    id: 10479,
    name: 'Jannatul Ferdous',
    area: 'Bashundhara, Dhaka',
    item: 'Single · 500 g',
    total: 850,
    check: 'ok',
    courier: 'Steadfast',
    status: 'Delivered',
  },
]

type Phase =
  'idle' | 'press' | 'sent' | 'row' | 'checked' | 'booked' | 'delivered'

/** When each phase starts, in ms from the top of the loop. */
const TIMELINE: [Phase, number][] = [
  ['idle', 0],
  ['press', 900],
  ['sent', 1250],
  ['row', 2150],
  ['checked', 3500],
  ['booked', 4900],
  ['delivered', 6600],
]
const LOOP_MS = 9200

const taka = (n: number) => `৳${n.toLocaleString('en-IN')}`

export function HeroStage() {
  const scalerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [turn, setTurn] = useState(0)
  const [rows, setRows] = useState<Order[]>(START)
  const [ordersToday, setOrdersToday] = useState(127)
  const [collected, setCollected] = useState(184350)
  const [bump, setBump] = useState<'orders' | 'collected' | null>(null)
  const [running, setRunning] = useState(false)

  const buyer = BUYERS[turn % BUYERS.length]!
  const nextId = 10483 + turn

  // Scale the 1200px stage to its column.
  useEffect(() => {
    const scaler = scalerRef.current
    const stage = stageRef.current
    if (!scaler || !stage) return
    // Phones get their own composition (see site.css): 620px wide, same
    // breakpoint as the CSS that gives the box its height.
    const compactQuery = window.matchMedia('(max-width: 760px)')
    const fit = () => {
      const compact = compactQuery.matches
      stage.toggleAttribute('data-compact', compact)
      stage.style.setProperty(
        '--s',
        String(scaler.clientWidth / (compact ? 620 : 1200))
      )
      setReady(true)
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(scaler)
    return () => observer.disconnect()
  }, [])

  // Run only while visible, and never for reduced motion — that visitor
  // sees the dashboard as a still picture.
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

  // The loop: one order, start to cash. Each step changes the dashboard as it
  // happens, from its timer.
  useEffect(() => {
    if (!running) return
    const id = 10483 + turn
    const who = BUYERS[turn % BUYERS.length]!
    const update = (change: (row: Order) => Order) =>
      setRows((current) =>
        current.map((row) => (row.id === id ? change(row) : row))
      )
    const steps: Record<Phase, () => void> = {
      idle: () => {},
      press: () => {},
      sent: () => {},
      row: () => {
        setRows((current) =>
          [
            {
              id,
              ...who,
              check: 'checking' as const,
              courier: '—',
              status: 'New' as const,
            },
            ...current,
          ].slice(0, 5)
        )
        setOrdersToday((n) => n + 1)
        setBump('orders')
      },
      checked: () => update((row) => ({ ...row, check: 'ok' })),
      booked: () =>
        update((row) => ({ ...row, courier: 'Steadfast', status: 'Booked' })),
      delivered: () => {
        update((row) => ({ ...row, status: 'Delivered' }))
        setCollected((n) => n + who.total)
        setBump('collected')
      },
    }
    const timers = TIMELINE.map(([next, at]) =>
      window.setTimeout(() => {
        setPhase(next)
        steps[next]()
      }, at)
    )
    timers.push(window.setTimeout(() => setBump(null), 2150 + 1400))
    timers.push(window.setTimeout(() => setBump(null), 6600 + 1400))
    timers.push(
      window.setTimeout(() => {
        setPhase('idle')
        setTurn((t) => t + 1)
      }, LOOP_MS)
    )
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [running, turn])

  // A little depth: layers drift with the pointer.
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

  const after = (p: Phase) =>
    TIMELINE.findIndex(([name]) => name === phase) >=
    TIMELINE.findIndex(([name]) => name === p)
  const checking = phase === 'row'
  const toast =
    phase === 'booked' ? 'booked' : phase === 'delivered' ? 'delivered' : null

  return (
    <div
      ref={scalerRef}
      className="hx-scaler"
      role="img"
      aria-label="NCOM in action: an order from a seller's Bangla landing page arrives in the NCOM dashboard, the buyer's delivery record is checked, the parcel is booked with Steadfast, and the cash is collected."
    >
      <div
        ref={stageRef}
        className="hx-stage"
        data-ready={ready ? '' : undefined}
        aria-hidden="true"
      >
        <div className="hx-tilt">
          {/* Dashboard */}
          <div className="hx-layer hx-win">
            <div className="hx-bar">
              <div className="hx-dots">
                <i />
                <i />
                <i />
              </div>
              <div className="hx-url">ncom.bd/orders</div>
              <span style={{ width: 52 }} />
            </div>
            <div className="hx-body">
              <nav className="hx-side">
                <div className="hx-ws">
                  <span>ম</span>Madhuban Organics
                </div>
                <div className="hx-nav">
                  <Home size={15} />
                  Home
                </div>
                <div className="hx-nav" data-on="">
                  <ShoppingBag size={15} />
                  Orders
                  <em>{3 + (after('row') && !after('booked') ? 1 : 0)}</em>
                </div>
                <div className="hx-nav">
                  <Package size={15} />
                  Products
                </div>
                <div className="hx-nav">
                  <LayoutTemplate size={15} />
                  Sites
                </div>
                <div className="hx-nav">
                  <Users size={15} />
                  Customers
                </div>
                <div className="hx-nav">
                  <Truck size={15} />
                  Couriers
                </div>
                <div className="hx-nav">
                  <BarChart3 size={15} />
                  Analytics
                </div>
                <div className="hx-nav">
                  <Settings size={15} />
                  Settings
                </div>
              </nav>
              <div className="hx-main">
                <div className="hx-head">
                  <div>
                    <h4>
                      Orders{' '}
                      <span className="hx-live">
                        <i />
                        Live
                      </span>
                    </h4>
                    <p>Today · all sites</p>
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
                    <p>Delivery success</p>
                    <strong>
                      94.2% <small>▲ 3.1</small>
                    </strong>
                  </div>
                  <div className="hx-kpi">
                    <p>Held for review</p>
                    <strong>2</strong>
                  </div>
                </div>
                <div className="hx-table">
                  <div className="hx-tr hx-th">
                    <span>Order</span>
                    <span>Customer</span>
                    <span>Total</span>
                    <span>Fake-order check</span>
                    <span>Courier</span>
                    <span>Status</span>
                  </div>
                  {rows.map((row) => (
                    <div
                      key={row.id}
                      className="hx-tr hx-row"
                      data-fresh={
                        row.id === nextId && after('row') ? '' : undefined
                      }
                    >
                      <span>
                        <b>#NC-{row.id}</b>
                        <span className="hx-muted">
                          {row.id === nextId
                            ? 'just now'
                            : `${(10483 + turn - row.id) * 6} min ago`}
                        </span>
                      </span>
                      <span>
                        <b>{row.name}</b>
                        <span className="hx-muted">{row.area}</span>
                      </span>
                      <span>
                        <b>{taka(row.total)}</b>
                        <span className="hx-muted">COD</span>
                      </span>
                      <span>
                        {row.check === 'checking' ? (
                          <span className="hx-chip" data-tone="neutral">
                            <span className="hx-spin" />
                            Checking
                          </span>
                        ) : row.check === 'ok' ? (
                          <span className="hx-chip" data-tone="ok">
                            <ShieldCheck size={12} />
                            Reliable
                          </span>
                        ) : (
                          <span className="hx-chip" data-tone="warn">
                            Check first
                          </span>
                        )}
                      </span>
                      <span>
                        {row.courier === '—' ? (
                          <span className="hx-muted">—</span>
                        ) : (
                          <b style={{ fontWeight: 600 }}>{row.courier}</b>
                        )}
                      </span>
                      <span>
                        <span
                          className="hx-chip"
                          data-tone={
                            row.status === 'Delivered'
                              ? 'lime'
                              : row.status === 'Held'
                                ? 'warn'
                                : 'neutral'
                          }
                        >
                          {row.status}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* The seller's landing page */}
          <div className="hx-layer hx-phone">
            <div className="hx-screen" lang="bn">
              <div className="hx-notch" />
              <div className="hx-strip">
                ঢাকায় ডেলিভারি ফ্রি · ক্যাশ অন ডেলিভারি
              </div>
              <div className="hx-shot">
                <svg viewBox="0 0 160 124">
                  <polygon
                    points="22,86 31,81 40,86 40,96 31,101 22,96"
                    fill="#e9b45a"
                  />
                  <polygon
                    points="128,30 137,25 146,30 146,40 137,45 128,40"
                    fill="#e9b45a"
                  />
                  <polygon
                    points="138,50 145,46 152,50 152,58 145,62 138,58"
                    fill="#efc77e"
                  />
                  <rect
                    x="52"
                    y="10"
                    width="56"
                    height="16"
                    rx="4"
                    fill="#3b2a17"
                  />
                  <rect
                    x="58"
                    y="25"
                    width="44"
                    height="8"
                    rx="2"
                    fill="#c98a2b"
                  />
                  <rect
                    x="40"
                    y="32"
                    width="80"
                    height="86"
                    rx="20"
                    fill="#e39a2f"
                  />
                  <rect
                    x="49"
                    y="42"
                    width="9"
                    height="62"
                    rx="4.5"
                    fill="#f4c26a"
                  />
                  <rect
                    x="58"
                    y="56"
                    width="46"
                    height="36"
                    rx="7"
                    fill="#fff6e3"
                  />
                  <rect
                    x="65"
                    y="64"
                    width="32"
                    height="6"
                    rx="3"
                    fill="#7a4b12"
                  />
                  <rect
                    x="68"
                    y="75"
                    width="26"
                    height="4"
                    rx="2"
                    fill="#c08a3e"
                  />
                </svg>
              </div>
              <div className="hx-copy">
                <small>মধুবন অর্গানিক্স · ল্যাব-টেস্টেড</small>
                <h5>সুন্দরবনের কাঁচা মধু</h5>
                <div className="hx-price">
                  <strong>৳৮৫০</strong>
                  <s>৳১,০৫০</s>
                  <em>১৯% ছাড়</em>
                </div>
              </div>
              <div className="hx-opts">
                <div className="hx-opt">
                  ১ বোতল · ৫০০ গ্রাম<b>৳৮৫০</b>
                </div>
                <div className="hx-opt" data-on="">
                  ফ্যামিলি প্যাক · ২ বোতল<b>৳১,৫৫০</b>
                </div>
              </div>
              <div
                className="hx-order"
                data-press={phase === 'press' ? '' : undefined}
              >
                অর্ডার কনফার্ম করুন
              </div>
              <p className="hx-cod">ক্যাশ অন ডেলিভারি · ২–৩ দিনে ডেলিভারি</p>
              <div
                className="hx-sheet"
                data-open={after('sent') && !after('booked') ? '' : undefined}
              >
                <i>
                  <Check size={18} strokeWidth={3} />
                </i>
                <b>অর্ডার নেওয়া হয়েছে!</b>
                <span>অর্ডার #NC-{nextId} · শিগগিরই কল করা হবে</span>
              </div>
            </div>
          </div>

          {/* The order on its way to the dashboard */}
          <div
            key={`fly-${turn}`}
            className="hx-fly"
            data-go={after('sent') ? '' : undefined}
          >
            + Order #NC-{nextId} · {taka(buyer.total)}
          </div>

          {/* Fake-order check */}
          <div className="hx-layer hx-card hx-check">
            <div className="hx-card-head">
              <span>Fake-order check</span>
              <span className="hx-tag">STEADFAST</span>
            </div>
            <div className="hx-check-body">
              <div className="hx-ring">
                <svg viewBox="0 0 64 64">
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    stroke="rgba(var(--s-ink), 0.1)"
                  />
                  <circle
                    className="hx-ring-fill"
                    cx="32"
                    cy="32"
                    r="28"
                    style={{
                      strokeDashoffset: after('checked')
                        ? 176 * 0.08
                        : checking
                          ? 120
                          : 176,
                    }}
                  />
                </svg>
                <strong>{after('checked') ? '92%' : '…'}</strong>
              </div>
              <p>
                <b>{buyer.name}</b>
                <br />
                {after('checked')
                  ? '23 delivered · 2 returned'
                  : 'Reading delivery history…'}
                <br />
                {after('checked') ? (
                  <span
                    className="hx-chip"
                    data-tone="ok"
                    style={{ marginTop: 6 }}
                  >
                    <ShieldCheck size={12} />
                    Reliable buyer
                  </span>
                ) : (
                  <span
                    className="hx-chip"
                    data-tone="neutral"
                    style={{ marginTop: 6 }}
                  >
                    <span className="hx-spin" />
                    Checking
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Courier and cash */}
          <div
            className="hx-layer hx-card hx-toast"
            data-hide={toast ? undefined : ''}
            data-done={toast === 'delivered' ? '' : undefined}
          >
            <span className="hx-toast-icon">
              {toast === 'delivered' ? (
                <Check size={20} strokeWidth={3} />
              ) : (
                <Truck size={19} />
              )}
            </span>
            <span>
              <b>
                {toast === 'delivered'
                  ? `Delivered · ${taka(buyer.total)} collected`
                  : 'Booked with Steadfast'}
              </b>
              <span>
                {toast === 'delivered'
                  ? `#NC-${nextId} · ${buyer.area}`
                  : `Consignment SF-${128472913 + turn} · sticker printed`}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
