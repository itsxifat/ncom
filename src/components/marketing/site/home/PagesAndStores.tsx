import Image from 'next/image'

/**
 * Landing page or online store: the two kinds of site, each shown as the real
 * thing a seller gets rather than a diagram of it.
 *
 * - Landing page: a Facebook ad, and the phone page it opens — the buyer picks
 *   a package, fills in name, phone and address, and confirms; the order lands.
 * - Online store: a clothing shop in the browser — banner, menu, new arrivals;
 *   two products go into the bag and the bag opens at checkout.
 *
 * Each scene is drawn on a fixed 560×430 canvas in `--u` units (one canvas
 * pixel, from the stage's container width), so it scales with its card without
 * JavaScript. Styles and the loops are the `ps-*` rules in site.css; the loops
 * wait for the card to scroll into view, and reduced motion gets a still frame.
 *
 * Photos: Unsplash, free licence (public/marketing/showcase/). Sources —
 * honey 1587049352851-8d4e89133924, 1587049352824-f7e128d4ebe5,
 * 1536788567643-8c2368376526; banner 1727430228383-aa1fb59db8bf; products
 * 1679006831648-7c9ea12e5807, 1701365676249-9d7ab5022dec,
 * 1780247585190-343fbb738c67, 1727835523545-70ee992b5763.
 */

const SHOT = '/marketing/showcase'
const RISE = 'ncom-rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both'

export function PagesAndStores() {
  return (
    <section id="sell" aria-labelledby="sell-title" className="ps">
      <div className="ps-head" style={{ animation: RISE }}>
        <p className="ps-eyebrow">Landing page or online store</p>
        <h2 id="sell-title" className="ps-title">
          A landing page for one product, or a store for everything you sell.
        </h2>
        <p className="ps-lead">
          Send your ads to a landing page, build your brand on a store — both
          run on the same products, offers, orders and couriers.
        </p>
      </div>

      <div className="ps-grid">
        <article
          className="ps-card"
          data-hover="lift"
          style={{ animation: RISE }}
        >
          <LandingScene />
          <CardCopy
            kind="Landing page"
            title="One product, one page — the order form is right on it."
            text="Built for Facebook and Instagram ads. The buyer taps the ad, picks a package, types name, phone and address, and orders in one tap. No cart, no sign-up."
            points={[
              'Packages, combos and free gifts',
              'Delivery charge by area',
              'Meta Pixel and Conversions API built in',
            ]}
          />
        </article>

        <article
          className="ps-card"
          data-hover="lift"
          style={{ animation: RISE }}
        >
          <StoreScene />
          <CardCopy
            kind="Online store"
            title="Your whole catalogue, with a page for every product."
            text="Home page, categories, cart, checkout and customer accounts — with banners, sliders and product grids you arrange yourself."
            points={[
              'Sizes, colours and stock per product',
              'Cash on delivery and bank transfer',
              'Your own domain, or a free NCOM address',
            ]}
          />
        </article>
      </div>
    </section>
  )
}

function CardCopy({
  kind,
  title,
  text,
  points,
}: {
  kind: string
  title: string
  text: string
  points: string[]
}) {
  return (
    <div className="ps-copy">
      <p className="ps-kind">{kind}</p>
      <h3 className="ps-h3">{title}</h3>
      <p className="ps-text">{text}</p>
      <ul className="ps-points">
        {points.map((point) => (
          <li key={point}>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M5 10.5l3.2 3.2L15 7" />
            </svg>
            {point}
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── Landing page: the ad, and the page it opens ─────────────────────────── */

function LandingScene() {
  return (
    <div className="ps-stage" aria-hidden="true">
      <div className="ps-canvas">
        <div className="ps-ad">
          <div className="ps-ad-top">
            <span className="ps-ad-avatar">
              <Image src={`${SHOT}/honey-comb.jpg`} alt="" fill sizes="40px" />
            </span>
            <span className="ps-ad-who">
              <b>Madhuban Organics</b>
              <span>
                Sponsored ·{' '}
                <svg viewBox="0 0 16 16">
                  <circle cx="8" cy="8" r="6.5" />
                  <path d="M1.5 8h13M8 1.5c2 2 2.8 4.2 2.8 6.5S10 12.5 8 14.5M8 1.5C6 3.5 5.2 5.7 5.2 8S6 12.5 8 14.5" />
                </svg>
              </span>
            </span>
            <span className="ps-ad-more">•••</span>
          </div>
          <p className="ps-ad-text">
            Raw honey from the Sundarbans, collected by hand. The family pack
            ships free inside Dhaka this week.
          </p>
          <div className="ps-ad-photo">
            <Image
              src={`${SHOT}/honey-jar.jpg`}
              alt=""
              fill
              sizes="(max-width: 760px) 160px, 240px"
            />
          </div>
          <div className="ps-ad-link">
            <span>
              <small>MADHUBAN.NCOM.BD</small>
              <b>Sundarbans Raw Honey</b>
            </span>
            <span className="ps-ad-cta">
              Order now
              <i className="ps-ad-ring" />
            </span>
          </div>
          <div className="ps-ad-meta">
            <span>
              <i className="ps-react ps-react-like" />
              <i className="ps-react ps-react-love" />
              2.4K
            </span>
            <span>318 comments · 96 shares</span>
          </div>
        </div>

        <svg className="ps-path" viewBox="0 0 560 430">
          <path d="M226 318 C 268 318, 262 214, 298 196" />
          <path className="ps-path-head" d="M290 190 L299 195.5 L292 203" />
        </svg>

        <div className="ps-phone">
          <div className="ps-screen">
            <span className="ps-island" />
            <div className="ps-status">
              <b>9:41</b>
              <span>
                <svg viewBox="0 0 18 12">
                  <rect x="0" y="8" width="3" height="4" rx="1" />
                  <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
                  <rect x="10" y="3" width="3" height="9" rx="1" />
                  <rect x="15" y="0" width="3" height="12" rx="1" />
                </svg>
                <svg viewBox="0 0 26 12">
                  <rect
                    x="0.5"
                    y="0.5"
                    width="22"
                    height="11"
                    rx="3.5"
                    fill="none"
                    stroke="currentColor"
                    opacity=".45"
                  />
                  <rect x="2.5" y="2.5" width="16" height="7" rx="2" />
                  <rect
                    x="23.5"
                    y="4"
                    width="2"
                    height="4"
                    rx="1"
                    opacity=".45"
                  />
                </svg>
              </span>
            </div>
            <div className="ps-url">
              <Lock />
              madhuban.ncom.bd
            </div>

            <div className="ps-view">
              <div className="ps-scroll">
                <div className="ps-hero">
                  <Image
                    src={`${SHOT}/honey-white.jpg`}
                    alt=""
                    fill
                    sizes="(max-width: 760px) 140px, 220px"
                  />
                  <em className="ps-off">−19%</em>
                  <span className="ps-hero-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
                <div className="ps-body">
                  <p className="ps-brand">MADHUBAN ORGANICS</p>
                  <p className="ps-name">Sundarbans Raw Honey</p>
                  <p className="ps-rate">
                    <Stars />
                    4.9 · 1,204 orders
                  </p>
                  <p className="ps-price">
                    <b>৳850</b>
                    <s>৳1,050</s>
                    <em>Save ৳200</em>
                  </p>

                  <p className="ps-label">Choose a package</p>
                  <div className="ps-opts">
                    <span className="ps-pick" />
                    <Option
                      dot="ps-dot-1"
                      name="Single jar · 500 g"
                      note="Try it first"
                      price="৳850"
                    />
                    <Option
                      dot="ps-dot-2"
                      name="Family pack · 2 × 500 g"
                      note="Free delivery inside Dhaka"
                      price="৳1,550"
                      tag="Popular"
                    />
                    <Option
                      name="3 jars + wooden dipper"
                      note="Free gift with the order"
                      price="৳2,200"
                    />
                  </div>

                  <p className="ps-label">Delivery details</p>
                  <Field label="Name" value="Nusrat Jahan" n={1} />
                  <Field label="Phone" value="01712-345678" n={2} />
                  <Field
                    label="Address"
                    value="House 12, Road 5, Dhanmondi"
                    n={3}
                  />

                  <p className="ps-sum">
                    <span>Delivery · Inside Dhaka</span>
                    <span>Free</span>
                  </p>
                  <p className="ps-sum ps-sum-total">
                    <span>Total</span>
                    <b>৳1,550</b>
                  </p>
                  <div className="ps-buy">
                    <span className="ps-buy-a">Confirm order · ৳1,550</span>
                    <span className="ps-buy-b">
                      <svg viewBox="0 0 20 20">
                        <path d="M5 10.5l3.2 3.2L15 7" />
                      </svg>
                      Order placed
                    </span>
                  </div>
                  <p className="ps-cod">
                    Cash on delivery · Check before you pay
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="ps-toast">
          <span className="ps-toast-icon">
            <svg viewBox="0 0 20 20">
              <path d="M5 10.5l3.2 3.2L15 7" />
            </svg>
          </span>
          <span>
            <b>New order #10484</b>
            <small>Family pack · ৳1,550 · Dhanmondi</small>
          </span>
        </div>
      </div>
    </div>
  )
}

function Option({
  dot,
  name,
  note,
  price,
  tag,
}: {
  dot?: string
  name: string
  note: string
  price: string
  tag?: string
}) {
  return (
    <div className="ps-opt">
      <i className="ps-radio">
        {dot ? <i className={`ps-dot ${dot}`} /> : null}
      </i>
      <span className="ps-opt-name">
        <b>{name}</b>
        <small>{note}</small>
      </span>
      <b className="ps-opt-price">{price}</b>
      {tag ? <em className="ps-tag">{tag}</em> : null}
    </div>
  )
}

function Field({
  label,
  value,
  n,
}: {
  label: string
  value: string
  n: number
}) {
  return (
    <div className="ps-field">
      <small>{label}</small>
      <span className={`ps-type ps-type-${n}`}>{value}</span>
    </div>
  )
}

function Stars() {
  return (
    <svg className="ps-stars" viewBox="0 0 60 11">
      {[0, 1, 2, 3, 4].map((i) => (
        <path
          key={i}
          transform={`translate(${i * 12} 0)`}
          d="M5.5 0.4l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6L.3 4.2l3.6-.5z"
        />
      ))}
    </svg>
  )
}

function Lock() {
  return (
    <svg className="ps-lock" viewBox="0 0 12 14">
      <rect x="1" y="6" width="10" height="7.5" rx="2" />
      <path
        d="M3.5 6V4.2a2.5 2.5 0 0 1 5 0V6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  )
}

/* ── Online store: a shop in the browser ─────────────────────────────────── */

const PRODUCTS = [
  {
    photo: 'saree-teal',
    name: 'Tangail silk saree',
    price: '৳4,200',
    add: 1,
  },
  {
    photo: 'panjabi-mustard',
    name: 'Cotton panjabi · Mustard',
    price: '৳1,850',
    was: '৳2,180',
  },
  {
    photo: 'three-piece-blue',
    name: 'Embroidered three-piece',
    price: '৳2,450',
    add: 2,
  },
  {
    photo: 'panjabi-mint',
    name: 'Printed panjabi · Mint',
    price: '৳1,650',
  },
] as const

const BAG = [
  { photo: 'panjabi-mint', name: 'Printed panjabi · M', price: '৳1,650' },
  { photo: 'saree-teal', name: 'Tangail silk saree', price: '৳4,200' },
  {
    photo: 'three-piece-blue',
    name: 'Embroidered three-piece',
    price: '৳2,450',
  },
]

function StoreScene() {
  return (
    <div className="ps-stage" aria-hidden="true">
      <div className="ps-canvas">
        <div className="ps-win">
          <div className="ps-chrome">
            <span className="ps-lights">
              <i />
              <i />
              <i />
            </span>
            <span className="ps-addr">
              <Lock />
              tanti.com.bd
            </span>
          </div>

          <div className="ps-shop">
            <p className="ps-announce">
              Free delivery inside Dhaka over ৳3,000 · Cash on delivery
            </p>
            <div className="ps-nav">
              <b className="ps-logo">TANTI</b>
              <span className="ps-menu">
                <span>New in</span>
                <span>Sarees</span>
                <span>Panjabi</span>
                <span>Three-piece</span>
                <span className="ps-sale">Sale</span>
              </span>
              <span className="ps-tools">
                <svg viewBox="0 0 20 20">
                  <circle cx="9" cy="9" r="5.5" />
                  <path d="M13 13l4 4" />
                </svg>
                <svg viewBox="0 0 20 20">
                  <circle cx="10" cy="7" r="3.5" />
                  <path d="M3.5 17.5c1.2-3.3 3.6-5 6.5-5s5.3 1.7 6.5 5" />
                </svg>
                <span className="ps-bag">
                  <svg viewBox="0 0 20 20">
                    <path d="M4 6.5h12l-1 11H5z" />
                    <path d="M7.5 6.5V5a2.5 2.5 0 0 1 5 0v1.5" />
                  </svg>
                  <span className="ps-count">
                    <span>
                      1
                      <br />2
                      <br />3
                    </span>
                  </span>
                </span>
              </span>
            </div>

            <div className="ps-banner">
              <Image
                src={`${SHOT}/store-hero.jpg`}
                alt=""
                fill
                sizes="(max-width: 760px) 340px, 540px"
                className="ps-banner-img"
              />
              <div className="ps-banner-copy">
                <small>FESTIVE EDIT · 2026</small>
                <b>Silk, woven for the season.</b>
                <span>Shop sarees</span>
              </div>
            </div>

            <p className="ps-row">
              <b>New arrivals</b>
              <span>View all</span>
            </p>
            <div className="ps-products">
              {PRODUCTS.map((product) => (
                <div className="ps-product" key={product.photo}>
                  <div className="ps-pimg">
                    <Image
                      src={`${SHOT}/${product.photo}.jpg`}
                      alt=""
                      fill
                      sizes="(max-width: 760px) 80px, 120px"
                    />
                    {'was' in product ? <em className="ps-off">−15%</em> : null}
                    <i className="ps-heart">
                      <svg viewBox="0 0 20 20">
                        <path d="M10 16.5s-6-3.6-6-8.2A3.3 3.3 0 0 1 10 6a3.3 3.3 0 0 1 6 2.3c0 4.6-6 8.2-6 8.2z" />
                      </svg>
                    </i>
                    {'add' in product ? (
                      <span className={`ps-add ps-add-${product.add}`}>
                        <span className="ps-add-a">Add to bag</span>
                        <span className="ps-add-b">Added to bag</span>
                      </span>
                    ) : null}
                  </div>
                  <p className="ps-pname">{product.name}</p>
                  <p className="ps-pprice">
                    <b>{product.price}</b>
                    {'was' in product ? <s>{product.was}</s> : null}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="ps-mini">
            <p className="ps-mini-head">
              <b>Your bag</b>
              <span>3 items</span>
            </p>
            {BAG.map((item) => (
              <p className="ps-mini-item" key={item.photo}>
                <span className="ps-mini-img">
                  <Image
                    src={`${SHOT}/${item.photo}.jpg`}
                    alt=""
                    fill
                    sizes="40px"
                  />
                </span>
                <span>{item.name}</span>
                <b>{item.price}</b>
              </p>
            ))}
            <p className="ps-mini-sub">
              <span>Subtotal</span>
              <b>৳8,300</b>
            </p>
            <span className="ps-mini-btn">Checkout</span>
            <small className="ps-mini-note">
              Cash on delivery · Bank transfer
            </small>
          </div>
        </div>

        <svg className="ps-cursor" viewBox="0 0 20 24">
          <path d="M2 1.5v18.2l4.8-4.6 3.1 7 3.3-1.4-3-6.9h6.6z" />
        </svg>
      </div>
    </div>
  )
}
